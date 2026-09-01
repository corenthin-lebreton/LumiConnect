# LumiConnect v2 — configuration in-guest des VMs via QEMU guest agent

## Context

`~/Dev/LumiConnect/AutoDeploy` est la v1 fonctionnelle (86 fichiers — Next.js 16, React 19,
Supabase, shadcn/base-ui). Elle provisionne en masse des VMs de formation sur Proxmox : clone
linked d'un template, réservation DHCP statique sur pfSense, création des connexions et comptes
Guacamole, export PDF des accès. Tout le pipeline vit dans `lib/orchestrator.ts`.

Ce qui manque : **les VMs clonées ne sont jamais démarrées ni configurées**. Aucun réglage
réseau in-guest, aucun outil installé. Le formateur récupère des clones bruts, identiques au
template, qu'il doit finir à la main sur chaque machine.

**Objectif** : après le clone, démarrer la VM, attendre le QEMU guest agent, puis exécuter une
sélection de scripts (PowerShell sur Windows, Bash sur Linux) choisis par case à cocher au
moment de créer la formation — configuration réseau obligatoire, puis outils optionnels (git,
docker, ansible…). Le reste du pipeline (pfSense, Guacamole, PDF) est conservé.

---

## Contraintes API vérifiées (à ne pas re-litiger)

- **Aucun endpoint REST n'exécute de shell sur le nœud Proxmox.** `/nodes/{node}/execute` est un
  lot d'appels *API*. `vncshell` / `termproxy` sont des consoles websocket qui refusent les
  tokens API. Shell hôte ⇒ SSH, écarté ici.
- **Aucun endpoint ne lit le contenu d'un fichier du nœud.** `/storage/{storage}/content` liste
  les snippets, ne les télécharge pas. Le contenu des scripts doit donc partir de l'application.
- `qm guest exec` **est** un appel API : la CLI `qm` est un client de l'API REST, la commande
  correspond exactement à `POST /nodes/{node}/qemu/{vmid}/agent/exec`.
- `agent/exec` s'exécute **dans l'invité**, avec des chemins **de l'invité**, en mode détaché :
  pas de stdin, pas de tty. Il faut poller `GET agent/exec-status?pid=N` jusqu'à `exited: 1`.
  Proxmox **décode lui-même** le base64 du guest agent : `out-data` et `err-data` arrivent en
  texte clair, aucun décodage côté application.
- `agent/file-write` est plafonné à **61440 caractères** par la validation Proxmox
  (paramètre `encode` pour le base64). `agent/file-read` plafonne à 16 Mio avec un flag
  `truncated`.
- Privilèges du token, selon la version : **PVE 8** → `VM.Monitor` couvre le guest agent.
  **PVE 9+** → `VM.GuestAgent.Unrestricted` (exec) + `VM.GuestAgent.FileWrite`.

---

## Architecture cible

### Canal d'exécution

Les scripts vivent dans `scripts/` **côté LumiConnect**. Pour chaque script, sur chaque VM :

```
POST agent/file-write   → dépose le script dans la VM
POST agent/exec         → powershell.exe -File …  /  /bin/bash …
GET  agent/exec-status  → poll jusqu'à exited:1, récupère exitcode + sortie (déjà décodée)
```

Pur REST, token API à droits restreints, **aucun accès SSH à l'hyperviseur**.

### Templates

Nomenclature à 4 champs, regex non ambiguë :

```
^tpl-(?<os_id>[a-z0-9]+)-(?<variant>[a-z0-9]+)-v(?<rev>\d+)$
```

| Template Proxmox | `os_id` | Shell |
|---|---|---|
| `tpl-win11-pro-v1` | `win11` | `powershell` |
| `tpl-debian13-std-v1` | `debian13` | `bash` |
| `tpl-ubuntu2404-std-v1` | `ubuntu2404` | `bash` |
| `tpl-kali-std-v1` | `kali` | `bash` |

`std` quand il n'y a pas de variante. `rev` s'incrémente à chaque reconstruction du template.
Tag Proxmox **`lc-tpl`** sur chaque template : le nom sert au parsing de l'`os_id`, le tag sert
au filtrage dans `getTemplates()` (qui remonte aujourd'hui *tous* les templates du nœud). Un
template taggé mais au nom non conforme est listé et grisé avec un message explicite — jamais
d'échec silencieux.

Prérequis côté templates, à la charge de l'utilisateur : `qemu-guest-agent` installé **et
démarré** (sinon `agent/exec` renvoie `QEMU guest agent is not running`), Win11 en `machine: q35`
+ OVMF + EFI disk + TPM 2.0.

### Bibliothèque de scripts

Un script = un outil. Plus un script `base` obligatoire, coché et verrouillé, exécuté en premier.

```
scripts/
  win11/       registry.json  base.ps1  git.ps1  docker.ps1  ansible.ps1
  debian13/    registry.json  base.sh
  ubuntu2404/  registry.json
  kali/        registry.json
  _shared/     apt-docker.sh
```

```json
{
  "os_id": "win11",
  "shell": "powershell",
  "scripts": [
    { "id": "base",    "label": "Configuration de base", "mandatory": true, "timeout_sec": 600 },
    { "id": "git",     "label": "Git",                   "timeout_sec": 600 },
    { "id": "docker",  "label": "Docker",  "timeout_sec": 1800, "reboot_after": true },
    { "id": "ansible", "label": "Ansible", "requires": ["git"], "timeout_sec": 900 }
  ]
}
```

Le fichier est déduit de l'`id` + du `shell` (`docker` → `docker.ps1`). Champ `file` optionnel
pour mutualiser : `"file": "../_shared/apt-docker.sh"` évite de tripler l'install Docker entre
Debian, Ubuntu et Kali.

Le script `base` fait : mode DHCP sur la carte, hostname, activation RDP/SSH, compte
utilisateur. Sur Linux il régénère `/etc/machine-id` et les clés d'hôte SSH — sans ça, tous les
clones présentent le même client-id DHCP et pfSense leur sert la même IP.

### Contexte passé aux scripts

`agent/exec` n'a pas de paramètre d'environnement, et passer un mot de passe en ligne de commande
l'expose dans la liste des processus de l'invité. Donc : un fichier de contexte écrit une fois
par VM (`C:\ProgramData\lumiconnect\context.ps1` / `/opt/lumiconnect/context.env`, permissions
restreintes), sourcé en tête de chaque script.

```
LC_HOSTNAME  LC_USERNAME  LC_PASSWORD  LC_VMID  LC_IP
```

**Frontière d'injection** — les valeurs viennent du formulaire utilisateur et sont écrites dans
un fichier interprété par un shell. Elles passent par un échappeur dédié et testé :
littéral simple-quote avec `'` doublé pour PowerShell, `'\''` pour Bash. Jamais de
concaténation directe.

### DHCP — inchangé

La réservation statique pfSense par MAC est conservée : l'IP est connue avant le boot, donc
Guacamole reste configurable, et le pipeline v1 est éprouvé. Le script `base` se contente de
mettre la carte en mode DHCP — c'est bien « DHCP + le script ».

### Nouveau pipeline de déploiement

```
1. clone       (parallèle, pool borné)      ← existant
2. dhcp        (séquentiel, pfSense)        ← existant
3. start       POST status/start            ← NOUVEAU
4. wait_agent  poll agent/ping (~10 min)    ← NOUVEAU
5. scripts     file-write + exec + poll     ← NOUVEAU
6. guacamole   conn + user + perms          ← déplacé APRÈS les scripts
7. pdf                                       ← existant
```

Guacamole passe **après** les scripts : c'est le script `base` qui active RDP, créer la connexion
avant n'a pas de sens.

`Promise.allSettled` sur toutes les VMs à la fois (v1) ne tient plus quand chaque VM installe des
outils pendant 30 min. Ajout d'un **pool de concurrence borné** (défaut 4, configurable) sur les
étapes 3-5.

### Durabilité des jobs — remplacement de `lib/job-store.ts`

L'état actuel vit dans une `Map` en RAM et le déploiement est un `.catch()` flottant dans un
route handler. Avec des configs de 20-40 minutes, un `next build` ou un restart pendant un
déploiement perd la progression et laisse la formation coincée en `deploying`.

Remplacement : **table de queue Postgres + worker séparé**.

- Table `jobs` consommée avec `FOR UPDATE SKIP LOCKED` — un seul worker prend un job, pas de
  double exécution même avec plusieurs répliques.
- Un conteneur worker (`worker/index.ts`, `tsx`) qui partage `lib/`. Le route handler ne fait
  plus qu'insérer une ligne dans `jobs`.
- L'UI passe sur **Supabase Realtime** sur `formation_vms` et `vm_script_runs`. `lib/job-store.ts`
  et `lib/hooks/use-deployment-stream.ts` (SSE) disparaissent, ainsi que
  `app/api/formations/[id]/stream/route.ts`.

C'est la conséquence directe des configs longues, pas un extra : sans ça, la fonctionnalité
demandée n'est pas exploitable en production.

---

## Fichiers

### À créer

| Fichier | Rôle |
|---|---|
| `scripts/<os_id>/registry.json` + scripts | Bibliothèque, 4 OS |
| `lib/scripts/registry.ts` | Chargement + validation zod des registries, `listScripts(osId)` |
| `lib/scripts/resolve.ts` | Tri topologique, clôture des `requires`, détection de cycles |
| `lib/scripts/escape.ts` | Échappement littéral PowerShell / Bash |
| `lib/services/proxmox-agent.ts` | `startVm`, `waitForAgent`, `guestFileWrite`, `guestExec`, `guestExecStatus`, `runGuestScript` |
| `lib/queue.ts` | `enqueue`, `claimNext` (SKIP LOCKED), `complete`, `fail` |
| `worker/index.ts` | Boucle du worker, appelle `deployFormation` |
| `app/api/scripts/route.ts` | `GET ?os_id=win11` → entrées du registry pour les cases à cocher |
| `supabase/migrations/002_scripts_and_rls.sql` | Nouvelles tables + RLS + colonnes |

### À modifier

| Fichier | Changement |
|---|---|
| `lib/services/proxmox.ts` | `getTemplates()` filtre sur le tag `lc-tpl`, parse `os_id` depuis le nom |
| `lib/orchestrator.ts` | Étapes `start` / `wait_agent` / `scripts`, pool borné, Guacamole déplacé |
| `lib/schemas.ts` | `script_ids: z.array(z.string())`, `os_id` |
| `types/index.ts` | `DeployStep` étendu, types `ScriptEntry` / `VmScriptRun` |
| `components/formations/creation-form.tsx` | Section cases à cocher pilotée par l'`os_id` du template |
| `components/formations/deploy-progress.tsx` | Progression par script et par VM, via Realtime |
| `app/(dashboard)/formations/[id]/page.tsx` | Sortie des scripts (stdout/exit code) par VM |
| `app/api/formations/[id]/deploy/route.ts` | Insère un job au lieu du fire-and-forget |
| `lib/cleanup.ts` | Nettoyage symétrique des nouvelles tables |
| `Dockerfile` / compose | Second service `worker` |
| `.env.example` | `LC_SCRIPT_CONCURRENCY`, `LC_AGENT_TIMEOUT_SEC`, clé de chiffrement |
| `README.md` | Aujourd'hui boilerplate `create-next-app`, à réécrire |

### Schéma (migration 002)

```sql
ALTER TABLE formations ADD COLUMN os_id TEXT;
ALTER TABLE formations ADD COLUMN template_name TEXT;   -- révision au moment du déploiement

CREATE TABLE formation_scripts (
  formation_id UUID REFERENCES formations(id) ON DELETE CASCADE,
  script_id    TEXT NOT NULL,
  position     INTEGER NOT NULL,      -- ordre topologique résolu
  PRIMARY KEY (formation_id, script_id)
);

CREATE TABLE vm_script_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vm_id       UUID REFERENCES formation_vms(id) ON DELETE CASCADE,
  script_id   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending|running|success|failed|skipped
  exit_code   INTEGER,
  stdout      TEXT,
  stderr      TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,          -- deploy|cleanup
  formation_id UUID REFERENCES formations(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'queued',
  attempts     INTEGER NOT NULL DEFAULT 0,
  claimed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

---

## Sécurité

Une bibliothèque de scripts cochables, c'est de l'exécution de code en SYSTEM/root sur N
machines déclenchée depuis une UI web. Les garde-fous font partie de la fonctionnalité, pas d'un
durcissement ultérieur :

1. **Scripts en fichiers versionnés uniquement.** Pas d'éditeur web, pas de script en base. Le
   seul moyen d'ajouter du code exécutable est un commit relu.
2. **Garde anti-traversée de chemin** sur la résolution `script_id → fichier`. Les ids viennent
   de la base ; toute résolution sortant de `scripts/` est rejetée.
3. **Échappement des valeurs de contexte** (`lib/scripts/escape.ts`), testé sur les cas tordus :
   quotes, backticks, `$(…)`, retours à la ligne.
4. **Token Proxmox dédié**, rôle sur mesure : `VM.Clone`, `VM.Config.*`, `VM.PowerMgmt`,
   `VM.Allocate` + selon version `VM.Monitor` (PVE 8) ou `VM.GuestAgent.Unrestricted` +
   `VM.GuestAgent.FileWrite` (PVE 9+). Pas de `root@pam`.
5. **RLS à réactiver.** `001_initial_schema.sql` fait `DISABLE ROW LEVEL SECURITY` sur les trois
   tables. Combiné aux grants Supabase par défaut, cela rendait `vm_password` et `guac_password`
   lisibles avec la seule clé **anon**, qui est publique (embarquée dans le bundle navigateur).
   La migration 002 active RLS et retire les grants à `anon`.

   **Écart assumé par rapport au plan initial** : les policies donnent l'accès complet à
   `authenticated` au lieu de le restreindre à `created_by`. La liste de
   `app/(dashboard)/formations/page.tsx` n'a aucun filtre par créateur — restreindre empêcherait
   un formateur de reprendre la formation d'un collègue. C'est une décision produit à trancher
   séparément, pas un correctif de sécurité : la faille réelle était l'exposition à `anon`, et
   elle est fermée. Le worker utilise la service role key et contourne RLS, ce qui est voulu.
6. **Mots de passe chiffrés au repos.** `formations.vm_password` et `formation_vms.guac_password`
   sont en clair. AES-256-GCM avec une clé serveur (`LC_ENCRYPTION_KEY`), déchiffrement seulement
   côté serveur pour le PDF et Guacamole.

Point 6 séparable si tu veux réduire le lot initial — mais il devient plus coûteux à faire après,
une fois les données en base.

### Notes d'écriture des scripts

- Sur Windows, le guest agent tourne en **LocalSystem** : pas de profil utilisateur,
  `$env:USERPROFILE` pointe sur `systemprofile`. Privilégier `winget`/`choco` en mode silencieux.
  Docker Desktop s'installe mal dans ce contexte — Docker via WSL2 est plus fiable.
- Les `.ps1` sont écrits avec **BOM UTF-8** : PowerShell 5.1 lit un fichier sans BOM en ANSI et
  casse les accents.
- Un script marqué `reboot_after` déclenche un redémarrage puis une nouvelle attente de l'agent.

---

## Séquence d'implémentation

**Phase 0 — assainissement** (préalable, petit)
Migration RLS + policies, chiffrement des mots de passe, suppression de `better-sqlite3`
(dépendance inutilisée), README réel.

**Phase 1 — socle guest agent**
`lib/services/proxmox-agent.ts` + `lib/scripts/escape.ts`. Validation sur **une** VM créée à la
main : `startVm` → `waitForAgent` → écrire et exécuter un script trivial → lire le code de
sortie. Rien d'autre ne peut avancer tant que ça n'est pas prouvé sur ton Proxmox.

**Phase 2 — bibliothèque de scripts**
`registry.ts`, `resolve.ts`, les 4 `registry.json`, les scripts `base` des 4 OS. Tests unitaires
sur le tri topologique, les cycles, la clôture des `requires` et l'échappement.

**Phase 3 — queue + worker**
Table `jobs`, `lib/queue.ts`, `worker/index.ts`, service Docker. Migration du route handler.
Retrait de `job-store.ts` et du SSE au profit de Realtime.

**Phase 4 — orchestrateur**
Nouvelles étapes dans `lib/orchestrator.ts`, pool borné, Guacamole déplacé après les scripts,
écriture des `vm_script_runs`.

**Phase 5 — UI**
Cases à cocher dans le formulaire, progression par script, affichage des sorties, filtrage des
templates par tag.

**Phase 6 — scripts outils**
git, docker, ansible… par OS. Chaque outil est un fichier + une ligne de registry, ajoutable
ensuite sans toucher au reste.

---

## Vérification

Le type-check ne prouve rien ici — tout le risque est dans l'interaction réelle avec Proxmox.

1. **Phase 1, sur ton Proxmox** : une VM clone démarrée à la main, `waitForAgent` renvoie OK,
   un script `Write-Output "ok"` remonte `exitcode: 0` et `out-data` décodé.
   Vérifier aussi le cas d'échec : agent absent → message clair, pas de blocage jusqu'au timeout.
2. **Tests unitaires** (`vitest`) : tri topologique (ordre, cycle, `requires` transitifs),
   échappement PowerShell et Bash sur charges hostiles, parsing du nom de template.
3. **Déploiement réel de bout en bout** : formation de 3 VMs Debian 13, base + un outil.
   Contrôler l'IP servie par pfSense (les trois doivent être distinctes — c'est le test qui
   valide la régénération de `machine-id`), la connexion SSH via Guacamole, l'outil présent.
4. **Idem sur Win11**, où le premier boot est long : vérifier que le timeout d'attente de l'agent
   est suffisant et que RDP répond via Guacamole.
5. **Résistance au redémarrage** : tuer le worker au milieu d'un déploiement, le relancer,
   vérifier que le job repart et que la formation ne reste pas coincée en `deploying`.
6. **RLS** : avec deux comptes distincts, vérifier depuis le client qu'un utilisateur ne lit pas
   les formations de l'autre.
7. **UI en navigateur réel** : cases à cocher pilotées par l'`os_id`, case `base` verrouillée,
   auto-cochage des `requires`, progression qui avance en direct.

---

## État d'avancement

### Phase 0 — terminée

- `supabase/migrations/002_enable_rls.sql` : RLS activée sur les 3 tables, grants retirés à `anon`.
  **Non appliquée** — à passer sur le projet Supabase.
- `lib/crypto.ts` : AES-256-GCM (`encryptSecret` / `decryptSecret`), format `v1:iv:tag:ct`.
  Les valeurs en clair antérieures sont renvoyées telles quelles, donc aucune migration de
  données n'est nécessaire et les formations déjà déployées continuent de fonctionner.
- `generatePassword` déplacé de `lib/services/guacamole.ts` vers `lib/crypto.ts` et passé de
  `Math.random()` à `crypto.randomInt` — l'ancienne version générait des mots de passe
  prédictibles. Longueur portée de 12 à 16.
- Chiffrement câblé : `app/api/formations/route.ts` (écriture), `lib/orchestrator.ts`
  (lecture pour Guacamole, écriture des mots de passe Guacamole), `lib/services/pdf.ts` (lecture).
- Dépendances `better-sqlite3` et `vscode` retirées (inutilisées). `package.json` renommé
  en `lumiconnect`.
- **Correction** : le README réel avait été annoncé comme fait en Phase 0 alors qu'il ne
  l'était pas. Il a été écrit en Phase 6, avec `scripts/README.md`.
- `LC_ENCRYPTION_KEY` ajoutée à `.env.example`.

### Phase 1 — code écrit, validation terrain en attente

- `lib/scripts/escape.ts` : échappement PowerShell / Bash, rendu du fichier de contexte,
  refus des retours à la ligne et des octets nuls.
- `lib/services/proxmox-agent.ts` : `startVm`, `rebootVm`, `waitForAgent`, `guestFileWrite`
  (plafond 61440 refusé explicitement), `guestExec`, `guestExecStatus`, `runGuestScript`.
- `tools/probe-agent.ts` + `pnpm probe:agent <vmid> [bash|powershell]` : sonde de bout en bout
  sur une VM réelle.
- Tests : `vitest`, 19 tests verts. L'échappement Bash est vérifié en exécutant réellement
  `/bin/bash` sur des charges hostiles, pas seulement par comparaison de chaînes.

**Validation terrain toujours en attente** : `pnpm probe:agent` n'a pas encore été lancé sur
une VM du Proxmox réel. La Phase 2 a été codée sans ce feu vert, à la demande explicite de
l'utilisateur. Tant que la sonde n'est pas verte, la bibliothèque existe mais rien ne prouve
qu'elle s'exécute.

### Phase 2 — terminée

- `lib/scripts/registry.ts` : chargement et validation zod des `registry.json`, contrôles de
  cohérence (ids uniques, `requires` existants, présence d'un script obligatoire, `os_id`
  conforme au dossier), résolution de chemin confinée à `scripts/`.
- `lib/scripts/resolve.ts` : clôture transitive des `requires`, inclusion forcée des scripts
  obligatoires, tri topologique de Kahn parcourant les candidats dans l'ordre de déclaration —
  ce qui rend la séquence déterministe. Détection de cycle nommant les scripts impliqués.
- `scripts/{win11,debian13,ubuntu2404,kali}/registry.json` : un script `base` obligatoire par OS.
- `scripts/_shared/debian-base.sh`, mutualisé entre Debian 13, Ubuntu 24.04 et Kali : régénère
  `machine-id` et les clés d'hôte SSH, pose le hostname et `127.0.1.1`, crée le compte avec
  `chpasswd` sur stdin, active SSH, puis bascule la carte en DHCP en détectant le gestionnaire
  réseau réellement présent (NetworkManager, netplan ou ifupdown) au lieu d'en supposer un.
- `scripts/win11/base.ps1` : compte local, appartenance aux groupes **par SID**
  (`S-1-5-32-544`, `S-1-5-32-555`) parce que leurs noms sont traduits sur un Windows français,
  activation RDP avec NLA conservé, cartes en DHCP, renommage en dernier (`reboot_after`).

Trou corrigé pendant les tests : le garde anti-traversée exemptait `resolved === SCRIPTS_ROOT`,
donc un `"file": ".."` passait. `scripts/` est un répertoire, jamais un script — l'exemption a
été retirée.

### Phase 3 — terminée

**Migration `003_jobs_and_progress.sql`** (non appliquée)

- Table `jobs` + index unique partiel `jobs_one_active_per_formation` : garantie structurelle
  contre le double déploiement, indépendante du verrou applicatif du route handler.
- Table `vm_steps` : une ligne par (formation, vmid, étape), avec `label`, `position`, statut,
  message, `exit_code`, `stdout`, `stderr`. `step` est du TEXT libre pour accueillir les étapes
  « script:<id> » de la Phase 4, et `position` porte l'ordre — l'UI n'a donc pas à connaître le
  pipeline à l'avance.
- Fonction `claim_job(worker_id)` en `FOR UPDATE SKIP LOCKED`.
- Fonction `fail_stale_jobs(interval)` : un worker tué laisse un job `running` dont le heartbeat
  s'arrête ; sans ce balayage la formation resterait en `deploying` et l'index unique
  interdirait toute nouvelle tentative.
- `EXECUTE` retiré à PUBLIC sur ces deux fonctions, RLS en lecture seule pour `authenticated`,
  écriture réservée au worker via la service role key.
- Ajout idempotent de `vm_steps`, `formation_vms` et `formations` à la publication Realtime.

**Décision : aucun rejeu automatique.** Un job `running` abandonné n'est jamais repris. Le
pipeline n'est pas idempotent — les VMs sont déjà clonées, les baux DHCP déjà posés — et le
rejouer produirait des erreurs et des ressources orphelines. Le job est marqué en échec, la
formation aussi, et l'opérateur décide. Cela reste cohérent avec la règle existante du route
handler : « supprimer et recréer pour redéployer ».

**Code**

- `lib/queue.ts` : `enqueue`, `claimJob`, `heartbeat`, `markSucceeded`, `markFailed`,
  `failStaleJobs`. La violation d'unicité (23505) devient une `JobAlreadyQueuedError` explicite.
- `lib/progress.ts` : `initSteps` pose la grille complète en `pending` avant tout traitement,
  `markStep` la met à jour, `skipRemaining` clôt ce qui n'aura jamais lieu. Une écriture de
  progression ratée est journalisée sans interrompre le déploiement : c'est de l'affichage,
  l'état réel reste porté par `formations` et `formation_vms`.
- `worker/index.ts` : boucle de prise de travail, heartbeat périodique, balayage des travaux
  abandonnés, arrêt propre sur SIGTERM après le travail en cours.
- `lib/hooks/use-deployment-progress.ts` : rattrapage initial puis abonnement Realtime. Rouvrir
  la page en cours de déploiement retrouve la progression exacte, ce que le SSE ne permettait pas.
- `components/formations/deploy-progress.tsx` : colonnes dérivées des données au lieu d'une
  liste figée de quatre étapes, via une variable CSS puisque Tailwind ne peut pas générer une
  classe dont le nombre de colonnes n'est connu qu'à l'exécution.
- Les routes `deploy` et `delete` mettent en file au lieu d'exécuter. En cas d'échec de mise en
  file, `deploy` remet la formation en `draft` plutôt que de la laisser bloquée en `deploying`.

**Supprimés** : `lib/job-store.ts`, `lib/hooks/use-deployment-stream.ts`,
`app/api/formations/[id]/stream/route.ts`.

**Conséquence à trancher** : `deployment_logs` n'a plus de producteur — son seul écrivain était
`persistStepLog` dans `job-store`. `vm_steps` la remplace avec davantage d'information. La table
et son historique sont conservés ; le type `DeploymentLog` est marqué `@deprecated`. À supprimer
par une migration dédiée si l'historique passé n'a plus d'intérêt.

**Déploiement**

- Étage `worker` ajouté au `Dockerfile`, placé **avant** `runner` pour que `docker build .` vise
  toujours l'application par défaut.
- Le worker est bundlé par esbuild en un fichier unique (`dist/worker.cjs`, 4,9 Mo) : son image
  ne contient aucun `node_modules`. Le bundle passe par l'API JS d'esbuild et non sa CLI, le
  shim `node_modules/.bin/esbuild` installé par pnpm relançant le binaire natif via node, ce qui
  échoue.
- `scripts/` est copié dans les deux images : le build standalone de Next ne l'embarque pas.
- `docker-compose.yml` : services `web` et `worker`, `stop_grace_period` à 120 s pour laisser un
  travail en cours se terminer.
- `.gitignore` créé — il était absent de cette copie du dépôt.

### Phase 4 — terminée

**Migration `004_formation_scripts.sql`** (non appliquée) — `formations.os_id`,
`formations.template_name`, table `formation_scripts (formation_id, script_id, position)`.
Seuls des identifiants y sont stockés, jamais de contenu : le code exécuté vient du dépôt, donc
cette table ne peut pas devenir un vecteur d'exécution de code arbitraire.

**Pipeline** — `lib/orchestrator.ts` réécrit :

```
clone → dhcp → start → wait_agent → context → script:<id>… → guacamole → pdf
```

Guacamole passe après la configuration : c'est le script `base` qui active RDP/SSH et crée le
compte. Créer la connexion avant reviendrait à pointer vers un service qui n'écoute pas.

**`lib/pipeline/configure-vm.ts`** — démarrage, attente de l'agent, dépôt du contexte, séquence
de scripts, redémarrage entre deux scripts quand `reboot_after` est posé (avec nouvelle attente
de l'agent, qui disparaît le temps du reboot). Points notables :

- Le répertoire est créé avant l'écriture : `agent/file-write` n'ouvre pas de fichier dans un
  répertoire inexistant. Sous Windows, `icacls` restreint l'accès en visant les groupes **par
  SID** (`*S-1-5-18`, `*S-1-5-32-544`), leurs noms étant traduits.
- Le contexte est **déposé** par `agent/file-write`, pas exécuté — les scripts le sourcent
  eux-mêmes — et reçoit un BOM UTF-8 sous Windows pour qu'un mot de passe accentué ne soit pas
  relu en ANSI.
- **Le contexte est supprimé de la VM en fin de configuration**, y compris en cas d'échec. Il
  contient le mot de passe en clair ; le laisser en ferait un fichier à emplacement connu sur
  chaque machine de formation.

**`lib/pool.ts`** — parallélisme borné. `Promise.allSettled` sur toutes les VMs convenait pour
des étapes de quelques secondes ; vingt installations simultanées saturent les E/S de
l'hyperviseur. Deux limites distinctes : `LC_CLONE_CONCURRENCY` (défaut 8) et
`LC_CONFIGURE_CONCURRENCY` (défaut 4). Le plan prévoyait un unique `LC_SCRIPT_CONCURRENCY` —
séparer les deux évite de brider les clones, qui sont brefs, au rythme des configurations.

**`lib/templates.ts`** — parsing de la nomenclature et détection du tag `lc-tpl`.
`getTemplates()` ne remonte plus que les templates taggés, avec leur `os_id`. Un template taggé
mais hors nomenclature est renvoyé avec `conforming: false` et signalé dans le formulaire, au
lieu de disparaître silencieusement de la liste. Groupes de capture indexés et non nommés : la
cible tsconfig du projet est ES2017, et la changer pour un gain cosmétique n'était pas justifié.

**`lib/pipeline/guacamole-step.ts`** — extraction du bloc Guacamole hors de l'orchestrateur, qui
serait devenu illisible avec la phase de configuration en plus.

**Résolution côté serveur** — `app/api/formations/route.ts` ne fait pas confiance à la sélection
reçue : elle est repassée par `resolveSelection`, qui réintroduit les scripts obligatoires, tire
les dépendances et fige l'ordre topologique. C'est cette résolution-là qui est enregistrée et
exécutée. Si l'enregistrement des scripts échoue, la formation est supprimée plutôt que de
laisser passer un déploiement silencieusement incomplet.

**Compatibilité** — une formation sans `os_id` (créées avant la migration 004, ou template hors
nomenclature) se déploie comme avant, sans configuration in-guest. Les étapes correspondantes
n'apparaissent simplement pas dans la grille.

**Reste pour la Phase 5** : les cases à cocher. Le formulaire transmet déjà `os_id` et
`template_name`, donc le script `base` s'exécute ; `script_ids` part vide.

### Phase 5 — terminée

**`app/api/scripts/route.ts`** — métadonnées du registry pour un `os_id`. Jamais le contenu des
scripts : le navigateur n'a besoin que de savoir quoi proposer.

**`components/formations/script-picker.tsx`** — manifeste plutôt que liste de cases. Le script
obligatoire est verrouillé, les autres portent leurs badges (`redémarrage`, `requiert Git`), et
le pied de section annonce le nombre de scripts et le **délai maximum** par VM. Pas une durée
estimée : `timeout_sec` est un plafond, l'annoncer comme une estimation serait faux.

Cocher un script tire ses dépendances, décocher retire ce qui en dépend
(`selectWithDependencies` / `deselectWithDependents` dans `lib/scripts/resolve.ts`). Le serveur
recalcule tout de son côté ; le faire aussi côté client sert à ce que l'écran montre exactement
ce qui tournera, plutôt que des scripts apparus après coup.

**Le vrai problème de design de la phase : la matrice ne passait pas la Phase 4.** Elle réservait
une colonne de texte par étape, ce qui tenait à quatre. Le pipeline en compte maintenant cinq à
douze selon les cases cochées, et `repeat(12, 1fr)` de libellés sur vingt lignes est illisible.

`components/formations/vm-track.tsx` la remplace par une **piste segmentée** : une VM par ligne,
un segment par étape, largeur constante quel que soit leur nombre. La ligne se déplie sur le
détail — libellés, durées, codes de sortie, `stdout` et `stderr`, qui n'avaient jusque-là nulle
part où s'afficher. La première VM en échec est ouverte d'emblée : sur vingt lignes, c'est la
seule qu'on vient lire.

**`components/formations/deployment-trace.tsx`** — même vue en lecture seule sur la page de
formation, pour revenir chercher une sortie de script après coup.

**Corrections de design système**

- `--success`, `--running` et `--warning` existaient dans `:root` et `.dark` mais étaient absents
  du bloc `@theme inline` : Tailwind ne pouvait pas générer `text-success`, et les composants
  retombaient sur `emerald-500` / `sky-500` codés en dur, qui ne suivent ni le thème ni la teinte
  d'accent. Ils sont exposés et employés.
- La numérotation `01/02/03` des sections du formulaire est retirée. Le même procédé sert dans la
  vue de déploiement, où l'ordre est réel et porteur d'information ; on remplit un formulaire
  dans l'ordre qu'on veut. Employer le même signal pour les deux le vidait de son sens.
- `prefers-reduced-motion` respecté. Un déploiement affiche plusieurs éléments en mouvement
  permanent pendant des dizaines de minutes.

**Vérification en navigateur réel** — banc de revue temporaire rendu dans Chromium headless, avec
des données factices couvrant réussite, exécution en cours, échec avec sortie, et attente, dans
les deux thèmes. Trois défauts corrigés sur capture :

1. la ligne verrouillée et les lignes cochées portaient la même teinte à deux opacités, donc se
   confondaient — le verrouillé passe à un filet d'accent sur fond neutre ;
2. `bg-accent/50` en thème clair vaut `oklch(0.95)` à 50 %, c'est-à-dire du blanc : la sélection
   ne se voyait pas. Remplacé par un voile de `--primary`, foncé en clair et vif en sombre ;
3. la légende était un mur de capitales mono sur trois lignes, passée en une ligne discrète.

Le banc, sa route et l'exception de middleware ont été retirés après relecture.

### Phase 6 — terminée

**Famille Debian** — `_shared/apt-git.sh`, `_shared/apt-docker.sh`, `_shared/apt-ansible.sh`,
partagés par Debian 13, Ubuntu 24.04 et Kali via le champ `file`.

Docker vient de `docker.io` des dépôts de la distribution, pas du dépôt officiel Docker : ce
dernier ne publie aucun canal pour Kali, et faire correspondre Kali rolling à un nom de code
Debian casse à chaque évolution. La version des dépôts suffit pour de la formation et le script
reste identique sur les trois OS.

**Windows** — `choco.ps1`, `git.ps1`, `docker.ps1`.

`winget` n'est pas utilisable : c'est une application MSIX installée par utilisateur, et le guest
agent s'exécute en LocalSystem, sans profil. D'où Chocolatey, conçu pour l'installation machine,
et un script `choco` que `git` et `docker` déclarent en `requires` — ce qui exerce enfin le tri
topologique sur de vraies données. Vérifié : cocher Docker seul produit
`base > choco > docker`.

Les scripts appellent `choco.exe` par son chemin complet : le PATH du guest agent date du
démarrage du service et ignore ce que Chocolatey y ajoute ensuite. Les codes de sortie 0 et 3010
sont tous deux traités comme des succès, 3010 signifiant « installé, redémarrage demandé ».

**Point ouvert : Ansible sous Windows.** Ansible ne prend pas Windows en charge comme nœud de
contrôle, seulement comme nœud géré. Trois lectures possibles de la demande initiale, aucune
n'ayant été tranchée :
1. Ansible dans WSL2 — fonctionne, mais l'initialisation d'une distribution WSL depuis
   LocalSystem est fragile ;
2. configurer WinRM pour que la machine soit *pilotée* par Ansible — utile, mais cela ouvre un
   service d'administration à distance et demande une décision explicite ;
3. ne rien livrer côté Windows.
Aucun `ansible.ps1` n'a été écrit : livrer l'un des trois sans arbitrage aurait été un pari.

**Documentation** — `README.md` du projet réécrit (il restait le boilerplate `create-next-app`)
et `scripts/README.md` ajouté : comment déclarer un outil, les règles d'écriture, et les pièges
Windows (LocalSystem, PATH, BOM, groupes par SID).

### Passe design transverse

Menée avec la base de règles ui-ux-pro-max, en gardant la direction visuelle existante — accent
moss, fond papier, Plex Mono, trame de points. Elle a une identité, il n'y avait pas lieu de la
remplacer.

**Échelle typographique.** `text-[10px]` et `text-[11px]` revenaient 23 fois dans les composants,
impossibles à ajuster d'un seul endroit. Deux tailles nommées les remplacent, déclarées dans
`@theme` : `text-micro` (étiquettes mono, compteurs) et `text-meta` (métadonnées, valeurs
tabulaires). `.eyebrow` s'aligne sur `--text-meta` au lieu d'un `11px` codé en dur.

**Couleurs d'état.** Vingt-cinq couleurs Tailwind brutes subsistaient — `emerald-500`, `sky-500`,
`amber-500`, `red-500` — dans `status-pill.tsx` et la page de détail. Elles ne suivaient ni le
thème ni la teinte d'accent, et dupliquaient à la main ce que `--success` / `--running` /
`--warning` / `--destructive` font déjà. Toutes converties ; il n'en reste aucune.

Effet de bord repéré sur capture et corrigé : la conversion rendait `failed` et `cleanup_failed`
identiques, alors que ce sont deux pannes qui appellent deux actions différentes — relancer un
déploiement, ou nettoyer des ressources orphelines à la main. `cleanup_failed` passe en ambre :
« incomplet, à reprendre » plutôt que « cassé ».

**Hiérarchie des titres.** Les pages avaient un `<h1>` puis plus rien : les libellés de section
étaient des `<p class="eyebrow">`, invisibles à la navigation par titres. Les six qui titrent
réellement une `<section>` deviennent des `<h2>` ; ceux qui étiquettent une métrique ou
surtitrent le `PageHeader` restent des `<p>`, un titre de niveau 2 sans section derrière étant
pire que pas de titre. `PageHeader` rend maintenant un `<header>`.

**Bascule de thème.** Elle n'affichait rien : les icônes attendaient qu'un `useEffect` pose
`mounted`. Passée en variantes CSS `dark:`, elle rend le même balisage côté serveur et côté
client, et gagne une bordure — c'était l'unique commande de l'écran de connexion et elle était
invisible.

**État des services.** Couleurs brutes converties, `aria-label="Refresh"` traduit, et la pastille
ne porte plus l'information par la seule couleur : un texte lisible par lecteur d'écran et une
infobulle disent « tous opérationnels » ou « 2 en erreur ».

**Nommage.** L'interface annonçait encore « AutoDeploy » dans la barre latérale, le titre de
l'onglet et l'écran de connexion. Ce dernier affichait aussi « accès restreint » deux fois.

**Lint** : 5 problèmes → 2. Les trois corrigés étaient des `setState` synchrones dans un effet et
un `let` jamais réassigné.

**Non vérifié visuellement** : la liste des formations, le détail, le formulaire de création et la
page des utilisateurs n'ont pas été rendus avec de vraies données — ils demandent une session
authentifiée. Les changements qui les concernent sont transverses (échelle typographique, tokens
de couleur, sémantique des titres) et vérifiés sur banc, mais leur mise en page propre n'a pas
été relue.

### Refonte visuelle

Changement de direction, pas retouche. L'ancienne était éditoriale et chaude — papier crème,
accent moss, Helvetica Neue, trame de points. La nouvelle est instrumentale et froide.

**Sol.** Graphite bleuté à quatre paliers de clarté (fond, carte, surface levée, bordure) au lieu
d'ombres portées, qui ne se voient pas sur fond sombre. Jamais de noir absolu. Le mode clair est
un blanc froid, pas un papier chaud. Réglure de 64 px en fond, à la place de la trame de points :
elle évoque le châssis et sert de repère d'alignement.

**Couleur.** Accent cyan-teal (teinte 195) réservé à l'interactif. Les quatre couleurs d'état
gardent un sens exclusif — vert terminé, bleu en cours, ambre à reprendre, rouge en échec — et
aucune ne sert à décorer. `deleting` passe au bleu : c'est une opération en cours comme une
autre, ce qui libère l'ambre pour `cleanup_failed`, seul état demandant une reprise manuelle.
Les deux étaient devenus indistinguables.

**Typographie.** Archivo pour l'interface, JetBrains Mono pour toute donnée — identifiants,
adresses, codes de sortie, compteurs. Nouvelle classe `.numeral` : chiffres tabulaires en 700,
très resserrés. Dans un outil de provisionnement les compteurs sont le contenu, pas la légende.

**Rayon** ramené de 8 px à 4 px : plus appareil, moins carte.

**Signature — la grille de flotte** (`components/formations/fleet-grid.tsx`). Une formation,
c'est vingt machines en parallèle ; une liste oblige à parcourir vingt lignes pour savoir ce qui
coince. La grille les montre ensemble comme un rack : la progression s'y lit comme une vague et
une tuile rouge saute aux yeux. Cliquer une tuile ouvre et déroule la ligne correspondante dans
le détail, en dessous. `FleetSummary` donne la répartition en gros chiffres.

**Écran de connexion** recomposé à gauche, avec le nom du produit en plaque d'appareil.

**Bug corrigé pendant la refonte** : les variables de police `next/font` étaient posées sur
`<body>` alors que `font-sans` s'applique sur `<html>`. `--font-archivo` étant introuvable à ce
niveau, la déclaration devenait invalide et le navigateur retombait sur son serif par défaut —
toute l'interface rendait en Times. Les variables sont passées sur `<html>`, et chaque `var()`
de police porte désormais une valeur de repli.

Relu dans Chromium sur build de production, dans les deux thèmes.

### Vérifications passées

```
pnpm exec tsc --noEmit   → exit 0
pnpm exec vitest run     → 68 tests, 7 fichiers, tous verts
pnpm run build           → build Next réussi, 18 routes
pnpm run worker:build    → dist/worker.cjs, 4,9 Mo
pnpm exec eslint .       → 4 erreurs + 1 avertissement, toutes pré-existantes
                           (theme-toggle, service-status, users/page, middleware)
```

Le worker bundlé a été démarré réellement : il refuse de tourner en listant les variables
d'environnement manquantes, et avec une base injoignable il journalise l'erreur et repasse dans
sa boucle au lieu de s'arrêter.

Les tests ne se contentent pas de comparer des chaînes :
- l'échappement Bash est vérifié en exécutant réellement `/bin/bash` sur des charges hostiles ;
- chaque script de la bibliothèque est passé au parser de son interpréteur (`bash -n`, et
  `[Parser]::ParseFile` via `pwsh` quand il est installé), donc une erreur de syntaxe remonte
  au commit et non en plein déploiement sur vingt machines ;
- le BOM UTF-8 des `.ps1` est contrôlé, et chaque script doit lire le fichier de contexte.

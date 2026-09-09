# LumiConnect

Provisionnement en masse d'environnements de formation sur Proxmox VE. Clone des VMs,
adresse réseau résolue dynamiquement via pfSense, configuration à l'intérieur des machines,
accès RDP par Guacamole et remise des identifiants en PDF.

Un formateur crée une formation (un template, une plage d'identifiants de VM, un nombre de
machines, une liste de scripts à appliquer) et récupère des postes prêts à l'emploi avec leurs
comptes d'accès.

## Comment ça marche

```
Formation créée  ➜  job de déploiement  ➜  boucle interne au serveur
                                              │
      clone Proxmox ➜ attente guest agent ➜ résolution IP pfSense ➜ scripts in-guest ➜ Guacamole
```

L'application ne provisionne rien en dehors d'une requête HTTP. Le déploiement passe par une
file de jobs traitée par une boucle intégrée au processus du serveur, démarrée au chargement de
l'application via `instrumentation.ts`. Il n'y a pas de processus séparé à faire tourner en plus.

La configuration à l'intérieur des VMs passe par le QEMU guest agent, via l'API REST de Proxmox.
`agent/file-write` dépose le script, `agent/exec` le lance, `agent/exec-status` en récupère le
résultat. C'est l'équivalent de `qm guest exec`. Aucun accès SSH à l'hyperviseur n'est
nécessaire, un jeton d'API à droits restreints suffit.

L'adresse IP d'une VM n'est jamais réservée à l'avance. Elle est retrouvée après démarrage en
interrogeant les baux DHCP actifs sur pfSense, ce qui évite toute configuration réseau manuelle
par machine.

## Prérequis

Proxmox VE avec un jeton d'API dédié plutôt que `root@pam`. Les privilèges dépendent de la
version. `VM.Monitor` couvre le guest agent sur PVE 8, sur PVE 9 et plus il faut
`VM.GuestAgent.Unrestricted` et `VM.GuestAgent.FileWrite`. Prévoir aussi `VM.Clone`,
`VM.Config.*`, `VM.PowerMgmt` et `VM.Allocate`.

Templates portant le tag `lc-tpl`, nommés librement. La famille d'OS est déduite du nom, sans
tenir compte de la casse. Un mot-clé doit ouvrir un mot (`Win11-Pro`, `Debian 13`, `lab_kali`) ;
un nom sans mot-clé, ou qui en mélange deux familles, est listé mais aucun script n'est proposé.

| Famille | Mots-clés reconnus | Scripts |
|---|---|---|
| `windows` | `windows`, `win` | `scripts/windows/` |
| `linux` | `debian`, `deb`, `ubuntu`, `ubun`, `kali`, `kal`, `linux` | `scripts/linux/` |

La liste vit dans `OS_FAMILIES` (`lib/templates.ts`) : ajouter une distribution, c'est y ajouter
un mot-clé.

Chaque template doit embarquer `qemu-guest-agent` installé et démarré, sans quoi rien ne peut
être configuré. Windows 11 réclame en plus `machine q35`, un BIOS OVMF, un disque EFI et un TPM
2.0.

pfSense avec l'API v2 activée et une interface DHCP configurée, Guacamole avec un compte
administrateur, et un projet Supabase.

Ces trois services se déclarent dans l'application, page **Paramètres**, sous forme de
**groupes d'infrastructure** : un groupe = un Proxmox + un pfSense + un Guacamole. Chaque
formation se déploie sur un groupe, un groupe en héberge autant qu'on veut. Sans groupe, aucun
déploiement n'est possible. Les secrets (token Proxmox, clé pfSense, mot de passe Guacamole) sont
chiffrés en base avec `LC_ENCRYPTION_KEY` et ne sont jamais renvoyés au navigateur.

## Installation

```bash
pnpm install
cp .env.example .env.local
openssl rand -base64 32
```

La valeur générée par `openssl` va dans `LC_ENCRYPTION_KEY`. Renseigner ensuite l'accès
Supabase dans `.env.local`.

Appliquer les migrations de `supabase/migrations/` dans l'ordre.

```bash
pnpm dev
```

Puis créer le premier groupe d'infrastructure dans **Paramètres**. Pour reprendre une
configuration `.env` historique (`PROXMOX_*`, `PFSENSE_*`, `GUACAMOLE_*`) en une fois :

```bash
pnpm seed:group -- --name "Salle principale"
```

Le script crée le groupe, y rattache les formations existantes, reprend
`lib/services/pfsense-ca.pem` s'il existe, puis ces variables peuvent quitter le `.env`.

En production, `docker compose up -d --build` construit et lance l'application seule, sans
service additionnel.

## Déploiement derrière Pangolin (HTTPS)

L'application ne sert que son propre domaine : toutes les routes `/api` sont appelées par
l'interface elle-même et exigent une session Supabase, il n'y a donc pas d'en-têtes CORS à
poser. Ce qui doit être exact, c'est l'**origine publique** — Next vérifie l'en-tête `Origin`
des Server Actions, et les redirections d'authentification sont construites à partir d'elle.

Une seule variable la pilote, `NEXT_PUBLIC_APP_ORIGIN` (schéma + hôte, sans slash final) :

| Environnement | Valeur |
| --- | --- |
| Production | `https://lumiconnect.fwx.pm` |
| Développement | `http://192.168.1.240:3000` |

Hors production, `localhost:3000`, `127.0.0.1:3000` et `192.168.1.240` sont autorisés
d'office ; `LC_DEV_ORIGINS` ajoute d'autres hôtes (`hote[:port]`, séparés par des virgules).
En production, seule l'origine déclarée est acceptée. La liste vit dans `lib/origins.ts` et
alimente `allowedDevOrigins` et `experimental.serverActions.allowedOrigins`.

`NEXT_PUBLIC_*` est inliné dans le bundle au moment du build : la valeur doit être fournie à
la construction de l'image, pas seulement au démarrage du conteneur.

```bash
NEXT_PUBLIC_APP_ORIGIN=https://lumiconnect.fwx.pm docker compose up -d --build
```

Côté Pangolin, la ressource pointe sur le conteneur, port `8002`, et doit transmettre :

- `X-Forwarded-Proto: https`
- `X-Forwarded-Host: lumiconnect.fwx.pm`

Côté Supabase (dashboard, **Authentication → URL Configuration**) : `Site URL` =
`https://lumiconnect.fwx.pm`, et `https://lumiconnect.fwx.pm/**` dans les *Redirect URLs*.
`NEXT_PUBLIC_SUPABASE_URL` doit être en `https://` : le suivi de déploiement ouvre un
WebSocket Realtime direct vers Supabase, hors reverse proxy, qu'un navigateur bloquerait en mixed
content depuis une page HTTPS.

En production, les cookies de session sont posés avec `Secure` et `SameSite=Lax`, et l'en-tête
`Strict-Transport-Security` est ajouté (`next.config.ts`).

## Image Docker

Build en quatre étapes (`base`, `deps`, `builder`, `runner`) : seule la dernière est publiée.
Elle ne contient ni pnpm, ni npm, ni sources, ni dépendances de développement — uniquement la
sortie `standalone` de Next, ses assets et `scripts/`.

Durcissement :

- processus non root (`nextjs`, uid 1001), shell `/sbin/nologin` ;
- code applicatif propriété de `root` en lecture seule : le service ne peut pas se réécrire ;
- `npm`/`npx` retirés de l'image finale, healthcheck assuré par le `fetch` natif de Node
  (aucun client HTTP supplémentaire installé) ;
- `apk upgrade` sur les deux images de base, `tini` comme PID 1 pour propager `SIGTERM` ;
- conteneur en `read_only` avec `cap_drop: ALL` et `no-new-privileges`, deux `tmpfs` pour
  `/tmp` et `/app/.next/cache` (`docker-compose.yml`) ;
- `.dockerignore` tient `.env*`, `.git` et `node_modules` hors du contexte de build : aucun
  secret ne peut se retrouver dans une couche.

## Premier compte administrateur

La gestion des comptes (page Utilisateurs) est réservée aux membres portant le rôle admin. Ce
rôle vit dans `app_metadata` du compte Supabase et n'est modifiable que par l'API admin, jamais
par un client. Depuis le tableau de bord Supabase, éditer le premier compte et poser
`{"role": "admin"}` dans les métadonnées applicatives, ou passer par
`createAdminClient().auth.admin.updateUserById(id, { app_metadata: { role: "admin" } })` dans un
script ponctuel.

## Déroulé d'un déploiement

```
template de base (tag lc-tpl)
  └─ image dorée : clone complet → démarrage → scripts d'installation → arrêt → template
       └─ N clones liés → démarrage → identité (scripts per_vm) → redémarrage → IP → Guacamole
```

Les scripts d'installation ne s'exécutent qu'une fois, sur l'image dorée. Chaque VM de la
formation est un clone lié de cette image et ne rejoue que les scripts `per_vm` (identité
machine sous Linux : machine-id, clés SSH, hostname). Un échec d'installation arrête la
formation avant qu'une seule VM soit créée. L'image dorée est supprimée avec la formation.

Coût disque : le template de base, une copie complète par formation (l'image dorée), puis un
delta par VM. `LC_CLONE_CONCURRENCY` (défaut 1) et `LC_CONFIGURE_CONCURRENCY` (défaut 4)
règlent respectivement le rythme des clones et le nombre de VMs configurées en parallèle.

## Vérifier la chaîne guest agent

Avant tout déploiement réel, valider le socle sur une VM.

```bash
pnpm probe:agent 201 bash
pnpm probe:agent 210 powershell --group "Salle principale"
```

`--group` est facultatif tant qu'un seul groupe existe.

La sonde démarre la VM, attend l'agent, écrit un fichier, l'exécute, contrôle qu'une valeur
hostile ressort intacte et qu'un code de sortie non nul est bien détecté comme un échec. Tant
qu'elle n'est pas verte, aucun script ne s'exécutera sur les machines de formation.

## Bibliothèque de scripts

Voir [`scripts/README.md`](scripts/README.md) pour ajouter un outil.

## Développement

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm run build
```

## Structure

| Chemin | Rôle |
|---|---|
| `app/` | Pages et routes d'API Next.js |
| `instrumentation.ts` | Démarrage de la boucle de traitement des jobs au chargement du serveur |
| `lib/orchestrator.ts` | Enchaînement des étapes d'un déploiement |
| `lib/pipeline/` | Résolution réseau, configuration in-guest et étape Guacamole |
| `lib/services/` | Clients Proxmox, guest agent, pfSense, Guacamole, PDF |
| `lib/scripts/` | Chargement des registries, résolution des dépendances, échappement |
| `lib/queue.ts`, `lib/job-runner.ts` | File de travaux et traitement interne au serveur |
| `scripts/` | Bibliothèque de scripts de configuration, par OS |
| `supabase/migrations/` | Schéma, versionné |

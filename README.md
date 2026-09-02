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

Templates nommés `tpl-<os>-<variante>-v<révision>` et portant le tag `lc-tpl`.

| Template | OS reconnu |
|---|---|
| `tpl-win11-pro-v1` | `win11` |
| `tpl-debian13-std-v1` | `debian13` |
| `tpl-ubuntu2404-std-v1` | `ubuntu2404` |
| `tpl-kali-std-v1` | `kali` |

Chaque template doit embarquer `qemu-guest-agent` installé et démarré, sans quoi rien ne peut
être configuré. Windows 11 réclame en plus `machine q35`, un BIOS OVMF, un disque EFI et un TPM
2.0.

pfSense avec l'API v2 activée et une interface DHCP configurée, Guacamole avec un compte
administrateur, et un projet Supabase.

## Installation

```bash
pnpm install
cp .env.example .env.local
openssl rand -base64 32
```

La valeur générée par `openssl` va dans `LC_ENCRYPTION_KEY`. Renseigner ensuite les autres
variables de `.env.local`, en particulier l'accès Proxmox, pfSense, Guacamole et Supabase.

Appliquer les migrations de `supabase/migrations/` dans l'ordre.

```bash
pnpm dev
```

En production, `docker compose up -d --build` construit et lance l'application seule, sans
service additionnel.

## Premier compte administrateur

La gestion des comptes (page Utilisateurs) est réservée aux membres portant le rôle admin. Ce
rôle vit dans `app_metadata` du compte Supabase et n'est modifiable que par l'API admin, jamais
par un client. Depuis le tableau de bord Supabase, éditer le premier compte et poser
`{"role": "admin"}` dans les métadonnées applicatives, ou passer par
`createAdminClient().auth.admin.updateUserById(id, { app_metadata: { role: "admin" } })` dans un
script ponctuel.

## Vérifier la chaîne guest agent

Avant tout déploiement réel, valider le socle sur une VM.

```bash
pnpm probe:agent 201 bash
pnpm probe:agent 210 powershell
```

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

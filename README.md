# LumiConnect

Provisionnement en masse d'environnements de formation sur Proxmox VE : clone des VMs,
réservation DHCP, configuration à l'intérieur des machines, accès RDP ou SSH par Guacamole, et
remise des identifiants en PDF.

Un formateur crée une « formation » — un template, une plage de VMID, un nombre de machines, une
liste de scripts à appliquer — et récupère des postes prêts à l'emploi et des comptes d'accès.

## Comment ça marche

```
Formation créée  ──▶  file `jobs`  ──▶  worker
                                          │
      clone ─ bail DHCP ─ démarrage ─ guest agent ─ contexte ─ scripts ─ Guacamole ─ PDF
```

L'application web ne provisionne rien elle-même : elle met un travail en file. Un **worker**
séparé l'exécute. Un redéploiement de l'application n'interrompt donc pas un provisionnement en
cours, ce qui compte quand la configuration d'une VM dure une demi-heure.

La configuration à l'intérieur des VMs passe par le **QEMU guest agent**, via l'API REST de
Proxmox : `agent/file-write` dépose le script, `agent/exec` le lance, `agent/exec-status` en
récupère le résultat. C'est l'équivalent de `qm guest exec`. **Aucun accès SSH à l'hyperviseur
n'est nécessaire** — un jeton d'API à droits restreints suffit.

## Prérequis

**Proxmox VE** avec un jeton d'API dédié. Les privilèges dépendent de la version : `VM.Monitor`
couvre le guest agent sur PVE 8 ; sur PVE 9+ il faut `VM.GuestAgent.Unrestricted` et
`VM.GuestAgent.FileWrite`. Plus `VM.Clone`, `VM.Config.*`, `VM.PowerMgmt` et `VM.Allocate`.
Ne pas employer `root@pam`.

**Templates** nommés `tpl-<os>-<variante>-v<révision>` et portant le tag `lc-tpl` :

| Template | OS reconnu |
|---|---|
| `tpl-win11-pro-v1` | `win11` |
| `tpl-debian13-std-v1` | `debian13` |
| `tpl-ubuntu2404-std-v1` | `ubuntu2404` |
| `tpl-kali-std-v1` | `kali` |

Chaque template doit embarquer **`qemu-guest-agent` installé et démarré**, sans quoi rien ne
peut être configuré. Windows 11 réclame en plus `machine: q35`, un BIOS OVMF, un disque EFI et
un TPM 2.0.

**pfSense** avec l'API v2 et une interface DHCP configurée, **Guacamole** avec un compte
administrateur, et un projet **Supabase**.

## Installation

```bash
pnpm install
cp .env.example .env.local        # puis renseigner les valeurs
openssl rand -base64 32           # -> LC_ENCRYPTION_KEY
```

Appliquer les migrations de `supabase/migrations/` dans l'ordre.

```bash
pnpm dev        # application web
pnpm worker     # worker, dans un second terminal
```

En production, `docker compose up -d --build` monte les deux services.

## Vérifier la chaîne guest agent

Avant tout déploiement réel, valider le socle sur **une** VM :

```bash
pnpm probe:agent 201 bash          # ou : pnpm probe:agent 210 powershell
```

La sonde démarre la VM, attend l'agent, écrit un fichier, l'exécute, contrôle qu'une valeur
hostile ressort intacte et qu'un code de sortie non nul est bien détecté comme un échec. Tant
qu'elle n'est pas verte, aucun script ne s'exécutera sur les machines de formation.

## Bibliothèque de scripts

Voir [`scripts/README.md`](scripts/README.md) pour ajouter un outil.

## Développement

```bash
pnpm test          # vitest
pnpm exec tsc --noEmit
pnpm lint
pnpm run build
pnpm run worker:build   # bundle du worker, dist/worker.cjs
```

## Structure

| Chemin | Rôle |
|---|---|
| `app/` | Pages et routes d'API Next.js |
| `lib/orchestrator.ts` | Enchaînement des étapes d'un déploiement |
| `lib/pipeline/` | Configuration in-guest et étape Guacamole |
| `lib/services/` | Clients Proxmox, guest agent, pfSense, Guacamole, PDF |
| `lib/scripts/` | Chargement des registries, résolution des dépendances, échappement |
| `lib/queue.ts`, `worker/` | File de travaux et worker |
| `scripts/` | Bibliothèque de scripts de configuration, par OS |
| `supabase/migrations/` | Schéma, versionné |

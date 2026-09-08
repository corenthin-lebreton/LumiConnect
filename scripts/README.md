# Bibliothèque de scripts

Ce que LumiConnect exécute à l'intérieur des VMs après leur démarrage. Un script, un outil.

```
scripts/
  windows/registry.json     déclaration des scripts proposés pour Windows (PowerShell)
  windows/<id>.ps1          le script lui-même
  linux/registry.json       déclaration des scripts proposés pour Linux (bash)
  linux/<id>.sh
  _shared/                  scripts partagés
```

Un dossier par famille d'OS, pas par distribution. La famille est déduite du nom du template
Proxmox par mots-clés (`OS_FAMILIES` dans `lib/templates.ts`) : une nouvelle distribution
Linux, c'est un mot-clé de plus dans cette liste, et les scripts `linux/` doivent la supporter.

## Ajouter un outil

1. Écrire le script dans le dossier de la famille (`windows/` ou `linux/`), ou dans `_shared/`
   s'il vaut pour plusieurs.
2. Ajouter une entrée dans le `registry.json` concerné.
3. `pnpm test` — la syntaxe est contrôlée par `bash -n` et par l'analyseur PowerShell.

```json
{
  "id": "terraform",
  "label": "Terraform",
  "description": "Phrase affichée sous la case à cocher.",
  "requires": ["choco"],
  "timeout_sec": 900,
  "reboot_after": false,
  "file": "../_shared/apt-terraform.sh"
}
```

| Champ | Effet |
|---|---|
| `id` | Minuscules, chiffres et tirets. Sert de nom de fichier par défaut et d'identifiant en base. |
| `label` | Ce que lit le formateur. |
| `mandatory` | Coché et verrouillé, exécuté avant tout le reste. Un seul suffit par OS. |
| `requires` | Cocher ce script coche aussi ses dépendances, et l'ordre d'exécution en découle. |
| `timeout_sec` | Plafond. Au-delà, l'étape échoue et le processus reste en cours dans la VM. |
| `reboot_after` | Redémarre la VM puis attend le retour du guest agent avant la suite. |
| `file` | Chemin relatif au dossier de l'OS. Toute résolution sortant de `scripts/` est refusée. |

## Écrire un script

**Le contexte de la formation arrive par un fichier**, pas par des arguments — un mot de passe en
ligne de commande serait visible dans la liste des processus de la VM. Sourcer ce fichier en
tête :

```bash
. /opt/lumiconnect/context.env      # bash
```
```powershell
. 'C:\ProgramData\lumiconnect\context.ps1'   # powershell
```

Variables disponibles : `LC_HOSTNAME`, `LC_USERNAME`, `LC_PASSWORD`, `LC_IP`, `LC_VMID`.
Le fichier est supprimé de la VM à la fin de la configuration.

**Règles**

- **Idempotent.** Un script peut être rejoué sur une machine déjà configurée.
- **Sortir non nul en cas d'échec.** C'est le seul signal d'erreur. En bash, `set -euo pipefail` ;
  en PowerShell, `$ErrorActionPreference = 'Stop'`.
- **Écrire ce qui se passe sur la sortie standard.** Elle est conservée et affichée dans le
  détail de la VM ; c'est ce qu'on lit quand une machine a échoué.
- **60 Ko maximum** par fichier : c'est la limite de `agent/file-write` côté Proxmox.

**Côté Windows**

- Le guest agent tourne en **LocalSystem** : pas de profil utilisateur, pas de session
  interactive. `winget` n'est donc pas utilisable — c'est une application MSIX par utilisateur.
  Passer par Chocolatey, en déclarant `"requires": ["choco"]`.
- Le PATH du guest agent date du démarrage du service : appeler les exécutables installés par
  leur chemin complet (`$env:ProgramData\chocolatey\bin\choco.exe`).
- Les fichiers `.ps1` doivent porter un **BOM UTF-8**, sans quoi PowerShell 5.1 les lit en ANSI
  et casse les accents. Un test le vérifie.
- Les groupes intégrés portent des noms traduits : les viser par SID (`S-1-5-32-544` pour les
  administrateurs, `S-1-5-32-555` pour les utilisateurs du Bureau à distance).

## Ce qui n'a pas sa place ici

Les scripts sont exécutés en SYSTEM ou en root sur toutes les machines d'une formation, à partir
d'un clic dans une interface web. Ils vivent dans le dépôt et nulle part ailleurs : c'est ce qui
fait qu'ajouter du code exécutable passe forcément par un commit relu. Pas d'éditeur en ligne,
pas de contenu de script stocké en base.

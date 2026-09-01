#!/bin/bash
# LumiConnect — Docker, famille Debian.
#
# Utilise `docker.io` des dépôts de la distribution plutôt que le dépôt officiel Docker. Ce
# dernier ne publie pas de canal pour Kali, et faire correspondre Kali rolling à un nom de code
# Debian casse à chaque évolution de la distribution. La version des dépôts est un peu en retrait
# mais suffit largement pour de la formation, et le script reste identique sur les trois OS.
set -euo pipefail

CONTEXT=/opt/lumiconnect/context.env
if [ ! -r "$CONTEXT" ]; then
  echo "Fichier de contexte introuvable : $CONTEXT" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$CONTEXT"

: "${LC_USERNAME:?LC_USERNAME manquant dans le contexte}"

export DEBIAN_FRONTEND=noninteractive

echo "[docker] installation"
apt-get update -qq
apt-get install -y -qq docker.io

# Le paquet du plugin compose n'a pas le même nom partout et manque sur certaines versions :
# son absence ne doit pas faire échouer l'installation de Docker lui-même.
if ! apt-get install -y -qq docker-compose-v2; then
  echo "[docker] docker-compose-v2 indisponible dans les dépôts, ignoré"
fi

systemctl enable --now docker

echo "[docker] ajout de $LC_USERNAME au groupe docker"
usermod -aG docker "$LC_USERNAME"

# L'appartenance à un groupe n'est prise en compte qu'à l'ouverture de session suivante. Le
# stagiaire se connecte après le provisioning, donc il l'aura ; inutile de redémarrer la VM.

docker --version
echo "[docker] terminé"

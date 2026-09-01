#!/bin/bash
# LumiConnect — Git, famille Debian.
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

echo "[git] installation"
apt-get update -qq
apt-get install -y -qq git

# Sans branche par défaut configurée, git affiche un avertissement à chaque `git init`, ce qui
# fait perdre du temps en formation.
sudo -u "$LC_USERNAME" git config --global init.defaultBranch main
sudo -u "$LC_USERNAME" git config --global pull.rebase false

git --version
echo "[git] terminé"

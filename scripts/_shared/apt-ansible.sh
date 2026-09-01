#!/bin/bash
# LumiConnect — Ansible, famille Debian.
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

echo "[ansible] installation"
apt-get update -qq
apt-get install -y -qq ansible

# Un inventaire vide mais présent évite l'avertissement « provided hosts list is empty » au
# premier essai, et donne un point de départ visible au stagiaire.
INVENTORY_DIR="/home/$LC_USERNAME/ansible"
if [ ! -e "$INVENTORY_DIR/inventory.ini" ]; then
  mkdir -p "$INVENTORY_DIR"
  cat > "$INVENTORY_DIR/inventory.ini" <<'INI'
[local]
localhost ansible_connection=local
INI
  chown -R "$LC_USERNAME:$LC_USERNAME" "$INVENTORY_DIR"
fi

ansible --version | head -1
echo "[ansible] terminé"

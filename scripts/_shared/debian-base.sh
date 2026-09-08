#!/bin/bash
# LumiConnect — configuration de base, famille Debian (Debian 13, Ubuntu 24.04, Kali).
#
# Exécuté en root par le QEMU guest agent, une seule fois, juste après le premier démarrage
# du clone. Il doit être idempotent : un redéploiement peut le rejouer sur la même VM.
set -euo pipefail

CONTEXT=/opt/lumiconnect/context.env
if [ ! -r "$CONTEXT" ]; then
  echo "Fichier de contexte introuvable : $CONTEXT" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$CONTEXT"

: "${LC_HOSTNAME:?LC_HOSTNAME manquant dans le contexte}"

log() { echo "[base] $*"; }

# Tous les clones d'un même template partagent leur machine-id. Or le client DHCP en dérive son
# client-identifier, et ISC dhcpd (pfSense) fait correspondre les baux sur ce client-id avant
# l'adresse MAC : sans régénération, toutes les VMs se disputent la même adresse.
regenerate_machine_id() {
  log "régénération de machine-id"
  rm -f /etc/machine-id /var/lib/dbus/machine-id
  systemd-machine-id-setup >/dev/null
  mkdir -p /var/lib/dbus
  ln -sf /etc/machine-id /var/lib/dbus/machine-id
}

# Les clés d'hôte viennent du template : sans régénération, toutes les VMs présentent la même
# empreinte SSH, ce qui rend l'avertissement de changement de clé inopérant.
regenerate_ssh_host_keys() {
  log "régénération des clés d'hôte SSH"
  rm -f /etc/ssh/ssh_host_*
  ssh-keygen -A >/dev/null
}

set_hostname() {
  log "hostname : $LC_HOSTNAME"
  hostnamectl set-hostname "$LC_HOSTNAME"

  # 127.0.1.1 est la convention Debian pour le nom de la machine ; sans cette ligne, sudo
  # attend la résolution DNS et met plusieurs secondes à répondre.
  if grep -qE '^127\.0\.1\.1[[:space:]]' /etc/hosts; then
    sed -i -E "s/^127\.0\.1\.1[[:space:]].*/127.0.1.1\t$LC_HOSTNAME/" /etc/hosts
  else
    printf '127.0.1.1\t%s\n' "$LC_HOSTNAME" >> /etc/hosts
  fi
}

# L'ordre compte : l'identité machine doit être posée avant le hostname, qui est repris par le
# client DHCP dans sa demande.
regenerate_machine_id
regenerate_ssh_host_keys
set_hostname

log "terminé"

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
: "${LC_USERNAME:?LC_USERNAME manquant dans le contexte}"
: "${LC_PASSWORD:?LC_PASSWORD manquant dans le contexte}"

log() { echo "[base] $*"; }

primary_interface() {
  local iface
  iface=$(ip -o -4 route show default 2>/dev/null | awk '{print $5}' | head -1)
  if [ -z "$iface" ]; then
    iface=$(ip -o link show | awk -F': ' '$2 != "lo" {print $2; exit}')
  fi
  if [ -z "$iface" ]; then
    echo "Aucune interface réseau exploitable" >&2
    return 1
  fi
  printf '%s' "$iface"
}

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

ensure_user() {
  log "compte utilisateur : $LC_USERNAME"
  if id "$LC_USERNAME" >/dev/null 2>&1; then
    usermod -aG sudo "$LC_USERNAME"
  else
    useradd --create-home --shell /bin/bash --groups sudo "$LC_USERNAME"
  fi

  # Le mot de passe passe par stdin : en argument, il apparaîtrait dans /proc et dans
  # l'historique des processus de la VM.
  printf '%s:%s\n' "$LC_USERNAME" "$LC_PASSWORD" | chpasswd
}

enable_ssh() {
  log "activation de SSH"
  local unit=ssh
  systemctl list-unit-files 'sshd.service' 2>/dev/null | grep -q sshd.service && unit=sshd
  systemctl enable --now "$unit"
}

configure_dhcp_networkmanager() {
  local iface="$1" connection
  connection=$(nmcli -g GENERAL.CONNECTION device show "$iface" 2>/dev/null | head -1)

  if [ -z "$connection" ] || [ "$connection" = "--" ]; then
    log "NetworkManager : création d'un profil DHCP pour $iface"
    nmcli connection add type ethernet ifname "$iface" con-name "lumiconnect-$iface" \
      ipv4.method auto ipv6.method auto >/dev/null
    connection="lumiconnect-$iface"
  else
    log "NetworkManager : passage de « $connection » en DHCP"
    nmcli connection modify "$connection" \
      ipv4.method auto ipv4.addresses "" ipv4.gateway "" ipv4.dns "" >/dev/null
  fi

  nmcli connection up "$connection" >/dev/null
}

configure_dhcp_netplan() {
  local iface="$1" file=/etc/netplan/99-lumiconnect.yaml
  log "netplan : $iface en DHCP"

  cat > "$file" <<YAML
network:
  version: 2
  ethernets:
    $iface:
      dhcp4: true
      dhcp6: false
YAML

  # netplan refuse d'appliquer un fichier lisible par tous.
  chmod 600 "$file"
  netplan apply
}

configure_dhcp_ifupdown() {
  local iface="$1" file=/etc/network/interfaces.d/99-lumiconnect
  log "ifupdown : $iface en DHCP"

  mkdir -p /etc/network/interfaces.d
  cat > "$file" <<CFG
auto $iface
iface $iface inet dhcp
CFG

  ifdown "$iface" >/dev/null 2>&1 || true
  ifup "$iface"
}

configure_dhcp() {
  local iface
  iface=$(primary_interface)
  log "interface primaire : $iface"

  if systemctl is-active --quiet NetworkManager; then
    configure_dhcp_networkmanager "$iface"
  elif command -v netplan >/dev/null 2>&1 && [ -d /etc/netplan ]; then
    configure_dhcp_netplan "$iface"
  elif [ -d /etc/network ] || [ -f /etc/network/interfaces ]; then
    configure_dhcp_ifupdown "$iface"
  else
    echo "Aucun gestionnaire réseau reconnu (ni NetworkManager, ni netplan, ni ifupdown)" >&2
    return 1
  fi
}

# L'ordre compte : l'identité machine et le hostname doivent être posés avant la demande DHCP,
# sinon pfSense enregistre le bail sous l'ancien nom et l'ancien client-id.
regenerate_machine_id
regenerate_ssh_host_keys
set_hostname
ensure_user
enable_ssh
configure_dhcp

log "terminé"

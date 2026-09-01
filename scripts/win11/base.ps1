# LumiConnect — configuration de base, Windows 11 Pro.
#
# Exécuté par le QEMU guest agent, donc en LocalSystem : pas de profil utilisateur, pas de
# session interactive. Idempotent — un redéploiement peut le rejouer sur la même VM.
#
# Le renommage de la machine ne prend effet qu'au redémarrage : l'entrée de registry
# correspondante porte "reboot_after": true.
#
# Un clone lié ne passe pas par sysprep : toutes les VMs issues du même template partagent leur
# SID machine. Sans domaine Active Directory c'est sans conséquence ; avec un domaine, il faut
# généraliser le template au préalable.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step($message) { Write-Output "[base] $message" }

$context = 'C:\ProgramData\lumiconnect\context.ps1'
if (-not (Test-Path -LiteralPath $context)) {
    throw "Fichier de contexte introuvable : $context"
}
. $context

foreach ($name in 'LC_HOSTNAME', 'LC_USERNAME', 'LC_PASSWORD') {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        throw "$name manquant dans le contexte"
    }
}

# NetBIOS plafonne à 15 caractères. Au-delà, Rename-Computer échoue tard et le message est
# obscur : mieux vaut refuser tout de suite avec la vraie raison.
if ($env:LC_HOSTNAME.Length -gt 15) {
    throw "Nom de machine « $($env:LC_HOSTNAME) » : $($env:LC_HOSTNAME.Length) caractères, maximum 15"
}

# --- Compte utilisateur ---------------------------------------------------------------
Write-Step "compte utilisateur : $($env:LC_USERNAME)"
$password = ConvertTo-SecureString $env:LC_PASSWORD -AsPlainText -Force
$existing = Get-LocalUser -Name $env:LC_USERNAME -ErrorAction SilentlyContinue

if ($existing) {
    Set-LocalUser -Name $env:LC_USERNAME -Password $password -PasswordNeverExpires $true
} else {
    New-LocalUser -Name $env:LC_USERNAME -Password $password `
        -PasswordNeverExpires -AccountNeverExpires | Out-Null
}

# Les noms de groupes intégrés sont traduits ("Administrateurs" sur un Windows français) mais
# leurs SID sont universels : c'est le seul moyen fiable de les viser.
$administrators = (Get-LocalGroup -SID 'S-1-5-32-544').Name
$remoteDesktopUsers = (Get-LocalGroup -SID 'S-1-5-32-555').Name

foreach ($group in $administrators, $remoteDesktopUsers) {
    $isMember = Get-LocalGroupMember -Group $group -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*\$($env:LC_USERNAME)" }
    if (-not $isMember) {
        Add-LocalGroupMember -Group $group -Member $env:LC_USERNAME
        Write-Step "ajouté au groupe $group"
    }
}

# --- Bureau à distance ----------------------------------------------------------------
Write-Step 'activation du Bureau à distance'
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' `
    -Name 'fDenyTSConnections' -Value 0

# NLA laissé actif : Guacamole fournit les identifiants à la connexion, donc l'authentification
# préalable ne gêne pas, et la désactiver exposerait l'écran de connexion sans authentification.
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' `
    -Name 'UserAuthentication' -Value 1

Enable-NetFirewallRule -Group '@FirewallAPI.dll,-28752' -ErrorAction SilentlyContinue
Set-Service -Name TermService -StartupType Automatic
if ((Get-Service TermService).Status -ne 'Running') { Start-Service TermService }

# --- Réseau en DHCP -------------------------------------------------------------------
Write-Step 'cartes réseau en DHCP'
$adapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' }
if (-not $adapters) { throw 'Aucune carte réseau physique active' }

foreach ($adapter in $adapters) {
    $interface = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4
    if ($interface.Dhcp -ne 'Enabled') {
        # Une adresse statique résiduelle empêche le passage en DHCP tant qu'elle est là.
        Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 `
            -ErrorAction SilentlyContinue |
            Where-Object { $_.PrefixOrigin -eq 'Manual' } |
            Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue

        Get-NetRoute -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 `
            -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
            Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue

        Set-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -Dhcp Enabled
    }
    Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ResetServerAddresses
}

# --- Nom de machine -------------------------------------------------------------------
# En dernier : le renouvellement DHCP qui suit le redémarrage annoncera le bon nom à pfSense.
if ($env:COMPUTERNAME -ne $env:LC_HOSTNAME) {
    Write-Step "renommage : $($env:COMPUTERNAME) -> $($env:LC_HOSTNAME) (effectif au redémarrage)"
    Rename-Computer -NewName $env:LC_HOSTNAME -Force
} else {
    Write-Step "nom de machine déjà correct : $($env:LC_HOSTNAME)"
}

Write-Step 'terminé'
exit 0

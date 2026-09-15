# LumiConnect — SQL Server 2025 Developer.
#
# Le guest agent s'exécute en LocalSystem. Une installation par défaut n'accorde le rôle
# sysadmin qu'au compte installeur, donc à SYSTEM : le stagiaire ouvrirait SSMS sans pouvoir
# créer la moindre base. D'où SQLSYSADMINACCOUNTS, qui nomme explicitement son compte.
#
# Les paramètres passent par un ConfigurationFile.ini et non par la ligne de commande, parce
# que SAPWD y serait lisible dans la liste des processus de la VM. Le paquet Chocolatey
# n'accepte de toute façon que /ConfigurationFile: — et quand il le reçoit, il REMPLACE ses
# arguments par défaut au lieu de les compléter : ACTION, INSTANCENAME et INSTANCEID doivent
# donc être déclarés ici, sans quoi l'installation part sur une instance par défaut.
#
# Le fichier est créé vide, verrouillé, puis rempli : ProgramData hérite d'un droit de lecture
# pour Users, et l'écrire avant de poser l'ACL exposerait le mot de passe le temps d'un instant.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step($message) { Write-Output "[sqlserver] $message" }

$context = 'C:\ProgramData\lumiconnect\context.ps1'
if (-not (Test-Path -LiteralPath $context)) {
    throw "Fichier de contexte introuvable : $context"
}
. $context

foreach ($name in 'LC_USERNAME', 'LC_PASSWORD') {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        throw "$name manquant dans le contexte"
    }
}

$service = 'MSSQL$SQLEXPRESS'

if (Get-Service -Name $service -ErrorAction SilentlyContinue) {
    Write-Step "déjà installé, service $service présent"
    exit 0
}

$choco = Join-Path $env:ProgramData 'chocolatey\bin\choco.exe'
if (-not (Test-Path -LiteralPath $choco)) {
    throw "Chocolatey introuvable ($choco). Le script « choco » doit s'exécuter avant celui-ci."
}

# Le .ini est lu en ANSI par le programme d'installation. Un mot de passe hors ASCII y serait
# transformé silencieusement, et l'échec n'apparaîtrait qu'à la première connexion sa.
if ($env:LC_PASSWORD -notmatch '^[\x20-\x7E]+$') {
    throw 'LC_PASSWORD contient des caractères hors ASCII imprimable, incompatibles avec le fichier de configuration'
}

# Le paquet Chocolatey refuse d'installer tant qu'un redémarrage est en attente (règle
# RebootRequiredCheck de SQL Server) et le signale par un code -1 opaque. Windows Update,
# Defender ou Chocolatey posent ces marqueurs à tout moment, y compris juste après le boot :
# la vérification se fait donc ici, au plus près de l'installation, avec les mêmes clés que le
# paquet. Le code 3010 demande à l'application de redémarrer la VM et de relancer ce script.
function Test-PendingReboot {
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { return $true }
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { return $true }
    $sm = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
    if ($sm -and $sm.PendingFileRenameOperations) { return $true }
    foreach ($value in 'JoinDomain', 'AvoidSpnSet') {
        if (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\Netlogon' -Name $value -ErrorAction SilentlyContinue) { return $true }
    }
    $active = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\ComputerName\ActiveComputerName' -Name ComputerName -ErrorAction SilentlyContinue).ComputerName
    $target = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\ComputerName\ComputerName' -Name ComputerName -ErrorAction SilentlyContinue).ComputerName
    if ($active -and $target -and $active -ne $target) { return $true }
    return $false
}

if (Test-PendingReboot) {
    Write-Step 'redémarrage Windows en attente, installation reportée après redémarrage'
    exit 3010
}

$sysadmins = '"{0}\{1}" "NT AUTHORITY\SYSTEM"' -f $env:COMPUTERNAME, $env:LC_USERNAME
Write-Step "sysadmin : $env:COMPUTERNAME\$env:LC_USERNAME"

$ini = Join-Path $env:ProgramData 'lumiconnect\sqlexpress-setup.ini'

try {
    New-Item -ItemType File -Path $ini -Force | Out-Null

    $acl = Get-Acl -LiteralPath $ini
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in $acl.Access) { $null = $acl.RemoveAccessRule($rule) }
    foreach ($sid in 'S-1-5-18', 'S-1-5-32-544') {
        $account = New-Object System.Security.Principal.SecurityIdentifier($sid)
        $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $account, 'FullControl', 'None', 'None', 'Allow')))
    }
    Set-Acl -LiteralPath $ini -AclObject $acl

    Set-Content -LiteralPath $ini -Encoding Ascii -Value @(
        '[OPTIONS]'
        'ACTION="Install"'
        'FEATURES=SQLENGINE'
        'INSTANCENAME="SQLEXPRESS"'
        'INSTANCEID="SQLEXPRESS"'
        'SQLSVCSTARTUPTYPE="Automatic"'
        'SECURITYMODE="SQL"'
        ('SAPWD="{0}"' -f $env:LC_PASSWORD)
        ('SQLSYSADMINACCOUNTS={0}' -f $sysadmins)
        'TCPENABLED="0"'
        'NPENABLED="0"'
        'BROWSERSVCSTARTUPTYPE="Disabled"'
        'UPDATEENABLED="False"'
        'QUIET="True"'
        'IACCEPTSQLSERVERLICENSETERMS="True"'
    )

    # L'édition Developer s'installe depuis un ISO téléchargé (~500 Mo, contre un petit
    # bootstrapper pour Express) : --skip-virus-check évite l'échec du scan en ligne de
    # Chocolatey, qui ne gère pas les fichiers de cette taille (recommandation du paquet).
    Write-Step 'installation, compter une trentaine de minutes'
    & $choco install sql-server-2025 -y --no-progress --limit-output --skip-virus-check --params "/ConfigurationFile:$ini"

    # 3010 = installé, redémarrage demandé. 1116 est déclaré valide par le paquet lui-même.
    if ($LASTEXITCODE -notin @(0, 3010, 1116)) {
        throw "choco install sql-server-2025 a terminé avec le code $LASTEXITCODE"
    }
}
finally {
    Remove-Item -LiteralPath $ini -Force -ErrorAction SilentlyContinue
}

$svc = Get-Service -Name $service -ErrorAction SilentlyContinue
if (-not $svc) {
    throw "Service $service absent après installation"
}
if ($svc.Status -ne 'Running') {
    Write-Step "démarrage du service $service"
    Start-Service -Name $service
}

# TCP/IP et les canaux nommés restent désactivés : la connexion locale passe par la mémoire
# partagée. Interroger réellement l'instance est le seul moyen de distinguer « service démarré »
# de « instance exploitable ».
Add-Type -AssemblyName System.Data
$connection = New-Object System.Data.SqlClient.SqlConnection(
    'Server=localhost\SQLEXPRESS;Integrated Security=SSPI;Connect Timeout=30')
try {
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandText = 'SELECT SERVERPROPERTY(''ProductVersion''), SERVERPROPERTY(''Edition'')'
    $reader = $command.ExecuteReader()
    if ($reader.Read()) {
        Write-Step ('instance en service : {0}, version {1}' -f $reader.GetValue(1), $reader.GetValue(0))
    }
    $reader.Close()
}
finally {
    $connection.Close()
}

Write-Step 'connexion SSMS : localhost\SQLEXPRESS'
Write-Step 'terminé'
exit 0

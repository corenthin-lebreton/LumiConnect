$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step($message) { Write-Output "[choco] $message" }

$context = 'C:\ProgramData\lumiconnect\context.ps1'
if (-not (Test-Path -LiteralPath $context)) {
    throw "Fichier de contexte introuvable : $context"
}
. $context

$chocoExe = Join-Path $env:ProgramData 'chocolatey\bin\choco.exe'

if (Test-Path -LiteralPath $chocoExe) {
    Write-Step "déjà installé : $(& $chocoExe --version)"
    exit 0
}

$installUrl = if ($env:LC_CHOCO_INSTALL_URL) {
    $env:LC_CHOCO_INSTALL_URL
} else {
    'https://community.chocolatey.org/install.ps1'
}

Write-Step "installation depuis $installUrl"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-Expression ((New-Object System.Net.WebClient).DownloadString($installUrl))

if (-not (Test-Path -LiteralPath $chocoExe)) {
    throw "Chocolatey introuvable après installation ($chocoExe)"
}

# Les scripts suivants sont lancés par le guest agent, dont l'environnement date du démarrage du
# service : il ne connaîtra pas le PATH ajouté par Chocolatey. Ils appellent donc choco.exe par
# son chemin complet, et cette confirmation sert au diagnostic.
Write-Step "installé : $(& $chocoExe --version)"
Write-Step 'terminé'
exit 0

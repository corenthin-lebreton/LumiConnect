# LumiConnect — Git pour Windows.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step($message) { Write-Output "[git] $message" }

$context = 'C:\ProgramData\lumiconnect\context.ps1'
if (-not (Test-Path -LiteralPath $context)) {
    throw "Fichier de contexte introuvable : $context"
}
. $context

# Le guest agent hérite de l'environnement du démarrage du service : le PATH ajouté par
# Chocolatey en est absent. D'où l'appel par chemin complet.
$choco = Join-Path $env:ProgramData 'chocolatey\bin\choco.exe'
if (-not (Test-Path -LiteralPath $choco)) {
    throw "Chocolatey introuvable ($choco). Le script « choco » doit s'exécuter avant celui-ci."
}

Write-Step 'installation'
& $choco install git -y --no-progress --limit-output

# 0 = installé, 3010 = installé mais un redémarrage est demandé. Traiter 3010 comme un échec
# ferait échouer une installation qui a pourtant réussi.
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
    throw "choco install git a terminé avec le code $LASTEXITCODE"
}

$gitExe = Join-Path $env:ProgramFiles 'Git\cmd\git.exe'
if (Test-Path -LiteralPath $gitExe) {
    Write-Step (& $gitExe --version)
} else {
    Write-Step 'git.exe non trouvé à son emplacement habituel, vérifier manuellement'
}

Write-Step 'terminé'
exit 0

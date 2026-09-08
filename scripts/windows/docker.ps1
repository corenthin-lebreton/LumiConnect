# LumiConnect — Docker Desktop pour Windows.
#
# Docker Desktop repose sur WSL2 : Chocolatey active les fonctionnalités Windows nécessaires,
# qui ne prennent effet qu'au redémarrage. D'où "reboot_after": true dans le registry.
#
# Le démon ne tourne pas en continu comme sous Linux : Docker Desktop démarre à l'ouverture de
# session. Le stagiaire l'aura donc en se connectant en RDP, pas avant.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step($message) { Write-Output "[docker] $message" }

$context = 'C:\ProgramData\lumiconnect\context.ps1'
if (-not (Test-Path -LiteralPath $context)) {
    throw "Fichier de contexte introuvable : $context"
}
. $context

$choco = Join-Path $env:ProgramData 'chocolatey\bin\choco.exe'
if (-not (Test-Path -LiteralPath $choco)) {
    throw "Chocolatey introuvable ($choco). Le script « choco » doit s'exécuter avant celui-ci."
}

Write-Step 'activation de WSL2'
& $choco install wsl2 -y --no-progress --limit-output
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
    throw "choco install wsl2 a terminé avec le code $LASTEXITCODE"
}

Write-Step 'installation de Docker Desktop'
& $choco install docker-desktop -y --no-progress --limit-output
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
    throw "choco install docker-desktop a terminé avec le code $LASTEXITCODE"
}

# Sans appartenance à ce groupe, Docker Desktop réclame une élévation à chaque démarrage.
$dockerUsers = Get-LocalGroup -Name 'docker-users' -ErrorAction SilentlyContinue
if ($dockerUsers) {
    $already = Get-LocalGroupMember -Group $dockerUsers.Name -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*\$($env:LC_USERNAME)" }
    if (-not $already) {
        Add-LocalGroupMember -Group $dockerUsers.Name -Member $env:LC_USERNAME
        Write-Step "$($env:LC_USERNAME) ajouté au groupe docker-users"
    }
} else {
    Write-Step 'groupe docker-users absent, ajout ignoré'
}

Write-Step 'terminé — effectif après le redémarrage'
exit 0

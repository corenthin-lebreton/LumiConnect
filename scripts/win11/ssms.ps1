# LumiConnect — SQL Server Management Studio.
#
# Le paquet « ssms » de Chocolatey est abandonné : figé sur la version 15 depuis 2021. Le
# paquet maintenu est « sql-server-management-studio ».
#
# SSMS est un client : il n'a pas besoin d'une instance pour s'installer. La dépendance
# déclarée vers « sqlserver » sert à l'ordre d'exécution et évite de poser une console sans
# rien à administrer.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step($message) { Write-Output "[ssms] $message" }

$context = 'C:\ProgramData\lumiconnect\context.ps1'
if (-not (Test-Path -LiteralPath $context)) {
    throw "Fichier de contexte introuvable : $context"
}
. $context

# Le numéro de version fait partie du chemin d'installation et change à chaque version majeure.
# Le chercher évite d'avoir à le suivre ici.
function Find-Ssms {
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
    foreach ($root in $roots) {
        $found = Get-ChildItem -Path (Join-Path $root 'Microsoft SQL Server Management Studio*') `
            -Filter 'Ssms.exe' -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

$existing = Find-Ssms
if ($existing) {
    Write-Step "déjà installé : $existing"
    exit 0
}

$choco = Join-Path $env:ProgramData 'chocolatey\bin\choco.exe'
if (-not (Test-Path -LiteralPath $choco)) {
    throw "Chocolatey introuvable ($choco). Le script « choco » doit s'exécuter avant celui-ci."
}

Write-Step 'installation, compter une dizaine de minutes'
& $choco install sql-server-management-studio -y --no-progress --limit-output

if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
    throw "choco install sql-server-management-studio a terminé avec le code $LASTEXITCODE"
}

$ssmsExe = Find-Ssms
if (-not $ssmsExe) {
    throw 'Ssms.exe introuvable après installation'
}

Write-Step "installé : $ssmsExe"
Write-Step 'terminé'
exit 0

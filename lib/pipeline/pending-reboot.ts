// Détection d'un redémarrage Windows en attente.
//
// Le programme d'installation de SQL Server refuse de démarrer tant qu'un redémarrage est
// en attente (règle RebootRequiredCheck), et l'erreur remonte sous la forme opaque d'un
// « choco install a terminé avec le code -1 ». Chocolatey lui-même, .NET Framework ou une
// mise à jour Windows laissent régulièrement l'un de ces marqueurs.
//
// La sonde sort toujours en 0 : waitForExec traite le moindre code non nul comme un échec
// d'étape, le résultat passe donc par stdout.

const MARKER = "LC_REBOOT_PENDING";

const PROBE = [
  "$pending = $false",
  "if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') { $pending = $true }",
  "if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $pending = $true }",
  "$sm = Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue",
  "if ($sm -and $sm.PendingFileRenameOperations) { $pending = $true }",
  "$active = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\ComputerName\\ActiveComputerName' -Name ComputerName -ErrorAction SilentlyContinue).ComputerName",
  "$target = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\ComputerName\\ComputerName' -Name ComputerName -ErrorAction SilentlyContinue).ComputerName",
  "if ($active -and $target -and $active -ne $target) { $pending = $true }",
  `Write-Output ('${MARKER}=' + $(if ($pending) { '1' } else { '0' }))`,
  "exit 0",
].join("; ");

export const PENDING_REBOOT_COMMAND: string[] = [
  "powershell.exe",
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  PROBE,
];

export function parsePendingReboot(stdout: string): boolean {
  const match = stdout.match(new RegExp(`${MARKER}=([01])`));
  if (!match) {
    throw new Error(
      `sortie illisible de la sonde de redémarrage en attente : ${JSON.stringify(stdout.slice(0, 200))}`
    );
  }
  return match[1] === "1";
}

export type Shell = "powershell" | "bash";

export function escapePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function escapeBash(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function escapeFor(shell: Shell, value: string): string {
  return shell === "powershell" ? escapePowerShell(value) : escapeBash(value);
}

function assertSingleLine(name: string, value: string): void {
  if (/[\r\n\u2028\u2029]/.test(value)) {
    throw new Error(
      `Valeur de contexte invalide pour ${name} : les retours à la ligne sont interdits`
    );
  }
  if (value.includes("\0")) {
    throw new Error(`Valeur de contexte invalide pour ${name} : octet nul interdit`);
  }
}

const NAME_PATTERN = /^LC_[A-Z0-9_]+$/;

export function renderContextFile(shell: Shell, values: Record<string, string>): string {
  const entries = Object.entries(values);
  for (const [name, value] of entries) {
    if (!NAME_PATTERN.test(name)) {
      throw new Error(`Nom de variable de contexte invalide : ${name}`);
    }
    assertSingleLine(name, value);
  }

  if (shell === "powershell") {
    const lines = entries.map(([name, value]) => `$env:${name} = ${escapePowerShell(value)}`);
    return ["# Généré par LumiConnect — ne pas éditer", ...lines, ""].join("\r\n");
  }

  const lines = entries.map(([name, value]) => `export ${name}=${escapeBash(value)}`);
  return ["# Généré par LumiConnect — ne pas éditer", ...lines, ""].join("\n");
}

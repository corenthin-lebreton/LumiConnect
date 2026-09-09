import { describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { loadRegistry, resolveScriptPath } from "./registry";

const run = promisify(execFile);

const OS_IDS = ["windows", "linux"] as const;

function isAvailable(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const HAS_PWSH = isAvailable("pwsh");

describe("bibliothèque de scripts — syntaxe", () => {
  it("chaque script bash parse", async () => {
    for (const osId of OS_IDS) {
      const registry = await loadRegistry(osId);
      if (registry.shell !== "bash") continue;

      for (const entry of registry.scripts) {
        const file = resolveScriptPath(registry, entry);
        await expect(
          run("bash", ["-n", file]),
          `${osId}/${entry.id} (${file})`
        ).resolves.toBeDefined();
      }
    }
  });

  // Un démarrage de pwsh coûte une à deux secondes : les scripts sont analysés en parallèle,
  // et le délai par défaut de 5 s ne suffit pas là où pwsh est installé (runners CI).
  it.runIf(HAS_PWSH)(
    "chaque script PowerShell parse",
    async () => {
      for (const osId of OS_IDS) {
        const registry = await loadRegistry(osId);
        if (registry.shell !== "powershell") continue;

        const parsed = await Promise.all(
          registry.scripts.map(async (entry) => {
            const file = resolveScriptPath(registry, entry);
            const { stdout } = await run("pwsh", [
              "-NoProfile",
              "-Command",
              `$e = $null
               $null = [System.Management.Automation.Language.Parser]::ParseFile('${file}', [ref]$null, [ref]$e)
               if ($e -and $e.Count -gt 0) { $e | ForEach-Object { $_.Message } } else { 'OK' }`,
            ]);
            return { id: entry.id, output: stdout.trim() };
          })
        );

        for (const { id, output } of parsed) {
          expect(output, `${osId}/${id}`).toBe("OK");
        }
      }
    },
    120_000
  );
});

describe("bibliothèque de scripts — conventions", () => {
  it("chaque script PowerShell porte un BOM UTF-8", async () => {
    for (const osId of OS_IDS) {
      const registry = await loadRegistry(osId);
      if (registry.shell !== "powershell") continue;

      const { readFile } = await import("node:fs/promises");
      for (const entry of registry.scripts) {
        const bytes = await readFile(resolveScriptPath(registry, entry));
        expect(
          [bytes[0], bytes[1], bytes[2]],
          `${osId}/${entry.id} doit commencer par EF BB BF`
        ).toEqual([0xef, 0xbb, 0xbf]);
      }
    }
  });

  it("chaque script lit le fichier de contexte plutôt que des arguments", async () => {
    for (const osId of OS_IDS) {
      const registry = await loadRegistry(osId);
      const { readFile } = await import("node:fs/promises");

      for (const entry of registry.scripts) {
        const content = await readFile(resolveScriptPath(registry, entry), "utf8");
        expect(content, `${osId}/${entry.id}`).toMatch(/lumiconnect[/\\]context\./);
      }
    }
  });
});

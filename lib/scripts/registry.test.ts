import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  SCRIPTS_ROOT,
  isValidOsId,
  loadRegistry,
  loadScriptContent,
  resolveScriptPath,
  type ScriptEntry,
  type ScriptRegistry,
} from "./registry";

const OS_IDS = ["windows", "linux"] as const;

describe("isValidOsId", () => {
  it("accepte les identifiants du projet", () => {
    for (const osId of OS_IDS) expect(isValidOsId(osId)).toBe(true);
  });

  it("rejette ce qui pourrait servir à sortir du dossier scripts/", () => {
    for (const hostile of ["..", "../..", "windows/../..", "win dows", "WINDOWS", "windows/"]) {
      expect(isValidOsId(hostile)).toBe(false);
    }
  });
});

describe("loadRegistry", () => {
  it("charge et valide les deux registries livrés", async () => {
    for (const osId of OS_IDS) {
      const registry = await loadRegistry(osId);
      expect(registry.os_id).toBe(osId);
      expect(registry.scripts.length).toBeGreaterThan(0);
    }
  });

  it("expose un script de base obligatoire pour Linux", async () => {
    const registry = await loadRegistry("linux");
    const base = registry.scripts.find((entry) => entry.id === "base");
    expect(base).toBeDefined();
    expect(base!.mandatory).toBe(true);
  });

  it("associe le bon shell à chaque famille", async () => {
    expect((await loadRegistry("windows")).shell).toBe("powershell");
    expect((await loadRegistry("linux")).shell).toBe("bash");
  });

  it("refuse un os_id qui n'est pas un simple identifiant", async () => {
    await expect(loadRegistry("../_shared")).rejects.toThrow(/os_id invalide/);
  });

  it("signale clairement un OS sans registry", async () => {
    await expect(loadRegistry("freebsd14")).rejects.toThrow(/Aucun registry/);
  });
});

describe("resolveScriptPath", () => {
  const bashRegistry: ScriptRegistry = { os_id: "linux", shell: "bash", scripts: [] };
  const psRegistry: ScriptRegistry = { os_id: "windows", shell: "powershell", scripts: [] };

  const entry = (overrides: Partial<ScriptEntry>): ScriptEntry => ({
    id: "docker",
    label: "Docker",
    mandatory: false,
    requires: [],
    timeout_sec: 900,
    reboot_after: false,
    reboot_if_pending: false,
    per_vm: false,
    ...overrides,
  });

  it("déduit le nom de fichier de l'id et du shell", () => {
    expect(resolveScriptPath(bashRegistry, entry({}))).toBe(
      path.join(SCRIPTS_ROOT, "linux", "docker.sh")
    );
    expect(resolveScriptPath(psRegistry, entry({}))).toBe(
      path.join(SCRIPTS_ROOT, "windows", "docker.ps1")
    );
  });

  it("autorise la mutualisation via _shared", () => {
    expect(resolveScriptPath(bashRegistry, entry({ file: "../_shared/apt-docker.sh" }))).toBe(
      path.join(SCRIPTS_ROOT, "_shared", "apt-docker.sh")
    );
  });

  it("rejette tout chemin qui sort de scripts/", () => {
    for (const hostile of [
      "../../lib/crypto.ts",
      "../../../etc/passwd",
      "/etc/passwd",
      "..",
    ]) {
      expect(() => resolveScriptPath(bashRegistry, entry({ file: hostile }))).toThrow(
        /hors de scripts/
      );
    }
  });
});

describe("loadScriptContent", () => {
  it("lit le script de base Linux", async () => {
    const registry = await loadRegistry("linux");
    const base = registry.scripts.find((entry) => entry.id === "base")!;
    const content = await loadScriptContent(registry, base);
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("LC_HOSTNAME");
  });

  it("tient dans la limite de agent/file-write", async () => {
    for (const osId of OS_IDS) {
      const registry = await loadRegistry(osId);
      for (const entry of registry.scripts) {
        const content = await loadScriptContent(registry, entry);
        expect(content.length, `${osId}/${entry.id}`).toBeLessThan(61440);
      }
    }
  });
});

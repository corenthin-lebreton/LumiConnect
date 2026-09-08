import { describe, expect, it } from "vitest";
import { needsReboot } from "@/lib/pipeline/reboot-step";
import type { ScriptEntry } from "@/lib/scripts/registry";

function entry(id: string, reboot_after = false): ScriptEntry {
  return { id, label: id, mandatory: false, requires: [], timeout_sec: 60, reboot_after };
}

describe("needsReboot", () => {
  it("ne redémarre pas une VM qui n'a exécuté aucun script", () => {
    expect(needsReboot([])).toBe(false);
  });

  it("redémarre après une configuration qui ne l'a pas déjà fait", () => {
    expect(needsReboot([entry("git"), entry("ssms")])).toBe(true);
  });

  it("ne redémarre pas deux fois quand le dernier script l'a déjà fait", () => {
    expect(needsReboot([entry("choco"), entry("docker", true)])).toBe(false);
  });

  it("redémarre si un reboot intermédiaire a été suivi d'autres scripts", () => {
    expect(needsReboot([entry("docker", true), entry("sqlserver")])).toBe(true);
  });
});

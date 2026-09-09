import { describe, expect, it } from "vitest";
import { splitEntries } from "@/lib/orchestrator";
import type { ScriptEntry } from "@/lib/scripts/registry";

function entry(id: string, per_vm = false): ScriptEntry {
  return {
    id,
    label: id,
    mandatory: false,
    requires: [],
    timeout_sec: 60,
    reboot_after: false,
    reboot_if_pending: false,
    per_vm,
  };
}

describe("splitEntries", () => {
  it("sépare identité machine et installation en gardant l'ordre", () => {
    const { golden, perVm } = splitEntries([
      entry("base", true),
      entry("git"),
      entry("docker"),
      entry("identity-2", true),
    ]);
    expect(golden.map((e) => e.id)).toEqual(["git", "docker"]);
    expect(perVm.map((e) => e.id)).toEqual(["base", "identity-2"]);
  });

  it("laisse les deux partitions vides sans script", () => {
    expect(splitEntries([])).toEqual({ golden: [], perVm: [] });
  });

  it("met tout sur la dorée quand rien n'est per_vm (Windows)", () => {
    const { golden, perVm } = splitEntries([entry("choco"), entry("git")]);
    expect(golden).toHaveLength(2);
    expect(perVm).toHaveLength(0);
  });
});

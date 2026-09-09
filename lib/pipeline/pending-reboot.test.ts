import { describe, expect, it } from "vitest";
import { PENDING_REBOOT_COMMAND, parsePendingReboot } from "./pending-reboot";

describe("parsePendingReboot", () => {
  it("lit un redémarrage en attente", () => {
    expect(parsePendingReboot("LC_REBOOT_PENDING=1\r\n")).toBe(true);
  });

  it("lit une machine propre", () => {
    expect(parsePendingReboot("LC_REBOOT_PENDING=0\r\n")).toBe(false);
  });

  it("rejette une sortie sans marqueur plutôt que de supposer la machine propre", () => {
    expect(() => parsePendingReboot("Access is denied.")).toThrow(/illisible/);
  });
});

describe("PENDING_REBOOT_COMMAND", () => {
  it("s'exécute sans profil ni interaction et sort toujours en 0", () => {
    expect(PENDING_REBOOT_COMMAND.slice(0, 4)).toEqual([
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
    ]);
    expect(PENDING_REBOOT_COMMAND[4]).toContain("exit 0");
  });
});

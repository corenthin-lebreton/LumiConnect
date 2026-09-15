import { describe, expect, it } from "vitest";
import { REBOOT_PENDING_EXIT_CODE, runWithRebootRetry } from "./pending-reboot";
import type { RunScriptOutcome } from "@/lib/services/proxmox-agent";
import type { ServiceResult } from "@/types";

function outcome(exitcode: number): ServiceResult<RunScriptOutcome> {
  const data = { exitcode, stdout: "", stderr: "", truncated: false };
  return exitcode === 0
    ? { success: true, data }
    : { success: false, data, error: `code ${exitcode}` };
}

function sequence(...codes: number[]) {
  const calls: number[] = [];
  const run = async () => {
    const code = codes[calls.length] ?? 0;
    calls.push(code);
    return outcome(code);
  };
  return { run, calls };
}

describe("runWithRebootRetry", () => {
  it("rend le résultat tel quel quand le script réussit", async () => {
    const { run, calls } = sequence(0);
    let restarts = 0;
    const result = await runWithRebootRetry("sqlserver", run, async () => {
      restarts++;
      return { success: true };
    });
    expect(result.success).toBe(true);
    expect(calls).toEqual([0]);
    expect(restarts).toBe(0);
  });

  it("rend l'échec tel quel quand le code n'est pas celui du redémarrage", async () => {
    const { run } = sequence(1);
    let restarts = 0;
    const result = await runWithRebootRetry("sqlserver", run, async () => {
      restarts++;
      return { success: true };
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("code 1");
    expect(restarts).toBe(0);
  });

  it("redémarre puis relance le script quand il signale un redémarrage en attente", async () => {
    const { run, calls } = sequence(REBOOT_PENDING_EXIT_CODE, 0);
    let restarts = 0;
    const result = await runWithRebootRetry("sqlserver", run, async () => {
      restarts++;
      return { success: true };
    });
    expect(result.success).toBe(true);
    expect(restarts).toBe(1);
    expect(calls).toEqual([REBOOT_PENDING_EXIT_CODE, 0]);
  });

  it("abandonne quand le redémarrage reste en attente après redémarrage", async () => {
    const { run, calls } = sequence(REBOOT_PENDING_EXIT_CODE, REBOOT_PENDING_EXIT_CODE);
    const result = await runWithRebootRetry("sqlserver", run, async () => ({ success: true }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/reste en attente après redémarrage/);
    expect(result.error).toContain("sqlserver");
    expect(calls).toHaveLength(2);
  });

  it("remonte l'échec du redémarrage sans relancer le script", async () => {
    const { run, calls } = sequence(REBOOT_PENDING_EXIT_CODE, 0);
    const result = await runWithRebootRetry("sqlserver", run, async () => ({
      success: false,
      error: "arrêt : délai dépassé",
    }));
    expect(result.success).toBe(false);
    expect(result.error).toBe("redémarrage avant sqlserver : arrêt : délai dépassé");
    expect(calls).toHaveLength(1);
  });
});

// Redémarrage Windows en attente avant un script.
//
// Le programme d'installation de SQL Server refuse de démarrer tant qu'un redémarrage est
// en attente (règle RebootRequiredCheck). Chocolatey lui-même, .NET Framework, Windows Update
// ou Defender laissent régulièrement l'un de ces marqueurs — y compris dans la minute qui suit
// le boot, donc APRÈS une sonde lancée depuis l'application. Le script vérifie donc lui-même
// les marqueurs juste avant d'installer et, s'il en trouve, sort avec le code 3010
// (ERROR_SUCCESS_REBOOT_REQUIRED) : l'application redémarre la VM et relance le script, qui
// est idempotent. Un second 3010 après redémarrage est une erreur définitive.

import type { RunScriptOutcome } from "@/lib/services/proxmox-agent";
import type { ServiceResult } from "@/types";
import { createLogger } from "@/lib/log";

const log = createLogger("configure");

export const REBOOT_PENDING_EXIT_CODE = 3010;

export async function runWithRebootRetry(
  scriptId: string,
  run: () => Promise<ServiceResult<RunScriptOutcome>>,
  restart: () => Promise<ServiceResult>
): Promise<ServiceResult<RunScriptOutcome>> {
  const first = await run();
  if (first.success || first.data?.exitcode !== REBOOT_PENDING_EXIT_CODE) return first;

  log.info(`redémarrage en attente avant ${scriptId}`);
  const restarted = await restart();
  if (!restarted.success) {
    return { success: false, error: `redémarrage avant ${scriptId} : ${restarted.error}` };
  }

  const second = await run();
  if (!second.success && second.data?.exitcode === REBOOT_PENDING_EXIT_CODE) {
    return {
      success: false,
      data: second.data,
      error: `un redémarrage Windows reste en attente après redémarrage, ${scriptId} ne peut pas s'installer`,
    };
  }
  return second;
}

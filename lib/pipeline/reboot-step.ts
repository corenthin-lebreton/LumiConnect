import { rebootVm, waitForAgent } from "@/lib/services/proxmox-agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import { mapWithConcurrency, readConcurrency } from "@/lib/pool";
import type { ScriptEntry } from "@/lib/scripts/registry";
import type { Formation } from "@/types";

const REBOOT_STEP = "reboot";

export const REBOOT_STEPS: StepDefinition[] = [{ step: REBOOT_STEP, label: "Redémarrage" }];

const REBOOT_CONCURRENCY = readConcurrency(process.env.LC_CONFIGURE_CONCURRENCY, 4);

export function needsReboot(entries: readonly ScriptEntry[]): boolean {
  const last = entries.at(-1);
  return last !== undefined && !last.reboot_after;
}

export async function runRebootStep(
  formation: Formation,
  vmids: readonly number[],
  agentTimeoutMs: number
): Promise<Set<number>> {
  const failed = new Set<number>();
  if (vmids.length === 0) return failed;

  const supabase = createAdminClient();

  const markVmFailed = async (vmid: number, error: string) => {
    failed.add(vmid);
    console.error(`[reboot] échec vmid=${vmid} :`, error);
    await markStep(formation.id, vmid, REBOOT_STEP, "failed", { message: error });
    await supabase
      .from("formation_vms")
      .update({ status: "failed", error_message: error })
      .eq("formation_id", formation.id)
      .eq("vmid", vmid);
  };

  await mapWithConcurrency(vmids, REBOOT_CONCURRENCY, async (vmid) => {
    await markStep(formation.id, vmid, REBOOT_STEP, "running");

    const rebooted = await rebootVm(vmid);
    if (!rebooted.success) return markVmFailed(vmid, `redémarrage : ${rebooted.error}`);

    const backUp = await waitForAgent(vmid, agentTimeoutMs);
    if (!backUp.success) return markVmFailed(vmid, `guest agent après redémarrage : ${backUp.error}`);

    await markStep(formation.id, vmid, REBOOT_STEP, "success");
  });

  return failed;
}

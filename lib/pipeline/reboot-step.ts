import { rebootVm, waitForAgent } from "@/lib/services/proxmox-agent";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import type { ProxmoxConfig } from "@/types";

const REBOOT_STEP = "reboot";

export const REBOOT_STEPS: StepDefinition[] = [{ step: REBOOT_STEP, label: "Redémarrage" }];

// Après les scripts d'identité (machine-id, hostname), le client DHCP doit repartir avec la
// nouvelle identité : un redémarrage complet est le seul moyen fiable sur toutes les distributions.
export async function rebootAndWait(
  proxmox: ProxmoxConfig,
  formationId: string,
  vmid: number,
  agentTimeoutMs: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  await markStep(formationId, vmid, REBOOT_STEP, "running");

  const rebooted = await rebootVm(proxmox, vmid);
  if (!rebooted.success) {
    const error = `redémarrage : ${rebooted.error}`;
    await markStep(formationId, vmid, REBOOT_STEP, "failed", { message: error });
    return { ok: false, error };
  }

  const backUp = await waitForAgent(proxmox, vmid, agentTimeoutMs);
  if (!backUp.success) {
    const error = `guest agent après redémarrage : ${backUp.error}`;
    await markStep(formationId, vmid, REBOOT_STEP, "failed", { message: error });
    return { ok: false, error };
  }

  await markStep(formationId, vmid, REBOOT_STEP, "success");
  return { ok: true };
}

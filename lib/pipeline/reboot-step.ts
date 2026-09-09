import { startVm, waitForAgent } from "@/lib/services/proxmox-agent";
import { shutdownVm } from "@/lib/services/proxmox";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import type { Shell } from "@/lib/scripts/escape";
import type { ProxmoxConfig, ServiceResult } from "@/types";

const REBOOT_STEP = "reboot";
const SHUTDOWN_TIMEOUT_MS = 300_000;

export const REBOOT_STEPS: StepDefinition[] = [{ step: REBOOT_STEP, label: "Redémarrage" }];

// Le ping du guest agent répond avant que Windows soit fiable pour exec pendant le boot storm.
// L'agent Linux, lui, est prêt dès le premier ping.
export const AGENT_SETTLE_MS = Number(process.env.LC_AGENT_SETTLE_SEC ?? 90) * 1000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function settleAfterBoot(shell: Shell): Promise<void> {
  if (shell === "powershell") await sleep(AGENT_SETTLE_MS);
}

// Arrêt puis démarrage plutôt que POST status/reboot : la tâche de redémarrage Proxmox rend la
// main avant que le guest agent ait cessé de répondre, si bien qu'un agent/ping immédiat peut
// être servi par l'agent d'avant le redémarrage — waitForAgent croirait la VM déjà revenue.
// shutdownVm, lui, attend réellement l'état « stopped ».
export async function restartGuest(
  proxmox: ProxmoxConfig,
  vmid: number,
  shell: Shell,
  agentTimeoutMs: number
): Promise<ServiceResult> {
  const stopped = await shutdownVm(proxmox, vmid, SHUTDOWN_TIMEOUT_MS);
  if (!stopped.success) return { success: false, error: `arrêt : ${stopped.error}` };

  const started = await startVm(proxmox, vmid);
  if (!started.success) return { success: false, error: `démarrage : ${started.error}` };

  const backUp = await waitForAgent(proxmox, vmid, agentTimeoutMs);
  if (!backUp.success) return { success: false, error: `guest agent après redémarrage : ${backUp.error}` };

  await settleAfterBoot(shell);
  return { success: true };
}

// Après les scripts d'identité (machine-id, hostname), le client DHCP doit repartir avec la
// nouvelle identité : un redémarrage complet est le seul moyen fiable sur toutes les distributions.
export async function rebootAndWait(
  proxmox: ProxmoxConfig,
  formationId: string,
  vmid: number,
  shell: Shell,
  agentTimeoutMs: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  await markStep(formationId, vmid, REBOOT_STEP, "running");

  const restarted = await restartGuest(proxmox, vmid, shell, agentTimeoutMs);
  if (!restarted.success) {
    const error = `redémarrage : ${restarted.error}`;
    await markStep(formationId, vmid, REBOOT_STEP, "failed", { message: error });
    return { ok: false, error };
  }

  await markStep(formationId, vmid, REBOOT_STEP, "success");
  return { ok: true };
}

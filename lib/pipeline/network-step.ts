import { startVm, waitForAgent, getGuestIp } from "@/lib/services/proxmox-agent";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import type { ProxmoxConfig } from "@/types";

const NETWORK_STEP = "network";

export const NETWORK_STEPS: StepDefinition[] = [{ step: NETWORK_STEP, label: "Adresse IP" }];

export interface NetworkVm {
  vmid: number;
  mac: string;
}

export async function runNetworkVm(
  proxmox: ProxmoxConfig,
  formationId: string,
  vm: NetworkVm,
  agentTimeoutMs: number
): Promise<{ ok: true; ip: string } | { ok: false; error: string }> {
  await markStep(formationId, vm.vmid, NETWORK_STEP, "running");

  const fail = async (error: string) => {
    await markStep(formationId, vm.vmid, NETWORK_STEP, "failed", { message: error });
    return { ok: false as const, error };
  };

  const started = await startVm(proxmox, vm.vmid);
  if (!started.success) return fail(`démarrage : ${started.error}`);

  const agent = await waitForAgent(proxmox, vm.vmid, agentTimeoutMs);
  if (!agent.success) return fail(`guest agent : ${agent.error}`);

  const ipResult = await getGuestIp(proxmox, vm.vmid, vm.mac, agentTimeoutMs);
  if (!ipResult.success) return fail(`adresse IP : ${ipResult.error}`);

  await markStep(formationId, vm.vmid, NETWORK_STEP, "success");
  return { ok: true, ip: ipResult.data!.ip };
}

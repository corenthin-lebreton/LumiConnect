import { startVm, waitForAgent, getGuestIp } from "@/lib/services/proxmox-agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import { mapWithConcurrency, readConcurrency } from "@/lib/pool";
import type { Formation, ProxmoxConfig } from "@/types";

export const NETWORK_STEPS: StepDefinition[] = [{ step: "network", label: "Adresse IP" }];

const NETWORK_STEP = "network";
const NETWORK_CONCURRENCY = readConcurrency(process.env.LC_CONFIGURE_CONCURRENCY, 4);

export interface NetworkVm {
  vmid: number;
  mac: string;
}

export async function runNetworkStep(
  proxmox: ProxmoxConfig,
  formation: Formation,
  vms: readonly NetworkVm[],
  agentTimeoutMs: number
): Promise<{ failed: Set<number>; ips: Map<number, string> }> {
  const failed = new Set<number>();
  const ips = new Map<number, string>();
  if (vms.length === 0) return { failed, ips };

  const supabase = createAdminClient();

  const updateVm = (vmid: number, patch: Record<string, unknown>) =>
    supabase
      .from("formation_vms")
      .update(patch)
      .eq("formation_id", formation.id)
      .eq("vmid", vmid);

  const markVmFailed = async (vmid: number, error: string) => {
    failed.add(vmid);
    console.error(`[network] échec vmid=${vmid} :`, error);
    await markStep(formation.id, vmid, NETWORK_STEP, "failed", { message: error });
    await updateVm(vmid, { status: "failed", error_message: error });
  };

  await mapWithConcurrency(vms, NETWORK_CONCURRENCY, async (vm) => {
    await markStep(formation.id, vm.vmid, NETWORK_STEP, "running");

    const started = await startVm(proxmox, vm.vmid);
    if (!started.success) return markVmFailed(vm.vmid, `démarrage : ${started.error}`);

    const agent = await waitForAgent(proxmox, vm.vmid, agentTimeoutMs);
    if (!agent.success) return markVmFailed(vm.vmid, `guest agent : ${agent.error}`);

    const ipResult = await getGuestIp(proxmox, vm.vmid, vm.mac, agentTimeoutMs);
    if (!ipResult.success) return markVmFailed(vm.vmid, `adresse IP : ${ipResult.error}`);

    const ip = ipResult.data!.ip;
    await updateVm(vm.vmid, { ip });
    await markStep(formation.id, vm.vmid, NETWORK_STEP, "success");
    ips.set(vm.vmid, ip);
  });

  return { failed, ips };
}

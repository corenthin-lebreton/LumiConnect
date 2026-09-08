import type { ProxmoxConfig, ProxmoxTemplate, ServiceResult } from "@/types";
import { TEMPLATE_TAG, detectOsFamily, hasTag } from "@/lib/templates";
import { POLL_INTERVAL_MS, form, pveFetch, sleep } from "@/lib/services/proxmox-api";
import { describeFetchError } from "@/lib/services/fetch-error";

interface ProxmoxVmSummary {
  vmid: number;
  name?: string;
  template?: number;
  tags?: string;
}

async function waitForTask(proxmox: ProxmoxConfig, upid: string, timeoutMs = 300000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await pveFetch(proxmox, 
      `/nodes/${proxmox.node}/tasks/${encodeURIComponent(upid)}/status`
    );
    if (data.status === "stopped") {
      if (data.exitstatus !== "OK") {
        throw new Error(`Task failed: ${data.exitstatus}`);
      }
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Task timeout");
}

export async function getTemplates(proxmox: ProxmoxConfig): Promise<ServiceResult<ProxmoxTemplate[]>> {
  try {
    const { data } = await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu`);

    const templates: ProxmoxTemplate[] = (data as ProxmoxVmSummary[])
      .filter((vm) => vm.template === 1 && hasTag(vm.tags, TEMPLATE_TAG))
      .map((vm) => ({
        vmid: vm.vmid,
        name: vm.name ?? String(vm.vmid),
        os_id: detectOsFamily(vm.name ?? ""),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data: templates };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function cloneVm(
  proxmox: ProxmoxConfig,
  templateId: number,
  newVmid: number,
  name: string,
  cpuCores: number,
  ramMb: number,
  tag: string
): Promise<ServiceResult<{ vmid: number; mac: string }>> {
  try {
    const cloneRes = await pveFetch(proxmox, 
      `/nodes/${proxmox.node}/qemu/${templateId}/clone`,
      form({ newid: String(newVmid), name, full: "0" })
    );

    await waitForTask(proxmox, cloneRes.data);

    await pveFetch(proxmox, 
      `/nodes/${proxmox.node}/qemu/${newVmid}/config`,
      form(
        { cores: String(cpuCores), memory: String(ramMb), tags: tag, agent: "1" },
        "PUT"
      )
    );

    const configRes = await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${newVmid}/config`);
    const net0 = configRes.data.net0 as string;
    const macMatch = net0.match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/);
    if (!macMatch) throw new Error("MAC address not found in net0 config");

    return { success: true, data: { vmid: newVmid, mac: macMatch[1] } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

async function stopVm(proxmox: ProxmoxConfig, vmid: number): Promise<ServiceResult> {
  try {
    const statusRes = await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${vmid}/status/current`);
    if (statusRes.data?.status === "stopped") {
      return { success: true };
    }
    const stopRes = await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${vmid}/status/stop`, {
      method: "POST",
    });
    await waitForTask(proxmox, stopRes.data);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteVm(proxmox: ProxmoxConfig, vmid: number): Promise<ServiceResult> {
  try {
    const stopResult = await stopVm(proxmox, vmid);
    if (!stopResult.success) {
      console.error(`[proxmox] stopVm failed vmid=${vmid}, aborting delete:`, stopResult.error);
      return { success: false, error: `stop failed: ${stopResult.error}` };
    }
    await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${vmid}`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function ping(proxmox: ProxmoxConfig): Promise<ServiceResult> {
  try {
    await pveFetch(proxmox, `/nodes/${proxmox.node}/status`, {
      signal: AbortSignal.timeout(10_000),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: describeFetchError(e) };
  }
}

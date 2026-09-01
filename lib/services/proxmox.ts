import type { ServiceResult, ProxmoxTemplate } from "@/types";
import { TEMPLATE_TAG, hasTag, parseTemplateName } from "@/lib/templates";

interface ProxmoxVmSummary {
  vmid: number;
  name?: string;
  template?: number;
  tags?: string;
}

const PROXMOX_URL = process.env.PROXMOX_URL!;
const PROXMOX_TOKEN_ID = process.env.PROXMOX_TOKEN_ID!;
const PROXMOX_TOKEN_SECRET = process.env.PROXMOX_TOKEN_SECRET!;
const PROXMOX_NODE = process.env.PROXMOX_NODE!;

const headers = {
  Authorization: `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`,
};

async function proxmoxFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${PROXMOX_URL}/api2/json${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Proxmox ${res.status}: ${text}`);
  }
  return res.json();
}

async function waitForTask(upid: string, timeoutMs = 300000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await proxmoxFetch(
      `/nodes/${PROXMOX_NODE}/tasks/${encodeURIComponent(upid)}/status`
    );
    if (data.status === "stopped") {
      if (data.exitstatus !== "OK") {
        throw new Error(`Task failed: ${data.exitstatus}`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Task timeout");
}

export async function getTemplates(): Promise<ServiceResult<ProxmoxTemplate[]>> {
  try {
    const { data } = await proxmoxFetch(`/nodes/${PROXMOX_NODE}/qemu`);

    const templates: ProxmoxTemplate[] = (data as ProxmoxVmSummary[])
      .filter((vm) => vm.template === 1 && hasTag(vm.tags, TEMPLATE_TAG))
      .map((vm) => {
        const parsed = parseTemplateName(vm.name ?? "");
        return {
          vmid: vm.vmid,
          name: vm.name ?? String(vm.vmid),
          os_id: parsed?.osId ?? null,
          variant: parsed?.variant ?? null,
          revision: parsed?.revision ?? null,
          conforming: parsed !== null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data: templates };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function cloneVm(
  templateId: number,
  newVmid: number,
  name: string,
  cpuCores: number,
  ramMb: number,
  tag: string
): Promise<ServiceResult<{ vmid: number; mac: string }>> {
  try {
    const cloneRes = await proxmoxFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${templateId}/clone`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          newid: String(newVmid),
          name,
          full: "0",
        }).toString(),
      }
    );

    await waitForTask(cloneRes.data);

    await proxmoxFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${newVmid}/config`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          cores: String(cpuCores),
          memory: String(ramMb),
          tags: tag,
        }).toString(),
      }
    );

    const configRes = await proxmoxFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${newVmid}/config`
    );
    const net0 = configRes.data.net0 as string;
    const macMatch = net0.match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/);
    if (!macMatch) throw new Error("MAC address not found in net0 config");

    return { success: true, data: { vmid: newVmid, mac: macMatch[1] } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function stopVm(vmid: number): Promise<ServiceResult> {
  try {
    const statusRes = await proxmoxFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current`
    );
    if (statusRes.data?.status === "stopped") {
      return { success: true };
    }
    const stopRes = await proxmoxFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/stop`,
      { method: "POST" }
    );
    await waitForTask(stopRes.data);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteVm(vmid: number): Promise<ServiceResult> {
  try {
    const stopResult = await stopVm(vmid);
    if (!stopResult.success) {
      console.error(`[proxmox] stopVm failed vmid=${vmid}, aborting delete:`, stopResult.error);
      return { success: false, error: `stop failed: ${stopResult.error}` };
    }
    await proxmoxFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

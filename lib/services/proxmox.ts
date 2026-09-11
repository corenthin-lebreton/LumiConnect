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

const LOCK_ERROR = /lock|locked|timeout/i;
// Proxmox repond 500, pas 404, pour une VM absente : « Configuration file
// 'nodes/pve/qemu-server/5000.conf' does not exist ». Le message est le seul discriminant.
const MISSING_VM_ERROR = /does not exist|no such vm/i;
const CLONE_ATTEMPTS = 5;
const CLONE_RETRY_DELAY_MS = 3000;

export interface CloneOptions {
  full?: boolean;
}

// Proxmox verrouille la config du template pendant un clone : deux clones du même template en
// même temps, et le second échoue sur « can't lock file » après ~10 s. On réessaie plutôt que
// de marquer la VM en échec.
async function requestClone(
  proxmox: ProxmoxConfig,
  templateId: number,
  body: Record<string, string>
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= CLONE_ATTEMPTS; attempt++) {
    try {
      const res = await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${templateId}/clone`, form(body));
      return res.data as string;
    } catch (e) {
      lastError = e as Error;
      if (!LOCK_ERROR.test(lastError.message) || attempt === CLONE_ATTEMPTS) throw lastError;
      console.warn(
        `[proxmox] clone de ${templateId} verrouillé (tentative ${attempt}/${CLONE_ATTEMPTS}) : ${lastError.message}`
      );
      await sleep(CLONE_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError ?? new Error("clone impossible");
}

export async function cloneVm(
  proxmox: ProxmoxConfig,
  templateId: number,
  newVmid: number,
  name: string,
  cpuCores: number,
  ramMb: number,
  tag: string,
  options: CloneOptions = {}
): Promise<ServiceResult<{ vmid: number; mac: string }>> {
  try {
    const upid = await requestClone(proxmox, templateId, {
      newid: String(newVmid),
      name,
      full: options.full ? "1" : "0",
    });

    await waitForTask(proxmox, upid, options.full ? 3_600_000 : 300_000);

    await pveFetch(
      proxmox,
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

export async function nextVmid(proxmox: ProxmoxConfig): Promise<ServiceResult<number>> {
  try {
    const { data } = await pveFetch(proxmox, "/cluster/nextid");
    const vmid = Number(data);
    if (!Number.isInteger(vmid) || vmid <= 0) throw new Error(`nextid invalide : ${JSON.stringify(data)}`);
    return { success: true, data: vmid };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

async function currentStatus(proxmox: ProxmoxConfig, vmid: number): Promise<string> {
  const res = await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${vmid}/status/current`);
  return String(res.data?.status ?? "");
}

// Arrêt propre via le guest agent, borné par `timeout` côté Proxmox : sans lui, la tâche
// qmshutdown attend l'extinction indéfiniment (Windows qui finalise des fonctionnalités à
// l'arrêt peut dépasser plusieurs minutes), et notre propre attente expirait en laissant la VM
// à moitié éteinte. Passé le délai, on force l'arrêt pour rendre un état connu.
const TASK_GRACE_MS = 30_000;

export async function shutdownVm(
  proxmox: ProxmoxConfig,
  vmid: number,
  timeoutMs: number
): Promise<ServiceResult> {
  try {
    if ((await currentStatus(proxmox, vmid)) === "stopped") return { success: true };

    const timeoutSec = Math.ceil(timeoutMs / 1000);
    const res = await pveFetch(
      proxmox,
      `/nodes/${proxmox.node}/qemu/${vmid}/status/shutdown`,
      form({ timeout: String(timeoutSec) })
    );

    try {
      await waitForTask(proxmox, res.data, timeoutMs + TASK_GRACE_MS);
    } catch (e) {
      // « Task timeout » (notre attente) ou « got timeout » (celle de Proxmox) : on force.
      if (!/timeout/i.test((e as Error).message)) throw e;
    }

    if ((await currentStatus(proxmox, vmid)) === "stopped") return { success: true };

    await stopVm(proxmox, vmid);
    return {
      success: false,
      error: `la VM ${vmid} ne s'est pas éteinte proprement en ${timeoutSec} s, arrêt forcé`,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function convertToTemplate(proxmox: ProxmoxConfig, vmid: number): Promise<ServiceResult> {
  try {
    const res = await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${vmid}/template`, {
      method: "POST",
    });
    // Selon la version de PVE, la conversion renvoie un UPID ou rien.
    if (typeof res.data === "string" && res.data.startsWith("UPID:")) {
      await waitForTask(proxmox, res.data);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// Une VM absente n'est pas une erreur pour qui cherche a la supprimer : la base peut decrire
// des VM jamais creees (les lignes formation_vms sont ecrites avant le clonage).
async function vmExists(proxmox: ProxmoxConfig, vmid: number): Promise<boolean> {
  try {
    await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${vmid}/status/current`);
    return true;
  } catch (e) {
    if (MISSING_VM_ERROR.test((e as Error).message)) return false;
    throw e;
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
    if (!(await vmExists(proxmox, vmid))) return { success: true };

    const stopResult = await stopVm(proxmox, vmid);
    if (!stopResult.success) {
      console.error(`[proxmox] stopVm failed vmid=${vmid}, aborting delete:`, stopResult.error);
      return { success: false, error: `stop failed: ${stopResult.error}` };
    }
    await pveFetch(proxmox, `/nodes/${proxmox.node}/qemu/${vmid}`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    // Deux nettoyages concurrents : le second trouve la VM deja supprimee.
    if (MISSING_VM_ERROR.test((e as Error).message)) return { success: true };
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

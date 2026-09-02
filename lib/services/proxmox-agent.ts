import type { ServiceResult } from "@/types";
import type { Shell } from "@/lib/scripts/escape";
import {
  POLL_INTERVAL_MS as AGENT_POLL_INTERVAL_MS,
  PROXMOX_NODE,
  form,
  pveFetch,
  sleep,
} from "@/lib/services/proxmox-api";

const FILE_WRITE_MAX_CHARS = 61440;
const TASK_TIMEOUT_MS = 120_000;

async function waitForTask(upid: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await pveFetch(
      `/nodes/${PROXMOX_NODE}/tasks/${encodeURIComponent(upid)}/status`
    );
    if (data.status === "stopped") {
      if (data.exitstatus !== "OK") throw new Error(`Tâche échouée : ${data.exitstatus}`);
      return;
    }
    await sleep(AGENT_POLL_INTERVAL_MS);
  }
  throw new Error("Délai dépassé en attendant la fin de la tâche Proxmox");
}

export async function startVm(vmid: number): Promise<ServiceResult> {
  try {
    const status = await pveFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current`);
    if (status.data?.status === "running") return { success: true };

    const res = await pveFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/start`, {
      method: "POST",
    });
    await waitForTask(res.data, TASK_TIMEOUT_MS);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function rebootVm(vmid: number): Promise<ServiceResult> {
  try {
    const res = await pveFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/reboot`, {
      method: "POST",
    });
    await waitForTask(res.data, TASK_TIMEOUT_MS);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function waitForAgent(
  vmid: number,
  timeoutMs: number
): Promise<ServiceResult> {
  const start = Date.now();
  let lastError = "aucune tentative";

  while (Date.now() - start < timeoutMs) {
    try {
      await pveFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/ping`, { method: "POST" });
      return { success: true };
    } catch (e) {
      lastError = (e as Error).message;
      await sleep(AGENT_POLL_INTERVAL_MS);
    }
  }

  return {
    success: false,
    error: `Guest agent injoignable sur la VM ${vmid} après ${Math.round(
      timeoutMs / 1000
    )} s. Vérifier que qemu-guest-agent est installé et démarré dans le template. Dernière erreur : ${lastError}`,
  };
}

export async function getGuestIp(
  vmid: number,
  mac: string,
  timeoutMs: number
): Promise<ServiceResult<{ ip: string }>> {
  const start = Date.now();
  const wanted = mac.toLowerCase();
  let lastError = "aucune tentative";

  while (Date.now() - start < timeoutMs) {
    try {
      const { data } = await pveFetch(
        `/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/network-get-interfaces`
      );
      const interfaces = (data?.result ?? []) as Array<{
        "hardware-address"?: string;
        "ip-addresses"?: Array<{ "ip-address": string; "ip-address-type": string }>;
      }>;

      const iface = interfaces.find(
        (i) => (i["hardware-address"] ?? "").toLowerCase() === wanted
      );
      const match = iface?.["ip-addresses"]?.find(
        (addr) =>
          addr["ip-address-type"] === "ipv4" &&
          addr["ip-address"] !== "127.0.0.1" &&
          !addr["ip-address"].startsWith("169.254.")
      );

      if (match) return { success: true, data: { ip: match["ip-address"] } };
      lastError = "aucune interface avec adresse IPv4 valide pour l'instant";
    } catch (e) {
      lastError = (e as Error).message;
    }
    await sleep(AGENT_POLL_INTERVAL_MS);
  }

  return {
    success: false,
    error: `Adresse IP introuvable pour la VM ${vmid} (MAC ${mac}) après ${Math.round(
      timeoutMs / 1000
    )} s. Vérifier que le client DHCP a bien obtenu un bail. Dernière erreur : ${lastError}`,
  };
}

const WIDE_CHAR_FALLBACK: Record<string, string> = {
  "—": "-",
  "–": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "﻿": "",
};

const COMBINING_MARKS = /[̀-ͯ]/g;

export function sanitizeForAgent(content: string): string {
  return content.replace(/[Ā-￿]/g, (char) => {
    if (char in WIDE_CHAR_FALLBACK) return WIDE_CHAR_FALLBACK[char];
    const folded = char.normalize("NFKD").replace(COMBINING_MARKS, "");
    return folded.length > 0 && folded.charCodeAt(0) <= 0xff ? folded : "?";
  });
}

export async function guestFileWrite(
  vmid: number,
  file: string,
  content: string
): Promise<ServiceResult> {
  const sanitized = sanitizeForAgent(content);
  if (sanitized.length > FILE_WRITE_MAX_CHARS) {
    return {
      success: false,
      error: `Contenu de ${sanitized.length} caractères pour ${file} : la limite Proxmox de agent/file-write est ${FILE_WRITE_MAX_CHARS}`,
    };
  }
  try {
    await pveFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/file-write`,
      form({ file, content: sanitized })
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

async function guestExec(
  vmid: number,
  command: string[]
): Promise<ServiceResult<{ pid: number }>> {
  try {
    const params = new URLSearchParams();
    for (const arg of command) params.append("command", arg);

    const res = await pveFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec`, form(params));
    return { success: true, data: { pid: res.data.pid } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

interface GuestExecResult {
  exited: boolean;
  exitcode?: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

async function guestExecStatus(
  vmid: number,
  pid: number
): Promise<ServiceResult<GuestExecResult>> {
  try {
    const { data } = await pveFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec-status?pid=${pid}`
    );
    return {
      success: true,
      data: {
        exited: data.exited === 1 || data.exited === true,
        exitcode: data.exitcode,
        stdout: decodeOutput(data["out-data"]),
        stderr: decodeOutput(data["err-data"]),
        truncated: Boolean(data["out-truncated"] || data["err-truncated"]),
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function decodeOutput(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

export interface RunScriptOptions {
  vmid: number;
  shell: Shell;
  remotePath: string;
  content: string;
  timeoutMs: number;
}

export interface RunScriptOutcome {
  exitcode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

function interpreterCommand(shell: Shell, remotePath: string): string[] {
  if (shell === "powershell") {
    return [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      remotePath,
    ];
  }
  return ["/bin/bash", remotePath];
}

async function waitForExec(
  vmid: number,
  pid: number,
  timeoutMs: number,
  label: string
): Promise<ServiceResult<RunScriptOutcome>> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await guestExecStatus(vmid, pid);
    if (!status.success) return { success: false, error: `exec-status pid=${pid} : ${status.error}` };

    const result = status.data!;
    if (result.exited) {
      const exitcode = result.exitcode ?? -1;
      const data = {
        exitcode,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
      };

      if (exitcode === 0) return { success: true, data };

      const detail = result.stderr ? ` : ${result.stderr.slice(0, 500)}` : "";
      return {
        success: false,
        data,
        error: `${label} a terminé avec le code ${exitcode}${detail}`,
      };
    }

    await sleep(AGENT_POLL_INTERVAL_MS);
  }

  return {
    success: false,
    error: `${label} toujours en cours après ${Math.round(
      timeoutMs / 1000
    )} s (pid ${pid} laissé en exécution dans la VM)`,
  };
}

export async function runGuestCommand(
  vmid: number,
  command: string[],
  timeoutMs: number
): Promise<ServiceResult<RunScriptOutcome>> {
  const exec = await guestExec(vmid, command);
  if (!exec.success) return { success: false, error: `exec : ${exec.error}` };

  return waitForExec(vmid, exec.data!.pid, timeoutMs, command[0]);
}

export async function runGuestScript(
  options: RunScriptOptions
): Promise<ServiceResult<RunScriptOutcome>> {
  const { vmid, shell, remotePath, timeoutMs } = options;

  const write = await guestFileWrite(vmid, remotePath, options.content);
  if (!write.success) return { success: false, error: `écriture ${remotePath} : ${write.error}` };

  const exec = await guestExec(vmid, interpreterCommand(shell, remotePath));
  if (!exec.success) return { success: false, error: `exec ${remotePath} : ${exec.error}` };

  return waitForExec(vmid, exec.data!.pid, timeoutMs, remotePath);
}

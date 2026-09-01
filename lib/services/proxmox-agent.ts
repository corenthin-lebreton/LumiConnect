import type { ServiceResult } from "@/types";
import type { Shell } from "@/lib/scripts/escape";

const PROXMOX_URL = process.env.PROXMOX_URL!;
const PROXMOX_TOKEN_ID = process.env.PROXMOX_TOKEN_ID!;
const PROXMOX_TOKEN_SECRET = process.env.PROXMOX_TOKEN_SECRET!;
const PROXMOX_NODE = process.env.PROXMOX_NODE!;

const FILE_WRITE_MAX_CHARS = 61440;

const AGENT_POLL_INTERVAL_MS = 2000;
const TASK_TIMEOUT_MS = 120_000;

const headers = {
  Authorization: `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`,
};

async function agentFetch(path: string, options: RequestInit = {}) {
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

function form(body: Record<string, string> | URLSearchParams): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTask(upid: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await agentFetch(
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
    const status = await agentFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/current`);
    if (status.data?.status === "running") return { success: true };

    const res = await agentFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/start`, {
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
    const res = await agentFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/status/reboot`, {
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
      await agentFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/ping`, { method: "POST" });
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

export async function guestFileWrite(
  vmid: number,
  file: string,
  content: string
): Promise<ServiceResult> {
  if (content.length > FILE_WRITE_MAX_CHARS) {
    return {
      success: false,
      error: `Contenu de ${content.length} caractères pour ${file} : la limite Proxmox de agent/file-write est ${FILE_WRITE_MAX_CHARS}`,
    };
  }
  try {
    await agentFetch(
      `/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/file-write`,
      form({ file, content })
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function guestExec(
  vmid: number,
  command: string[]
): Promise<ServiceResult<{ pid: number }>> {
  try {
    const params = new URLSearchParams();
    for (const arg of command) params.append("command", arg);

    const res = await agentFetch(`/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec`, form(params));
    return { success: true, data: { pid: res.data.pid } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export interface GuestExecResult {
  exited: boolean;
  exitcode?: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export async function guestExecStatus(
  vmid: number,
  pid: number
): Promise<ServiceResult<GuestExecResult>> {
  try {
    const { data } = await agentFetch(
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

function withPowerShellBom(content: string): string {
  return content.startsWith("\ufeff") ? content : `\ufeff${content}`;
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
  const content =
    shell === "powershell" ? withPowerShellBom(options.content) : options.content;

  const write = await guestFileWrite(vmid, remotePath, content);
  if (!write.success) return { success: false, error: `écriture ${remotePath} : ${write.error}` };

  const exec = await guestExec(vmid, interpreterCommand(shell, remotePath));
  if (!exec.success) return { success: false, error: `exec ${remotePath} : ${exec.error}` };

  return waitForExec(vmid, exec.data!.pid, timeoutMs, remotePath);
}

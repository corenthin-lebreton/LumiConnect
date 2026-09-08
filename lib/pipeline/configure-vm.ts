import {
  guestFileWrite,
  rebootVm,
  runGuestCommand,
  runGuestScript,
  startVm,
  waitForAgent,
} from "@/lib/services/proxmox-agent";
import { renderContextFile, type Shell } from "@/lib/scripts/escape";
import { loadScriptContent, type ScriptEntry, type ScriptRegistry } from "@/lib/scripts/registry";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import type { ProxmoxConfig } from "@/types";

const START_STEP = "start";
const AGENT_STEP = "wait_agent";
const CONTEXT_STEP = "context";

export const CONFIGURE_STEPS: StepDefinition[] = [
  { step: START_STEP, label: "Démarrage" },
  { step: AGENT_STEP, label: "Guest agent" },
  { step: CONTEXT_STEP, label: "Contexte" },
];

function scriptStep(scriptId: string): string {
  return `script:${scriptId}`;
}

export function scriptSteps(entries: readonly ScriptEntry[]): StepDefinition[] {
  return entries.map((entry) => ({ step: scriptStep(entry.id), label: entry.label }));
}

interface GuestPaths {
  dir: string;
  separator: string;
  extension: string;
  contextPath: string;
}

function guestPaths(shell: Shell): GuestPaths {
  if (shell === "powershell") {
    const dir = "C:\\ProgramData\\lumiconnect";
    return {
      dir,
      separator: "\\",
      extension: "ps1",
      contextPath: `${dir}\\context.ps1`,
    };
  }
  const dir = "/opt/lumiconnect";
  return { dir, separator: "/", extension: "sh", contextPath: `${dir}/context.env` };
}

function prepareDirectoryCommand(shell: Shell, paths: GuestPaths): string[] {
  if (shell === "powershell") {
    return [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `New-Item -ItemType Directory -Force -Path '${paths.dir}' | Out-Null; ` +
        `icacls '${paths.dir}' /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' /grant:r '*S-1-5-32-544:(OI)(CI)F' | Out-Null`,
    ];
  }
  return ["/bin/bash", "-c", `mkdir -p '${paths.dir}' && chmod 700 '${paths.dir}'`];
}

function restrictContextCommand(shell: Shell, paths: GuestPaths): string[] | null {
  if (shell === "powershell") return null;
  return ["/bin/bash", "-c", `chmod 600 '${paths.contextPath}'`];
}

function removeContextCommand(shell: Shell, paths: GuestPaths): string[] {
  if (shell === "powershell") {
    return [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Remove-Item -LiteralPath '${paths.contextPath}' -Force -ErrorAction SilentlyContinue`,
    ];
  }
  return ["/bin/bash", "-c", `rm -f '${paths.contextPath}'`];
}

export interface ConfigureVmOptions {
  proxmox: ProxmoxConfig;
  formationId: string;
  vmid: number;
  hostname: string;
  ip: string;
  username: string;
  password: string;
  registry: ScriptRegistry;
  entries: readonly ScriptEntry[];
  agentTimeoutMs: number;
}

export interface ConfigureVmResult {
  ok: boolean;
  failedStep?: string;
  error?: string;
}

const COMMAND_TIMEOUT_MS = 60_000;

const AGENT_SETTLE_MS = Number(process.env.LC_AGENT_SETTLE_SEC ?? 90) * 1000;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function configureVm(options: ConfigureVmOptions): Promise<ConfigureVmResult> {
  const { proxmox, formationId, vmid, registry, entries, agentTimeoutMs } = options;
  const shell = registry.shell;
  const paths = guestPaths(shell);

  const fail = async (step: string, error: string): Promise<ConfigureVmResult> => {
    await markStep(formationId, vmid, step, "failed", { message: error });
    return { ok: false, failedStep: step, error };
  };

  await markStep(formationId, vmid, START_STEP, "running");
  const started = await startVm(proxmox, vmid);
  if (!started.success) return fail(START_STEP, started.error!);
  await markStep(formationId, vmid, START_STEP, "success");

  await markStep(formationId, vmid, AGENT_STEP, "running");
  const agent = await waitForAgent(proxmox, vmid, agentTimeoutMs);
  if (!agent.success) return fail(AGENT_STEP, agent.error!);
  await markStep(formationId, vmid, AGENT_STEP, "success");
  // Le ping répond avant que l'agent Windows soit fiable pour exec pendant le boot storm.
  // L'agent Linux, lui, est prêt dès le premier ping.
  if (shell === "powershell") await sleep(AGENT_SETTLE_MS);

  await markStep(formationId, vmid, CONTEXT_STEP, "running");

  const prepared = await runGuestCommand(
    proxmox,
    vmid,
    prepareDirectoryCommand(shell, paths),
    COMMAND_TIMEOUT_MS
  );
  if (!prepared.success) return fail(CONTEXT_STEP, `création de ${paths.dir} : ${prepared.error}`);

  let contextBody: string;
  try {
    contextBody = renderContextFile(shell, {
      LC_HOSTNAME: options.hostname,
      LC_USERNAME: options.username,
      LC_PASSWORD: options.password,
      LC_IP: options.ip,
      LC_VMID: String(vmid),
    });
  } catch (e) {
    return fail(CONTEXT_STEP, (e as Error).message);
  }

  const contextWritten = await guestFileWrite(proxmox, vmid, paths.contextPath, contextBody);
  if (!contextWritten.success) {
    return fail(CONTEXT_STEP, `écriture du contexte : ${contextWritten.error}`);
  }

  const restrict = restrictContextCommand(shell, paths);
  if (restrict) {
    const restricted = await runGuestCommand(proxmox, vmid, restrict, COMMAND_TIMEOUT_MS);
    if (!restricted.success) {
      return fail(CONTEXT_STEP, `droits sur le contexte : ${restricted.error}`);
    }
  }
  await markStep(formationId, vmid, CONTEXT_STEP, "success");

  const runScripts = async (): Promise<ConfigureVmResult> => {
    for (const entry of entries) {
      const step = scriptStep(entry.id);
      await markStep(formationId, vmid, step, "running");

      let content: string;
      try {
        content = await loadScriptContent(registry, entry);
      } catch (e) {
        return fail(step, (e as Error).message);
      }

      const run = await runGuestScript(proxmox, {
        vmid,
        shell,
        remotePath: `${paths.dir}${paths.separator}${entry.id}.${paths.extension}`,
        content,
        timeoutMs: entry.timeout_sec * 1000,
      });

      if (!run.success) {
        await markStep(formationId, vmid, step, "failed", {
          message: run.error,
          exitCode: run.data?.exitcode ?? null,
          stdout: run.data?.stdout ?? null,
          stderr: run.data?.stderr ?? null,
        });
        return { ok: false, failedStep: step, error: run.error };
      }

      await markStep(formationId, vmid, step, "success", {
        exitCode: run.data!.exitcode,
        stdout: run.data!.stdout,
        stderr: run.data!.stderr,
      });

      if (entry.reboot_after) {
        const rebooted = await rebootVm(proxmox, vmid);
        if (!rebooted.success) {
          return fail(step, `redémarrage après ${entry.id} : ${rebooted.error}`);
        }

        const backUp = await waitForAgent(proxmox, vmid, agentTimeoutMs);
        if (!backUp.success) {
          return fail(step, `guest agent après redémarrage : ${backUp.error}`);
        }
      }
    }

    return { ok: true };
  };

  const result = await runScripts();

  const removed = await runGuestCommand(proxmox, vmid, removeContextCommand(shell, paths), COMMAND_TIMEOUT_MS);
  if (!removed.success) {
    console.error(`[configure] suppression du contexte échouée vmid=${vmid} : ${removed.error}`);
  }

  return result;
}

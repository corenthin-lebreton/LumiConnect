import {
  guestFileWrite,
  runGuestCommand,
  runGuestScript,
  startVm,
  waitForAgent,
} from "@/lib/services/proxmox-agent";
import { restartGuest, settleAfterBoot } from "@/lib/pipeline/reboot-step";
import { runWithRebootRetry } from "@/lib/pipeline/pending-reboot";
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
        `icacls '${paths.dir}' /inheritance:r ` +
        `/grant:r '*S-1-5-18:(OI)(CI)F' /grant:r '*S-1-5-32-544:(OI)(CI)F' | Out-Null`,
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

interface VmContext {
  proxmox: ProxmoxConfig;
  formationId: string;
  vmid: number;
  shell: Shell;
  paths: GuestPaths;
  agentTimeoutMs: number;
  fail: (step: string, error: string) => Promise<ConfigureVmResult>;
}

async function bootVm(ctx: VmContext): Promise<ConfigureVmResult | null> {
  const { proxmox, formationId, vmid } = ctx;

  await markStep(formationId, vmid, START_STEP, "running");
  const started = await startVm(proxmox, vmid);
  if (!started.success) return ctx.fail(START_STEP, started.error!);
  await markStep(formationId, vmid, START_STEP, "success");

  await markStep(formationId, vmid, AGENT_STEP, "running");
  const agent = await waitForAgent(proxmox, vmid, ctx.agentTimeoutMs);
  if (!agent.success) return ctx.fail(AGENT_STEP, agent.error!);
  await markStep(formationId, vmid, AGENT_STEP, "success");
  await settleAfterBoot(ctx.shell);

  return null;
}

async function writeContext(
  ctx: VmContext,
  options: ConfigureVmOptions
): Promise<ConfigureVmResult | null> {
  const { proxmox, formationId, vmid, shell, paths } = ctx;

  await markStep(formationId, vmid, CONTEXT_STEP, "running");

  const prepared = await runGuestCommand(
    proxmox,
    vmid,
    prepareDirectoryCommand(shell, paths),
    COMMAND_TIMEOUT_MS
  );
  if (!prepared.success) {
    return ctx.fail(CONTEXT_STEP, `création de ${paths.dir} : ${prepared.error}`);
  }

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
    return ctx.fail(CONTEXT_STEP, (e as Error).message);
  }

  const contextWritten = await guestFileWrite(proxmox, vmid, paths.contextPath, contextBody);
  if (!contextWritten.success) {
    return ctx.fail(CONTEXT_STEP, `écriture du contexte : ${contextWritten.error}`);
  }

  const restrict = restrictContextCommand(shell, paths);
  if (restrict) {
    const restricted = await runGuestCommand(proxmox, vmid, restrict, COMMAND_TIMEOUT_MS);
    if (!restricted.success) {
      return ctx.fail(CONTEXT_STEP, `droits sur le contexte : ${restricted.error}`);
    }
  }
  await markStep(formationId, vmid, CONTEXT_STEP, "success");

  return null;
}

function executeScript(ctx: VmContext, entry: ScriptEntry, content: string) {
  const { proxmox, vmid, shell, paths, agentTimeoutMs } = ctx;
  const runOnce = () =>
    runGuestScript(proxmox, {
      vmid,
      shell,
      remotePath: `${paths.dir}${paths.separator}${entry.id}.${paths.extension}`,
      content,
      timeoutMs: entry.timeout_sec * 1000,
    });

  return entry.reboot_if_pending
    ? runWithRebootRetry(entry.id, runOnce, () =>
        restartGuest(proxmox, vmid, shell, agentTimeoutMs)
      )
    : runOnce();
}

async function runScript(
  ctx: VmContext,
  registry: ScriptRegistry,
  entry: ScriptEntry
): Promise<ConfigureVmResult | null> {
  const { proxmox, formationId, vmid, shell, agentTimeoutMs } = ctx;
  const step = scriptStep(entry.id);
  await markStep(formationId, vmid, step, "running");

  let content: string;
  try {
    content = await loadScriptContent(registry, entry);
  } catch (e) {
    return ctx.fail(step, (e as Error).message);
  }

  const run = await executeScript(ctx, entry, content);

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
    const restarted = await restartGuest(proxmox, vmid, shell, agentTimeoutMs);
    if (!restarted.success) {
      return ctx.fail(step, `redémarrage après ${entry.id} : ${restarted.error}`);
    }
  }

  return null;
}

async function runScripts(
  ctx: VmContext,
  registry: ScriptRegistry,
  entries: readonly ScriptEntry[]
): Promise<ConfigureVmResult> {
  for (const entry of entries) {
    const failed = await runScript(ctx, registry, entry);
    if (failed) return failed;
  }
  return { ok: true };
}

export async function configureVm(options: ConfigureVmOptions): Promise<ConfigureVmResult> {
  const { proxmox, formationId, vmid, registry, entries, agentTimeoutMs } = options;
  const shell = registry.shell;
  const ctx: VmContext = {
    proxmox,
    formationId,
    vmid,
    shell,
    paths: guestPaths(shell),
    agentTimeoutMs,
    fail: async (step, error) => {
      await markStep(formationId, vmid, step, "failed", { message: error });
      return { ok: false, failedStep: step, error };
    },
  };

  const bootFailed = await bootVm(ctx);
  if (bootFailed) return bootFailed;

  const contextFailed = await writeContext(ctx, options);
  if (contextFailed) return contextFailed;

  const result = await runScripts(ctx, registry, entries);

  const removed = await runGuestCommand(
    proxmox,
    vmid,
    removeContextCommand(shell, ctx.paths),
    COMMAND_TIMEOUT_MS
  );
  if (!removed.success) {
    console.error(`[configure] suppression du contexte échouée vmid=${vmid} : ${removed.error}`);
  }

  return result;
}

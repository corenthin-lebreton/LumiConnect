import * as proxmox from "@/lib/services/proxmox";
import { generatePdf } from "@/lib/services/pdf";
import { PROVISION_STEPS, initSteps, markStep, skipRemaining } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import { decryptSecret } from "@/lib/crypto";
import { mapWithConcurrency, readConcurrency } from "@/lib/pool";
import { createLogger } from "@/lib/log";
import { loadRegistry, type ScriptEntry, type ScriptRegistry } from "@/lib/scripts/registry";
import { resolveSelection } from "@/lib/scripts/resolve";
import { CONFIGURE_STEPS, configureVm, scriptSteps } from "@/lib/pipeline/configure-vm";
import { REBOOT_STEPS, rebootAndWait } from "@/lib/pipeline/reboot-step";
import { NETWORK_STEPS, runNetworkVm } from "@/lib/pipeline/network-step";
import {
  GUACAMOLE_STEPS,
  createGuacamoleGroups,
  provisionGuacamoleVm,
  type GuacamoleGroups,
} from "@/lib/pipeline/guacamole-step";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Formation, FormationVm, InfraConfig, ProxmoxConfig } from "@/types";

const log = createLogger("deploy");
const goldenLog = createLogger("golden");
const guacLog = createLogger("guacamole");

const CLONE_CONCURRENCY = readConcurrency(process.env.LC_CLONE_CONCURRENCY, 1);
const VM_CONCURRENCY = readConcurrency(process.env.LC_CONFIGURE_CONCURRENCY, 4);
const AGENT_TIMEOUT_MS = Number(process.env.LC_AGENT_TIMEOUT_SEC ?? 600) * 1000;
const SHUTDOWN_TIMEOUT_MS = 300_000;

export const GOLDEN_STEPS: StepDefinition[] = [{ step: "clone", label: "Clone complet" }];
export const GOLDEN_FINAL_STEPS: StepDefinition[] = [
  { step: "shutdown", label: "Arrêt" },
  { step: "template", label: "Conversion en template" },
];

interface VmContext {
  vmid: number;
  iteration: number;
  ip: string | null;
  mac?: string;
  failed: boolean;
  failedStep?: string;
}

interface Selection {
  registry: ScriptRegistry;
  entries: ScriptEntry[];
}

export interface SplitEntries {
  golden: ScriptEntry[];
  perVm: ScriptEntry[];
}

// L'ordre de résolution est conservé dans chaque partition : les scripts de la dorée
// s'exécutent une fois avant le clonage, ceux marqués per_vm sur chaque clone.
export function splitEntries(entries: readonly ScriptEntry[]): SplitEntries {
  return {
    golden: entries.filter((entry) => !entry.per_vm),
    perVm: entries.filter((entry) => entry.per_vm),
  };
}

async function loadSelection(formation: Formation): Promise<Selection | null> {
  if (!formation.os_id) {
    log.info(`formation ${formation.name} sans os_id : configuration in-guest ignorée`);
    return null;
  }

  const registry = await loadRegistry(formation.os_id);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("formation_scripts")
    .select("script_id")
    .eq("formation_id", formation.id)
    .order("position");

  if (error) throw new Error(`Lecture des scripts de la formation impossible : ${error.message}`);

  const entries = resolveSelection(registry, (data ?? []).map((row) => row.script_id as string));
  return { registry, entries };
}

interface GoldenResult {
  ok: boolean;
  error?: string;
}

type GoldenFail = (step: string, error: string) => Promise<GoldenResult>;

async function configureGolden(
  formation: Formation,
  px: ProxmoxConfig,
  goldenVmid: number,
  selection: Selection,
  goldenEntries: readonly ScriptEntry[],
  vmPassword: string
): Promise<GoldenResult> {
  const configured = await configureVm({
    proxmox: px,
    formationId: formation.id,
    vmid: goldenVmid,
    hostname: `${formation.name}-golden`,
    ip: "",
    username: formation.vm_username,
    password: vmPassword,
    registry: selection.registry,
    entries: goldenEntries,
    agentTimeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!configured.ok) {
    return { ok: false, error: `image dorée, ${configured.failedStep} : ${configured.error}` };
  }
  return { ok: true };
}

async function finalizeGolden(
  formationId: string,
  px: ProxmoxConfig,
  goldenVmid: number,
  fail: GoldenFail
): Promise<GoldenResult> {
  await markStep(formationId, goldenVmid, "shutdown", "running");
  const stopped = await proxmox.shutdownVm(px, goldenVmid, SHUTDOWN_TIMEOUT_MS);
  if (!stopped.success) return fail("shutdown", stopped.error!);
  await markStep(formationId, goldenVmid, "shutdown", "success");

  await markStep(formationId, goldenVmid, "template", "running");
  const converted = await proxmox.convertToTemplate(px, goldenVmid);
  if (!converted.success) return fail("template", converted.error!);
  await markStep(formationId, goldenVmid, "template", "success");

  return { ok: true };
}

// Clone complet du template, scripts d'installation, arrêt propre, conversion en template.
// Un échec ici arrête la formation avant qu'une seule VM soit créée.
async function buildGoldenImage(
  formation: Formation,
  infra: InfraConfig,
  goldenVmid: number,
  selection: Selection | null,
  goldenEntries: readonly ScriptEntry[],
  vmPassword: string
): Promise<GoldenResult> {
  const px = infra.proxmox;
  const fail: GoldenFail = async (step, error) => {
    goldenLog.error(`${step} échouée vmid=${goldenVmid} :`, error);
    await markStep(formation.id, goldenVmid, step, "failed", { message: error });
    return { ok: false, error: `image dorée, ${step} : ${error}` };
  };

  await markStep(formation.id, goldenVmid, "clone", "running");
  const cloned = await proxmox.cloneVm(
    px,
    formation.template_vmid,
    goldenVmid,
    `${formation.name}-golden`,
    formation.cpu_cores,
    formation.ram_mb,
    formation.name,
    { full: true }
  );
  if (!cloned.success) return fail("clone", cloned.error ?? "clone échoué");
  await markStep(formation.id, goldenVmid, "clone", "success");

  if (selection) {
    const configured = await configureGolden(
      formation,
      px,
      goldenVmid,
      selection,
      goldenEntries,
      vmPassword
    );
    if (!configured.ok) return configured;
  }

  return finalizeGolden(formation.id, px, goldenVmid, fail);
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface DeployContext {
  supabase: AdminClient;
  formation: Formation;
  infra: InfraConfig;
  selection: Selection | null;
  perVmEntries: readonly ScriptEntry[];
  identityOnClone: boolean;
  vmPassword: string;
  groupsResult: Awaited<ReturnType<typeof createGuacamoleGroups>>;
  groups: GuacamoleGroups | null;
}

function updateVm(ctx: DeployContext, vmid: number, patch: Record<string, unknown>) {
  return ctx.supabase
    .from("formation_vms")
    .update(patch)
    .eq("formation_id", ctx.formation.id)
    .eq("vmid", vmid);
}

async function failVm(ctx: DeployContext, vm: VmContext, step: string, error: string) {
  vm.failed = true;
  vm.failedStep = vm.failedStep ?? step;
  log.error(`${step} échouée vmid=${vm.vmid} :`, error);
  await updateVm(ctx, vm.vmid, { status: "failed", error_message: error });
}

async function reserveGoldenVmid(
  supabase: AdminClient,
  formation: Formation,
  infra: InfraConfig
): Promise<number> {
  const nextId = await proxmox.nextVmid(infra.proxmox);
  if (!nextId.success) {
    throw new Error(`VMID pour l'image dorée introuvable : ${nextId.error}`);
  }
  const goldenVmid = nextId.data!;
  await supabase
    .from("formations")
    .update({ golden_vmid: goldenVmid, updated_at: new Date().toISOString() })
    .eq("id", formation.id);
  return goldenVmid;
}

function buildStepPlans(
  selection: Selection | null,
  goldenEntries: readonly ScriptEntry[],
  perVmEntries: readonly ScriptEntry[],
  identityOnClone: boolean
): { goldenSteps: StepDefinition[]; vmSteps: StepDefinition[] } {
  const goldenSteps: StepDefinition[] = [
    ...GOLDEN_STEPS,
    ...(selection ? [...CONFIGURE_STEPS, ...scriptSteps(goldenEntries)] : []),
    ...GOLDEN_FINAL_STEPS,
  ];
  const vmSteps: StepDefinition[] = [
    ...PROVISION_STEPS,
    ...(identityOnClone ? [...CONFIGURE_STEPS, ...scriptSteps(perVmEntries), ...REBOOT_STEPS] : []),
    ...NETWORK_STEPS,
    ...GUACAMOLE_STEPS,
  ];
  return { goldenSteps, vmSteps };
}

async function cloneVms(ctx: DeployContext, goldenVmid: number, vmContexts: VmContext[]) {
  const { formation, infra } = ctx;
  await mapWithConcurrency(vmContexts, CLONE_CONCURRENCY, async (vm) => {
    await markStep(formation.id, vm.vmid, "clone", "running");
    const result = await proxmox.cloneVm(
      infra.proxmox,
      goldenVmid,
      vm.vmid,
      `${formation.name}-${vm.vmid}`,
      formation.cpu_cores,
      formation.ram_mb,
      formation.name
    );

    if (!result.success || !result.data) {
      await markStep(formation.id, vm.vmid, "clone", "failed", { message: result.error });
      await failVm(ctx, vm, "clone", result.error ?? "clone échoué");
      return;
    }

    vm.mac = result.data.mac;
    await markStep(formation.id, vm.vmid, "clone", "success");
    await updateVm(ctx, vm.vmid, { status: "cloning", mac_address: vm.mac });
  });
}

// Scripts per_vm puis redémarrage : la VM reçoit son identité propre après le clonage.
async function configureClone(ctx: DeployContext, vm: VmContext): Promise<boolean> {
  const { formation, infra, selection, vmPassword } = ctx;
  await updateVm(ctx, vm.vmid, { status: "configuring" });
  const configured = await configureVm({
    proxmox: infra.proxmox,
    formationId: formation.id,
    vmid: vm.vmid,
    hostname: `${formation.name}-${vm.vmid}`,
    ip: "",
    username: formation.vm_username,
    password: vmPassword,
    registry: selection!.registry,
    entries: ctx.perVmEntries,
    agentTimeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!configured.ok) {
    await failVm(ctx, vm, configured.failedStep!, configured.error!);
    return false;
  }

  const rebooted = await rebootAndWait(
    infra.proxmox,
    formation.id,
    vm.vmid,
    selection!.registry.shell,
    AGENT_TIMEOUT_MS
  );
  if (!rebooted.ok) {
    await failVm(ctx, vm, "reboot", rebooted.error);
    return false;
  }
  return true;
}

async function attachGuacamole(ctx: DeployContext, vm: VmContext): Promise<void> {
  const { formation, infra, groups, groupsResult, vmPassword } = ctx;
  if (!groups) {
    const error = `Guacamole : ${groupsResult.error ?? "groupes non créés"}`;
    await markStep(formation.id, vm.vmid, "guacamole_conn", "failed", { message: error });
    return failVm(ctx, vm, "guacamole_conn", error);
  }

  const guac = await provisionGuacamoleVm(
    infra.guacamole,
    formation,
    groups,
    { vmid: vm.vmid, iteration: vm.iteration, ip: vm.ip! },
    vmPassword
  );
  if (!guac.ok) {
    await updateVm(ctx, vm.vmid, guac.credentials);
    return failVm(ctx, vm, guac.step, guac.error);
  }

  await updateVm(ctx, vm.vmid, { status: "ready", ...guac.credentials });
}

async function provisionOneVm(ctx: DeployContext, vm: VmContext): Promise<void> {
  if (ctx.identityOnClone && !(await configureClone(ctx, vm))) return;

  const network = await runNetworkVm(
    ctx.infra.proxmox,
    ctx.formation.id,
    { vmid: vm.vmid, mac: vm.mac! },
    AGENT_TIMEOUT_MS
  );
  if (!network.ok) return failVm(ctx, vm, "network", network.error);
  vm.ip = network.ip;
  await updateVm(ctx, vm.vmid, { ip: vm.ip });

  await attachGuacamole(ctx, vm);
}

function buildVmContexts(formation: Formation): VmContext[] {
  const vmCount = formation.vm_end_id - formation.vm_start_id + 1;
  return Array.from({ length: vmCount }, (_, i) => ({
    vmid: formation.vm_start_id + i,
    iteration: i + 1,
    ip: null,
    failed: false,
  }));
}

async function createVmRows(supabase: AdminClient, formation: Formation, vmContexts: VmContext[]) {
  await supabase.from("formation_vms").insert(
    vmContexts.map((vm) => ({
      formation_id: formation.id,
      vmid: vm.vmid,
      ip: vm.ip,
      status: "pending",
    }))
  );
}

async function finishFormation(supabase: AdminClient, formationId: string, failed: boolean) {
  await supabase
    .from("formations")
    .update({ status: failed ? "failed" : "deployed", updated_at: new Date().toISOString() })
    .eq("id", formationId);
  await skipRemaining(formationId);
}

async function provisionAllVms(ctx: DeployContext, vmContexts: VmContext[]) {
  ctx.groupsResult = await createGuacamoleGroups(ctx.infra.guacamole, ctx.formation);
  ctx.groups = ctx.groupsResult.success ? ctx.groupsResult.data! : null;
  if (!ctx.groups) {
    guacLog.error("création des groupes échouée :", ctx.groupsResult.error);
  }

  await mapWithConcurrency(
    vmContexts.filter((vm) => !vm.failed),
    VM_CONCURRENCY,
    (vm) => provisionOneVm(ctx, vm)
  );

  ctx.groups = null;
}

async function generateFormationPdf(supabase: AdminClient, formation: Formation, infra: InfraConfig) {
  const { data: allVms } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", formation.id)
    .order("vmid");

  await generatePdf(formation, (allVms ?? []) as FormationVm[], infra.guacamole.url);
}

interface DeployPlan {
  selection: Selection | null;
  goldenEntries: ScriptEntry[];
  perVmEntries: ScriptEntry[];
  identityOnClone: boolean;
  goldenVmid: number;
}

// Résout les scripts, réserve le VMID de la dorée et initialise les étapes de suivi.
async function planDeployment(
  supabase: AdminClient,
  formation: Formation,
  infra: InfraConfig,
  vmids: number[]
): Promise<DeployPlan> {
  const selection = await loadSelection(formation);
  const { golden: goldenEntries, perVm: perVmEntries } = splitEntries(selection?.entries ?? []);
  const identityOnClone = selection !== null && perVmEntries.length > 0;

  const goldenVmid = await reserveGoldenVmid(supabase, formation, infra);

  const { goldenSteps, vmSteps } = buildStepPlans(
    selection,
    goldenEntries,
    perVmEntries,
    identityOnClone
  );
  await initSteps(formation.id, [goldenVmid], goldenSteps);
  await initSteps(formation.id, vmids, vmSteps);

  return { selection, goldenEntries, perVmEntries, identityOnClone, goldenVmid };
}

async function abortOnGoldenFailure(
  supabase: AdminClient,
  formation: Formation,
  error: string
): Promise<never> {
  await supabase
    .from("formation_vms")
    .update({ status: "failed", error_message: error })
    .eq("formation_id", formation.id);
  await finishFormation(supabase, formation.id, true);
  throw new Error(error);
}

export async function deployFormation(formation: Formation, infra: InfraConfig) {
  log.info(`démarrage de la formation ${formation.name} sur ${infra.name}`);
  const supabase = createAdminClient();

  const vmContexts = buildVmContexts(formation);
  await createVmRows(supabase, formation, vmContexts);

  const plan = await planDeployment(
    supabase,
    formation,
    infra,
    vmContexts.map((vm) => vm.vmid)
  );
  const vmPassword = decryptSecret(formation.vm_password);

  const golden = await buildGoldenImage(
    formation,
    infra,
    plan.goldenVmid,
    plan.selection,
    plan.goldenEntries,
    vmPassword
  );
  if (!golden.ok) await abortOnGoldenFailure(supabase, formation, golden.error!);

  const ctx: DeployContext = {
    supabase,
    formation,
    infra,
    selection: plan.selection,
    perVmEntries: plan.perVmEntries,
    identityOnClone: plan.identityOnClone,
    vmPassword,
    groupsResult: { success: false },
    groups: null,
  };

  await cloneVms(ctx, plan.goldenVmid, vmContexts);
  await provisionAllVms(ctx, vmContexts);
  await generateFormationPdf(supabase, formation, infra);

  const failedVmids = vmContexts.filter((vm) => vm.failed).map((vm) => vm.vmid);
  await finishFormation(supabase, formation.id, failedVmids.length > 0);

  return { failedVmids };
}

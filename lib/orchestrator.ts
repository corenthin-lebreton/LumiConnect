import * as proxmox from "@/lib/services/proxmox";
import { generatePdf } from "@/lib/services/pdf";
import { PROVISION_STEPS, initSteps, markStep, skipRemaining } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import { decryptSecret } from "@/lib/crypto";
import { mapWithConcurrency, readConcurrency } from "@/lib/pool";
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
import type { Formation, FormationVm, InfraConfig } from "@/types";

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
    console.log(`[deploy] formation ${formation.name} sans os_id : configuration in-guest ignorée`);
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
  const fail = async (step: string, error: string): Promise<GoldenResult> => {
    console.error(`[golden] ${step} échouée vmid=${goldenVmid} :`, error);
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
  }

  await markStep(formation.id, goldenVmid, "shutdown", "running");
  const stopped = await proxmox.shutdownVm(px, goldenVmid, SHUTDOWN_TIMEOUT_MS);
  if (!stopped.success) return fail("shutdown", stopped.error!);
  await markStep(formation.id, goldenVmid, "shutdown", "success");

  await markStep(formation.id, goldenVmid, "template", "running");
  const converted = await proxmox.convertToTemplate(px, goldenVmid);
  if (!converted.success) return fail("template", converted.error!);
  await markStep(formation.id, goldenVmid, "template", "success");

  return { ok: true };
}

export async function deployFormation(formation: Formation, infra: InfraConfig) {
  console.log(`[deploy] démarrage de la formation ${formation.name} sur ${infra.name}`);
  const supabase = createAdminClient();

  const vmCount = formation.vm_end_id - formation.vm_start_id + 1;
  const vmids = Array.from({ length: vmCount }, (_, i) => formation.vm_start_id + i);
  const vmContexts: VmContext[] = vmids.map((vmid, i) => ({
    vmid,
    iteration: i + 1,
    ip: null,
    failed: false,
  }));

  await supabase.from("formation_vms").insert(
    vmContexts.map((vm) => ({
      formation_id: formation.id,
      vmid: vm.vmid,
      ip: vm.ip,
      status: "pending",
    }))
  );

  const selection = await loadSelection(formation);
  const { golden: goldenEntries, perVm: perVmEntries } = splitEntries(selection?.entries ?? []);
  const identityOnClone = selection !== null && perVmEntries.length > 0;

  const nextId = await proxmox.nextVmid(infra.proxmox);
  if (!nextId.success) {
    throw new Error(`VMID pour l'image dorée introuvable : ${nextId.error}`);
  }
  const goldenVmid = nextId.data!;
  await supabase
    .from("formations")
    .update({ golden_vmid: goldenVmid, updated_at: new Date().toISOString() })
    .eq("id", formation.id);

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

  await initSteps(formation.id, [goldenVmid], goldenSteps);
  await initSteps(formation.id, vmids, vmSteps);

  const vmPassword = decryptSecret(formation.vm_password);

  const finish = async (failed: boolean) => {
    await supabase
      .from("formations")
      .update({ status: failed ? "failed" : "deployed", updated_at: new Date().toISOString() })
      .eq("id", formation.id);
    await skipRemaining(formation.id);
  };

  const golden = await buildGoldenImage(
    formation,
    infra,
    goldenVmid,
    selection,
    goldenEntries,
    vmPassword
  );
  if (!golden.ok) {
    await supabase
      .from("formation_vms")
      .update({ status: "failed", error_message: golden.error })
      .eq("formation_id", formation.id);
    await finish(true);
    throw new Error(golden.error);
  }

  const updateVm = (vmid: number, patch: Record<string, unknown>) =>
    supabase
      .from("formation_vms")
      .update(patch)
      .eq("formation_id", formation.id)
      .eq("vmid", vmid);

  const failVm = async (vm: VmContext, step: string, error: string) => {
    vm.failed = true;
    vm.failedStep = vm.failedStep ?? step;
    console.error(`[deploy] ${step} échouée vmid=${vm.vmid} :`, error);
    await updateVm(vm.vmid, { status: "failed", error_message: error });
  };

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
      await failVm(vm, "clone", result.error ?? "clone échoué");
      return;
    }

    vm.mac = result.data.mac;
    await markStep(formation.id, vm.vmid, "clone", "success");
    await updateVm(vm.vmid, { status: "cloning", mac_address: vm.mac });
  });

  const groupsResult = await createGuacamoleGroups(infra.guacamole, formation);
  let groups: GuacamoleGroups | null = groupsResult.success ? groupsResult.data! : null;
  if (!groups) {
    console.error(`[guacamole] création des groupes échouée :`, groupsResult.error);
  }

  const provisionVm = async (vm: VmContext) => {
    if (identityOnClone) {
      await updateVm(vm.vmid, { status: "configuring" });
      const configured = await configureVm({
        proxmox: infra.proxmox,
        formationId: formation.id,
        vmid: vm.vmid,
        hostname: `${formation.name}-${vm.vmid}`,
        ip: "",
        username: formation.vm_username,
        password: vmPassword,
        registry: selection!.registry,
        entries: perVmEntries,
        agentTimeoutMs: AGENT_TIMEOUT_MS,
      });
      if (!configured.ok) return failVm(vm, configured.failedStep!, configured.error!);

      const rebooted = await rebootAndWait(
        infra.proxmox,
        formation.id,
        vm.vmid,
        selection!.registry.shell,
        AGENT_TIMEOUT_MS
      );
      if (!rebooted.ok) return failVm(vm, "reboot", rebooted.error);
    }

    const network = await runNetworkVm(
      infra.proxmox,
      formation.id,
      { vmid: vm.vmid, mac: vm.mac! },
      AGENT_TIMEOUT_MS
    );
    if (!network.ok) return failVm(vm, "network", network.error);
    vm.ip = network.ip;
    await updateVm(vm.vmid, { ip: vm.ip });

    if (!groups) {
      const error = `Guacamole : ${groupsResult.error ?? "groupes non créés"}`;
      await markStep(formation.id, vm.vmid, "guacamole_conn", "failed", { message: error });
      return failVm(vm, "guacamole_conn", error);
    }

    const guac = await provisionGuacamoleVm(
      infra.guacamole,
      formation,
      groups,
      { vmid: vm.vmid, iteration: vm.iteration, ip: vm.ip },
      vmPassword
    );
    if (!guac.ok) {
      await updateVm(vm.vmid, guac.credentials);
      return failVm(vm, guac.step, guac.error);
    }

    await updateVm(vm.vmid, { status: "ready", ...guac.credentials });
  };

  await mapWithConcurrency(
    vmContexts.filter((vm) => !vm.failed),
    VM_CONCURRENCY,
    provisionVm
  );

  groups = null;

  const { data: allVms } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", formation.id)
    .order("vmid");

  await generatePdf(formation, (allVms ?? []) as FormationVm[], infra.guacamole.url);

  const failedVmids = vmContexts.filter((vm) => vm.failed).map((vm) => vm.vmid);
  await finish(failedVmids.length > 0);

  return { failedVmids };
}

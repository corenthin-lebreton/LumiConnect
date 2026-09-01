import * as proxmox from "@/lib/services/proxmox";
import * as pfsense from "@/lib/services/pfsense";
import { generatePdf } from "@/lib/services/pdf";
import { PROVISION_STEPS, initSteps, markStep, skipRemaining } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import { decryptSecret } from "@/lib/crypto";
import { mapWithConcurrency, readConcurrency } from "@/lib/pool";
import { loadRegistry, type ScriptEntry, type ScriptRegistry } from "@/lib/scripts/registry";
import { resolveSelection } from "@/lib/scripts/resolve";
import { CONFIGURE_STEPS, configureVm, scriptSteps } from "@/lib/pipeline/configure-vm";
import { GUACAMOLE_STEPS, runGuacamoleStep } from "@/lib/pipeline/guacamole-step";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Formation, FormationVm } from "@/types";

const CLONE_CONCURRENCY = readConcurrency(process.env.LC_CLONE_CONCURRENCY, 8);
const CONFIGURE_CONCURRENCY = readConcurrency(process.env.LC_CONFIGURE_CONCURRENCY, 4);
const AGENT_TIMEOUT_MS = Number(process.env.LC_AGENT_TIMEOUT_SEC ?? 600) * 1000;

interface VmContext {
  vmid: number;
  iteration: number;
  ip: string;
  mac?: string;
  dhcpLeaseId?: string;
  failed: boolean;
  failedStep?: string;
}

interface Selection {
  registry: ScriptRegistry;
  entries: ScriptEntry[];
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

export async function deployFormation(formation: Formation) {
  console.log(`[deploy] démarrage de la formation ${formation.name}`);
  const supabase = createAdminClient();

  const vmCount = formation.vm_end_id - formation.vm_start_id + 1;
  const vmids = Array.from({ length: vmCount }, (_, i) => formation.vm_start_id + i);
  const vmContexts: VmContext[] = vmids.map((vmid, i) => ({
    vmid,
    iteration: i + 1,
    ip: `${formation.base_ip}${formation.ip_start + i}`,
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

  const steps: StepDefinition[] = [
    ...PROVISION_STEPS,
    ...(selection ? [...CONFIGURE_STEPS, ...scriptSteps(selection.entries)] : []),
    ...GUACAMOLE_STEPS,
  ];

  await initSteps(formation.id, vmids, steps);

  const updateVm = (vmid: number, patch: Record<string, unknown>) =>
    supabase
      .from("formation_vms")
      .update(patch)
      .eq("formation_id", formation.id)
      .eq("vmid", vmid);

  const failVm = async (vm: VmContext, step: string, error: string) => {
    vm.failed = true;
    vm.failedStep = step;
    console.error(`[deploy] ${step} échouée vmid=${vm.vmid} :`, error);
    await markStep(formation.id, vm.vmid, step, "failed", { message: error });
    await updateVm(vm.vmid, { status: "failed", error_message: error });
  };

  await mapWithConcurrency(vmContexts, CLONE_CONCURRENCY, async (vm) => {
    await markStep(formation.id, vm.vmid, "clone", "running");
    const result = await proxmox.cloneVm(
      formation.template_vmid,
      vm.vmid,
      `${formation.name}-${vm.vmid}`,
      formation.cpu_cores,
      formation.ram_mb,
      formation.name
    );

    if (!result.success || !result.data) {
      await failVm(vm, "clone", result.error ?? "clone échoué");
      return;
    }

    vm.mac = result.data.mac;
    await markStep(formation.id, vm.vmid, "clone", "success");
    await updateVm(vm.vmid, { status: "cloning", mac_address: vm.mac });
  });

  for (const vm of vmContexts.filter((v) => !v.failed)) {
    await markStep(formation.id, vm.vmid, "dhcp", "running");
    const result = await pfsense.createDhcpLease(
      vm.mac!,
      vm.ip,
      `${formation.name}-${vm.vmid}`
    );

    if (!result.success) {
      await failVm(vm, "dhcp", result.error ?? "bail DHCP échoué");
      continue;
    }

    vm.dhcpLeaseId = result.data?.id;
    await markStep(formation.id, vm.vmid, "dhcp", "success");
    const { error } = await updateVm(vm.vmid, { dhcp_lease_id: vm.dhcpLeaseId });
    if (error) {
      console.error(`[deploy] écriture de dhcp_lease_id échouée vmid=${vm.vmid} :`, error.message);
    }
  }

  const applyResult = await pfsense.applyDhcpChanges();
  if (!applyResult.success) {
    for (const vm of vmContexts.filter((v) => !v.failed)) {
      await failVm(vm, "dhcp", `application des réservations DHCP : ${applyResult.error}`);
    }
  }

  const vmPassword = decryptSecret(formation.vm_password);

  if (selection) {
    await mapWithConcurrency(
      vmContexts.filter((v) => !v.failed),
      CONFIGURE_CONCURRENCY,
      async (vm) => {
        await updateVm(vm.vmid, { status: "configuring" });

        const result = await configureVm({
          formationId: formation.id,
          vmid: vm.vmid,
          hostname: `${formation.name}-${vm.vmid}`,
          ip: vm.ip,
          username: formation.vm_username,
          password: vmPassword,
          registry: selection.registry,
          entries: selection.entries,
          agentTimeoutMs: AGENT_TIMEOUT_MS,
        });

        if (!result.ok) {
          vm.failed = true;
          vm.failedStep = result.failedStep;
          console.error(`[deploy] configuration échouée vmid=${vm.vmid} :`, result.error);
          await updateVm(vm.vmid, { status: "failed", error_message: result.error });
        }
      }
    );
  }

  const guacFailed = await runGuacamoleStep(
    formation,
    vmContexts.filter((v) => !v.failed),
    vmPassword
  );
  for (const vm of vmContexts) {
    if (guacFailed.has(vm.vmid)) {
      vm.failed = true;
      vm.failedStep = vm.failedStep ?? "guacamole";
    }
  }

  const { data: allVms } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", formation.id)
    .order("vmid");

  await generatePdf(formation, (allVms ?? []) as FormationVm[]);

  await supabase
    .from("formations")
    .update({
      status: vmContexts.some((vm) => vm.failed) ? "failed" : "deployed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", formation.id);

  await skipRemaining(formation.id);

  const failedVmids = vmContexts.filter((vm) => vm.failed).map((vm) => vm.vmid);
  return { failedVmids };
}

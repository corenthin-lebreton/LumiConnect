import * as proxmox from "@/lib/services/proxmox";
import * as guacamole from "@/lib/services/guacamole";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInfraForFormation } from "@/lib/infra/groups";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/pool";
import type {
  Formation,
  FormationVm,
  GuacamoleConfig,
  ProxmoxConfig,
  ServiceResult,
} from "@/types";

const log = createLogger("cleanup");

// Le fallback de suppression des connexions touche une entrée par VM : borné pour ne pas
// saturer l'API Guacamole.
const CONNECTION_DELETE_CONCURRENCY = 5;

function logStep(step: string, target: string, result: ServiceResult, failures: string[]) {
  if (result.success) {
    log.debug(`${step} OK target=${target}`);
  } else {
    const msg = `${step} target=${target} err=${result.error}`;
    log.error(msg);
    failures.push(msg);
  }
}

async function settleAll(step: string, tasks: Promise<unknown>[], failures: string[]) {
  for (const result of await Promise.allSettled(tasks)) {
    if (result.status === "rejected") {
      log.error(`${step} rejected:`, result.reason);
      failures.push(`${step} rejected: ${(result.reason as Error).message}`);
    }
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

type GroupLookup = (
  guac: GuacamoleConfig,
  name: string
) => Promise<ServiceResult<{ identifier: string } | null>>;

// Identifiant persisté en base, sinon recherche par nom : un déploiement interrompu avant
// l'enregistrement des groupes en aurait laissé sans trace.
async function resolveGroupId(
  guac: GuacamoleConfig,
  storedId: string | null | undefined,
  label: string,
  name: string,
  lookup: { name: string; fn: GroupLookup },
  failures: string[]
): Promise<string | null> {
  if (storedId) return storedId;
  const found = await lookup.fn(guac, name);
  if (found.success && found.data) {
    log.debug(`${label} group fallback findByName=${found.data.identifier}`);
    return found.data.identifier;
  }
  if (!found.success) {
    log.error(`${lookup.name} err:`, found.error);
    failures.push(`${lookup.name}: ${found.error}`);
  }
  return null;
}

async function deleteGuacUsers(guac: GuacamoleConfig, vmList: FormationVm[], failures: string[]) {
  await settleAll(
    "deleteUser",
    vmList
      .filter((vm) => vm.guac_username)
      .map(async (vm) => {
        const r = await guacamole.deleteUser(guac, vm.guac_username!);
        logStep("deleteUser", vm.guac_username!, r, failures);
      }),
    failures
  );
}

async function deleteGuacUserGroup(guac: GuacamoleConfig, f: Formation, failures: string[]) {
  const userGroupId = await resolveGroupId(
    guac,
    f.guac_user_group,
    "user",
    `${f.name}_users`,
    { name: "findUserGroupByName", fn: guacamole.findUserGroupByName },
    failures
  );
  if (!userGroupId) {
    log.debug("no user group to delete");
    return;
  }
  const r = await guacamole.deleteUserGroup(guac, userGroupId);
  logStep("deleteUserGroup", userGroupId, r, failures);
}

async function deleteGuacConnections(
  guac: GuacamoleConfig,
  f: Formation,
  vmList: FormationVm[],
  failures: string[]
) {
  const connGroupId = await resolveGroupId(
    guac,
    f.guac_connection_group_id,
    "conn",
    `${f.name}_connections`,
    { name: "findConnectionGroupByName", fn: guacamole.findConnectionGroupByName },
    failures
  );
  if (!connGroupId) {
    log.debug("no connection group to delete");
    return;
  }
  const r = await guacamole.deleteConnectionGroup(guac, connGroupId);
  logStep("deleteConnectionGroup", connGroupId, r, failures);
  if (r.success) return;
  const connectionIds = vmList
    .map((vm) => vm.guac_connection_id)
    .filter((id): id is string => Boolean(id));
  await mapWithConcurrency(connectionIds, CONNECTION_DELETE_CONCURRENCY, async (id) => {
    const cr = await guacamole.deleteConnection(guac, id);
    logStep("deleteConnection", id, cr, failures);
  });
}

async function deleteProxmoxVms(
  px: ProxmoxConfig,
  f: Formation,
  vmList: FormationVm[],
  failures: string[]
) {
  await settleAll(
    "deleteVm",
    vmList.map(async (vm) => {
      const r = await proxmox.deleteVm(px, vm.vmid);
      logStep("deleteVm", String(vm.vmid), r, failures);
    }),
    failures
  );

  // L'image dorée est la base des clones liés : Proxmox refuse de la supprimer tant qu'un
  // clone existe, d'où son passage en dernier.
  if (f.golden_vmid) {
    const r = await proxmox.deleteVm(px, f.golden_vmid);
    logStep("deleteGolden", String(f.golden_vmid), r, failures);
  }
}

async function loadFormation(supabase: AdminClient, formationId: string): Promise<Formation> {
  const { data: formation } = await supabase
    .from("formations")
    .select("*")
    .eq("id", formationId)
    .single();

  if (!formation) throw new Error("Formation not found");
  return formation as Formation;
}

async function markDeletingAndLoadVms(
  supabase: AdminClient,
  formationId: string
): Promise<FormationVm[]> {
  await supabase
    .from("formations")
    .update({ status: "deleting", updated_at: new Date().toISOString() })
    .eq("id", formationId);

  const { data: vms } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", formationId);

  return (vms ?? []) as FormationVm[];
}

function markCleanupFailed(supabase: AdminClient, formationId: string, message: string) {
  return supabase
    .from("formations")
    .update({
      status: "cleanup_failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", formationId);
}

export async function deleteFormation(formationId: string) {
  log.info(`Starting formation=${formationId}`);
  const supabase = createAdminClient();
  const failures: string[] = [];

  const f = await loadFormation(supabase, formationId);
  const infra = await resolveInfraForFormation(f);
  const guac = infra.guacamole;
  const vmList = await markDeletingAndLoadVms(supabase, formationId);
  log.debug(`formation=${f.name} vms=${vmList.length}`);

  await deleteGuacUsers(guac, vmList, failures);
  await deleteGuacUserGroup(guac, f, failures);
  await deleteGuacConnections(guac, f, vmList, failures);
  await deleteProxmoxVms(infra.proxmox, f, vmList, failures);

  if (failures.length > 0) {
    log.error(
      `formation=${formationId} completed with ${failures.length} failures:`,
      failures
    );
    await markCleanupFailed(supabase, formationId, failures.join("\n"));
    return;
  }

  const { error: dbErr } = await supabase.from("formations").delete().eq("id", formationId);
  if (dbErr) {
    log.error("DB delete FAILED:", dbErr.message);
    await markCleanupFailed(supabase, formationId, `db delete: ${dbErr.message}`);
    return;
  }

  log.info(`formation=${formationId} all OK`);
}

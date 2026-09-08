import * as proxmox from "@/lib/services/proxmox";
import * as guacamole from "@/lib/services/guacamole";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInfraForFormation } from "@/lib/infra/groups";
import type { Formation, FormationVm, ServiceResult } from "@/types";

function logStep(step: string, target: string, result: ServiceResult, failures: string[]) {
  if (result.success) {
    console.log(`[cleanup] ${step} OK target=${target}`);
  } else {
    const msg = `${step} target=${target} err=${result.error}`;
    console.error(`[cleanup] ${msg}`);
    failures.push(msg);
  }
}

async function settleAll(step: string, tasks: Promise<unknown>[], failures: string[]) {
  for (const result of await Promise.allSettled(tasks)) {
    if (result.status === "rejected") {
      console.error(`[cleanup] ${step} rejected:`, result.reason);
      failures.push(`${step} rejected: ${(result.reason as Error).message}`);
    }
  }
}

export async function deleteFormation(formationId: string) {
  console.log(`[cleanup] Starting formation=${formationId}`);
  const supabase = createAdminClient();
  const failures: string[] = [];

  const { data: formation } = await supabase
    .from("formations")
    .select("*")
    .eq("id", formationId)
    .single();

  if (!formation) throw new Error("Formation not found");
  const f = formation as Formation;
  const infra = await resolveInfraForFormation(f);
  const guac = infra.guacamole;

  await supabase
    .from("formations")
    .update({ status: "deleting", updated_at: new Date().toISOString() })
    .eq("id", formationId);

  const { data: vms } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", formationId);

  const vmList = (vms ?? []) as FormationVm[];
  console.log(`[cleanup] formation=${f.name} vms=${vmList.length}`);

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

  let userGroupId = f.guac_user_group;
  if (!userGroupId) {
    const found = await guacamole.findUserGroupByName(guac, `${f.name}_users`);
    if (found.success && found.data) {
      userGroupId = found.data.identifier;
      console.log(`[cleanup] user group fallback findByName=${userGroupId}`);
    } else if (!found.success) {
      console.error(`[cleanup] findUserGroupByName err:`, found.error);
      failures.push(`findUserGroupByName: ${found.error}`);
    }
  }
  if (userGroupId) {
    const r = await guacamole.deleteUserGroup(guac, userGroupId);
    logStep("deleteUserGroup", userGroupId, r, failures);
  } else {
    console.log(`[cleanup] no user group to delete`);
  }

  let connGroupId = f.guac_connection_group_id;
  if (!connGroupId) {
    const found = await guacamole.findConnectionGroupByName(guac, `${f.name}_connections`);
    if (found.success && found.data) {
      connGroupId = found.data.identifier;
      console.log(`[cleanup] conn group fallback findByName=${connGroupId}`);
    } else if (!found.success) {
      console.error(`[cleanup] findConnectionGroupByName err:`, found.error);
      failures.push(`findConnectionGroupByName: ${found.error}`);
    }
  }
  if (connGroupId) {
    const r = await guacamole.deleteConnectionGroup(guac, connGroupId);
    logStep("deleteConnectionGroup", connGroupId, r, failures);
    if (!r.success) {
      for (const vm of vmList) {
        if (vm.guac_connection_id) {
          const cr = await guacamole.deleteConnection(guac, vm.guac_connection_id);
          logStep("deleteConnection", vm.guac_connection_id, cr, failures);
        }
      }
    }
  } else {
    console.log(`[cleanup] no connection group to delete`);
  }

  await settleAll(
    "deleteVm",
    vmList.map(async (vm) => {
      const r = await proxmox.deleteVm(infra.proxmox, vm.vmid);
      logStep("deleteVm", String(vm.vmid), r, failures);
    }),
    failures
  );

  const markCleanupFailed = (message: string) =>
    supabase
      .from("formations")
      .update({
        status: "cleanup_failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formationId);

  if (failures.length > 0) {
    console.error(`[cleanup] formation=${formationId} completed with ${failures.length} failures:`, failures);
    await markCleanupFailed(failures.join("\n"));
    return;
  }

  const { error: dbErr } = await supabase.from("formations").delete().eq("id", formationId);
  if (dbErr) {
    console.error(`[cleanup] DB delete FAILED:`, dbErr.message);
    await markCleanupFailed(`db delete: ${dbErr.message}`);
    return;
  }

  console.log(`[cleanup] formation=${formationId} all OK`);
}

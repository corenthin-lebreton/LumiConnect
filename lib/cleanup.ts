import * as proxmox from "@/lib/services/proxmox";
import * as pfsense from "@/lib/services/pfsense";
import * as guacamole from "@/lib/services/guacamole";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const userResults = await Promise.allSettled(
    vmList
      .filter((vm) => vm.guac_username)
      .map(async (vm) => {
        const r = await guacamole.deleteUser(vm.guac_username!);
        logStep("deleteUser", vm.guac_username!, r, failures);
        return r;
      })
  );
  userResults.forEach((r) => {
    if (r.status === "rejected") {
      console.error(`[cleanup] deleteUser rejected:`, r.reason);
      failures.push(`deleteUser rejected: ${(r.reason as Error).message}`);
    }
  });

  let userGroupId = f.guac_user_group;
  if (!userGroupId) {
    const found = await guacamole.findUserGroupByName(`${f.name}_users`);
    if (found.success && found.data) {
      userGroupId = found.data.identifier;
      console.log(`[cleanup] user group fallback findByName=${userGroupId}`);
    } else if (!found.success) {
      console.error(`[cleanup] findUserGroupByName err:`, found.error);
      failures.push(`findUserGroupByName: ${found.error}`);
    }
  }
  if (userGroupId) {
    const r = await guacamole.deleteUserGroup(userGroupId);
    logStep("deleteUserGroup", userGroupId, r, failures);
  } else {
    console.log(`[cleanup] no user group to delete`);
  }

  let connGroupId = f.guac_connection_group_id;
  if (!connGroupId) {
    const found = await guacamole.findConnectionGroupByName(`${f.name}_connections`);
    if (found.success && found.data) {
      connGroupId = found.data.identifier;
      console.log(`[cleanup] conn group fallback findByName=${connGroupId}`);
    } else if (!found.success) {
      console.error(`[cleanup] findConnectionGroupByName err:`, found.error);
      failures.push(`findConnectionGroupByName: ${found.error}`);
    }
  }
  if (connGroupId) {
    const r = await guacamole.deleteConnectionGroup(connGroupId);
    logStep("deleteConnectionGroup", connGroupId, r, failures);
    if (!r.success) {
      for (const vm of vmList) {
        if (vm.guac_connection_id) {
          const cr = await guacamole.deleteConnection(vm.guac_connection_id);
          logStep("deleteConnection", vm.guac_connection_id, cr, failures);
        }
      }
    }
  } else {
    console.log(`[cleanup] no connection group to delete`);
  }

  const leaseIds = vmList.map((vm) => vm.dhcp_lease_id).filter((id): id is string => !!id);
  if (leaseIds.length > 0) {
    const bulk = await pfsense.deleteDhcpLeasesBulk(leaseIds);
    if (bulk.success) {
      console.log(`[cleanup] DHCP bulk delete OK count=${bulk.data?.deleted.length}`);
    } else {
      console.error(`[cleanup] DHCP bulk delete partial:`, bulk.error, bulk.data?.failed);
      failures.push(`dhcp bulk: ${bulk.error}`);
    }
  } else {
    console.log(`[cleanup] no DHCP leases to delete`);
  }

  const vmResults = await Promise.allSettled(
    vmList.map(async (vm) => {
      const r = await proxmox.deleteVm(vm.vmid);
      logStep("deleteVm", String(vm.vmid), r, failures);
      return r;
    })
  );
  vmResults.forEach((r) => {
    if (r.status === "rejected") {
      console.error(`[cleanup] deleteVm rejected:`, r.reason);
      failures.push(`deleteVm rejected: ${(r.reason as Error).message}`);
    }
  });

  if (failures.length > 0) {
    console.error(`[cleanup] formation=${formationId} completed with ${failures.length} failures:`, failures);
    await supabase
      .from("formations")
      .update({
        status: "cleanup_failed",
        error_message: failures.join("\n"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", formationId);
    return;
  }

  const { error: dbErr } = await supabase.from("formations").delete().eq("id", formationId);
  if (dbErr) {
    console.error(`[cleanup] DB delete FAILED:`, dbErr.message);
    await supabase
      .from("formations")
      .update({
        status: "cleanup_failed",
        error_message: `db delete: ${dbErr.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formationId);
    return;
  }

  console.log(`[cleanup] formation=${formationId} all OK`);
}

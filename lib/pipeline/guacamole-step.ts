import * as guacamole from "@/lib/services/guacamole";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, generatePassword } from "@/lib/crypto";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import type { Formation } from "@/types";

export const GUACAMOLE_STEPS: StepDefinition[] = [
  { step: "guacamole_conn", label: "Connexion Guacamole" },
  { step: "guacamole_user", label: "Compte utilisateur" },
];

const CONN_STEP = "guacamole_conn";
const USER_STEP = "guacamole_user";

export interface GuacamoleVm {
  vmid: number;
  iteration: number;
  ip: string;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function runGuacamoleStep(
  formation: Formation,
  vms: readonly GuacamoleVm[],
  vmPassword: string
): Promise<Set<number>> {
  const failed = new Set<number>();
  if (vms.length === 0) return failed;

  const supabase = createAdminClient();

  const updateVm = (vmid: number, patch: Record<string, unknown>) =>
    supabase
      .from("formation_vms")
      .update(patch)
      .eq("formation_id", formation.id)
      .eq("vmid", vmid);

  const markVmFailed = async (
    vmid: number,
    step: string,
    error: string,
    patch: Record<string, unknown> = {}
  ) => {
    failed.add(vmid);
    console.error(`[guacamole] ${step} échouée vmid=${vmid} :`, error);
    await markStep(formation.id, vmid, step, "failed", { message: error });
    await updateVm(vmid, { status: "failed", error_message: error, ...patch });
  };

  const groupResult = await guacamole.createConnectionGroup(`${formation.name}_connections`);
  const userGroupResult = await guacamole.createUserGroup(`${formation.name}_users`);

  if (!groupResult.success || !userGroupResult.success) {
    const error = groupResult.error ?? userGroupResult.error ?? "création des groupes échouée";
    console.error(`[guacamole] création des groupes échouée, étape abandonnée :`, error);

    for (const vm of vms) {
      failed.add(vm.vmid);
      await markStep(formation.id, vm.vmid, CONN_STEP, "failed", { message: error });
      await updateVm(vm.vmid, { status: "failed", error_message: `Guacamole : ${error}` });
    }

    await supabase
      .from("formations")
      .update({
        guac_connection_group_id: groupResult.data?.identifier ?? null,
        guac_user_group: userGroupResult.data?.identifier ?? null,
      })
      .eq("id", formation.id);

    return failed;
  }

  const groupId = groupResult.data!.identifier;
  const userGroupName = userGroupResult.data!.identifier;

  await supabase
    .from("formations")
    .update({ guac_connection_group_id: groupId, guac_user_group: userGroupName })
    .eq("id", formation.id);

  for (const vm of vms) {
    await markStep(formation.id, vm.vmid, CONN_STEP, "running");
    const connection = await guacamole.createRdpConnection(
      `${formation.name}-${vm.vmid}`,
      vm.ip,
      formation.rdp_port,
      formation.vm_username,
      vmPassword,
      groupId
    );

    if (!connection.success) {
      await markVmFailed(vm.vmid, CONN_STEP, connection.error!);
      continue;
    }
    const connectionId = connection.data!.identifier;
    await markStep(formation.id, vm.vmid, CONN_STEP, "success");

    await markStep(formation.id, vm.vmid, USER_STEP, "running");
    const username = `${slugify(formation.name)}-${vm.iteration}`;
    const password = generatePassword();
    const encrypted = encryptSecret(password);

    const created = await guacamole.createUser(username, password, formation.name);
    if (!created.success) {
      await markVmFailed(vm.vmid, USER_STEP, created.error!, {
        guac_connection_id: connectionId,
      });
      continue;
    }

    const credentials = {
      guac_username: username,
      guac_password: encrypted,
      guac_connection_id: connectionId,
    };

    const grouped = await guacamole.addUserToGroup(username, userGroupName);
    if (!grouped.success) {
      await markVmFailed(vm.vmid, USER_STEP, `addUserToGroup : ${grouped.error}`, credentials);
      continue;
    }

    const permitted = await guacamole.assignConnectionPermission(username, connectionId, groupId);
    if (!permitted.success) {
      await markVmFailed(
        vm.vmid,
        USER_STEP,
        `assignConnectionPermission : ${permitted.error}`,
        credentials
      );
      continue;
    }

    await markStep(formation.id, vm.vmid, USER_STEP, "success");
    await updateVm(vm.vmid, { status: "ready", ...credentials });
  }

  return failed;
}

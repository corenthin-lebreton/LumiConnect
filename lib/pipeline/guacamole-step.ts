import * as guacamole from "@/lib/services/guacamole";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, generatePassword } from "@/lib/crypto";
import { markStep } from "@/lib/progress";
import type { StepDefinition } from "@/lib/progress";
import type { Formation, GuacamoleConfig, ServiceResult } from "@/types";

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

export interface GuacamoleGroups {
  connectionGroupId: string;
  userGroupName: string;
}

export interface GuacamoleCredentials {
  guac_username: string;
  guac_password: string;
  guac_connection_id: string;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Créés une fois par formation, avant les VMs. Les identifiants sont persistés même en cas
// d'échec partiel pour que le nettoyage retrouve ce qui a été créé.
export async function createGuacamoleGroups(
  guac: GuacamoleConfig,
  formation: Formation
): Promise<ServiceResult<GuacamoleGroups>> {
  const groupResult = await guacamole.createConnectionGroup(guac, `${formation.name}_connections`);
  const userGroupResult = await guacamole.createUserGroup(guac, `${formation.name}_users`);

  const supabase = createAdminClient();
  await supabase
    .from("formations")
    .update({
      guac_connection_group_id: groupResult.data?.identifier ?? null,
      guac_user_group: userGroupResult.data?.identifier ?? null,
    })
    .eq("id", formation.id);

  if (!groupResult.success || !userGroupResult.success) {
    return {
      success: false,
      error: groupResult.error ?? userGroupResult.error ?? "création des groupes échouée",
    };
  }

  return {
    success: true,
    data: {
      connectionGroupId: groupResult.data!.identifier,
      userGroupName: userGroupResult.data!.identifier,
    },
  };
}

export type GuacamoleVmResult =
  | { ok: true; credentials: GuacamoleCredentials }
  | { ok: false; step: string; error: string; credentials: Partial<GuacamoleCredentials> };

export async function provisionGuacamoleVm(
  guac: GuacamoleConfig,
  formation: Formation,
  groups: GuacamoleGroups,
  vm: GuacamoleVm,
  vmPassword: string
): Promise<GuacamoleVmResult> {
  const { id: formationId } = formation;

  const fail = async (
    step: string,
    error: string,
    credentials: Partial<GuacamoleCredentials> = {}
  ): Promise<GuacamoleVmResult> => {
    await markStep(formationId, vm.vmid, step, "failed", { message: error });
    return { ok: false, step, error, credentials };
  };

  await markStep(formationId, vm.vmid, CONN_STEP, "running");
  const connection = await guacamole.createRdpConnection(
    guac,
    `${formation.name}-${vm.vmid}`,
    vm.ip,
    formation.rdp_port,
    formation.vm_username,
    vmPassword,
    groups.connectionGroupId
  );
  if (!connection.success) return fail(CONN_STEP, connection.error!);
  const connectionId = connection.data!.identifier;
  await markStep(formationId, vm.vmid, CONN_STEP, "success");

  await markStep(formationId, vm.vmid, USER_STEP, "running");
  const username = `${slugify(formation.name)}-${vm.iteration}`;
  const password = generatePassword();
  const credentials: GuacamoleCredentials = {
    guac_username: username,
    guac_password: encryptSecret(password),
    guac_connection_id: connectionId,
  };

  const created = await guacamole.createUser(guac, username, password, formation.name);
  if (!created.success) {
    return fail(USER_STEP, created.error!, { guac_connection_id: connectionId });
  }

  const grouped = await guacamole.addUserToGroup(guac, username, groups.userGroupName);
  if (!grouped.success) return fail(USER_STEP, `addUserToGroup : ${grouped.error}`, credentials);

  const permitted = await guacamole.assignConnectionPermission(
    guac,
    username,
    connectionId,
    groups.connectionGroupId
  );
  if (!permitted.success) {
    return fail(USER_STEP, `assignConnectionPermission : ${permitted.error}`, credentials);
  }

  await markStep(formationId, vm.vmid, USER_STEP, "success");
  return { ok: true, credentials };
}

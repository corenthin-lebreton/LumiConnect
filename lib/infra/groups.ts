import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import * as guacamole from "@/lib/services/guacamole";
import * as pfsense from "@/lib/services/pfsense";
import * as proxmox from "@/lib/services/proxmox";
import type {
  Formation,
  InfraConfig,
  InfraGroupRow,
  InfraGroupSecretField,
  InfraGroupSummary,
  InfraHealth,
  ServiceProbe,
} from "@/types";

export const SECRET_FIELDS: readonly InfraGroupSecretField[] = [
  "proxmox_token_secret",
  "pfsense_api_key",
  "guacamole_admin_password",
];

export class InfraGroupMissingError extends Error {
  constructor(formationName: string) {
    super(
      `La formation « ${formationName} » n'est rattachée à aucun groupe d'infrastructure. ` +
        "Lui en assigner un depuis la base avant de la déployer ou de la supprimer."
    );
    this.name = "InfraGroupMissingError";
  }
}

export function toConfig(row: InfraGroupRow): InfraConfig {
  return {
    id: row.id,
    name: row.name,
    proxmox: {
      url: row.proxmox_url,
      node: row.proxmox_node,
      tokenId: row.proxmox_token_id,
      tokenSecret: decryptSecret(row.proxmox_token_secret),
    },
    pfsense: {
      url: row.pfsense_url,
      apiKey: decryptSecret(row.pfsense_api_key),
      caPem: row.pfsense_ca_pem,
      insecureTls: row.pfsense_insecure_tls,
    },
    guacamole: {
      url: row.guacamole_url,
      datasource: row.guacamole_datasource,
      adminUser: row.guacamole_admin_user,
      adminPassword: decryptSecret(row.guacamole_admin_password),
    },
  };
}

export function toSummary(
  row: InfraGroupRow & { formations?: { count: number }[] }
): InfraGroupSummary {
  const {
    proxmox_token_secret: _tokenSecret,
    pfsense_api_key: _apiKey,
    guacamole_admin_password: _password,
    formations,
    ...rest
  } = row;
  void _tokenSecret;
  void _apiKey;
  void _password;
  return { ...rest, formations_count: formations?.[0]?.count ?? 0 };
}

export function encryptSecrets<T extends Partial<Record<InfraGroupSecretField, string | undefined>>>(
  values: T
): T {
  const out = { ...values };
  for (const field of SECRET_FIELDS) {
    const value = out[field];
    if (typeof value === "string") out[field] = encryptSecret(value) as T[typeof field];
  }
  return out;
}

export async function loadInfraRow(id: string): Promise<InfraGroupRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("infra_groups").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Lecture du groupe d'infrastructure impossible : ${error.message}`);
  return (data as InfraGroupRow | null) ?? null;
}

export async function loadInfraConfig(id: string): Promise<InfraConfig> {
  const row = await loadInfraRow(id);
  if (!row) throw new Error(`Groupe d'infrastructure ${id} introuvable`);
  return toConfig(row);
}

export async function resolveInfraForFormation(formation: Formation): Promise<InfraConfig> {
  if (!formation.infra_group_id) throw new InfraGroupMissingError(formation.name);
  return loadInfraConfig(formation.infra_group_id);
}

export async function listInfraRows(): Promise<(InfraGroupRow & { formations: { count: number }[] })[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("infra_groups")
    .select("*, formations(count)")
    .order("name");
  if (error) throw new Error(`Liste des groupes impossible : ${error.message}`);
  return (data ?? []) as (InfraGroupRow & { formations: { count: number }[] })[];
}

const SERVICE_URL_FIELDS: ReadonlyArray<{
  label: string;
  url: "proxmox_url" | "pfsense_url" | "guacamole_url";
  secret: InfraGroupSecretField;
}> = [
  { label: "Proxmox", url: "proxmox_url", secret: "proxmox_token_secret" },
  { label: "pfSense", url: "pfsense_url", secret: "pfsense_api_key" },
  { label: "Guacamole", url: "guacamole_url", secret: "guacamole_admin_password" },
];

// Changer l'URL d'un service sans ressaisir son secret enverrait le secret stocké vers une
// nouvelle destination : quiconque édite un groupe pourrait ainsi l'exfiltrer.
export function secretRequiredForNewUrl(
  row: InfraGroupRow,
  patch: Partial<Record<"proxmox_url" | "pfsense_url" | "guacamole_url" | InfraGroupSecretField, string | undefined>>
): string | null {
  for (const service of SERVICE_URL_FIELDS) {
    const nextUrl = patch[service.url];
    if (nextUrl !== undefined && nextUrl !== row[service.url] && !patch[service.secret]) {
      return `L'URL ${service.label} change : ressaisir son secret pour confirmer.`;
    }
  }
  return null;
}

function fromResult(result: { success: boolean; error?: string }): ServiceProbe {
  return result.success ? { ok: true } : { ok: false, error: result.error ?? "Erreur" };
}

export async function probeInfra(config: InfraConfig): Promise<InfraHealth> {
  const [px, pf, gu] = await Promise.all([
    proxmox.ping(config.proxmox),
    pfsense.ping(config.pfsense),
    guacamole.ping(config.guacamole),
  ]);
  return { proxmox: fromResult(px), pfsense: fromResult(pf), guacamole: fromResult(gu) };
}

import type { OsFamily } from "@/lib/templates";

export type FormationStatus = "draft" | "deploying" | "deployed" | "failed" | "deleting" | "cleanup_failed";
export type VmStatus = "pending" | "cloning" | "configuring" | "ready" | "failed";
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface Formation {
  id: string;
  name: string;
  template_vmid: number;
  os_id: string | null;
  template_name: string | null;
  infra_group_id: string | null;
  vm_start_id: number;
  vm_end_id: number;
  vm_username: string;
  vm_password: string;
  rdp_port: number;
  cpu_cores: number;
  ram_mb: number;
  status: FormationStatus;
  error_message: string | null;
  guac_connection_group_id: string | null;
  guac_user_group: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FormationVm {
  id: string;
  formation_id: string;
  vmid: number;
  ip: string | null;
  mac_address: string | null;
  guac_username: string | null;
  guac_password: string | null;
  guac_connection_id: string | null;
  status: VmStatus;
  error_message: string | null;
  created_at: string;
}

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProxmoxTemplate {
  vmid: number;
  name: string;
  os_id: OsFamily | null;
}

export interface VmStep {
  id: string;
  formation_id: string;
  vmid: number;
  step: string;
  label: string;
  position: number;
  status: StepStatus;
  message: string | null;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export type JobKind = "deploy" | "cleanup";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  kind: JobKind;
  formation_id: string;
  status: JobStatus;
  attempts: number;
  error_message: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ProxmoxConfig {
  url: string;
  node: string;
  tokenId: string;
  tokenSecret: string;
}

export interface PfsenseConfig {
  url: string;
  apiKey: string;
  caPem: string | null;
  insecureTls: boolean;
}

export interface GuacamoleConfig {
  url: string;
  datasource: string;
  adminUser: string;
  adminPassword: string;
}

export interface InfraConfig {
  id: string;
  name: string;
  proxmox: ProxmoxConfig;
  pfsense: PfsenseConfig;
  guacamole: GuacamoleConfig;
}

export interface InfraGroupRow {
  id: string;
  name: string;
  proxmox_url: string;
  proxmox_node: string;
  proxmox_token_id: string;
  proxmox_token_secret: string;
  pfsense_url: string;
  pfsense_api_key: string;
  pfsense_ca_pem: string | null;
  pfsense_insecure_tls: boolean;
  guacamole_url: string;
  guacamole_datasource: string;
  guacamole_admin_user: string;
  guacamole_admin_password: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InfraGroupSecretField =
  | "proxmox_token_secret"
  | "pfsense_api_key"
  | "guacamole_admin_password";

export interface InfraGroupSummary extends Omit<InfraGroupRow, InfraGroupSecretField> {
  formations_count: number;
}

export interface ServiceProbe {
  ok: boolean;
  error?: string;
}

export interface InfraHealth {
  proxmox: ServiceProbe;
  pfsense: ServiceProbe;
  guacamole: ServiceProbe;
}

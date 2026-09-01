export type FormationStatus = "draft" | "deploying" | "deployed" | "failed" | "deleting" | "cleanup_failed";
export type VmStatus = "pending" | "cloning" | "configuring" | "ready" | "failed";
export type DeployStep = "clone" | "dhcp" | "guacamole_conn" | "guacamole_user";
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface Formation {
  id: string;
  name: string;
  template_vmid: number;
  os_id: string | null;
  template_name: string | null;
  vm_start_id: number;
  vm_end_id: number;
  base_ip: string;
  ip_start: number;
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

export interface FormationScript {
  formation_id: string;
  script_id: string;
  position: number;
}

export interface FormationVm {
  id: string;
  formation_id: string;
  vmid: number;
  ip: string;
  mac_address: string | null;
  guac_username: string | null;
  guac_password: string | null;
  guac_connection_id: string | null;
  dhcp_lease_id: string | null;
  status: VmStatus;
  error_message: string | null;
  created_at: string;
}

export interface DeploymentLog {
  id: string;
  formation_id: string;
  vm_id: string;
  step: DeployStep;
  status: "success" | "failed";
  message: string | null;
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
  os_id: string | null;
  variant: string | null;
  revision: number | null;
  conforming: boolean;
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

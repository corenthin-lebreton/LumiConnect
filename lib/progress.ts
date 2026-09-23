import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/log";
import type { StepStatus } from "@/types";

const log = createLogger("progress");

export interface StepDefinition {
  step: string;
  label: string;
}

export const PROVISION_STEPS: StepDefinition[] = [
  { step: "clone", label: "Clone Proxmox" },
];

export interface StepOutcome {
  message?: string | null;
  exitCode?: number | null;
  stdout?: string | null;
  stderr?: string | null;
}

const OUTPUT_MAX_CHARS = 20000;

function tail(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= OUTPUT_MAX_CHARS ? value : value.slice(-OUTPUT_MAX_CHARS);
}

export async function initSteps(
  formationId: string,
  vmids: readonly number[],
  steps: readonly StepDefinition[]
): Promise<void> {
  const rows = vmids.flatMap((vmid) =>
    steps.map((definition, position) => ({
      formation_id: formationId,
      vmid,
      step: definition.step,
      label: definition.label,
      position,
      status: "pending" as StepStatus,
    }))
  );

  if (rows.length === 0) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("vm_steps")
    .upsert(rows, { onConflict: "formation_id,vmid,step" });

  if (error) throw new Error(`Initialisation de la progression impossible : ${error.message}`);
}

export async function markStep(
  formationId: string,
  vmid: number,
  step: string,
  status: StepStatus,
  outcome: StepOutcome = {}
): Promise<void> {
  const now = new Date().toISOString();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("vm_steps")
    .update({
      status,
      message: outcome.message ?? null,
      exit_code: outcome.exitCode ?? null,
      stdout: tail(outcome.stdout),
      stderr: tail(outcome.stderr),
      started_at: status === "running" ? now : undefined,
      finished_at: status === "running" || status === "pending" ? undefined : now,
      updated_at: now,
    })
    .eq("formation_id", formationId)
    .eq("vmid", vmid)
    .eq("step", step);

  if (error) {
    log.error(`écriture ${step} vmid=${vmid} échouée :`, error.message);
  }
}

export async function skipRemaining(formationId: string): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("vm_steps")
    .update({ status: "skipped", finished_at: now, updated_at: now })
    .eq("formation_id", formationId)
    .in("status", ["pending", "running"]);

  if (error) log.error("clôture des étapes restantes échouée :", error.message);
}

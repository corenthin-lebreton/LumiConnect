import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/log";
import type { Job, JobKind } from "@/types";

const log = createLogger("queue");

const UNIQUE_VIOLATION = "23505";

export class JobAlreadyQueuedError extends Error {
  constructor(formationId: string) {
    super(`Un travail est déjà en attente ou en cours pour la formation ${formationId}`);
    this.name = "JobAlreadyQueuedError";
  }
}

export async function enqueue(kind: JobKind, formationId: string): Promise<Job> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({ kind, formation_id: formationId })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new JobAlreadyQueuedError(formationId);
    throw new Error(`Mise en file impossible : ${error.message}`);
  }
  return data as Job;
}

export async function claimJob(workerId: string): Promise<Job | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_job", { worker_id: workerId });

  if (error) throw new Error(`Prise de travail impossible : ${error.message}`);

  const rows = (data ?? []) as Job[];
  return rows[0] ?? null;
}

export async function heartbeat(jobId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("jobs")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) log.error(`heartbeat job=${jobId} échoué :`, error.message);
}

export async function markSucceeded(jobId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("jobs")
    .update({ status: "succeeded", finished_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) throw new Error(`Clôture du travail ${jobId} impossible : ${error.message}`);
}

export async function markFailed(jobId: string, message: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "failed",
      error_message: message.slice(0, 4000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw new Error(`Marquage en échec du travail ${jobId} impossible : ${error.message}`);
}

export async function failStaleJobs(staleAfter = "00:05:00"): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("fail_stale_jobs", { stale_after: staleAfter });

  if (error) throw new Error(`Balayage des travaux abandonnés impossible : ${error.message}`);
  return (data as number) ?? 0;
}

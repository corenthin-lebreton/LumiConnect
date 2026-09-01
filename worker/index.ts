import { hostname } from "node:os";
import { deployFormation } from "@/lib/orchestrator";
import { deleteFormation } from "@/lib/cleanup";
import { claimJob, failStaleJobs, heartbeat, markFailed, markSucceeded } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Formation, Job } from "@/types";

const WORKER_ID = `${hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = Number(process.env.LC_WORKER_POLL_MS ?? 3000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.LC_WORKER_HEARTBEAT_MS ?? 30000);
const STALE_AFTER = process.env.LC_WORKER_STALE_AFTER ?? "00:05:00";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LC_ENCRYPTION_KEY",
  "PROXMOX_URL",
  "PROXMOX_TOKEN_ID",
  "PROXMOX_TOKEN_SECRET",
  "PROXMOX_NODE",
];

let shuttingDown = false;

function log(message: string, ...rest: unknown[]) {
  console.log(`[worker ${WORKER_ID}] ${message}`, ...rest);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadFormation(formationId: string): Promise<Formation> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("formations")
    .select("*")
    .eq("id", formationId)
    .single();

  if (error || !data) {
    throw new Error(`Formation ${formationId} introuvable : ${error?.message ?? "aucune ligne"}`);
  }
  return data as Formation;
}

async function markFormationFailed(job: Job, message: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("formations")
    .update({
      status: job.kind === "cleanup" ? "cleanup_failed" : "failed",
      error_message: message.slice(0, 4000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.formation_id);
}

async function runJob(job: Job): Promise<void> {
  const beat = setInterval(() => {
    void heartbeat(job.id);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    if (job.kind === "deploy") {
      const formation = await loadFormation(job.formation_id);
      const { failedVmids } = await deployFormation(formation);
      log(
        failedVmids.length === 0
          ? `déploiement ${formation.name} terminé`
          : `déploiement ${formation.name} terminé avec ${failedVmids.length} VM(s) en échec`
      );
    } else {
      await deleteFormation(job.formation_id);
      log(`nettoyage ${job.formation_id} terminé`);
    }

    await markSucceeded(job.id);
  } catch (err) {
    const message = String((err as Error)?.stack ?? err);
    console.error(`[worker ${WORKER_ID}] travail ${job.id} en échec :`, message);
    await markFormationFailed(job, String((err as Error)?.message ?? err));
    await markFailed(job.id, message);
  } finally {
    clearInterval(beat);
  }
}

async function tick(): Promise<boolean> {
  const reaped = await failStaleJobs(STALE_AFTER);
  if (reaped > 0) log(`${reaped} travail/travaux abandonné(s) marqué(s) en échec`);

  const job = await claimJob(WORKER_ID);
  if (!job) return false;

  log(`prise du travail ${job.kind} formation=${job.formation_id} (${job.id})`);
  await runJob(job);
  return true;
}

async function main() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`[worker] variables d'environnement manquantes : ${missing.join(", ")}`);
    process.exit(1);
  }

  log(`démarré — sondage toutes les ${POLL_INTERVAL_MS} ms`);

  while (!shuttingDown) {
    try {
      const didWork = await tick();
      if (!didWork) await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      console.error("[worker] erreur de boucle :", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  log("arrêté");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) {
      log(`${signal} reçu à nouveau — arrêt immédiat`);
      process.exit(1);
    }
    log(`${signal} reçu — arrêt après le travail en cours`);
    shuttingDown = true;
  });
}

main().catch((err) => {
  console.error("[worker] arrêt sur erreur fatale :", err);
  process.exit(1);
});

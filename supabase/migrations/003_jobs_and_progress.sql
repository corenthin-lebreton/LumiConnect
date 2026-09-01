-- Migration 003 — File de travaux persistante et progression en base
--
-- Remplace lib/job-store.ts, qui gardait l'état des déploiements dans une Map en mémoire du
-- processus Next, alimentée par un `.catch()` flottant dans un route handler. Un redémarrage
-- pendant un déploiement perdait toute la progression et laissait la formation en `deploying`
-- pour toujours. Avec des scripts de configuration qui durent des dizaines de minutes, ce
-- n'était plus tenable.

-- ---------------------------------------------------------------------------------------
-- File de travaux
-- ---------------------------------------------------------------------------------------

CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('deploy', 'cleanup')),
  formation_id  UUID NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  claimed_by    TEXT,
  claimed_at    TIMESTAMPTZ,
  heartbeat_at  TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une formation ne peut pas avoir deux travaux actifs en même temps. C'est la garantie
-- structurelle contre le double déploiement : plus besoin de compter sur le seul verrou
-- applicatif du route handler.
CREATE UNIQUE INDEX jobs_one_active_per_formation
  ON jobs (formation_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX jobs_pending ON jobs (created_at) WHERE status = 'queued';

-- ---------------------------------------------------------------------------------------
-- Progression par VM et par étape
-- ---------------------------------------------------------------------------------------

-- `step` est volontairement du TEXT libre : aux étapes fixes du pipeline s'ajoutent des
-- étapes « script:<id> » dont la liste dépend des cases cochées sur la formation. `position`
-- porte l'ordre d'affichage, pour que l'UI n'ait pas à connaître le pipeline à l'avance.
CREATE TABLE vm_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formation_id UUID NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  vmid         INTEGER NOT NULL,
  step         TEXT NOT NULL,
  label        TEXT NOT NULL,
  position     INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  message      TEXT,
  exit_code    INTEGER,
  stdout       TEXT,
  stderr       TEXT,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (formation_id, vmid, step)
);

CREATE INDEX vm_steps_formation ON vm_steps (formation_id, vmid, position);

-- ---------------------------------------------------------------------------------------
-- Prise de travail
-- ---------------------------------------------------------------------------------------

-- SKIP LOCKED : plusieurs workers peuvent tourner sans se marcher dessus ni se bloquer.
-- Seuls les travaux `queued` sont pris. Un travail `running` abandonné n'est jamais rejoué
-- automatiquement : le pipeline n'est pas idempotent (les VMs sont déjà clonées, les baux DHCP
-- déjà posés), le rejouer produirait des erreurs et des ressources orphelines. Il est marqué
-- en échec par fail_stale_jobs et l'opérateur décide.
CREATE FUNCTION claim_job(worker_id TEXT)
RETURNS SETOF jobs
LANGUAGE sql
AS $$
  UPDATE jobs
  SET status       = 'running',
      attempts     = attempts + 1,
      claimed_by   = worker_id,
      claimed_at   = now(),
      heartbeat_at = now()
  WHERE id = (
    SELECT id FROM jobs
    WHERE status = 'queued'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
$$;

-- Un worker tué en plein travail laisse un job `running` dont le heartbeat s'arrête. Sans ce
-- balayage, la formation resterait en `deploying` indéfiniment et l'index unique interdirait
-- toute nouvelle tentative.
CREATE FUNCTION fail_stale_jobs(stale_after INTERVAL DEFAULT '00:05:00')
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  stale RECORD;
  affected INTEGER := 0;
BEGIN
  FOR stale IN
    UPDATE jobs
    SET status        = 'failed',
        error_message = 'Worker interrompu : aucun signe de vie depuis ' || stale_after,
        finished_at   = now()
    WHERE status = 'running'
      AND heartbeat_at < now() - stale_after
    RETURNING formation_id, kind
  LOOP
    UPDATE formations
    SET status        = CASE WHEN stale.kind = 'cleanup' THEN 'cleanup_failed' ELSE 'failed' END,
        error_message = 'Worker interrompu pendant le traitement',
        updated_at    = now()
    WHERE id = stale.formation_id;

    UPDATE vm_steps
    SET status      = 'failed',
        message     = 'Worker interrompu',
        finished_at = now(),
        updated_at  = now()
    WHERE formation_id = stale.formation_id
      AND status = 'running';

    affected := affected + 1;
  END LOOP;

  RETURN affected;
END;
$$;

-- Ces fonctions modifient l'état du déploiement : seul le worker, qui utilise la service role
-- key, doit pouvoir les appeler. PostgreSQL accorde EXECUTE à PUBLIC par défaut.
REVOKE ALL ON FUNCTION claim_job(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_stale_jobs(INTERVAL) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------

ALTER TABLE jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vm_steps ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON jobs     FROM anon;
REVOKE ALL ON vm_steps FROM anon;

-- L'écriture vient exclusivement du worker (service role, hors RLS). Les sessions
-- utilisateur n'ont besoin que de lire, pour afficher la progression.
CREATE POLICY jobs_read_authenticated ON jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY vm_steps_read_authenticated ON vm_steps
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------------------

-- Remplace le flux SSE : l'UI s'abonne aux changements de ces tables. Ajout idempotent, la
-- publication contient déjà certaines tables selon la configuration du projet.
DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['vm_steps', 'formation_vms', 'formations']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = target
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target);
    END IF;
  END LOOP;
END;
$$;

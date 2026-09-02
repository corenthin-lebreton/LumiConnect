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

  CREATE UNIQUE INDEX jobs_one_active_per_formation
    ON jobs (formation_id)
    WHERE status IN ('queued', 'running');

  CREATE INDEX jobs_pending ON jobs (created_at) WHERE status = 'queued';

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

  REVOKE ALL ON FUNCTION claim_job(TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION fail_stale_jobs(INTERVAL) FROM PUBLIC;

  ALTER TABLE jobs     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE vm_steps ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON jobs     FROM anon;
  REVOKE ALL ON vm_steps FROM anon;

  CREATE POLICY jobs_read_authenticated ON jobs
    FOR SELECT TO authenticated USING (true);

  CREATE POLICY vm_steps_read_authenticated ON vm_steps
    FOR SELECT TO authenticated USING (true);

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

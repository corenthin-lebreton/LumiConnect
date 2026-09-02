ALTER TABLE formations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_vms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON formations      FROM anon;
REVOKE ALL ON formation_vms   FROM anon;
REVOKE ALL ON deployment_logs FROM anon;

CREATE POLICY formations_authenticated ON formations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY formation_vms_authenticated ON formation_vms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY deployment_logs_authenticated ON deployment_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE formations ADD COLUMN os_id         TEXT;
ALTER TABLE formations ADD COLUMN template_name TEXT;

CREATE TABLE formation_scripts (
  formation_id UUID    NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  script_id    TEXT    NOT NULL,
  position     INTEGER NOT NULL,
  PRIMARY KEY (formation_id, script_id)
);

CREATE INDEX formation_scripts_order ON formation_scripts (formation_id, position);

ALTER TABLE formation_scripts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON formation_scripts FROM anon;

CREATE POLICY formation_scripts_authenticated ON formation_scripts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

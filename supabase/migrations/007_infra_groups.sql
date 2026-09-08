-- Groupes d'infrastructure : un Proxmox + un pfSense + un Guacamole, configurés depuis la page
-- Paramètres. Les secrets sont chiffrés côté application (lib/crypto.ts, LC_ENCRYPTION_KEY).
CREATE TABLE infra_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  proxmox_url TEXT NOT NULL,
  proxmox_node TEXT NOT NULL,
  proxmox_token_id TEXT NOT NULL,
  proxmox_token_secret TEXT NOT NULL,
  pfsense_url TEXT NOT NULL,
  pfsense_api_key TEXT NOT NULL,
  pfsense_ca_pem TEXT,
  guacamole_url TEXT NOT NULL,
  guacamole_datasource TEXT NOT NULL DEFAULT 'postgresql',
  guacamole_admin_user TEXT NOT NULL,
  guacamole_admin_password TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Aucun accès client, même aux valeurs chiffrées : seules les routes API (service role) lisent
-- et écrivent cette table après authentification.
ALTER TABLE infra_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON infra_groups FROM anon, authenticated;

ALTER TABLE formations
  ADD COLUMN infra_group_id UUID REFERENCES infra_groups(id) ON DELETE RESTRICT;

CREATE INDEX formations_infra_group_id ON formations (infra_group_id);

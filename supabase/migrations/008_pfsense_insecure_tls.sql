-- Option explicite par groupe : accepter un certificat pfSense auto-signé sans CA.
ALTER TABLE infra_groups ADD COLUMN pfsense_insecure_tls BOOLEAN NOT NULL DEFAULT false;

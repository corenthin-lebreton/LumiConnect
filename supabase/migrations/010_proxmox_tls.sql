-- Proxmox sert par défaut un certificat auto-signé : mêmes options TLS que pfSense.
ALTER TABLE infra_groups ADD COLUMN proxmox_ca_pem TEXT;
ALTER TABLE infra_groups ADD COLUMN proxmox_insecure_tls BOOLEAN NOT NULL DEFAULT false;

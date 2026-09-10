import { z } from "zod";

export const formationSchema = z
  .object({
    name: z.string().min(1, "Nom requis").max(100),
    template_vmid: z.number().int().positive("Template requis"),
    os_id: z
      .string()
      .regex(/^[a-z0-9]+$/, "Identifiant d'OS invalide")
      .nullable()
      .default(null),
    template_name: z.string().max(200).nullable().default(null),
    infra_group_id: z.uuid("Groupe d'infrastructure requis"),
    script_ids: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "Identifiant de script invalide"))
      .max(50)
      .default([]),
    vm_start_id: z.number().int().min(100, "Min 100"),
    vm_end_id: z.number().int().min(100, "Min 100"),
    vm_username: z.string().min(1, "Username requis"),
    vm_password: z.string().min(4, "Min 4 caractères"),
    rdp_port: z.number().int().min(1).max(65535).default(3389),
    cpu_cores: z.number().int().min(1).max(32).default(2),
    ram_mb: z.number().int().min(512).max(131072).default(4096),
  })
  .refine((data) => data.vm_end_id >= data.vm_start_id, {
    message: "VM end ID doit être >= start ID",
    path: ["vm_end_id"],
  });

export type FormationFormData = z.infer<typeof formationSchema>;

const httpUrl = (message: string) =>
  z
    .url({ protocol: /^https?$/, message })
    .max(500)
    .transform((value) => value.replace(/\/+$/, ""));

const proxmoxUrl = httpUrl("URL Proxmox invalide (http ou https)").refine(
  (value) => new URL(value).pathname === "/",
  "URL de base uniquement, sans chemin : le code ajoute lui-même /api2/json"
);

const secret = (message: string) => z.string().min(1, message).max(4000);

const caPem = z
  .string()
  .trim()
  .max(20000)
  .refine(
    (value) => value === "" || value.startsWith("-----BEGIN CERTIFICATE-----"),
    "Certificat PEM attendu (-----BEGIN CERTIFICATE-----)"
  )
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .default(null);

const infraGroupFields = {
  name: z.string().trim().min(1, "Nom requis").max(100),
  proxmox_url: proxmoxUrl,
  proxmox_node: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Nom de nœud Proxmox invalide"),
  proxmox_token_id: z
    .string()
    .trim()
    .regex(/^[^@\s!]+@[^@\s!]+![^@\s!]+$/, "Forme attendue : user@realm!nomdutoken"),
  proxmox_ca_pem: caPem,
  proxmox_insecure_tls: z.boolean().default(false),
  pfsense_url: httpUrl("URL pfSense invalide (http ou https)"),
  pfsense_ca_pem: caPem,
  pfsense_insecure_tls: z.boolean().default(false),
  guacamole_url: httpUrl("URL Guacamole invalide (http ou https)"),
  guacamole_datasource: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]+$/, "Identifiant de datasource invalide (ex. postgresql)")
    .default("postgresql"),
  guacamole_admin_user: z.string().trim().min(1, "Utilisateur Guacamole requis").max(200),
};

const infraGroupSecrets = {
  proxmox_token_secret: secret("Secret du token Proxmox requis"),
  pfsense_api_key: secret("Clé API pfSense requise"),
  guacamole_admin_password: secret("Mot de passe Guacamole requis"),
};

export const infraGroupSchema = z.object({ ...infraGroupFields, ...infraGroupSecrets });

const optionalSecret = z
  .string()
  .max(4000)
  .optional()
  .transform((value) => (value === undefined || value === "" ? undefined : value));

export const infraGroupPatchSchema = z.object({
  ...infraGroupFields,
  proxmox_token_secret: optionalSecret,
  pfsense_api_key: optionalSecret,
  guacamole_admin_password: optionalSecret,
});

export type InfraGroupFormData = z.infer<typeof infraGroupSchema>;
export type InfraGroupPatchData = z.infer<typeof infraGroupPatchSchema>;

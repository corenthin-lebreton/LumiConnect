import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { infraGroupSchema } from "@/lib/schemas";
import { encryptSecrets } from "@/lib/infra/groups";
import { createAdminClient } from "@/lib/supabase/admin";

function fail(message: string): never {
  console.error(`\n  ÉCHEC — ${message}\n`);
  process.exit(1);
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const name = readArg("--name");
  if (!name) fail('usage : pnpm seed:group -- --name "Nom du groupe"');

  const env = (key: string) => process.env[key] ?? "";
  const caFile = readArg("--ca") ?? path.join(process.cwd(), "lib/services/pfsense-ca.pem");
  const caPem = existsSync(caFile) ? readFileSync(caFile, "utf8") : "";

  const parsed = infraGroupSchema.safeParse({
    name,
    proxmox_url: env("PROXMOX_URL"),
    proxmox_node: env("PROXMOX_NODE"),
    proxmox_token_id: env("PROXMOX_TOKEN_ID"),
    proxmox_token_secret: env("PROXMOX_TOKEN_SECRET"),
    pfsense_url: env("PFSENSE_URL"),
    pfsense_api_key: env("PFSENSE_API_KEY"),
    pfsense_ca_pem: caPem,
    pfsense_insecure_tls: false,
    guacamole_url: env("GUACAMOLE_URL"),
    guacamole_datasource: env("GUACAMOLE_DATASOURCE") || "postgresql",
    guacamole_admin_user: env("GUACAMOLE_ADMIN_USER"),
    guacamole_admin_password: env("GUACAMOLE_ADMIN_PASSWORD"),
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`);
    fail(`variables d'environnement incomplètes ou invalides :\n    ${issues.join("\n    ")}`);
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("infra_groups")
    .select("id")
    .eq("name", parsed.data.name)
    .maybeSingle();
  if (existing) fail(`un groupe « ${parsed.data.name} » existe déjà`);

  const { data: group, error } = await supabase
    .from("infra_groups")
    .insert(encryptSecrets(parsed.data))
    .select("id, name")
    .single();
  if (error || !group) fail(`insertion impossible : ${error?.message}`);

  const { data: attached, error: attachError } = await supabase
    .from("formations")
    .update({ infra_group_id: group.id })
    .is("infra_group_id", null)
    .select("id");
  if (attachError) fail(`rattachement des formations impossible : ${attachError.message}`);

  console.log(`\n  Groupe « ${group.name} » créé (${group.id}).`);
  console.log(`  ${attached?.length ?? 0} formation(s) existante(s) rattachée(s).`);
  console.log(
    `  CA pfSense : ${caPem ? `reprise depuis ${caFile}` : "aucune (confiance système)"}.`
  );
  console.log(
    "\n  Retirer maintenant PROXMOX_*, PFSENSE_* et GUACAMOLE_* du .env : la configuration vit dans Paramètres.\n"
  );
}

main().catch((err) => fail(String(err?.stack ?? err)));

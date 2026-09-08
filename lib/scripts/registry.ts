import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Shell } from "@/lib/scripts/escape";
import { OS_FAMILY_IDS } from "@/lib/templates";

export const SCRIPTS_ROOT = path.join(process.cwd(), "scripts");

const EXTENSION: Record<Shell, string> = { powershell: "ps1", bash: "sh" };

const scriptEntrySchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "id : minuscules, chiffres et tirets uniquement"),
  label: z.string().min(1),
  description: z.string().optional(),
  mandatory: z.boolean().default(false),
  requires: z.array(z.string()).default([]),
  timeout_sec: z.number().int().positive().max(7200).default(900),
  reboot_after: z.boolean().default(false),
  file: z.string().optional(),
});

const registrySchema = z.object({
  os_id: z.enum(OS_FAMILY_IDS),
  shell: z.enum(["powershell", "bash"]),
  scripts: z.array(scriptEntrySchema).min(1),
});

export type ScriptEntry = z.infer<typeof scriptEntrySchema>;
export type ScriptRegistry = z.infer<typeof registrySchema>;

const cache = new Map<string, ScriptRegistry>();

const OS_ID_PATTERN = /^[a-z0-9]+$/;

export function isValidOsId(osId: string): boolean {
  return OS_ID_PATTERN.test(osId);
}

export async function loadRegistry(osId: string): Promise<ScriptRegistry> {
  if (!isValidOsId(osId)) {
    throw new Error(`os_id invalide : ${JSON.stringify(osId)}`);
  }

  const cached = cache.get(osId);
  if (cached) return cached;

  const file = path.join(SCRIPTS_ROOT, osId, "registry.json");

  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`Aucun registry de scripts pour l'OS « ${osId} » (attendu : ${file})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file} : JSON invalide, ${(e as Error).message}`);
  }

  const result = registrySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${file} : ${z.prettifyError(result.error)}`);
  }

  const registry = result.data;
  assertConsistent(osId, registry, file);

  if (process.env.NODE_ENV === "production") cache.set(osId, registry);

  return registry;
}

function assertConsistent(osId: string, registry: ScriptRegistry, file: string): void {
  if (registry.os_id !== osId) {
    throw new Error(`${file} : os_id « ${registry.os_id} » ne correspond pas au dossier « ${osId} »`);
  }

  const ids = new Set<string>();
  for (const entry of registry.scripts) {
    if (ids.has(entry.id)) throw new Error(`${file} : id dupliqué « ${entry.id} »`);
    ids.add(entry.id);
  }

  for (const entry of registry.scripts) {
    for (const dependency of entry.requires) {
      if (!ids.has(dependency)) {
        throw new Error(`${file} : « ${entry.id} » requiert « ${dependency} », qui n'existe pas`);
      }
      if (dependency === entry.id) {
        throw new Error(`${file} : « ${entry.id} » se requiert lui-même`);
      }
    }
  }
}

export function resolveScriptPath(registry: ScriptRegistry, entry: ScriptEntry): string {
  const osDir = path.join(SCRIPTS_ROOT, registry.os_id);
  const relative = entry.file ?? `${entry.id}.${EXTENSION[registry.shell]}`;
  const resolved = path.resolve(osDir, relative);

  if (!resolved.startsWith(SCRIPTS_ROOT + path.sep)) {
    throw new Error(
      `Chemin de script hors de scripts/ : « ${relative} » pour ${registry.os_id}/${entry.id}`
    );
  }

  return resolved;
}

export async function loadScriptContent(
  registry: ScriptRegistry,
  entry: ScriptEntry
): Promise<string> {
  const file = resolveScriptPath(registry, entry);
  try {
    return await readFile(file, "utf8");
  } catch {
    throw new Error(`Script introuvable pour ${registry.os_id}/${entry.id} : ${file}`);
  }
}

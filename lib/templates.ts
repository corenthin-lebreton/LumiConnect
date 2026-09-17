export const TEMPLATE_TAG = "lc-tpl";

export type OsFamily = "windows" | "linux";

export interface OsFamilyDefinition {
  id: OsFamily;
  keywords: readonly string[];
  // Un mot-clé doit ouvrir un token (« Win11 », « lab-debian ») : « darwin » ne vaut pas Windows.
  // Motif littéral, à garder aligné sur `keywords`.
  pattern: RegExp;
}

export const OS_FAMILIES: ReadonlyArray<OsFamilyDefinition> = [
  { id: "windows", keywords: ["windows", "win"], pattern: /(?<![a-z])(?:windows|win)/i },
  {
    id: "linux",
    keywords: ["debian", "deb", "ubuntu", "ubun", "kali", "kal", "linux"],
    pattern: /(?<![a-z])(?:debian|deb|ubuntu|ubun|kali|kal|linux)/i,
  },
];

export const OS_FAMILY_IDS = OS_FAMILIES.map((family) => family.id) as [OsFamily, ...OsFamily[]];

export function detectOsFamily(name: string): OsFamily | null {
  const matches = OS_FAMILIES.filter(({ pattern }) => pattern.test(name));
  return matches.length === 1 ? matches[0].id : null;
}

export function hasTag(tags: string | undefined | null, tag: string): boolean {
  if (!tags) return false;
  return tags
    .split(/[;,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .includes(tag.toLowerCase());
}

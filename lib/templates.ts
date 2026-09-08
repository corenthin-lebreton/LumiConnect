export const TEMPLATE_TAG = "lc-tpl";

export type OsFamily = "windows" | "linux";

export const OS_FAMILIES: ReadonlyArray<{ id: OsFamily; keywords: readonly string[] }> = [
  { id: "windows", keywords: ["windows", "win"] },
  { id: "linux", keywords: ["debian", "deb", "ubuntu", "ubun", "kali", "kal", "linux"] },
];

export const OS_FAMILY_IDS = OS_FAMILIES.map((family) => family.id) as [OsFamily, ...OsFamily[]];

// Un mot-clé doit ouvrir un token (« Win11 », « lab-debian ») : « darwin » ne vaut pas Windows.
const FAMILY_PATTERNS = OS_FAMILIES.map((family) => ({
  id: family.id,
  pattern: new RegExp(`(?<![a-z])(?:${family.keywords.join("|")})`, "i"),
}));

export function detectOsFamily(name: string): OsFamily | null {
  const matches = FAMILY_PATTERNS.filter(({ pattern }) => pattern.test(name));
  return matches.length === 1 ? matches[0].id : null;
}

export function hasTag(tags: string | undefined | null, tag: string): boolean {
  if (!tags) return false;
  return tags
    .split(/[;,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .includes(tag.toLowerCase());
}

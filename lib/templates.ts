export const TEMPLATE_TAG = "lc-tpl";

const TEMPLATE_NAME = /^tpl-([a-z0-9]+)-([a-z0-9]+)-v(\d+)$/;

export interface ParsedTemplateName {
  osId: string;
  variant: string;
  revision: number;
}

export function parseTemplateName(name: string): ParsedTemplateName | null {
  const match = TEMPLATE_NAME.exec(name);
  if (!match) return null;

  const [, osId, variant, revision] = match;
  return { osId, variant, revision: Number(revision) };
}

export function hasTag(tags: string | undefined | null, tag: string): boolean {
  if (!tags) return false;
  return tags
    .split(/[;,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .includes(tag.toLowerCase());
}

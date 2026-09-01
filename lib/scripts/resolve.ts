import type { ScriptEntry, ScriptRegistry } from "@/lib/scripts/registry";

export function resolveSelection(
  registry: ScriptRegistry,
  selectedIds: readonly string[]
): ScriptEntry[] {
  const byId = new Map(registry.scripts.map((entry) => [entry.id, entry]));

  for (const id of selectedIds) {
    if (!byId.has(id)) {
      throw new Error(`Script inconnu pour ${registry.os_id} : « ${id} »`);
    }
  }

  const mandatoryIds = registry.scripts.filter((e) => e.mandatory).map((e) => e.id);

  const included = new Set<string>([...mandatoryIds, ...selectedIds]);
  const queue = [...included];
  while (queue.length > 0) {
    const entry = byId.get(queue.shift()!)!;
    for (const dependency of entry.requires) {
      if (!included.has(dependency)) {
        included.add(dependency);
        queue.push(dependency);
      }
    }
  }

  const dependenciesOf = (entry: ScriptEntry): string[] => {
    const declared = entry.requires.filter((id) => included.has(id));
    if (entry.mandatory) return declared;
    return [...new Set([...declared, ...mandatoryIds])];
  };

  const order = registry.scripts.filter((entry) => included.has(entry.id));
  const remaining = new Map(order.map((entry) => [entry.id, new Set(dependenciesOf(entry))]));
  const sorted: ScriptEntry[] = [];

  while (remaining.size > 0) {
    const ready = order.find((entry) => remaining.get(entry.id)?.size === 0);

    if (!ready) {
      const stuck = [...remaining.keys()].sort().join(", ");
      throw new Error(`Dépendances circulaires entre scripts ${registry.os_id} : ${stuck}`);
    }

    sorted.push(ready);
    remaining.delete(ready.id);
    for (const pending of remaining.values()) pending.delete(ready.id);
  }

  return sorted;
}

export function totalTimeoutSec(entries: readonly ScriptEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.timeout_sec, 0);
}

export function selectWithDependencies(
  registry: ScriptRegistry,
  selected: readonly string[],
  id: string
): string[] {
  const byId = new Map(registry.scripts.map((entry) => [entry.id, entry]));
  const next = new Set(selected);

  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (next.has(current)) continue;
    next.add(current);
    const entry = byId.get(current);
    if (entry) queue.push(...entry.requires);
  }

  return registry.scripts.filter((entry) => next.has(entry.id)).map((entry) => entry.id);
}

export function deselectWithDependents(
  registry: ScriptRegistry,
  selected: readonly string[],
  id: string
): string[] {
  const removed = new Set([id]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of registry.scripts) {
      if (removed.has(entry.id)) continue;
      if (entry.requires.some((dependency) => removed.has(dependency))) {
        removed.add(entry.id);
        changed = true;
      }
    }
  }

  return selected.filter((current) => !removed.has(current));
}

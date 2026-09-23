"use client";

import { useEffect, useState } from "react";
import { Check, Lock, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deselectWithDependents,
  selectWithDependencies,
  totalTimeoutSec,
} from "@/lib/scripts/resolve";
import type { ScriptEntry, ScriptRegistry } from "@/lib/scripts/registry";
import { OS_FAMILIES } from "@/lib/templates";

interface Props {
  osId: string | null;
  templateChosen: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "error"; osId: string; message: string }
  | { kind: "ready"; osId: string; registry: ScriptRegistry };

function Notice({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warning" }) {
  return (
    <span
      className={cn(
        "rounded-[3px] border px-[5px] py-[3px] font-mono text-[0.59375rem] leading-none font-medium",
        "tracking-[0.08em] whitespace-nowrap uppercase",
        tone === "warning" ? "border-warning/45 text-warning" : "border-line-strong text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function Checkbox({ checked, locked = false }: { checked: boolean; locked?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-px grid size-4 shrink-0 place-items-center rounded-sm transition-colors duration-150",
        checked ? "bg-primary text-primary-foreground" : "border-[1.5px] border-input bg-card",
        locked && "opacity-60"
      )}
    >
      {checked && (locked ? <Lock className="size-2.5 [stroke-width:2.5]" /> : <Check className="size-3 [stroke-width:3]" />)}
    </span>
  );
}

function formatCeiling(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.round(minutes / 6) / 10} h` : `${minutes} min`;
}

export function ScriptPicker({ osId, templateChosen, value, onChange }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!osId) return;

    let cancelled = false;

    fetch(`/api/scripts?os_id=${encodeURIComponent(osId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "error", osId, message: body.error ?? "Chargement impossible" });
          return;
        }
        setState({ kind: "ready", osId, registry: body as ScriptRegistry });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", osId, message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [osId]);

  const stale = state.kind === "idle" || state.osId !== osId;

  if (!templateChosen) {
    return (
      <Notice icon={<TriangleAlert className="h-4 w-4" />}>
        Choisir un template pour voir les scripts disponibles.
      </Notice>
    );
  }

  if (!osId) {
    return (
      <Notice icon={<TriangleAlert className="h-4 w-4 text-warning" />}>
        Aucun système d&apos;exploitation n&apos;est reconnu dans le nom de ce template. Les VMs
        seront clonées et joignables, mais rien ne sera configuré à l&apos;intérieur. Renommer le
        template sur Proxmox avec l&apos;un de ces mots :{" "}
        {OS_FAMILIES.map((family, index) => (
          <span key={family.id}>
            {index > 0 && " · "}
            <code className="font-mono text-xs">{family.keywords.join(", ")}</code>
          </span>
        ))}
        .
      </Notice>
    );
  }

  if (stale) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 rounded-md bg-muted motion-safe:animate-shimmer-soft" />
        ))}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <Notice icon={<TriangleAlert className="h-4 w-4 text-destructive" />}>
        Aucune bibliothèque de scripts pour <code className="font-mono text-xs">{osId}</code>.{" "}
        {state.message}
      </Notice>
    );
  }

  return <ScriptManifest registry={state.registry} value={value} onChange={onChange} />;
}

function ScriptManifest({
  registry,
  value,
  onChange,
}: {
  registry: ScriptRegistry;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const mandatory = registry.scripts.filter((entry) => entry.mandatory);
  const optional = registry.scripts.filter((entry) => !entry.mandatory);
  const selected = new Set(value);

  function toggle(entry: ScriptEntry) {
    onChange(
      selected.has(entry.id)
        ? deselectWithDependents(registry, value, entry.id)
        : selectWithDependencies(registry, value, entry.id)
    );
  }

  const applied = [...mandatory, ...optional.filter((entry) => selected.has(entry.id))];
  const ceiling = totalTimeoutSec(applied);
  const reboots = applied.filter((entry) => entry.reboot_after).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between pb-1.5">
        <span className="eyebrow">{registry.os_id}</span>
        <span className="text-xs text-muted-foreground">
          {applied.length} sélectionné{applied.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-x-5 gap-y-0.5 md:grid-cols-2">
        {mandatory.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2.5 rounded-md p-2" title="Toujours appliqué">
            <Checkbox checked locked />
            <ScriptText entry={entry} registry={registry} mandatory />
          </div>
        ))}

        {optional.map((entry) => {
          const isSelected = selected.has(entry.id);
          const missing = entry.requires.filter((id) => !selected.has(id));

          return (
            <label
              key={entry.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors duration-150",
                "hover:bg-muted has-[:focus-visible]:bg-muted has-[:focus-visible]:outline-2",
                "has-[:focus-visible]:outline-ring has-[:focus-visible]:-outline-offset-2"
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                onChange={() => toggle(entry)}
              />
              <Checkbox checked={isSelected} />
              <ScriptText entry={entry} registry={registry} addedWithDeps={isSelected && missing.length > 0} />
            </label>
          );
        })}
      </div>

      {optional.length === 0 && (
        <p className="text-[0.8125rem] text-muted-foreground">
          Aucun outil optionnel pour {registry.os_id} pour l&apos;instant. Ajouter un fichier dans{" "}
          <code className="font-mono text-xs">scripts/{registry.os_id}/</code> et une entrée dans son{" "}
          <code className="font-mono text-xs">registry.json</code>.
        </p>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-muted-foreground">
          Exécutés sur l&apos;image dorée puis clonés ; ceux marqués « par VM » sont rejoués sur
          chaque machine
          {reboots > 0 && (
            <>
              , dont <span className="font-mono tabular">{reboots}</span> avec redémarrage
            </>
          )}
          .
        </p>
        <p className="text-xs text-muted-foreground">
          Délai maximum <span className="font-mono tabular">{formatCeiling(ceiling)}</span>
        </p>
      </div>
    </div>
  );
}

function ScriptText({
  entry,
  registry,
  mandatory = false,
  addedWithDeps = false,
}: {
  entry: ScriptEntry;
  registry: ScriptRegistry;
  mandatory?: boolean;
  addedWithDeps?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.84375rem] leading-tight font-medium">
        {entry.label}
        {mandatory && <Tag>toujours</Tag>}
        {entry.per_vm && <Tag>par VM</Tag>}
        {entry.reboot_after && <Tag tone="warning">redémarrage</Tag>}
        {entry.requires.length > 0 && (
          <Tag>
            requiert{" "}
            {entry.requires
              .map((id) => registry.scripts.find((s) => s.id === id)?.label ?? id)
              .join(", ")}
          </Tag>
        )}
      </span>
      {entry.description && (
        <span className="font-mono text-[0.71875rem] leading-snug text-muted-foreground">
          {entry.description}
        </span>
      )}
      {addedWithDeps && (
        <span className="text-[0.71875rem] text-muted-foreground">Ajouté avec ses dépendances.</span>
      )}
    </span>
  );
}

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
    <div className="flex gap-3 rounded-lg border border-dashed border-line-strong px-4 py-4">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warning" }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-micro uppercase tracking-[0.06em]",
        tone === "warning"
          ? "border-warning/40 bg-warning/12 text-warning"
          : "border-line bg-muted text-muted-foreground"
      )}
    >
      {children}
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
          <div key={i} className="h-[4.25rem] rounded-lg border border-line bg-muted motion-safe:animate-pulse" />
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
    <div className="space-y-4">
      <div className="panel divide-y divide-line overflow-hidden bg-card">
        {mandatory.map((entry) => (
          <div key={entry.id} className="flex gap-3 bg-card px-4 py-3.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium">{entry.label}</span>
                <Tag>toujours appliqué</Tag>
                {entry.per_vm && <Tag>par VM</Tag>}
                {entry.reboot_after && <Tag tone="warning">redémarrage</Tag>}
              </div>
              {entry.description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {entry.description}
                </p>
              )}
            </div>
          </div>
        ))}

        {optional.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Aucun outil optionnel pour {registry.os_id} pour l&apos;instant. Ajouter un fichier
            dans <code className="font-mono text-xs">scripts/{registry.os_id}/</code> et une entrée
            dans son <code className="font-mono text-xs">registry.json</code>.
          </p>
        ) : (
          optional.map((entry) => {
            const isSelected = selected.has(entry.id);
            const missing = entry.requires.filter((id) => !selected.has(id));

            return (
              <label
                key={entry.id}
                className={cn(
                  "flex cursor-pointer gap-3 px-4 py-3.5 transition-colors duration-150",
                  "hover:bg-muted has-[:focus-visible]:bg-muted",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                  "has-[:focus-visible]:outline-ring has-[:focus-visible]:-outline-offset-2",
                  isSelected ? "bg-accent" : "bg-card"
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isSelected}
                  onChange={() => toggle(entry)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                    "transition-colors duration-150",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-line-strong bg-card"
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 [stroke-width:2.5]" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium">{entry.label}</span>
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
                  </div>
                  {entry.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {entry.description}
                    </p>
                  )}
                  {isSelected && missing.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ajouté avec ses dépendances.
                    </p>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono tabular">{applied.length}</span> script
          {applied.length > 1 ? "s" : ""}, exécutés dans cet ordre sur l&apos;image dorée puis
          clonés ; ceux marqués « par VM » rejoués sur chaque machine
          {reboots > 0 && (
            <>
              , dont <span className="font-mono tabular">{reboots}</span> avec redémarrage
            </>
          )}
          .
        </p>
        <p className="text-xs text-muted-foreground">
          Délai maximum <span className="font-mono tabular">{formatCeiling(ceiling)}</span> pour
          l&apos;image dorée
        </p>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InfraHealth, ServiceProbe } from "@/types";

export interface GroupHealth extends InfraHealth {
  id: string;
  name: string;
}

export const SERVICES: { key: keyof InfraHealth; label: string; short: string }[] = [
  { key: "proxmox", label: "Proxmox", short: "PVE" },
  { key: "pfsense", label: "pfSense", short: "PFS" },
  { key: "guacamole", label: "Guacamole", short: "GUAC" },
];

async function fetchHealth(): Promise<GroupHealth[] | null> {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return null;
    const body = (await response.json()) as { groups?: GroupHealth[] };
    return Array.isArray(body.groups) ? body.groups : null;
  } catch {
    return null;
  }
}

export type ServiceState = "unknown" | "ok" | "down";

export interface ServiceHealth {
  groups: GroupHealth[] | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** État agrégé par service, tous groupes confondus. */
  byService: Record<keyof InfraHealth, ServiceState>;
}

function aggregate(groups: GroupHealth[] | null, key: keyof InfraHealth): ServiceState {
  if (!groups || groups.length === 0) return "unknown";
  return groups.every((g) => g[key].ok) ? "ok" : "down";
}

// Sondage de /api/health toutes les minutes, partagé par la barre et le menu mobile.
export function useServiceHealth(): ServiceHealth {
  const [groups, setGroups] = useState<GroupHealth[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const data = await fetchHealth();
      if (!cancelled && data) setGroups(data);
    }

    void poll();
    const interval = setInterval(() => void poll(), 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const data = await fetchHealth();
    if (data) setGroups(data);
    setRefreshing(false);
  }, []);

  return {
    groups,
    refreshing,
    refresh,
    byService: {
      proxmox: aggregate(groups, "proxmox"),
      pfsense: aggregate(groups, "pfsense"),
      guacamole: aggregate(groups, "guacamole"),
    },
  };
}

export const serviceDot: Record<ServiceState, string> = {
  unknown: "bg-muted-foreground/40",
  ok: "bg-success",
  down: "bg-destructive",
};

export function summarize(health: ServiceHealth): string {
  const { groups } = health;
  if (!groups) return "Services : vérification en cours";
  if (groups.length === 0) return "Services : aucun groupe configuré";
  const probes: ServiceProbe[] = groups.flatMap((g) => SERVICES.map((s) => g[s.key]));
  const down = probes.filter((p) => !p.ok).length;
  return down === 0 ? "Services : tous opérationnels" : `Services : ${down} en erreur`;
}

export function ServiceStatus({ health }: { health: ServiceHealth }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { groups, refreshing, refresh, byService } = health;

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  const summary = summarize(health);
  const noGroup = groups !== null && groups.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={summary}
        className={cn(
          "flex h-[30px] items-center gap-3.5 rounded-md border border-line-strong bg-card px-3",
          "font-mono text-micro font-medium uppercase tracking-[0.07em] text-muted-foreground",
          "outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <span className="sr-only">{summary}</span>
        {SERVICES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5" aria-hidden>
            <span className={cn("size-[7px] rounded-full", serviceDot[byService[s.key]])} />
            {s.label}
          </span>
        ))}
      </button>

      {open && (
        <div
          className={
            "panel absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden bg-popover " +
            "shadow-[0_12px_28px_-12px_rgba(30,20,10,0.4)] " +
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 " +
            "motion-safe:duration-150"
          }
        >
          <div className="flex items-center justify-between border-b border-line-strong bg-surface px-3 py-2">
            <h2 className="eyebrow">État des services</h2>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Revérifier maintenant"
            >
              <RefreshCw className={cn("size-3", refreshing && "motion-safe:animate-spin")} aria-hidden />
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!groups ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground" aria-busy="true">
                Vérification…
              </p>
            ) : noGroup ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aucun groupe d&apos;infrastructure.{" "}
                <Link
                  href="/parametres"
                  className="text-accent-foreground underline underline-offset-2"
                  onClick={() => setOpen(false)}
                >
                  En créer un
                </Link>
                .
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.id} className="border-b border-line last:border-b-0">
                  <p className="eyebrow bg-muted/60 px-3 py-2">{g.name}</p>
                  <div className="divide-y divide-line">
                    {SERVICES.map(({ key, label }) => {
                      const status = g[key];
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="font-medium">{label}</span>
                          <span
                            className={cn(
                              "flex min-w-0 items-center gap-2 font-mono text-micro",
                              status.ok ? "text-success" : "text-destructive"
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 shrink-0",
                                status.ok ? "rounded-full bg-success" : "rounded-[1px] bg-destructive"
                              )}
                              aria-hidden
                            />
                            <span className="truncate" title={status.error}>
                              {status.ok ? "OK" : (status.error ?? "Erreur")}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

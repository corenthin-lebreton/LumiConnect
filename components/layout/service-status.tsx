"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw } from "lucide-react";
import type { InfraHealth, ServiceProbe } from "@/types";

interface GroupHealth extends InfraHealth {
  id: string;
  name: string;
}

const SERVICES: { key: keyof InfraHealth; label: string }[] = [
  { key: "proxmox", label: "Proxmox" },
  { key: "pfsense", label: "pfSense" },
  { key: "guacamole", label: "Guacamole" },
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

function probes(groups: GroupHealth[]): ServiceProbe[] {
  return groups.flatMap((g) => SERVICES.map((s) => g[s.key]));
}

export function ServiceStatus() {
  const [groups, setGroups] = useState<GroupHealth[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  const all = groups ? probes(groups) : [];
  const noGroup = groups !== null && groups.length === 0;
  const allOk = groups !== null && !noGroup && all.every((s) => s.ok);
  const downCount = all.filter((s) => !s.ok).length;

  const summary = !groups
    ? "Services : vérification en cours"
    : noGroup
      ? "Services : aucun groupe configuré"
      : allOk
        ? "Services : tous opérationnels"
        : `Services : ${downCount} en erreur`;

  const dotTone = !groups || noGroup ? "bg-muted-foreground/40" : allOk ? "bg-success" : "bg-destructive";

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-2"
        aria-expanded={open}
        title={summary}
      >
        <span className="sr-only">{summary}</span>
        <span className={`inline-flex h-1.5 w-1.5 rounded-full ${dotTone}`} aria-hidden />
        <span className="hidden sm:inline text-[0.8rem]" aria-hidden>
          Services
        </span>
        <Activity className="h-3.5 w-3.5 sm:hidden" aria-hidden />
      </Button>

      {open && (
        <div className="panel absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden bg-popover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150">
          <div className="flex items-center justify-between border-b border-line bg-muted px-3 py-2">
            <h2 className="eyebrow">État des services</h2>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Revérifier maintenant"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "motion-safe:animate-spin" : ""}`} aria-hidden />
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
                <Link href="/parametres" className="underline underline-offset-4" onClick={() => setOpen(false)}>
                  En créer un
                </Link>
                .
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.id} className="border-b border-line last:border-b-0">
                  <p className="eyebrow bg-muted/60 px-3 py-1.5">{g.name}</p>
                  <div className="divide-y divide-line">
                    {SERVICES.map(({ key, label }) => {
                      const status = g[key];
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="font-medium">{label}</span>
                          <span
                            className={`flex min-w-0 items-center gap-2 font-mono text-micro ${
                              status.ok ? "text-success" : "text-destructive"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.ok ? "bg-success" : "bg-destructive"}`}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw } from "lucide-react";

interface ServiceHealth {
  ok: boolean;
  error?: string;
}

type HealthData = Record<string, ServiceHealth>;

async function fetchHealth(): Promise<HealthData | null> {
  try {
    const response = await fetch("/api/health");
    return response.ok ? ((await response.json()) as HealthData) : null;
  } catch {
    return null;
  }
}

export function ServiceStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const data = await fetchHealth();
      if (!cancelled && data) setHealth(data);
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
    if (data) setHealth(data);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  const allOk = health !== null && Object.values(health).every((s) => s.ok);
  const downCount = health ? Object.values(health).filter((s) => !s.ok).length : 0;

  const summary = !health
    ? "Services : vérification en cours"
    : allOk
      ? "Services : tous opérationnels"
      : `Services : ${downCount} en erreur`;

  const dotTone = !health ? "bg-muted-foreground/40" : allOk ? "bg-success" : "bg-destructive";

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
        <div className="panel absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden bg-popover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150">
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
          <div className="divide-y divide-line">
            {health ? (
              Object.entries(health).map(([name, status]) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="capitalize font-medium">{name}</span>
                  <span
                    className={`flex items-center gap-2 font-mono text-micro ${
                      status.ok ? "text-success" : "text-destructive"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        status.ok ? "bg-success" : "bg-destructive"
                      }`}
                      aria-hidden
                    />
                    {status.ok ? "OK" : (status.error ?? "Erreur")}
                  </span>
                </div>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground" aria-busy="true">
                Vérification…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

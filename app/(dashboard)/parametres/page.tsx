"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ConsoleHead, EmptyState, ReadoutStrip, TableHead } from "@/components/layout/console-head";
import { SERVICES } from "@/components/layout/service-status";
import { cn } from "@/lib/utils";
import type { InfraGroupSummary, InfraHealth } from "@/types";

type HealthState = InfraHealth | "loading";

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

const GRID = "md:grid-cols-[minmax(0,1.3fr)_1.5fr_1.3fr_90px_1.5fr_40px]";

function Connection({ state }: { state: HealthState | undefined }) {
  if (!state || state === "loading") {
    return <span className="font-mono text-micro text-muted-foreground">Vérification…</span>;
  }
  const ok = SERVICES.every((s) => state[s.key].ok);
  return (
    <span className="flex flex-wrap items-center gap-3">
      <Pill tone={ok ? "success" : "destructive"}>{ok ? "Connecté" : "Erreur"}</Pill>
      <span className="flex gap-2 font-mono text-[0.625rem] font-medium tracking-[0.05em] text-muted-foreground">
        {SERVICES.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1"
            title={`${s.label} : ${state[s.key].ok ? "OK" : (state[s.key].error ?? "erreur")}`}
          >
            <span
              className={cn("size-1.5 rounded-full", state[s.key].ok ? "bg-success" : "bg-destructive")}
              aria-hidden
            />
            {s.short}
          </span>
        ))}
      </span>
    </span>
  );
}

export default function ParametresPage() {
  const [groups, setGroups] = useState<InfraGroupSummary[] | null>(null);
  const [health, setHealth] = useState<Record<string, HealthState>>({});

  useEffect(() => {
    fetch("/api/infra-groups")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !Array.isArray(data)) throw new Error();
        setGroups(data);
      })
      .catch(() => {
        setGroups([]);
        toast.error("Impossible de charger les groupes");
      });

    fetch("/api/health")
      .then(async (r) => {
        if (!r.ok) return;
        const body = (await r.json()) as { groups?: (InfraHealth & { id: string })[] };
        const next: Record<string, HealthState> = {};
        for (const g of body.groups ?? []) next[g.id] = g;
        setHealth((h) => ({ ...next, ...h }));
      })
      .catch(() => undefined);
  }, []);

  async function probe(id: string) {
    setHealth((h) => ({ ...h, [id]: "loading" }));
    try {
      const res = await fetch(`/api/infra-groups/${id}/test`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as InfraHealth;
      setHealth((h) => ({ ...h, [id]: data }));
    } catch {
      setHealth((h) => {
        const next = { ...h };
        delete next[id];
        return next;
      });
      toast.error("Test impossible");
    }
  }

  const attached = (groups ?? []).reduce((sum, g) => sum + g.formations_count, 0);

  return (
    <div className="space-y-6">
      <ConsoleHead
        eyebrow="Lumixen"
        title="Paramètres"
        actions={
          <Link href="/parametres/groupes/nouveau">
            <Button>
              <Plus className="size-4 [stroke-width:2]" aria-hidden />
              Nouveau groupe
            </Button>
          </Link>
        }
      />

      <ReadoutStrip
        className="max-w-[560px] lg:grid-cols-2"
        readouts={[
          { label: "Groupes", value: groups?.length ?? 0 },
          { label: "Formations rattachées", value: attached },
        ]}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[1.0625rem] leading-6 font-semibold">Groupes d’infrastructure</h2>
          <p className="text-[0.8125rem] text-muted-foreground">
            Un groupe = un nœud Proxmox, son pfSense et son Guacamole
          </p>
        </div>

        <div className="panel overflow-hidden bg-card">
          {groups === null ? (
            <div className="flex flex-col gap-4 p-4" aria-busy="true">
              {[0, 1].map((i) => (
                <span key={i} className="h-2.5 rounded-[3px] bg-muted motion-safe:animate-shimmer-soft" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              count="0 groupe"
              title="Aucun groupe d’infrastructure"
              action={
                <Link href="/parametres/groupes/nouveau">
                  <Button variant="outline" size="sm" className="h-8">
                    <Plus className="size-4" aria-hidden />
                    Nouveau groupe
                  </Button>
                </Link>
              }
            >
              Impossible de déployer une formation sans groupe. Un groupe réunit un Proxmox, un
              pfSense et un Guacamole.
            </EmptyState>
          ) : (
            <>
              <TableHead className={GRID}>
                <span>Groupe</span>
                <span>Proxmox</span>
                <span>Guacamole</span>
                <span className="text-right">Formations</span>
                <span>Connexion</span>
                <span />
              </TableHead>
              <ul>
                {groups.map((g) => {
                  const state = health[g.id];
                  return (
                    <li
                      key={g.id}
                      className={cn(
                        "group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line",
                        "px-[18px] py-3.5 transition-colors duration-150 last:border-b-0 hover:bg-muted md:h-[58px] md:py-0",
                        GRID
                      )}
                    >
                      <Link
                        href={`/parametres/groupes/${g.id}`}
                        className={
                          "truncate text-sm font-medium outline-none after:absolute after:inset-0 " +
                          "after:content-[''] focus-visible:underline"
                        }
                      >
                        {g.name}
                      </Link>
                      <span className="hidden min-w-0 flex-col gap-1 md:flex">
                        <span className="truncate font-mono text-[0.8125rem] leading-none font-medium">
                          {g.proxmox_node}
                        </span>
                        <span className="truncate font-mono text-[0.71875rem] leading-none text-muted-foreground">
                          {stripScheme(g.proxmox_url)}
                        </span>
                      </span>
                      <span className="hidden truncate font-mono text-[0.78125rem] md:block">
                        {stripScheme(g.guacamole_url)}
                      </span>
                      <span className="hidden text-right font-mono text-[0.8125rem] tabular md:block">
                        {g.formations_count}
                      </span>
                      <span className="relative z-10 col-span-2 flex items-center gap-2 md:col-span-1">
                        <Connection state={state} />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={state === "loading"}
                          onClick={() => void probe(g.id)}
                          aria-label={`Retester ${g.name}`}
                          title="Retester"
                        >
                          <RefreshCw className={cn("size-3", state === "loading" && "motion-safe:animate-spin")} aria-hidden />
                        </Button>
                      </span>
                      <ChevronRight
                        className="row-start-1 size-4 justify-self-end text-muted-foreground md:row-auto"
                        aria-hidden
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

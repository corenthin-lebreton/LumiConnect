"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PlugZap, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsoleHead, Slab, TableHead } from "@/components/layout/console-head";
import type { InfraGroupSummary, InfraHealth } from "@/types";

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export default function ParametresPage() {
  const [groups, setGroups] = useState<InfraGroupSummary[] | null>(null);
  const [health, setHealth] = useState<Record<string, InfraHealth | "loading">>({});

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
    <div className="space-y-8">
      <ConsoleHead
        eyebrow="Administration"
        title="Paramètres"
        actions={
          <Link href="/parametres/groupes/nouveau">
            <Button size="lg" className="gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Nouveau groupe
            </Button>
          </Link>
        }
        readouts={[
          {
            label: "Groupes",
            value: String(groups?.length ?? 0),
            sub: "Proxmox + pfSense + Guacamole",
          },
          {
            label: "Formations rattachées",
            value: String(attached),
            sub: "toutes infrastructures confondues",
          },
        ]}
      />

      <Slab
        title="Groupes d'infrastructure"
        aside={
          <p className="text-micro text-muted-foreground">
            Une formation se déploie sur un groupe, un groupe en héberge autant qu&apos;il faut.
          </p>
        }
      >
        {groups === null ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground" aria-busy="true">
            Chargement…
          </p>
        ) : groups.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Settings className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="display mt-3 text-lg">Aucun groupe</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Impossible de déployer une formation sans groupe. Un groupe réunit un Proxmox, un
              pfSense et un Guacamole.
            </p>
            <div className="mt-5">
              <Link href="/parametres/groupes/nouveau">
                <Button className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Créer le premier
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <TableHead className="grid grid-cols-12">
              <span className="eyebrow col-span-3">Groupe</span>
              <span className="eyebrow col-span-3">Proxmox</span>
              <span className="eyebrow col-span-3">Guacamole</span>
              <span className="eyebrow col-span-1 text-right">Formations</span>
              <span className="eyebrow col-span-2 text-right">Connexion</span>
            </TableHead>
            <ul className="divide-y divide-line">
              {groups.map((g) => {
                const state = health[g.id];
                return (
                  <li
                    key={g.id}
                    className={
                      "group relative grid grid-cols-12 items-center gap-4 px-4 py-3 " +
                      "transition-colors duration-150 hover:bg-muted"
                    }
                  >
                    <div className="col-span-12 min-w-0 md:col-span-3">
                      <Link
                        href={`/parametres/groupes/${g.id}`}
                        className={
                          "block truncate text-sm font-medium after:absolute after:inset-0 " +
                          "after:content-[''] group-hover:underline group-hover:underline-offset-4"
                        }
                      >
                        {g.name}
                      </Link>
                      <p className="mt-0.5 font-mono text-micro text-muted-foreground md:hidden">
                        {stripScheme(g.proxmox_url)} · {g.formations_count} formation
                        {g.formations_count > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="col-span-3 hidden min-w-0 md:block">
                      <p className="truncate font-mono text-meta">{stripScheme(g.proxmox_url)}</p>
                      <p className="font-mono text-micro text-muted-foreground">nœud {g.proxmox_node}</p>
                    </div>
                    <div className="col-span-3 hidden min-w-0 md:block">
                      <p className="truncate font-mono text-meta">{stripScheme(g.guacamole_url)}</p>
                      <p className="font-mono text-micro text-muted-foreground">{g.guacamole_admin_user}</p>
                    </div>
                    <div className="col-span-1 hidden text-right font-mono text-meta tabular md:block">
                      {g.formations_count}
                    </div>
                    <div className="relative z-10 col-span-12 flex items-center justify-end gap-3 md:col-span-2">
                      {state && state !== "loading" && (
                        <span className="flex items-center gap-1.5" aria-label="État des services">
                          {(["proxmox", "pfsense", "guacamole"] as const).map((key) => (
                            <span
                              key={key}
                              title={`${key} : ${state[key].ok ? "OK" : (state[key].error ?? "erreur")}`}
                              className={`h-1.5 w-1.5 rounded-full ${state[key].ok ? "bg-success" : "bg-destructive"}`}
                            />
                          ))}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        disabled={state === "loading"}
                        onClick={() => void probe(g.id)}
                      >
                        <PlugZap
                          className={`h-3.5 w-3.5 ${state === "loading" ? "motion-safe:animate-pulse" : ""}`}
                          aria-hidden
                        />
                        Tester
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Slab>
    </div>
  );
}

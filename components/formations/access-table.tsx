"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/layout/console-head";
import { toneRail } from "@/components/ui/pill";
import { VmStatusPill, vmStatus } from "./status-pill";
import type { FormationVm, VmStatus } from "@/types";

type Filter = "all" | "ready" | "running" | "failed";

const FILTERS: { key: Filter; label: string; match: (s: VmStatus) => boolean }[] = [
  { key: "all", label: "Toutes", match: () => true },
  { key: "ready", label: "Prêtes", match: (s) => s === "ready" },
  { key: "running", label: "En cours", match: (s) => s === "pending" || s === "cloning" || s === "configuring" },
  { key: "failed", label: "Échec", match: (s) => s === "failed" },
];

const GRID = "md:grid-cols-[3px_72px_1fr_1.1fr_1.4fr_1.2fr]";

function railOf(status: VmStatus): string {
  return toneRail[(vmStatus[status] ?? vmStatus.pending).tone];
}

export function AccessTable({ vms }: { vms: FormationVm[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = vms.filter((vm) => active.match(vm.status));

  return (
    <section className="space-y-3 md:space-y-0">
      <div className="flex items-baseline justify-between md:hidden">
        <h2 className="text-base font-semibold">Accès</h2>
        <span className="font-mono text-xs text-muted-foreground">{vms.length} VMs</span>
      </div>

      <div className="overflow-hidden md:panel md:bg-card">
        <div className="hidden flex-wrap items-center gap-4 border-b border-line px-[18px] py-3 md:flex">
          <h2 className="text-[0.9375rem] leading-none font-semibold">Accès</h2>
          <div role="tablist" aria-label="Filtrer les machines" className="flex gap-0.5 rounded-md bg-muted p-0.5 text-[0.78125rem] font-medium">
            {FILTERS.map((f) => {
              const count = vms.filter((vm) => f.match(vm.status)).length;
              const selected = f.key === filter;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-sm px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label} <span className="font-mono text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">Mots de passe dans le PDF</span>
        </div>

        <TableHead className={cn(GRID, "pl-0")}>
          <span />
          <span>VMID</span>
          <span>IP</span>
          <span>MAC</span>
          <span>Identifiant</span>
          <span>Statut</span>
        </TableHead>

        {shown.length === 0 ? (
          <p className="px-[18px] py-8 text-center text-sm text-muted-foreground">
            Aucune machine dans cet état.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5 md:gap-0">
            {shown.map((vm) => (
              <li
                key={vm.id}
                className={cn(
                  "overflow-hidden rounded-lg border border-line-strong bg-card md:grid md:h-[46px] md:items-center",
                  "md:gap-x-4 md:rounded-none md:border-0 md:border-b md:border-line md:bg-transparent md:pr-[18px]",
                  "transition-colors duration-150 md:last:border-b-0 md:hover:bg-muted",
                  GRID
                )}
              >
                <span className={cn("block h-[3px] md:h-full", railOf(vm.status))} aria-hidden />

                <div className="flex flex-col gap-2.5 px-3.5 py-3 md:contents">
                  <div className="flex items-center justify-between gap-2 md:contents">
                    <span className="font-mono text-sm font-semibold md:text-[0.8125rem] md:font-medium">
                      {vm.vmid}
                    </span>
                    <span className="md:hidden">
                      <VmStatusPill status={vm.status} />
                    </span>
                  </div>
                  <div className="flex justify-between font-mono text-[0.78125rem] md:contents md:text-[0.8125rem]">
                    <span className="tabular">{vm.ip ?? "en attente"}</span>
                    <span className="hidden truncate text-muted-foreground md:block">{vm.mac_address ?? "-"}</span>
                    <span className="flex items-center gap-2.5 truncate">
                      {vm.guac_username ?? "-"}
                      {vm.guac_username && (
                        <span className="tracking-[0.1em] text-muted-foreground" aria-hidden>
                          ••••••••
                        </span>
                      )}
                    </span>
                  </div>
                  {vm.error_message && (
                    <span className="text-[0.78125rem] text-destructive md:hidden">{vm.error_message}</span>
                  )}
                </div>

                <span className="hidden md:block" title={vm.error_message ?? undefined}>
                  <VmStatusPill status={vm.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

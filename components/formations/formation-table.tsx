"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, TableHead } from "@/components/layout/console-head";
import { StatusPill } from "./status-pill";
import { cn } from "@/lib/utils";
import type { FormationStatus } from "@/types";

export interface FormationRowData {
  id: string;
  name: string;
  os_id: string | null;
  template_name: string | null;
  vm_start_id: number;
  vm_end_id: number;
  status: string;
  created_at: string;
}

const GRID = "md:grid-cols-[minmax(0,2.4fr)_1fr_64px_1.35fr_1.1fr_84px]";

function formatCreated(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
    time: date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function osLabel(f: FormationRowData): string {
  return f.template_name ?? f.os_id ?? "OS non déduit";
}

function FormationRow({ formation: f }: { formation: FormationRowData }) {
  const vmCount = f.vm_end_id - f.vm_start_id + 1;
  const created = formatCreated(f.created_at);
  const deployed = f.status === "deployed";

  return (
    <li
      className={cn(
        "group relative grid items-center gap-x-4 gap-y-2.5 border-b border-line px-3.5 py-3.5 last:border-b-0",
        "transition-colors duration-150 hover:bg-muted md:h-14 md:px-[18px] md:py-0",
        GRID
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2.5">
        <span className="flex min-w-0 flex-col gap-[5px]">
          <Link
            href={`/formations/${f.id}`}
            className={
              "truncate text-[0.9375rem] leading-tight font-medium outline-none after:absolute after:inset-0 " +
              "after:content-[''] focus-visible:underline md:text-sm"
            }
          >
            {f.name}
          </Link>
          <span className="hidden truncate font-mono text-[0.71875rem] leading-none text-muted-foreground md:block">
            {osLabel(f)}
          </span>
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground md:hidden" aria-hidden />
      </div>

      <span className="hidden font-mono text-[0.8125rem] tabular md:block">
        {f.vm_start_id}–{f.vm_end_id}
      </span>
      <span className="hidden text-right font-mono text-[0.8125rem] tabular md:block">{vmCount}</span>

      <div className="flex items-center justify-between gap-2 md:block">
        <StatusPill status={f.status as FormationStatus} />
        <span className="font-mono text-[0.71875rem] text-muted-foreground md:hidden">
          {f.vm_start_id}–{f.vm_end_id} · {vmCount} VMs
        </span>
      </div>

      <span className="hidden flex-col gap-[5px] md:flex">
        <span className="text-[0.8125rem] leading-none">{created.day}</span>
        <span className="text-[0.71875rem] leading-none text-muted-foreground">{created.time}</span>
      </span>

      <span className="relative z-10 hidden justify-end gap-1 md:flex">
        {deployed ? (
          <a
            href={`/api/formations/${f.id}/pdf`}
            aria-label={`Télécharger le PDF de ${f.name}`}
            title="PDF des identifiants"
            className={
              "grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors " +
              "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            }
          >
            <Download className="size-4" aria-hidden />
          </a>
        ) : (
          <span
            className="grid size-8 place-items-center text-muted-foreground opacity-35"
            title="Disponible une fois la formation déployée"
            aria-hidden
          >
            <Download className="size-4" />
          </span>
        )}
        {f.status !== "deleting" && (
          <Link
            href={`/formations/${f.id}/delete`}
            aria-label={`Supprimer ${f.name}`}
            className={
              "grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors " +
              "hover:bg-destructive/12 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
            }
          >
            <Trash2 className="size-4" aria-hidden />
          </Link>
        )}
      </span>
    </li>
  );
}

export function FormationTable({
  formations,
  newButton,
}: {
  formations: FormationRowData[];
  newButton: React.ReactNode;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return formations;
    return formations.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        osLabel(f).toLowerCase().includes(q) ||
        `${f.vm_start_id}`.includes(q)
    );
  }, [formations, query]);

  const vmTotal = filtered.reduce((sum, f) => sum + (f.vm_end_id - f.vm_start_id + 1), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {formations.length > 0 && (
          <div className="relative sm:w-60">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une formation"
              aria-label="Rechercher une formation"
              className="h-[34px] pl-8 text-[0.84375rem]"
            />
          </div>
        )}
        {newButton}
      </div>

      <div className="panel overflow-hidden bg-card">
        {formations.length === 0 ? (
          <EmptyState
            count="0 formation"
            title="Aucune formation pour l’instant"
            action={
              <Link href="/formations/new">
                <Button variant="outline" size="sm" className="h-8">
                  <Plus className="size-4" aria-hidden />
                  Nouvelle formation
                </Button>
              </Link>
            }
          >
            Créez une formation pour cloner un template et générer les accès stagiaires.
          </EmptyState>
        ) : (
          <>
            <TableHead className={GRID}>
              <span>Formation</span>
              <span>Plage VMID</span>
              <span className="text-right">VMs</span>
              <span>État</span>
              <span>Créée</span>
              <span className="text-right">Actions</span>
            </TableHead>
            {filtered.length === 0 ? (
              <p className="px-[18px] py-10 text-center text-sm text-muted-foreground">
                Aucune formation ne correspond à « {query.trim()} ».
              </p>
            ) : (
              <ul>
                {filtered.map((formation) => (
                  <FormationRow key={formation.id} formation={formation} />
                ))}
              </ul>
            )}
            <div className="flex justify-between border-t border-line px-[18px] py-3 font-mono text-[0.71875rem] text-muted-foreground">
              <span>
                {filtered.length} formation{filtered.length > 1 ? "s" : ""} · {vmTotal} VMs
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

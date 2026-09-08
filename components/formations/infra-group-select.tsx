"use client";

import Link from "next/link";
import { ChevronDown, Settings, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InfraGroupSummary } from "@/types";

interface Props {
  groups: InfraGroupSummary[] | null;
  value: string;
  onChange: (id: string) => void;
}

export function InfraGroupSelect({ groups, value, onChange }: Props) {
  if (groups === null) {
    return <div className="h-10 rounded-md border border-line bg-muted motion-safe:animate-pulse" aria-busy="true" />;
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-warning/50 bg-warning/8 px-4 py-4">
        <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          Aucun groupe d&apos;infrastructure. Impossible de déployer une formation sans Proxmox,
          pfSense et Guacamole configurés.
        </p>
        <Link href="/parametres/groupes/nouveau">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" aria-hidden />
            Créer un groupe
          </Button>
        </Link>
      </div>
    );
  }

  const selected = groups.find((g) => g.id === value) ?? null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Groupe d'infrastructure"
          className="h-10 w-full appearance-none rounded-md border border-line-strong bg-card px-3 pr-9 text-sm outline-none transition-[border-color,box-shadow] duration-150 hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        >
          <option value="" disabled>
            Sélectionner un groupe
          </option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
      {selected && (
        <p className="font-mono text-micro text-muted-foreground">
          {selected.proxmox_url.replace(/^https?:\/\//, "")} · nœud {selected.proxmox_node} ·{" "}
          {selected.guacamole_url.replace(/^https?:\/\//, "")}
        </p>
      )}
    </div>
  );
}

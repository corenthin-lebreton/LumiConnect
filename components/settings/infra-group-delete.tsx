"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InfraGroupSummary } from "@/types";

export function InfraGroupDelete({ group }: { group: InfraGroupSummary }) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);

  const blocked = group.formations_count > 0;
  const plural = group.formations_count > 1 ? "s" : "";
  const isMatch = confirmName === group.name;

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/infra-groups/${group.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(typeof body?.error === "string" ? body.error : "Suppression impossible");
        return;
      }
      toast.success("Groupe supprimé");
      router.push("/parametres");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel overflow-hidden bg-card">
      <div className="h-[3px] bg-destructive" aria-hidden />
      <div className="flex flex-col gap-3.5 p-5">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-micro font-medium tracking-[0.12em] text-destructive uppercase">
            Supprimer ce groupe
          </p>
          <p className="text-sm leading-normal text-pretty">
            {blocked
              ? `${group.formations_count} formation${plural} y ${plural ? "sont" : "est"} ` +
                `rattachée${plural}. Les supprimer d'abord.`
              : "Aucune ressource n'est touchée sur Proxmox, pfSense ou Guacamole : seule la configuration disparaît."}
          </p>
        </div>

        {!blocked && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.8125rem] leading-snug font-medium">
              Saisissez{" "}
              <span className="rounded-[3px] bg-muted px-[5px] py-px font-mono">{group.name}</span>{" "}
              pour confirmer
            </span>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Nom du groupe"
              autoComplete="off"
              className="h-[38px] focus-visible:border-destructive focus-visible:ring-destructive/25"
            />
          </label>
        )}
      </div>
      {!blocked && (
        <div className="flex justify-end border-t border-line bg-surface px-5 py-3.5">
          <Button variant="destructive" className="h-9" disabled={!isMatch || loading} onClick={() => void handleDelete()}>
            <Trash2 className="size-4" aria-hidden />
            {loading ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </div>
      )}
    </div>
  );
}

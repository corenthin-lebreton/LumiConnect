"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
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
    <div className="panel overflow-hidden border-destructive/35 bg-card">
      <div className="flex items-start gap-3 border-b border-destructive/25 bg-destructive/8 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-destructive">Supprimer ce groupe</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {blocked
              ? `${group.formations_count} formation${plural} y ${plural ? "sont" : "est"} ` +
                `rattachée${plural}. Les supprimer d'abord.`
              : "Aucune ressource n'est touchée sur Proxmox, pfSense ou Guacamole : seule la configuration disparaît."}
          </p>
        </div>
      </div>

      {!blocked && (
        <div className="space-y-4 px-5 py-4">
          <div>
            <label htmlFor="confirm-group-name" className="eyebrow">
              Tapez le nom pour confirmer
            </label>
            <p className="mb-2 mt-1.5 inline-block rounded-sm border border-line bg-muted px-2 py-1 font-mono text-sm">
              {group.name}
            </p>
            <Input
              id="confirm-group-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={group.name}
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <Button variant="destructive" disabled={!isMatch || loading} onClick={() => void handleDelete()}>
            {loading ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </div>
      )}
    </div>
  );
}

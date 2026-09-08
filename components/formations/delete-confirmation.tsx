"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

export function DeleteConfirmation({
  formationId,
  formationName,
  vmCount,
}: {
  formationId: string;
  formationName: string;
  vmCount: number;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isMatch = confirmName === formationName;

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/formations/${formationId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });

    if (res.ok) {
      router.push("/formations");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="panel overflow-hidden border-destructive/35 bg-card">
      <div className="flex items-start gap-3 border-b border-destructive/25 bg-destructive/8 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-destructive">Action irréversible</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Les ressources suivantes seront définitivement supprimées.
          </p>
        </div>
      </div>

      <ul className="space-y-2 border-b border-line px-5 py-4 text-sm">
        <Item>{vmCount} VM(s) sur Proxmox, plus l&apos;image dorée (template)</Item>
        <Item>{vmCount} bail(s) DHCP sur pfSense</Item>
        <Item>{vmCount} connexion(s) et utilisateur(s) Guacamole</Item>
        <Item>Toutes les données en base</Item>
      </ul>

      <div className="space-y-4 px-5 py-4">
        <div>
          <label htmlFor="confirm-name" className="eyebrow">
            Tapez le nom pour confirmer
          </label>
          <p className="mb-2 mt-1.5 inline-block rounded-sm border border-line bg-muted px-2 py-1 font-mono text-sm">
            {formationName}
          </p>
          <Input
            id="confirm-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={formationName}
            className="font-mono"
            autoComplete="off"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            variant="destructive"
            disabled={!isMatch || loading}
            onClick={handleDelete}
            size="lg"
            className="flex-1"
          >
            {loading ? "Suppression…" : "Supprimer définitivement"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.back()}
            className="flex-1"
          >
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className="h-1 w-1 shrink-0 rounded-full bg-destructive" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

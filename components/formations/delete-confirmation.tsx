"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DeleteConfirmation({
  formationId,
  formationName,
  vmStart,
  vmEnd,
  node,
  hasGolden,
}: {
  formationId: string;
  formationName: string;
  vmStart: number;
  vmEnd: number;
  node: string | null;
  hasGolden: boolean;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isMatch = confirmName === formationName;
  const vmCount = vmEnd - vmStart + 1;

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
    } else {
      const body = await res.json().catch(() => null);
      toast.error(typeof body?.error === "string" ? body.error : "Suppression impossible");
    }
    setLoading(false);
  }

  return (
    <div className="panel overflow-hidden bg-card">
      <div className="h-[3px] bg-destructive" aria-hidden />
      <div className="flex flex-col gap-3.5 p-5">
        <p className="text-sm leading-normal text-pretty">
          Cette action est irréversible. Les éléments suivants seront détruits :
        </p>
        <ul className="flex flex-col rounded-md border border-line">
          <Item value={`${vmCount} · ${vmStart}–${vmEnd}`}>
            VMs Proxmox{node ? ` sur ${node}` : ""}
            {hasGolden && ", image dorée comprise"}
          </Item>
          <Item value={String(vmCount)}>Baux DHCP pfSense</Item>
          <Item value={String(vmCount)}>Connexions et comptes Guacamole</Item>
          <Item value="toutes">Données de la formation en base</Item>
        </ul>
        <label className="flex flex-col gap-1.5 pt-1">
          <span className="text-[0.8125rem] leading-snug font-medium">
            Saisissez{" "}
            <span className="rounded-[3px] bg-muted px-[5px] py-px font-mono">{formationName}</span>{" "}
            pour confirmer
          </span>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Nom de la formation"
            autoComplete="off"
            className={cn(
              "h-[38px] focus-visible:border-destructive focus-visible:ring-destructive/25",
              confirmName && !isMatch && "border-destructive"
            )}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-surface px-5 py-3.5">
        <Button variant="outline" className="h-9" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button variant="destructive" className="h-9" disabled={!isMatch || loading} onClick={handleDelete}>
          <Trash2 className="size-4" aria-hidden />
          {loading ? "Suppression…" : "Supprimer définitivement"}
        </Button>
      </div>
    </div>
  );
}

function Item({ children, value }: { children: React.ReactNode; value: string }) {
  return (
    <li className="flex justify-between gap-4 border-b border-line px-3 py-2.5 text-[0.84375rem] leading-tight last:border-b-0">
      <span>{children}</span>
      <span className="shrink-0 font-mono text-[0.78125rem] text-muted-foreground">{value}</span>
    </li>
  );
}

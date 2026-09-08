"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { toast } from "sonner";
import { ConsoleHead } from "@/components/layout/console-head";
import { InfraGroupForm } from "@/components/settings/infra-group-form";
import { InfraGroupDelete } from "@/components/settings/infra-group-delete";
import type { InfraGroupSummary } from "@/types";

export default function EditInfraGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<InfraGroupSummary | null | "missing">(null);

  useEffect(() => {
    fetch(`/api/infra-groups/${id}`)
      .then(async (r) => {
        if (r.status === 404) {
          setGroup("missing");
          return;
        }
        const data = await r.json();
        if (!r.ok) throw new Error();
        setGroup(data as InfraGroupSummary);
      })
      .catch(() => toast.error("Impossible de charger le groupe"));
  }, [id]);

  if (group === "missing") notFound();

  if (group === null) {
    return (
      <div className="space-y-8" aria-busy="true">
        <ConsoleHead eyebrow="Paramètres" title="Chargement…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ConsoleHead
        eyebrow="Paramètres"
        title={group.name}
        readouts={[
          { label: "Formations", value: String(group.formations_count), sub: "rattachées à ce groupe" },
          { label: "Nœud Proxmox", value: group.proxmox_node, sub: group.proxmox_url.replace(/^https?:\/\//, "") },
        ]}
      />
      <InfraGroupForm mode="edit" group={group} />
      <InfraGroupDelete group={group} />
    </div>
  );
}

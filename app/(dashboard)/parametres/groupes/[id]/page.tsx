"use client";

import { use, useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { toast } from "sonner";
import { ConsoleHead } from "@/components/layout/console-head";
import { InfraGroupForm } from "@/components/settings/infra-group-form";
import { InfraGroupDelete } from "@/components/settings/infra-group-delete";
import type { InfraGroupSummary } from "@/types";

const BACK = { href: "/parametres", label: "Paramètres" };

export default function EditInfraGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<InfraGroupSummary | null | "missing">(null);
  const [deleting, setDeleting] = useState(false);
  const deleteRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (deleting) deleteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [deleting]);

  if (group === "missing") notFound();

  if (group === null) {
    return (
      <div className="space-y-6" aria-busy="true">
        <ConsoleHead back={BACK} eyebrow="Groupe d’infrastructure" title="Chargement…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConsoleHead
        back={BACK}
        eyebrow="Groupe d’infrastructure"
        title={group.name}
        subtitle={`${group.formations_count} formation${group.formations_count > 1 ? "s" : ""} rattachée${
          group.formations_count > 1 ? "s" : ""
        } · nœud ${group.proxmox_node}`}
      />
      <InfraGroupForm mode="edit" group={group} onDelete={() => setDeleting(true)} />
      {deleting && (
        <div ref={deleteRef} className="max-w-[600px]">
          <InfraGroupDelete group={group} />
        </div>
      )}
    </div>
  );
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DeleteConfirmation } from "@/components/formations/delete-confirmation";
import { ConsoleHead } from "@/components/layout/console-head";
import { loadInfraRow } from "@/lib/infra/groups";

export default async function DeletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: formation } = await supabase
    .from("formations")
    .select("*")
    .eq("id", id)
    .single();

  if (!formation) notFound();

  const group = formation.infra_group_id ? await loadInfraRow(formation.infra_group_id) : null;

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-5">
      <ConsoleHead
        back={{ href: `/formations/${id}`, label: formation.name }}
        eyebrow={formation.status === "cleanup_failed" ? "Relance du nettoyage" : "Suppression définitive"}
        eyebrowTone="destructive"
        title={`Supprimer « ${formation.name} » ?`}
      />
      <DeleteConfirmation
        formationId={id}
        formationName={formation.name}
        vmStart={formation.vm_start_id}
        vmEnd={formation.vm_end_id}
        node={group?.proxmox_node ?? null}
        hasGolden={formation.golden_vmid !== null}
      />
    </div>
  );
}

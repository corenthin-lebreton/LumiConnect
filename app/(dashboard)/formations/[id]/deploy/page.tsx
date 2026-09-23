import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DeployProgress } from "@/components/formations/deploy-progress";
import { ConsoleHead } from "@/components/layout/console-head";
import { loadInfraRow } from "@/lib/infra/groups";

export default async function DeployPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: formation } = await supabase
    .from("formations")
    .select("name, vm_start_id, vm_end_id, infra_group_id")
    .eq("id", id)
    .single();

  if (!formation) notFound();

  const group = formation.infra_group_id ? await loadInfraRow(formation.infra_group_id) : null;
  const count = formation.vm_end_id - formation.vm_start_id + 1;
  const title = `${count} machine${count > 1 ? "s" : ""}${group ? ` sur ${group.proxmox_node}` : ""}`;

  return (
    <div className="space-y-5">
      <ConsoleHead back={{ href: `/formations/${id}`, label: formation.name }} eyebrow="Déploiement" title={title} />
      <DeployProgress formationId={id} />
    </div>
  );
}

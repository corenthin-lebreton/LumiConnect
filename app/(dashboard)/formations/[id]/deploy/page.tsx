import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DeployProgress } from "@/components/formations/deploy-progress";
import { ConsoleHead } from "@/components/layout/console-head";

export default async function DeployPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: formation } = await supabase
    .from("formations")
    .select("name")
    .eq("id", id)
    .single();

  if (!formation) notFound();

  return (
    <div className="space-y-7">
      <ConsoleHead
        eyebrow="Déploiement"
        title={formation.name}
      />
      <DeployProgress formationId={id} />
    </div>
  );
}

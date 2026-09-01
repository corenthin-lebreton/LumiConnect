import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DeleteConfirmation } from "@/components/formations/delete-confirmation";
import { ConsoleHead } from "@/components/layout/console-head";

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

  const vmCount = formation.vm_end_id - formation.vm_start_id + 1;

  return (
    <div className="mx-auto max-w-lg space-y-7">
      <ConsoleHead
        eyebrow="Suppression"
        title={formation.name}
      />
      <DeleteConfirmation
        formationId={id}
        formationName={formation.name}
        vmCount={vmCount}
      />
    </div>
  );
}

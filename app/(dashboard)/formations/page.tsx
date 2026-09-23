import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DeletingWatcher } from "@/components/formations/deleting-watcher";
import { ConsoleHead } from "@/components/layout/console-head";
import { FormationTable, type FormationRowData } from "@/components/formations/formation-table";
import type { FormationStatus } from "@/types";

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

export default async function FormationsPage() {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("formations")
    .select("id, name, os_id, template_name, vm_start_id, vm_end_id, status, created_at, infra_group_id")
    .order("created_at", { ascending: false });

  const formations = (data ?? []) as (FormationRowData & { infra_group_id: string | null })[];
  const hasRunning = formations.some(
    (f) => f.status === "deleting" || f.status === "deploying"
  );

  const count = (...statuses: FormationStatus[]) =>
    formations.filter((f) => statuses.includes(f.status as FormationStatus)).length;

  const machines = formations.reduce((sum, f) => sum + (f.vm_end_id - f.vm_start_id + 1), 0);
  const broken = count("failed", "cleanup_failed");
  const groups = new Set(formations.map((f) => f.infra_group_id).filter(Boolean)).size;

  const newButton = (
    <Link href="/formations/new" className="w-full sm:w-auto">
      <Button className="h-[46px] w-full rounded-lg sm:h-[34px] sm:w-auto sm:rounded-md">
        <Plus className="size-4 [stroke-width:2]" aria-hidden />
        Nouvelle formation
      </Button>
    </Link>
  );

  return (
    <div className="space-y-6">
      <DeletingWatcher hasDeleting={hasRunning} />

      <ConsoleHead
        eyebrow="Lumixen"
        title="Formations"
        subtitle={
          formations.length > 0
            ? `${plural(formations.length, "formation")} sur ${plural(groups, "groupe")} d’infrastructure`
            : undefined
        }
        readouts={[
          {
            label: "Machines",
            value: (
              <span className="flex items-baseline gap-2">
                {machines}
                <span className="hidden font-mono text-xs font-normal text-muted-foreground sm:inline">
                  sur {plural(formations.length, "formation")}
                </span>
              </span>
            ),
          },
          { label: "Déployées", value: count("deployed"), tone: "success" },
          { label: "En cours", value: count("deploying", "deleting"), tone: "running" },
          { label: "En échec", value: broken, tone: "destructive", alert: broken > 0 },
        ]}
      />

      <FormationTable formations={formations} newButton={newButton} />
    </div>
  );
}

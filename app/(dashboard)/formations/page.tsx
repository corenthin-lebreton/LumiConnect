import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus, Download, Trash2 } from "lucide-react";
import { DeletingWatcher } from "@/components/formations/deleting-watcher";
import { ConsoleHead, Slab, TableHead } from "@/components/layout/console-head";
import { StatusPill } from "@/components/formations/status-pill";
import { cn } from "@/lib/utils";
import type { FormationStatus } from "@/types";

export default async function FormationsPage() {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("formations")
    .select("*, formation_vms(count)")
    .order("created_at", { ascending: false });

  const formations = data ?? [];
  const hasRunning = formations.some(
    (f) => f.status === "deleting" || f.status === "deploying"
  );

  const count = (...statuses: FormationStatus[]) =>
    String(formations.filter((f) => statuses.includes(f.status as FormationStatus)).length);

  const machines = formations.reduce(
    (sum, f) => sum + (f.vm_end_id - f.vm_start_id + 1),
    0
  );
  const broken = count("failed", "cleanup_failed");

  return (
    <div className="space-y-8">
      <DeletingWatcher hasDeleting={hasRunning} />

      <ConsoleHead
        eyebrow="Lumixen"
        title="Formations"
        actions={
          <Link href="/formations/new">
            <Button size="lg" className="gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Nouvelle formation
            </Button>
          </Link>
        }
        readouts={[
          {
            label: "Machines",
            value: String(machines),
            sub: `${formations.length} formation${formations.length > 1 ? "s" : ""}`,
          },
          { label: "Déployées", value: count("deployed"), tone: "success" },
          { label: "En cours", value: count("deploying", "deleting"), tone: "running" },
          { label: "En échec", value: broken, tone: broken === "0" ? "default" : "destructive" },
        ]}
      />

      <Slab
        title={`Liste (${formations.length})`}
        aside={
          formations.length > 0 ? (
            <p className="text-micro text-muted-foreground">
              Cliquer une ligne pour ouvrir la formation
            </p>
          ) : undefined
        }
      >
        {formations.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <TableHead>
              <span className="w-0.5" aria-hidden />
              <span className="eyebrow flex-1">Formation</span>
              <span className="eyebrow w-28">Plage VMID</span>
              <span className="eyebrow w-14 pr-4 text-right">VMs</span>
              <span className="eyebrow w-44">État</span>
              <span className="eyebrow w-16 text-right">Créée</span>
              <span className="w-16" aria-hidden />
            </TableHead>
            <ul className="divide-y divide-line">
              {formations.map((formation) => (
                <FormationRow key={formation.id} formation={formation} />
              ))}
            </ul>
          </>
        )}
      </Slab>
    </div>
  );
}

interface FormationRowData {
  id: string;
  name: string;
  vm_start_id: number;
  vm_end_id: number;
  status: string;
  created_at: string;
}

const railTone: Record<string, string> = {
  draft: "bg-muted-foreground/30",
  deploying: "bg-running",
  deleting: "bg-running",
  deployed: "bg-success",
  failed: "bg-destructive",
  cleanup_failed: "bg-warning",
};

function FormationRow({ formation: f }: { formation: FormationRowData }) {
  const vmCount = f.vm_end_id - f.vm_start_id + 1;

  return (
    <li className="group relative flex items-center gap-4 px-4 py-2.5 transition-colors duration-150 hover:bg-muted">
      <span
        className={cn(
          "h-7 w-0.5 shrink-0 rounded-full",
          railTone[f.status] ?? "bg-muted-foreground/30"
        )}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <Link
          href={`/formations/${f.id}`}
          className="block truncate text-sm font-medium after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4"
        >
          {f.name}
        </Link>
        <p className="mt-0.5 font-mono text-micro text-muted-foreground md:hidden">
          {vmCount} VM, {f.vm_start_id}-{f.vm_end_id}
        </p>
      </div>

      <span className="hidden w-28 font-mono text-meta text-muted-foreground tabular md:block">
        {f.vm_start_id}-{f.vm_end_id}
      </span>
      <span className="hidden w-14 pr-4 text-right font-mono text-meta tabular md:block">
        {vmCount}
      </span>
      <span className="hidden w-44 md:block">
        <StatusPill status={f.status as FormationStatus} />
      </span>
      <span className="hidden w-16 text-right font-mono text-micro text-muted-foreground tabular md:block">
        {new Date(f.created_at).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
        })}
      </span>

      <span className="relative z-10 flex w-16 shrink-0 items-center justify-end gap-0.5">
        {f.status === "deployed" && (
          <a href={`/api/formations/${f.id}/pdf`} aria-label={`Télécharger le PDF de ${f.name}`}>
            <Button variant="ghost" size="icon-sm">
              <Download className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </a>
        )}
        {f.status !== "deleting" && (
          <Link href={`/formations/${f.id}/delete`} aria-label={`Supprimer ${f.name}`}>
            <Button variant="ghost" size="icon-sm" className="hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </Link>
        )}
      </span>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-14 text-center">
      <p className="display text-lg">Aucune formation</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Une formation décrit un template, une plage de VMID et les scripts à appliquer. Le
        déploiement s&apos;occupe du reste.
      </p>
      <div className="mt-5">
        <Link href="/formations/new">
          <Button className="gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Créer la première
          </Button>
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Play, Download, Trash2 } from "lucide-react";
import { ConsoleHead, ReadoutStrip, Slab, TableHead } from "@/components/layout/console-head";
import { StatusPill } from "@/components/formations/status-pill";
import { DeploymentTrace } from "@/components/formations/deployment-trace";
import { cn } from "@/lib/utils";
import type { FormationStatus, VmStatus } from "@/types";

const vmTone: Record<VmStatus, { rail: string; text: string; label: string }> = {
  pending: { rail: "bg-muted-foreground/30", text: "text-muted-foreground", label: "En attente" },
  cloning: { rail: "bg-running", text: "text-running", label: "Clone" },
  configuring: { rail: "bg-running", text: "text-running", label: "Configuration" },
  ready: { rail: "bg-success", text: "text-success", label: "Prête" },
  failed: { rail: "bg-destructive", text: "text-destructive", label: "Échec" },
};

export default async function FormationDetailPage({
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

  const { data: vmRows } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", id)
    .order("vmid");

  const vms = vmRows ?? [];
  const vmCount = formation.vm_end_id - formation.vm_start_id + 1;
  const ready = vms.filter((vm) => vm.status === "ready").length;

  return (
    <div className="space-y-8">
      <ConsoleHead
        eyebrow={formation.os_id ?? "OS non déduit"}
        title={formation.name}
        status={
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={formation.status as FormationStatus} />
            {formation.error_message && (
              <span className="font-mono text-micro text-destructive">
                {formation.error_message}
              </span>
            )}
          </div>
        }
        actions={
          <>
            {formation.status === "draft" && (
              <Link href={`/formations/${id}/deploy`}>
                <Button size="lg" className="gap-1.5">
                  <Play className="h-4 w-4" aria-hidden />
                  Déployer
                </Button>
              </Link>
            )}
            {(formation.status === "deployed" || formation.status === "failed") && (
              <a href={`/api/formations/${id}/pdf`}>
                <Button variant="outline" size="lg" className="gap-1.5">
                  <Download className="h-4 w-4" aria-hidden />
                  PDF
                </Button>
              </a>
            )}
            <Link href={`/formations/${id}/delete`}>
              <Button variant="ghost" size="lg" className="gap-1.5 hover:text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden />
                Supprimer
              </Button>
            </Link>
          </>
        }
        readouts={[
          {
            label: "Machines prêtes",
            value: `${ready}/${vmCount}`,
            tone: vmCount > 0 && ready === vmCount ? "success" : "default",
          },
          {
            label: "Plage VMID",
            value: String(formation.vm_start_id),
            sub: `jusqu'à ${formation.vm_end_id}`,
          },
          {
            label: "CPU par VM",
            value: String(formation.cpu_cores),
            sub: `${formation.ram_mb} Mo de RAM`,
          },
          {
            label: "Template",
            value: String(formation.template_vmid),
            sub: formation.template_name ?? "nom non enregistré",
          },
        ]}
      />

      <DeploymentTrace formationId={id} />

      {vms.length > 0 && (
        <Slab
          title={`Accès (${vms.length})`}
          aside={
            <p className="text-micro text-muted-foreground">Mots de passe dans le PDF</p>
          }
        >
          <TableHead>
            <span className="w-0.5" aria-hidden />
            <span className="eyebrow w-16">VMID</span>
            <span className="eyebrow w-32">Adresse IP</span>
            <span className="eyebrow flex-1">Adresse MAC</span>
            <span className="eyebrow flex-1">Compte Guacamole</span>
            <span className="eyebrow w-28 text-right">État</span>
          </TableHead>

          <ul className="divide-y divide-line">
            {vms.map((vm) => {
              const tone = vmTone[vm.status as VmStatus] ?? vmTone.pending;
              return (
                <li
                  key={vm.id}
                  className="flex items-center gap-4 px-4 py-2.5 transition-colors duration-150 hover:bg-muted"
                >
                  <span
                    className={cn("h-6 w-0.5 shrink-0 rounded-full", tone.rail)}
                    aria-hidden
                  />
                  <span className="w-16 font-mono text-sm font-medium tabular">{vm.vmid}</span>
                  <span className="w-32 font-mono text-meta tabular">{vm.ip ?? "-"}</span>
                  <span className="hidden flex-1 truncate font-mono text-micro text-muted-foreground md:block">
                    {vm.mac_address ?? "-"}
                  </span>
                  <span className="hidden flex-1 truncate font-mono text-meta md:block">
                    {vm.guac_username ?? "-"}
                  </span>
                  <span
                    className={cn(
                      "w-28 text-right font-mono text-micro uppercase tracking-[0.06em]",
                      tone.text
                    )}
                  >
                    {tone.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Slab>
      )}

      {vms.length > 0 && (
        <section className="space-y-3">
          <h2 className="display text-base">Ressources externes</h2>
          <ReadoutStrip
            readouts={[
              {
                label: "Clones Proxmox",
                value: String(vms.filter((v) => v.mac_address).length),
                sub: `template ${formation.template_vmid}`,
              },
              {
                label: "Connexions RDP",
                value: String(vms.filter((v) => v.guac_connection_id).length),
                sub: formation.guac_user_group ?? "groupe non créé",
              },
              {
                label: "Comptes stagiaires",
                value: String(vms.filter((v) => v.guac_username).length),
                sub: "un par machine",
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}

import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Download, Play, SquareTerminal, Trash2, TriangleAlert, RotateCw } from "lucide-react";
import { ConsoleHead, ReadoutStrip } from "@/components/layout/console-head";
import { StatusPill } from "@/components/formations/status-pill";
import { DeploymentTrace } from "@/components/formations/deployment-trace";
import { AccessTable } from "@/components/formations/access-table";
import type { FormationStatus, FormationVm } from "@/types";
import { loadInfraRow } from "@/lib/infra/groups";

function formatRam(mb: number): string {
  const gb = mb / 1024;
  return Number.isInteger(gb) ? `${gb} Go` : `${mb} Mo`;
}

function ReadyBar({ ready, failed, total }: { ready: number; failed: number; total: number }) {
  if (total === 0) return null;
  const rest = Math.max(total - ready - failed, 0);
  return (
    <span className="flex h-1 gap-0.5" aria-hidden>
      {ready > 0 && <span className="rounded-full bg-success" style={{ flex: ready }} />}
      {failed > 0 && <span className="rounded-full bg-destructive" style={{ flex: failed }} />}
      {rest > 0 && <span className="rounded-full bg-line-strong" style={{ flex: rest }} />}
    </span>
  );
}

function CleanupBanner({ id, message }: { id: string; message: string | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/45 bg-warning/8 px-4 py-3.5 sm:flex-row sm:items-start">
      <TriangleAlert className="mt-px size-[18px] shrink-0 text-warning" aria-hidden />
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-semibold">Le nettoyage n’a pas abouti</span>
        <span className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
          La formation reste visible tant que le nettoyage n’est pas complet.
          {message && <span className="mt-1 block font-mono text-xs">{message}</span>}
        </span>
      </div>
      <Link href={`/formations/${id}/delete`} className="shrink-0">
        <Button size="sm" className="h-8">
          <RotateCw className="size-[15px]" aria-hidden />
          Relancer le nettoyage
        </Button>
      </Link>
    </div>
  );
}

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

  const group = formation.infra_group_id ? await loadInfraRow(formation.infra_group_id) : null;

  const { data: vmRows } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", id)
    .order("vmid");

  const vms = (vmRows ?? []) as FormationVm[];
  const vmCount = formation.vm_end_id - formation.vm_start_id + 1;
  const ready = vms.filter((vm) => vm.status === "ready").length;
  const failed = vms.filter((vm) => vm.status === "failed").length;
  const status = formation.status as FormationStatus;
  const pdfReady = status === "deployed" || status === "failed";

  return (
    <div className="space-y-6">
      <ConsoleHead
        back={{ href: "/formations", label: "Formations" }}
        eyebrow={[formation.os_id ?? "OS non déduit", formation.template_name].filter(Boolean).join(" · ")}
        title={formation.name}
        status={
          <StatusPill status={status} detail={status === "deploying" ? `${ready}/${vmCount}` : undefined} />
        }
        subtitle={
          formation.error_message && status !== "cleanup_failed" ? (
            <span className="font-mono text-xs text-destructive">{formation.error_message}</span>
          ) : undefined
        }
        actions={
          <>
            {status === "draft" && (
              <Link href={`/formations/${id}/deploy`}>
                <Button>
                  <Play className="size-4" aria-hidden />
                  Déployer
                </Button>
              </Link>
            )}
            {status === "deploying" && (
              <Link href={`/formations/${id}/deploy`}>
                <Button variant="outline">
                  <SquareTerminal className="size-4" aria-hidden />
                  Suivre le déploiement
                </Button>
              </Link>
            )}
            {pdfReady ? (
              <a href={`/api/formations/${id}/pdf`}>
                <Button variant="outline">
                  <Download className="size-4" aria-hidden />
                  PDF des identifiants
                </Button>
              </a>
            ) : (
              <Button variant="outline" disabled title="Disponible quand toutes les VMs sont prêtes">
                <Download className="size-4" aria-hidden />
                PDF des identifiants
              </Button>
            )}
            {status !== "deleting" && (
              <Link href={`/formations/${id}/delete`} aria-label="Supprimer la formation">
                <Button variant="destructive-outline" size="icon" tabIndex={-1}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </Link>
            )}
          </>
        }
      />

      {status === "cleanup_failed" && <CleanupBanner id={id} message={formation.error_message} />}

      <ReadoutStrip
        className="lg:grid-cols-[1.2fr_1fr_1fr_1.1fr_1.1fr]"
        readouts={[
          {
            label: "Machines prêtes",
            tone: "success",
            value: (
              <span className="flex items-baseline gap-1.5">
                {ready}
                <span className="text-[0.9375rem] font-normal text-muted-foreground">/ {vmCount}</span>
              </span>
            ),
            footer: <ReadyBar ready={ready} failed={failed} total={vmCount} />,
          },
          {
            label: "Plage VMID",
            mono: true,
            value: `${formation.vm_start_id}–${formation.vm_end_id}`,
          },
          {
            label: "CPU par VM",
            value: (
              <span className="flex items-baseline gap-2">
                {formation.cpu_cores}
                <span className="font-mono text-[0.8125rem] font-normal text-muted-foreground">
                  cores · {formatRam(formation.ram_mb)}
                </span>
              </span>
            ),
          },
          {
            label: "Template",
            mono: true,
            value: formation.template_name ?? String(formation.template_vmid),
            sub: formation.golden_vmid
              ? `VMID ${formation.template_vmid} · image dorée ${formation.golden_vmid}`
              : `VMID ${formation.template_vmid}`,
          },
          {
            label: "Infrastructure",
            value: (
              <span className="block truncate text-[0.9375rem] leading-tight font-medium">
                {group?.name ?? "aucune"}
              </span>
            ),
            tone: group ? undefined : "warning",
            sub: group ? group.proxmox_node : "rattacher un groupe avant tout déploiement",
          },
        ]}
      />

      {vms.length > 0 && <AccessTable vms={vms} />}

      <DeploymentTrace formationId={id} />

      {vms.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[1.0625rem] leading-6 font-semibold">Ressources externes</h2>
          <ReadoutStrip
            readouts={[
              {
                label: "Clones Proxmox",
                value: vms.filter((v) => v.mac_address).length,
                sub: `template ${formation.template_vmid}`,
              },
              {
                label: "Connexions Guacamole",
                value: vms.filter((v) => v.guac_connection_id).length,
                sub: formation.guac_user_group ?? "groupe non créé",
              },
              {
                label: "Comptes stagiaires",
                value: vms.filter((v) => v.guac_username).length,
                sub: "un par machine",
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useDeploymentProgress, type StepColumn, type VmProgress } from "@/lib/hooks/use-deployment-progress";
import { TrackBoard, toneOf, formatClock, vmDuration, type VmTone } from "./track-board";
import { StatusMark, type Tone } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { ArrowRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const LEGEND: { tone: VmTone; mark: Tone; bar: string; label: string }[] = [
  { tone: "success", mark: "success", bar: "bg-success", label: "prêtes" },
  { tone: "failed", mark: "destructive", bar: "bg-destructive", label: "échec" },
  { tone: "running", mark: "running", bar: "bg-running motion-safe:animate-shimmer-soft", label: "en cours" },
  { tone: "idle", mark: "muted", bar: "bg-line-strong", label: "en attente" },
  { tone: "stopped", mark: "muted", bar: "bg-line-strong", label: "interrompues" },
];

function countTones(vms: readonly VmProgress[], columns: readonly StepColumn[]) {
  const counts: Record<VmTone, number> = { idle: 0, running: 0, success: 0, failed: 0, stopped: 0 };
  for (const vm of vms) counts[toneOf(vm, columns)] += 1;
  return counts;
}

function StageHeader({ title, state }: { title: string; state: { label: string; className: string } }) {
  return (
    <span className="eyebrow flex justify-between gap-3">
      <span>{title}</span>
      <span className={state.className}>{state.label}</span>
    </span>
  );
}

function GoldenStage({ golden, columns }: { golden: VmProgress; columns: readonly StepColumn[] }) {
  const tone = toneOf(golden, columns);
  const state =
    tone === "success"
      ? { label: `Terminée · ${vmDuration(golden)}`, className: "text-success" }
      : tone === "failed"
        ? { label: "Échec", className: "text-destructive" }
        : tone === "running"
          ? { label: "En cours", className: "text-running" }
          : { label: "En attente", className: "" };

  return (
    <div className="flex flex-col gap-2.5">
      <StageHeader title="1 · Image dorée" state={state} />
      <div className="flex flex-wrap gap-1.5 text-[0.78125rem] font-medium">
        {columns.map((c) => {
          const status = golden.steps.get(c.step)?.status ?? "pending";
          return (
            <span
              key={c.step}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 py-2 whitespace-nowrap",
                status === "success" && "bg-success/10",
                status === "failed" && "bg-destructive/10 text-destructive",
                status === "running" && "bg-running/10 text-running",
                (status === "pending" || status === "skipped") && "bg-muted text-muted-foreground"
              )}
              title={c.label}
            >
              {status === "success" && <span className="text-success">✓</span>}
              {status === "failed" && <span>✕</span>}
              <span className="truncate">{c.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ClonesStage({
  vms,
  columns,
  index,
}: {
  vms: readonly VmProgress[];
  columns: readonly StepColumn[];
  index: number;
}) {
  const counts = countTones(vms, columns);
  const state =
    counts.running + counts.idle > 0
      ? { label: "En cours", className: "text-running" }
      : counts.failed > 0
        ? { label: "Terminé avec erreurs", className: "text-destructive" }
        : { label: "Terminé", className: "text-success" };

  return (
    <div className="flex flex-col gap-2.5">
      <StageHeader title={`${index} · Clones liés × ${vms.length}`} state={state} />
      <div className="flex flex-wrap gap-1.5 text-[0.78125rem] font-medium">
        {columns.map((c) => {
          const done = vms.filter((vm) => vm.steps.get(c.step)?.status === "success").length;
          return (
            <span
              key={c.step}
              className="flex min-w-0 flex-1 justify-between gap-2 rounded-md bg-muted px-2.5 py-2 whitespace-nowrap"
              title={c.label}
            >
              <span className="truncate">{c.label}</span>
              <span className="font-mono text-muted-foreground">
                {done}/{vms.length}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Début du premier pas et fin du dernier, toutes machines confondues (image dorée comprise).
function timeSpan(vms: readonly VmProgress[], golden: VmProgress | null) {
  const all = [...vms, ...(golden ? [golden] : [])].flatMap((vm) => [...vm.steps.values()]);
  const times = (pick: (s: (typeof all)[number]) => string | null) =>
    all.map((s) => Date.parse(pick(s) ?? "")).filter(Number.isFinite);
  const starts = times((s) => s.started_at);
  const ends = times((s) => s.finished_at);
  return {
    start: starts.length > 0 ? Math.min(...starts) : null,
    end: ends.length > 0 ? Math.max(...ends) : null,
  };
}

export function DeployProgress({ formationId }: { formationId: string }) {
  const triggered = useRef(false);
  const { vms, columns, golden, goldenColumns, isComplete, formationStatus, failedVmids, progress } =
    useDeploymentProgress(formationId);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    void fetch(`/api/formations/${formationId}/deploy`, { method: "POST" });
  }, [formationId]);

  const failed = formationStatus === "failed";
  const percent = Math.round(progress);
  const counts = countTones(vms, columns);
  const { start, end } = timeSpan(vms, golden);

  return (
    <div className="space-y-5">
      {start !== null && (
        <p className="font-mono text-[0.78125rem] text-muted-foreground">
          Démarré à{" "}
          {new Date(start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          {isComplete && end !== null && ` · durée ${formatClock(end - start)}`}
        </p>
      )}

      <section className="panel flex flex-col gap-[18px] bg-card px-5 py-[18px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <span
            className={cn(
              "numeral text-[2.125rem]",
              isComplete && !failed && "text-success",
              failed && "text-destructive"
            )}
          >
            {percent}
            <span className="text-lg text-muted-foreground"> %</span>
          </span>
          <div className="flex flex-1 flex-col gap-2">
            <div
              className="flex h-2 gap-0.5 overflow-hidden rounded-[3px] bg-line-strong"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progression du déploiement"
            >
              {vms.length === 0 ? (
                <span className="bg-running transition-[width] duration-500" style={{ width: `${progress}%` }} />
              ) : (
                LEGEND.filter((l) => counts[l.tone] > 0).map((l) => (
                  <span key={l.tone} className={l.bar} style={{ flex: counts[l.tone] }} />
                ))
              )}
            </div>
            {vms.length > 0 && (
              <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 font-mono text-micro font-medium tracking-[0.07em] text-muted-foreground uppercase">
                {LEGEND.filter((l) => counts[l.tone] > 0).map((l) => (
                  <span key={l.tone} className="flex items-center gap-1.5">
                    <StatusMark tone={l.mark} className="motion-safe:animate-none" />
                    {counts[l.tone]} {l.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {(golden || columns.length > 0) && (
          <div
            className={cn(
              "grid gap-5 border-t border-line pt-4",
              golden && columns.length > 0 && "lg:grid-cols-[4fr_5fr]"
            )}
          >
            {golden && <GoldenStage golden={golden} columns={goldenColumns} />}
            {columns.length > 0 && <ClonesStage vms={vms} columns={columns} index={golden ? 2 : 1} />}
          </div>
        )}

        {isComplete && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
            <p className="text-sm text-muted-foreground">
              {failed
                ? `${failedVmids.length} machine${failedVmids.length > 1 ? "s" : ""} n'a pas abouti. ` +
                  "Sa trace indique l'étape fautive et sa sortie."
                : "Le PDF des identifiants est prêt."}
            </p>
            <div className="flex shrink-0 gap-2">
              <a href={`/api/formations/${formationId}/pdf`}>
                <Button variant="outline" size="sm" className="h-8">
                  <Download className="size-[15px]" aria-hidden />
                  PDF des identifiants
                </Button>
              </a>
              <Link href={`/formations/${formationId}`}>
                <Button size="sm" className="h-8">
                  Voir la formation
                  <ArrowRight className="size-[15px]" aria-hidden />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </section>

      {vms.length > 0 || golden ? (
        <TrackBoard vms={vms} columns={columns} golden={golden} goldenColumns={goldenColumns} />
      ) : (
        <section className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-sm text-muted-foreground">En attente de la prise en charge du déploiement.</p>
        </section>
      )}
    </div>
  );
}

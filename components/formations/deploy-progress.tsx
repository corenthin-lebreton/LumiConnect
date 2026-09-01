"use client";

import { useEffect, useRef, useState } from "react";
import { useDeploymentProgress } from "@/lib/hooks/use-deployment-progress";
import { PipelineLegend, VmTrackList } from "@/components/formations/vm-track";
import { FleetGrid, FleetSummary } from "@/components/formations/fleet-grid";
import { Button } from "@/components/ui/button";
import { Download, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

function phaseLabel(isComplete: boolean, failed: boolean): string {
  if (!isComplete) return "Provisionnement";
  return failed ? "Terminé avec erreurs" : "Déploiement terminé";
}

function barTone(isComplete: boolean, failed: boolean): string {
  if (failed) return "bg-destructive";
  if (isComplete) return "bg-success";
  return "bg-running progress-shimmer";
}

export function DeployProgress({ formationId }: { formationId: string }) {
  const triggered = useRef(false);
  const [focused, setFocused] = useState<number | null>(null);
  const { vms, columns, isComplete, formationStatus, failedVmids, progress } =
    useDeploymentProgress(formationId);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    void fetch(`/api/formations/${formationId}/deploy`, { method: "POST" });
  }, [formationId]);

  const failed = formationStatus === "failed";
  const percent = Math.round(progress);

  return (
    <div className="space-y-7">
      <section className="panel overflow-hidden bg-card">
        <div className="flex flex-wrap items-end justify-between gap-6 p-5">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "numeral text-5xl md:text-6xl",
                isComplete && !failed && "text-success",
                failed && "text-destructive"
              )}
            >
              {percent}
            </span>
            <div className="space-y-1">
              <span className="numeral text-xl text-muted-foreground">%</span>
              <p className="eyebrow">{phaseLabel(isComplete, failed)}</p>
            </div>
          </div>

          {vms.length > 0 && <FleetSummary vms={vms} columns={columns} />}
        </div>

        <div
          className="h-1.5 overflow-hidden border-t border-line bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du déploiement"
        >
          <div
            className={cn("h-full transition-[width] duration-500 ease-out", barTone(isComplete, failed))}
            style={{ width: `${progress}%` }}
          />
        </div>

        {isComplete && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-3.5">
            <p className="text-sm text-muted-foreground">
              {failed
                ? `${failedVmids.length} machine${failedVmids.length > 1 ? "s" : ""} n'a pas abouti. Ouvrir sa ligne pour voir l'étape fautive et sa sortie.`
                : "Le PDF d'identifiants est prêt."}
            </p>
            <div className="flex gap-2 shrink-0">
              <a href={`/api/formations/${formationId}/pdf`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Télécharger le PDF
                </Button>
              </a>
              <a href={`/formations/${formationId}`}>
                <Button size="sm" className="gap-1.5">
                  Voir la formation
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </a>
            </div>
          </div>
        )}
      </section>

      {vms.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="display text-base">Flotte ({vms.length} machines)</h2>
            <p className="text-micro text-muted-foreground">
              Cliquer une tuile pour la retrouver ci-dessous
            </p>
          </div>
          <FleetGrid vms={vms} columns={columns} selected={focused} onSelect={setFocused} />
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-sm text-muted-foreground">
            En attente de la prise en charge par le worker.
          </p>
        </section>
      )}

      {columns.length > 0 && (
        <section className="space-y-3">
          <h2 className="display text-base">Pipeline</h2>
          <PipelineLegend columns={columns} vms={vms} />
        </section>
      )}

      {vms.length > 0 && (
        <section className="space-y-3">
          <h2 className="display text-base">Détail par machine</h2>
          <VmTrackList
            vms={vms}
            columns={columns}
            emptyMessage="Aucune étape enregistrée."
            focusedVmid={focused}
          />
        </section>
      )}
    </div>
  );
}

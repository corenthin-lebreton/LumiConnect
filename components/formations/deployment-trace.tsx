"use client";

import { useDeploymentProgress } from "@/lib/hooks/use-deployment-progress";
import { PipelineLegend, VmTrackList } from "@/components/formations/vm-track";

export function DeploymentTrace({ formationId }: { formationId: string }) {
  const { vms, columns, golden, goldenColumns } = useDeploymentProgress(formationId);

  if (vms.length === 0 && !golden) return null;

  return (
    <div className="space-y-8">
      {golden && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="display text-base">Image dorée</h2>
            <p className="text-xs text-muted-foreground">
              Installée une fois, puis clonée pour chaque machine.
            </p>
          </div>
          {goldenColumns.length > 0 && <PipelineLegend columns={goldenColumns} vms={[golden]} />}
          <VmTrackList
            vms={[golden]}
            columns={goldenColumns}
            emptyMessage="Aucune étape enregistrée."
            rowLabel={() => `Image dorée, VMID ${golden.vmid}`}
          />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-base">{golden ? "Machines" : "Déroulé du déploiement"}</h2>
          <p className="text-xs text-muted-foreground">
            Ouvrir une ligne pour le détail et la sortie des scripts.
          </p>
        </div>

        {columns.length > 0 && <PipelineLegend columns={columns} vms={vms} />}

        <VmTrackList vms={vms} columns={columns} emptyMessage="Aucune étape enregistrée." />
      </section>
    </div>
  );
}

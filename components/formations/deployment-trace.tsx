"use client";

import { useDeploymentProgress } from "@/lib/hooks/use-deployment-progress";
import { PipelineLegend, VmTrackList } from "@/components/formations/vm-track";

export function DeploymentTrace({ formationId }: { formationId: string }) {
  const { vms, columns } = useDeploymentProgress(formationId);

  if (vms.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-base">Déroulé du déploiement</h2>
        <p className="text-xs text-muted-foreground">
          Ouvrir une ligne pour le détail et la sortie des scripts.
        </p>
      </div>

      {columns.length > 0 && <PipelineLegend columns={columns} vms={vms} />}

      <VmTrackList vms={vms} columns={columns} emptyMessage="Aucune étape enregistrée." />
    </section>
  );
}

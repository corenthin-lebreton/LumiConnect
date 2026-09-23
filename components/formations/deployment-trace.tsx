"use client";

import { useDeploymentProgress } from "@/lib/hooks/use-deployment-progress";
import { TrackBoard } from "./track-board";

export function DeploymentTrace({ formationId }: { formationId: string }) {
  const { vms, columns, golden, goldenColumns } = useDeploymentProgress(formationId);

  if (vms.length === 0 && !golden) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[1.0625rem] leading-6 font-semibold">Déroulé du déploiement</h2>
        <p className="text-[0.8125rem] text-muted-foreground">
          Choisir une machine pour voir ses étapes et la sortie des scripts.
        </p>
      </div>
      <TrackBoard vms={vms} columns={columns} golden={golden} goldenColumns={goldenColumns} />
    </section>
  );
}

import { Pill, type Tone } from "@/components/ui/pill";
import type { FormationStatus, VmStatus } from "@/types";

export const formationStatus: Record<FormationStatus, { tone: Tone; label: string }> = {
  draft: { tone: "muted", label: "Brouillon" },
  deploying: { tone: "running", label: "Déploiement" },
  deployed: { tone: "success", label: "Déployée" },
  failed: { tone: "destructive", label: "Échec" },
  deleting: { tone: "running", label: "Suppression" },
  cleanup_failed: { tone: "warning", label: "Nettoyage échoué" },
};

export const vmStatus: Record<VmStatus, { tone: Tone; label: string }> = {
  pending: { tone: "muted", label: "En attente" },
  cloning: { tone: "running", label: "Clone" },
  configuring: { tone: "running", label: "Configuration" },
  ready: { tone: "success", label: "Prête" },
  failed: { tone: "destructive", label: "Échec" },
};

export function StatusPill({ status, detail }: { status: FormationStatus; detail?: string }) {
  const s = formationStatus[status] ?? formationStatus.draft;
  return (
    <Pill tone={s.tone}>
      {s.label}
      {detail && ` ${detail}`}
    </Pill>
  );
}

export function VmStatusPill({ status }: { status: VmStatus }) {
  const s = vmStatus[status] ?? vmStatus.pending;
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

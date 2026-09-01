import { cn } from "@/lib/utils";
import type { FormationStatus } from "@/types";

const styles: Record<FormationStatus, { dot: string; text: string; label: string }> = {
  draft: { dot: "bg-muted", text: "text-muted-foreground", label: "Brouillon" },
  deploying: { dot: "bg-running motion-safe:animate-pulse", text: "text-running", label: "Déploiement" },
  deployed: { dot: "bg-success", text: "text-success", label: "Déployée" },
  failed: { dot: "bg-destructive", text: "text-destructive", label: "Échec" },
  deleting: { dot: "bg-running motion-safe:animate-pulse", text: "text-running", label: "Suppression" },
  cleanup_failed: { dot: "bg-warning", text: "text-warning", label: "Nettoyage échoué" },
};

export function StatusPill({ status }: { status: FormationStatus }) {
  const s = styles[status] ?? styles.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-current/25 px-1.5 py-0.5",
        s.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} aria-hidden />
      <span className="whitespace-nowrap font-mono text-micro font-medium uppercase tracking-[0.06em]">
        {s.label}
      </span>
    </span>
  );
}

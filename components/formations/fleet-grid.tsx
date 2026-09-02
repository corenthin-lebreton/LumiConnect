"use client";

import { cn } from "@/lib/utils";
import type { StepColumn, VmProgress } from "@/lib/hooks/use-deployment-progress";

interface Props {
  vms: readonly VmProgress[];
  columns: readonly StepColumn[];
  selected?: number | null;
  onSelect?: (vmid: number) => void;
}

type Tone = "idle" | "running" | "success" | "failed" | "stopped";

function toneOf(vm: VmProgress, columns: readonly StepColumn[]): Tone {
  const steps = columns.map((column) => vm.steps.get(column.step)?.status);
  if (steps.some((s) => s === "failed")) return "failed";
  if (steps.some((s) => s === "running")) return "running";
  if (columns.length > 0 && steps.every((s) => s === "success")) return "success";
  if (steps.some((s) => s === "skipped")) return "stopped";
  return "idle";
}

const toneStyles: Record<Tone, { tile: string; bar: string; label: string }> = {
  idle: {
    tile: "border-line bg-card text-muted-foreground",
    bar: "bg-muted-foreground/40",
    label: "text-muted-foreground",
  },
  running: {
    tile: "border-running/45 bg-running/10 text-running",
    bar: "bg-running",
    label: "text-running",
  },
  success: {
    tile: "border-success/45 bg-success/10 text-success",
    bar: "bg-success",
    label: "text-success",
  },
  failed: {
    tile: "border-destructive/55 bg-destructive/12 text-destructive",
    bar: "bg-destructive",
    label: "text-destructive",
  },
  stopped: {
    tile: "border-line bg-muted text-muted-foreground",
    bar: "bg-muted-foreground/40",
    label: "text-muted-foreground",
  },
};

const summaryTone: Record<Tone, string> = {
  idle: "text-muted-foreground",
  running: "text-running",
  success: "text-success",
  failed: "text-destructive",
  stopped: "text-muted-foreground",
};

const toneWord: Record<Tone, string> = {
  idle: "en attente",
  running: "en cours",
  success: "prête",
  failed: "en échec",
  stopped: "interrompue",
};

export function FleetGrid({ vms, columns, selected, onSelect }: Props) {
  if (vms.length === 0) return null;

  const total = columns.length || 1;

  return (
    <ul
      className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(5rem,1fr))]"
      aria-label={`Flotte de ${vms.length} machines`}
    >
      {vms.map((vm) => {
        const tone = toneOf(vm, columns);
        const styles = toneStyles[tone];
        const done = columns.filter(
          (column) => vm.steps.get(column.step)?.status === "success"
        ).length;
        const isSelected = selected === vm.vmid;

        const current = columns.find(
          (column) => vm.steps.get(column.step)?.status === "running"
        );
        const broken = columns.find(
          (column) => vm.steps.get(column.step)?.status === "failed"
        );
        const detail = broken?.label ?? current?.label ?? toneWord[tone];

        return (
          <li key={vm.vmid}>
            <button
              type="button"
              onClick={() => onSelect?.(vm.vmid)}
              title={`VM ${vm.vmid}, ${detail} (${done}/${total})`}
              aria-pressed={isSelected}
              className={cn(
                "group w-full rounded-md border p-2 text-left outline-none",
                "transition-[background-color,border-color,color,box-shadow] duration-200 ease-out",
                "focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                styles.tile,
                isSelected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                onSelect && "press cursor-pointer"
              )}
            >
              <span className="numeral block text-base leading-none">{vm.vmid}</span>

              <span
                className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-foreground/12"
                aria-hidden
              >
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-500 ease-out",
                    styles.bar,
                    tone === "running" && "motion-safe:animate-pulse"
                  )}
                  style={{ width: `${Math.round((done / total) * 100)}%` }}
                />
              </span>

              <span
                className={cn(
                  "mt-1.5 block font-mono text-micro tabular leading-none",
                  styles.label
                )}
              >
                {done}/{total}
              </span>

              <span className="sr-only">
                {`${detail}, ${done} étapes sur ${total}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FleetSummary({
  vms,
  columns,
}: {
  vms: readonly VmProgress[];
  columns: readonly StepColumn[];
}) {
  const counts = vms.reduce<Record<Tone, number>>(
    (acc, vm) => {
      acc[toneOf(vm, columns)] += 1;
      return acc;
    },
    { idle: 0, running: 0, success: 0, failed: 0, stopped: 0 }
  );

  const entries: [Tone, string][] = [
    ["success", "prêtes"],
    ["running", "en cours"],
    ["failed", "en échec"],
    ["idle", "en attente"],
    ["stopped", "interrompues"],
  ];

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {entries
        .filter(([tone]) => counts[tone] > 0)
        .map(([tone, label]) => (
          <div key={tone} className="flex items-baseline gap-2">
            <dd className={cn("numeral text-xl", summaryTone[tone])}>{counts[tone]}</dd>
            <dt className="eyebrow">{label}</dt>
          </div>
        ))}
    </dl>
  );
}

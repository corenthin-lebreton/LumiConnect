"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Check, X, Minus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepStatus, VmStep } from "@/types";
import type { StepColumn, VmProgress } from "@/lib/hooks/use-deployment-progress";

const segmentTone: Record<StepStatus, string> = {
  pending: "bg-foreground/10",
  running: "bg-running motion-safe:animate-pulse",
  success: "bg-success",
  failed: "bg-destructive",
  skipped: "bg-muted-foreground/35",
};

const statusIcon: Record<StepStatus, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />,
  running: <span className="h-1.5 w-1.5 rounded-full bg-running motion-safe:animate-pulse" aria-hidden />,
  success: <Check className="h-3.5 w-3.5 text-success [stroke-width:2.25]" aria-hidden />,
  failed: <X className="h-3.5 w-3.5 text-destructive [stroke-width:2.25]" aria-hidden />,
  skipped: <Minus className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />,
};

type SummaryTone = "failed" | "running" | "success" | "muted";

const summaryTone: Record<SummaryTone, string> = {
  failed: "text-destructive",
  running: "text-running",
  success: "text-success",
  muted: "text-muted-foreground",
};

const statusWord: Record<StepStatus, string> = {
  pending: "en attente",
  running: "en cours",
  success: "terminée",
  failed: "en échec",
  skipped: "ignorée",
};

function duration(step: VmStep): string | null {
  if (!step.started_at || !step.finished_at) return null;
  const ms = Date.parse(step.finished_at) - Date.parse(step.started_at);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")}`;
}

function summarize(vm: VmProgress, columns: readonly StepColumn[]) {
  const steps = columns.map((column) => vm.steps.get(column.step));
  const failed = steps.find((step) => step?.status === "failed");
  if (failed) return { tone: "failed" as const, text: `échec, ${failed.label}` };

  const running = steps.find((step) => step?.status === "running");
  if (running) return { tone: "running" as const, text: `en cours, ${running.label}` };

  const done = steps.filter((step) => step?.status === "success").length;
  if (done === columns.length && columns.length > 0) {
    return { tone: "success" as const, text: "prête" };
  }
  if (steps.some((step) => step?.status === "skipped")) {
    return { tone: "muted" as const, text: "interrompue" };
  }
  return { tone: "muted" as const, text: "en attente" };
}

function Output({ label, content }: { label: string; content: string }) {
  return (
    <div className="mt-2">
      <p className="eyebrow mb-1">{label}</p>
      <pre
        className={
          "max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line " +
          "bg-muted p-3 font-mono text-meta leading-relaxed"
        }
      >
        {content}
      </pre>
    </div>
  );
}

type RowLabel = (vm: VmProgress, index: number) => string;

const defaultRowLabel: RowLabel = (vm, index) => `Itération ${index + 1}, VMID ${vm.vmid}`;

function VmRow({
  vm,
  columns,
  index,
  defaultOpen = false,
  focused = false,
  rowLabel = defaultRowLabel,
}: {
  vm: VmProgress;
  columns: readonly StepColumn[];
  index: number;
  defaultOpen?: boolean;
  focused?: boolean;
  rowLabel?: RowLabel;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const rowRef = useRef<HTMLDivElement>(null);

  const open = expanded || focused;

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const summary = summarize(vm, columns);
  const done = columns.filter((c) => vm.steps.get(c.step)?.status === "success").length;

  return (
    <div ref={rowRef} className={cn("transition-colors duration-150", focused && "bg-accent")}>
      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors duration-150",
          "hover:bg-muted focus-visible:outline focus-visible:outline-2",
          "focus-visible:outline-ring focus-visible:-outline-offset-2"
        )}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out",
            open && "rotate-90"
          )}
          aria-hidden
        />

        <span className="font-mono tabular text-sm font-medium w-14 shrink-0">{vm.vmid}</span>

        <span
          className="flex-1 flex gap-0.5 min-w-24"
          role="img"
          aria-label={`${done} étapes terminées sur ${columns.length}, ${summary.text}`}
        >
          {columns.map((column) => {
            const status = vm.steps.get(column.step)?.status ?? "pending";
            return (
              <span
                key={column.step}
                title={`${column.label}, ${statusWord[status]}`}
                className={cn("h-1.5 flex-1 rounded-full", segmentTone[status])}
              />
            );
          })}
        </span>

        <span className={cn("w-44 shrink-0 truncate text-right text-xs", summaryTone[summary.tone])}>
          {summary.text}
        </span>

        <span className="font-mono tabular text-meta text-muted-foreground w-12 shrink-0 text-right">
          {done}/{columns.length}
        </span>
      </button>

      {open && (
        <div className="border-t border-line bg-muted px-4 pb-4 pl-[4.25rem]">
          <ol className="divide-y divide-line">
            {columns.map((column, position) => {
              const step = vm.steps.get(column.step);
              const status = step?.status ?? "pending";
              const elapsed = step ? duration(step) : null;
              const exitCode = step?.exit_code ?? null;

              return (
                <li key={column.step} className="py-2.5">
                  <div className="flex items-baseline gap-3">
                    <span className="w-4 shrink-0 flex justify-center self-center">
                      {statusIcon[status]}
                    </span>
                    <span className="font-mono text-micro text-muted-foreground tabular w-5 shrink-0">
                      {String(position + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm flex-1 min-w-0 truncate">{column.label}</span>
                    {exitCode !== null && (
                      <span className="font-mono text-meta text-muted-foreground tabular">
                        exit {exitCode}
                      </span>
                    )}
                    {elapsed && (
                      <span className="font-mono text-meta text-muted-foreground tabular w-16 text-right">
                        {elapsed}
                      </span>
                    )}
                  </div>

                  {step?.message && (
                    <p className="text-xs text-destructive mt-1.5 ml-12 leading-relaxed break-words">
                      {step.message}
                    </p>
                  )}
                  <div className="ml-12">
                    {step?.stdout && <Output label="Sortie" content={step.stdout} />}
                    {step?.stderr && <Output label="Erreurs" content={step.stderr} />}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 font-mono text-micro text-muted-foreground">{rowLabel(vm, index)}</p>
        </div>
      )}
    </div>
  );
}

export function VmTrackList({
  vms,
  columns,
  emptyMessage,
  focusedVmid = null,
  rowLabel,
}: {
  vms: readonly VmProgress[];
  columns: readonly StepColumn[];
  emptyMessage: string;
  focusedVmid?: number | null;
  rowLabel?: RowLabel;
}) {
  if (vms.length === 0) {
    return (
      <div className="panel bg-card">
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const firstFailed = vms.find((vm) =>
    columns.some((column) => vm.steps.get(column.step)?.status === "failed")
  );

  return (
    <div className="panel overflow-hidden bg-card">
      <div className="flex items-center gap-4 border-b border-line bg-muted px-4 py-2">
        <span className="w-3.5 shrink-0" aria-hidden />
        <span className="eyebrow w-14 shrink-0">VMID</span>
        <span className="eyebrow flex-1">Pipeline</span>
        <span className="eyebrow w-44 shrink-0 text-right">État</span>
        <span className="eyebrow w-12 shrink-0 text-right">Fait</span>
      </div>
      <div className="divide-y divide-line">
        {vms.map((vm, index) => (
          <VmRow
            key={vm.vmid}
            vm={vm}
            columns={columns}
            index={index}
            defaultOpen={vm.vmid === firstFailed?.vmid}
            focused={vm.vmid === focusedVmid}
            rowLabel={rowLabel}
          />
        ))}
      </div>
    </div>
  );
}

export function PipelineLegend({
  columns,
  vms,
}: {
  columns: readonly StepColumn[];
  vms: readonly VmProgress[];
}) {
  return (
    <ol className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs leading-relaxed">
      {columns.map((column, index) => {
        const reached = vms.some((vm) => {
          const status = vm.steps.get(column.step)?.status;
          return status === "success" || status === "running";
        });

        return (
          <li key={column.step} className="flex items-baseline gap-1.5">
            <span className="font-mono text-micro text-muted-foreground tabular">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className={reached ? "text-foreground" : "text-muted-foreground"}>
              {column.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

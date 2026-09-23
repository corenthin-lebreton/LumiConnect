"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill, type Tone } from "@/components/ui/pill";
import type { StepStatus, VmStep } from "@/types";
import type { StepColumn, VmProgress } from "@/lib/hooks/use-deployment-progress";

export type VmTone = "idle" | "running" | "success" | "failed" | "stopped";

export function toneOf(vm: VmProgress, columns: readonly StepColumn[]): VmTone {
  const steps = columns.map((column) => vm.steps.get(column.step)?.status);
  if (steps.some((s) => s === "failed")) return "failed";
  if (steps.some((s) => s === "running")) return "running";
  if (columns.length > 0 && steps.every((s) => s === "success")) return "success";
  if (steps.some((s) => s === "skipped")) return "stopped";
  return "idle";
}

const segmentTone: Record<StepStatus, string> = {
  pending: "bg-line-strong",
  running: "bg-running motion-safe:animate-shimmer-soft",
  success: "bg-success",
  failed: "bg-destructive",
  skipped: "bg-[repeating-linear-gradient(135deg,var(--line-strong)_0_3px,transparent_3px_6px)]",
};

const statusWord: Record<StepStatus, string> = {
  pending: "en attente",
  running: "en cours",
  success: "terminée",
  failed: "en échec",
  skipped: "ignorée",
};

const mark: Record<StepStatus, { glyph: string; className: string }> = {
  success: { glyph: "✓", className: "bg-success/14 text-success" },
  failed: { glyph: "✕", className: "bg-destructive/14 text-destructive" },
  running: { glyph: "•", className: "bg-running/14 text-running motion-safe:animate-shimmer-soft" },
  pending: { glyph: "", className: "bg-muted text-muted-foreground" },
  skipped: { glyph: "–", className: "bg-muted text-muted-foreground" },
};

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function stepDuration(step: VmStep | undefined): string | null {
  if (!step?.started_at || !step.finished_at) return null;
  const ms = Date.parse(step.finished_at) - Date.parse(step.started_at);
  return Number.isFinite(ms) && ms >= 0 ? formatClock(ms) : null;
}

export function vmDuration(vm: VmProgress): string {
  const steps = [...vm.steps.values()];
  const starts = steps.map((s) => (s.started_at ? Date.parse(s.started_at) : NaN)).filter(Number.isFinite);
  const ends = steps.map((s) => (s.finished_at ? Date.parse(s.finished_at) : NaN)).filter(Number.isFinite);
  if (starts.length === 0 || ends.length === 0) return "-";
  return formatClock(Math.max(...ends) - Math.min(...starts));
}

function pillFor(vm: VmProgress, columns: readonly StepColumn[]): { tone: Tone; label: string } {
  const failed = columns.find((c) => vm.steps.get(c.step)?.status === "failed");
  if (failed) return { tone: "destructive", label: `Échec · ${failed.label}` };
  const running = columns.find((c) => vm.steps.get(c.step)?.status === "running");
  if (running) return { tone: "running", label: running.label };
  const tone = toneOf(vm, columns);
  if (tone === "success") return { tone: "success", label: "Prête" };
  if (tone === "stopped") return { tone: "muted", label: "Interrompue" };
  return { tone: "muted", label: "En attente" };
}

interface Track {
  key: string;
  vm: VmProgress;
  columns: readonly StepColumn[];
  name: string;
}

function LogBlock({ step }: { step: VmStep }) {
  const lines: { label: string; text: string; error?: boolean }[] = [];
  if (step.message) lines.push({ label: "message", text: step.message, error: step.status === "failed" });
  if (step.stdout) lines.push({ label: "stdout", text: step.stdout });
  if (step.stderr) lines.push({ label: "stderr", text: step.stderr, error: true });
  if (step.exit_code !== null) lines.push({ label: "exit", text: String(step.exit_code), error: step.exit_code !== 0 });

  if (lines.length === 0) {
    return <p className="px-3 py-2 font-mono text-xs text-muted-foreground">Aucune sortie enregistrée.</p>;
  }

  return (
    <>
      {lines.map((line) => (
        <div
          key={line.label}
          className={cn(
            "grid grid-cols-[62px_minmax(0,1fr)] gap-2 px-3 py-px",
            line.error && "bg-destructive/12 text-destructive shadow-[inset_2px_0_0_var(--destructive)]"
          )}
        >
          <span className="text-muted-foreground">{line.label}</span>
          <pre className="max-h-56 overflow-auto font-mono break-words whitespace-pre-wrap">{line.text}</pre>
        </div>
      ))}
    </>
  );
}

function TracePanel({ track }: { track: Track }) {
  const { vm, columns } = track;
  const firstFailed = columns.findIndex((c) => vm.steps.get(c.step)?.status === "failed");
  const [openStep, setOpenStep] = useState<string | null>(
    firstFailed >= 0 ? columns[firstFailed].step : null
  );
  const pill = pillFor(vm, columns);

  return (
    <div className="panel overflow-hidden bg-card">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex min-w-0 flex-col gap-[5px]">
          <span className="eyebrow">Trace · VM {vm.vmid}</span>
          <span className="truncate font-mono text-[0.9375rem] leading-none font-semibold">{track.name}</span>
        </span>
        <span className="flex-1" />
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      {columns.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune étape enregistrée.</p>
      ) : (
        <ol>
          {columns.map((column) => {
            const step = vm.steps.get(column.step);
            const status = step?.status ?? "pending";
            const open = openStep === column.step;
            const m = mark[status];
            return (
              <li
                key={column.step}
                className={cn("border-b border-line last:border-b-0", status === "failed" && "bg-destructive/7")}
              >
                <button
                  type="button"
                  onClick={() => setOpenStep(open ? null : column.step)}
                  aria-expanded={open}
                  disabled={!step}
                  className={cn(
                    "grid w-full grid-cols-[22px_minmax(0,1fr)_auto_16px] items-center gap-3 px-4 py-[11px] text-left",
                    "outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                  )}
                >
                  <span
                    className={cn("grid size-[22px] place-items-center rounded-[5px] font-mono text-xs font-semibold", m.className)}
                    aria-label={statusWord[status]}
                  >
                    {m.glyph}
                  </span>
                  <span className="text-[0.84375rem] leading-snug font-medium">{column.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{stepDuration(step) ?? ""}</span>
                  <ChevronRight
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform duration-150",
                      open && "rotate-90",
                      !step && "opacity-0"
                    )}
                    aria-hidden
                  />
                </button>
                {open && step && (
                  <div className="mr-4 mb-3.5 ml-[50px] overflow-hidden rounded-md border border-line-strong bg-surface py-1.5 font-mono text-xs leading-relaxed">
                    <LogBlock step={step} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function defaultSelection(tracks: Track[]): string | null {
  const failed = tracks.find((t) => toneOf(t.vm, t.columns) === "failed");
  const running = tracks.find((t) => toneOf(t.vm, t.columns) === "running");
  return (failed ?? running ?? tracks[0])?.key ?? null;
}

// Tableau des pistes (une ligne par VM, un segment par étape) et trace de la VM choisie.
export function TrackBoard({
  vms,
  columns,
  golden,
  goldenColumns,
}: {
  vms: readonly VmProgress[];
  columns: readonly StepColumn[];
  golden: VmProgress | null;
  goldenColumns: readonly StepColumn[];
}) {
  const tracks: Track[] = [
    ...(golden ? [{ key: "golden", vm: golden, columns: goldenColumns, name: "image dorée" }] : []),
    ...vms.map((vm, i) => ({ key: String(vm.vmid), vm, columns, name: `machine ${i + 1}` })),
  ];
  const [picked, setPicked] = useState<string | null>(null);
  const selectedKey = picked ?? defaultSelection(tracks);
  const selected = tracks.find((t) => t.key === selectedKey) ?? null;

  if (tracks.length === 0) return null;

  const segCols = Math.max(columns.length, 1);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="panel overflow-hidden bg-card">
        <div className="eyebrow grid h-[34px] grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-3 border-b border-line-strong bg-surface px-4">
          <span>VMID</span>
          <span
            className="hidden gap-[3px] text-[0.59375rem] tracking-[0.04em] sm:grid"
            style={{ gridTemplateColumns: `repeat(${segCols}, minmax(0, 1fr))` }}
          >
            {columns.map((c) => (
              <span key={c.step} className="truncate" title={c.label}>
                {c.label}
              </span>
            ))}
          </span>
          <span className="sm:hidden">Étapes</span>
          <span className="text-right">Durée</span>
        </div>
        <ul>
          {tracks.map((track) => {
            const isSelected = track.key === selectedKey;
            return (
              <li key={track.key} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => setPicked(track.key)}
                  aria-pressed={isSelected}
                  className={cn(
                    "grid h-[38px] w-full grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-3 px-4 text-left",
                    "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    isSelected ? "bg-accent" : "hover:bg-muted"
                  )}
                >
                  <span className="font-mono text-[0.78125rem] font-medium">
                    {track.key === "golden" ? "doré" : track.vm.vmid}
                  </span>
                  <span
                    className="grid gap-[3px]"
                    style={{ gridTemplateColumns: `repeat(${Math.max(track.columns.length, 1)}, minmax(0, 1fr))` }}
                    role="img"
                    aria-label={`VM ${track.vm.vmid}, ${pillFor(track.vm, track.columns).label}`}
                  >
                    {track.columns.map((column) => {
                      const status = track.vm.steps.get(column.step)?.status ?? "pending";
                      return (
                        <span
                          key={column.step}
                          title={`${column.label}, ${statusWord[status]}`}
                          className={cn("h-1.5 rounded-[2px]", segmentTone[status])}
                        />
                      );
                    })}
                  </span>
                  <span className="text-right font-mono text-xs text-muted-foreground tabular">
                    {vmDuration(track.vm)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selected && <TracePanel key={selected.key} track={selected} />}
    </div>
  );
}

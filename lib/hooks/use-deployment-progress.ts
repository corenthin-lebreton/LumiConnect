"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FormationStatus, VmStep } from "@/types";

export interface VmProgress {
  vmid: number;
  steps: Map<string, VmStep>;
  error?: string;
}

export interface StepColumn {
  step: string;
  label: string;
  position: number;
}

const TERMINAL: FormationStatus[] = ["deployed", "failed", "cleanup_failed"];

function buildColumns(steps: readonly VmStep[]): StepColumn[] {
  const seen = new Map<string, StepColumn>();
  for (const step of steps) {
    if (!seen.has(step.step)) {
      seen.set(step.step, { step: step.step, label: step.label, position: step.position });
    }
  }
  return [...seen.values()].sort((a, b) => a.position - b.position);
}

function groupByVm(steps: readonly VmStep[]): VmProgress[] {
  const byVmid = new Map<number, VmProgress>();
  for (const step of steps) {
    let entry = byVmid.get(step.vmid);
    if (!entry) {
      entry = { vmid: step.vmid, steps: new Map() };
      byVmid.set(step.vmid, entry);
    }
    entry.steps.set(step.step, step);
    if (step.status === "failed" && step.message) entry.error = step.message;
  }
  return [...byVmid.values()].sort((a, b) => a.vmid - b.vmid);
}

interface FormationRow {
  status: FormationStatus;
  golden_vmid: number | null;
}

export function useDeploymentProgress(formationId: string | null) {
  const [steps, setSteps] = useState<VmStep[]>([]);
  const [formationStatus, setFormationStatus] = useState<FormationStatus | null>(null);
  const [goldenVmid, setGoldenVmid] = useState<number | null>(null);

  const upsert = useCallback((incoming: VmStep) => {
    setSteps((previous) => {
      const index = previous.findIndex(
        (s) => s.vmid === incoming.vmid && s.step === incoming.step
      );
      if (index === -1) return [...previous, incoming];
      const next = [...previous];
      next[index] = incoming;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!formationId) return;

    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const [stepsResult, formationResult] = await Promise.all([
        supabase
          .from("vm_steps")
          .select("*")
          .eq("formation_id", formationId)
          .order("vmid")
          .order("position"),
        supabase.from("formations").select("status, golden_vmid").eq("id", formationId).single(),
      ]);

      if (cancelled) return;
      if (stepsResult.data) setSteps(stepsResult.data as VmStep[]);
      if (formationResult.data) {
        const row = formationResult.data as FormationRow;
        setFormationStatus(row.status);
        setGoldenVmid(row.golden_vmid);
      }
    })();

    const channel = supabase
      .channel(`formation:${formationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vm_steps",
          filter: `formation_id=eq.${formationId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          upsert(payload.new as VmStep);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "formations",
          filter: `id=eq.${formationId}`,
        },
        (payload) => {
          const row = payload.new as FormationRow;
          setFormationStatus(row.status);
          setGoldenVmid(row.golden_vmid ?? null);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [formationId, upsert]);

  // L'image dorée a son propre pipeline (clone complet, installation, arrêt, template) :
  // ses étapes ne doivent pas devenir des colonnes vides sur les pistes des VMs.
  const vmSteps = useMemo(
    () => (goldenVmid === null ? steps : steps.filter((s) => s.vmid !== goldenVmid)),
    [steps, goldenVmid]
  );
  const goldenSteps = useMemo(
    () => (goldenVmid === null ? [] : steps.filter((s) => s.vmid === goldenVmid)),
    [steps, goldenVmid]
  );

  const columns = useMemo(() => buildColumns(vmSteps), [vmSteps]);
  const vms = useMemo(() => groupByVm(vmSteps), [vmSteps]);
  const goldenColumns = useMemo(() => buildColumns(goldenSteps), [goldenSteps]);
  const golden = useMemo(() => groupByVm(goldenSteps)[0] ?? null, [goldenSteps]);

  const isComplete = formationStatus !== null && TERMINAL.includes(formationStatus);

  const failedVmids = useMemo(
    () => vms.filter((vm) => [...vm.steps.values()].some((s) => s.status === "failed")).map((vm) => vm.vmid),
    [vms]
  );

  const progress = useMemo(() => {
    if (steps.length === 0) return 0;
    const settled = steps.filter(
      (s) => s.status === "success" || s.status === "failed" || s.status === "skipped"
    ).length;
    return (settled / steps.length) * 100;
  }, [steps]);

  return { vms, columns, golden, goldenColumns, isComplete, formationStatus, failedVmids, progress };
}

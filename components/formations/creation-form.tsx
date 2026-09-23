"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { formationSchema, type FormationFormData } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Minus, Plus } from "lucide-react";
import { FieldError, FieldHint, FieldLabel } from "@/components/forms/field";
import { PanelTitle } from "@/components/layout/console-head";
import { TemplateCombobox } from "./template-combobox";
import { ScriptPicker } from "./script-picker";
import { InfraGroupSelect } from "./infra-group-select";
import type { InfraGroupSummary, ProxmoxTemplate } from "@/types";

type Form = UseFormReturn<FormationFormData>;

const DEFAULT_VALUES: FormationFormData = {
  name: "",
  template_vmid: 0,
  os_id: null,
  template_name: null,
  infra_group_id: "",
  script_ids: [],
  vm_start_id: 200,
  vm_end_id: 210,
  vm_username: "dev",
  vm_password: "Formation123",
  rdp_port: 3389,
  cpu_cores: 2,
  ram_mb: 4096,
};

const MAX_VMS = 40;

function useInfraGroups() {
  const [groups, setGroups] = useState<InfraGroupSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/infra-groups")
      .then((r) => r.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {
        setGroups([]);
        toast.error("Impossible de charger les groupes d'infrastructure");
      });
  }, []);

  return groups;
}

// Les templates sont rattachés au groupe qui les a chargés : changer de groupe vide la liste
// sans setState dans l'effet.
function useTemplates(groupId: string) {
  const [loaded, setLoaded] = useState<{ groupId: string; templates: ProxmoxTemplate[] }>({
    groupId: "",
    templates: [],
  });

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    fetch(`/api/proxmox/templates?group_id=${encodeURIComponent(groupId)}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok || !Array.isArray(data)) {
          setLoaded({ groupId, templates: [] });
          toast.error(
            typeof data?.error === "string"
              ? data.error
              : "Impossible de charger les templates Proxmox"
          );
          return;
        }
        setLoaded({ groupId, templates: data });
      })
      .catch(() => {
        if (!cancelled) toast.error("Impossible de charger les templates Proxmox");
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return loaded.groupId === groupId ? loaded.templates : [];
}

async function createFormation(data: FormationFormData): Promise<{ id: string } | null> {
  const res = await fetch("/api/formations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    toast.error(
      typeof body?.error === "string" ? body.error : "Échec de la création de la formation"
    );
    return null;
  }

  return res.json();
}

function formatRam(mb: number): string {
  const gb = mb / 1024;
  return Number.isInteger(gb) ? `${gb} Go` : `${gb.toFixed(1).replace(".", ",")} Go`;
}

function ResourceSlider({
  label,
  display,
  min,
  max,
  step,
  value,
  bounds,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  bounds: [string, string];
  onChange: (next: number | readonly number[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-[0.8125rem] font-medium tabular">{display}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={onChange} aria-label={label} />
      <div className="flex justify-between font-mono text-[0.6875rem] text-muted-foreground tabular">
        <span>{bounds[0]}</span>
        <span>{bounds[1]}</span>
      </div>
    </div>
  );
}

// Premier VMID et nombre de VMs : la plage (vm_start_id, vm_end_id) en découle.
function VmRangeFields({ form }: { form: Form }) {
  const errors = form.formState.errors;
  const start = form.watch("vm_start_id");
  const end = form.watch("vm_end_id");
  const count = Number.isFinite(start) && Number.isFinite(end) ? end - start + 1 : 1;

  function setCount(next: number) {
    const clamped = Math.min(MAX_VMS, Math.max(1, next));
    form.setValue("vm_end_id", (Number.isFinite(start) ? start : 0) + clamped - 1, {
      shouldValidate: true,
    });
  }

  const startField = form.register("vm_start_id", { valueAsNumber: true });

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="vm_start_id">Premier VMID</FieldLabel>
        <div className="relative">
          <Input
            id="vm_start_id"
            type="number"
            {...startField}
            onChange={(e) => {
              void startField.onChange(e);
              const next = e.target.valueAsNumber;
              if (Number.isFinite(next)) form.setValue("vm_end_id", next + Math.max(count, 1) - 1);
            }}
            className="pr-20 font-mono tabular"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[0.78125rem] text-muted-foreground">
            → {Number.isFinite(end) ? end : "?"}
          </span>
        </div>
        <FieldError message={errors.vm_start_id?.message ?? errors.vm_end_id?.message} className="" />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="vm_count">Nombre de VMs</FieldLabel>
        <div className="flex h-9 items-center overflow-hidden rounded-md border border-input bg-card">
          <button
            type="button"
            aria-label="Retirer une VM"
            onClick={() => setCount(count - 1)}
            className="grid h-full w-9 place-items-center border-r border-line text-muted-foreground outline-none hover:bg-muted focus-visible:bg-muted"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <input
            id="vm_count"
            type="number"
            min={1}
            max={MAX_VMS}
            value={count}
            onChange={(e) => {
              if (Number.isFinite(e.target.valueAsNumber)) setCount(e.target.valueAsNumber);
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-center font-mono text-sm font-medium tabular outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Ajouter une VM"
            onClick={() => setCount(count + 1)}
            className="grid h-full w-9 place-items-center border-l border-line text-muted-foreground outline-none hover:bg-muted focus-visible:bg-muted"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <FieldHint>Une VM par stagiaire, 1 à {MAX_VMS}</FieldHint>
      </div>
    </>
  );
}

function MachinesPanel({ form }: { form: Form }) {
  const cpu = form.watch("cpu_cores");
  const ram = form.watch("ram_mb");

  function setSliderValue(field: "cpu_cores" | "ram_mb", next: number | readonly number[]) {
    const value = Array.isArray(next) ? next[0] : next;
    if (typeof value === "number") form.setValue(field, value);
  }

  return (
    <div className="panel bg-card">
      <PanelTitle index="02">Machines et ressources</PanelTitle>
      <div className="grid grid-cols-1 gap-x-7 gap-y-[22px] p-5 md:grid-cols-2">
        <VmRangeFields form={form} />
        <ResourceSlider
          label="CPU par VM"
          display={`${cpu} core${cpu > 1 ? "s" : ""}`}
          min={1}
          max={16}
          step={1}
          value={cpu}
          bounds={["1", "16"]}
          onChange={(v) => setSliderValue("cpu_cores", v)}
        />
        <ResourceSlider
          label="RAM par VM"
          display={formatRam(ram)}
          min={512}
          max={32768}
          step={512}
          value={ram}
          bounds={["0,5 Go", "32 Go"]}
          onChange={(v) => setSliderValue("ram_mb", v)}
        />
      </div>
    </div>
  );
}

function AccessPanel({ form }: { form: Form }) {
  return (
    <div className="panel bg-card">
      <PanelTitle index="04" aside="Injectés dans Guacamole">
        Accès stagiaires
      </PanelTitle>
      <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] p-5 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="vm_username">Utilisateur</FieldLabel>
          <Input id="vm_username" {...form.register("vm_username")} className="font-mono" />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="vm_password">Mot de passe</FieldLabel>
          <Input id="vm_password" type="password" {...form.register("vm_password")} className="font-mono" />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="rdp_port">Port RDP</FieldLabel>
          <Input
            id="rdp_port"
            type="number"
            {...form.register("rdp_port", { valueAsNumber: true })}
            className="font-mono tabular"
          />
        </div>
      </div>
    </div>
  );
}

// Choix du groupe d'infra, du template et des scripts : chaque niveau réinitialise les suivants.
function useSourceSelection(form: Form) {
  const groupId = form.watch("infra_group_id");
  const templates = useTemplates(groupId);

  function selectTemplate(vmid: number) {
    const template = templates.find((t) => t.vmid === vmid) ?? null;
    form.setValue("template_vmid", vmid, { shouldValidate: true });
    form.setValue("os_id", template?.os_id ?? null);
    form.setValue("template_name", template?.name ?? null);
  }

  function selectGroup(id: string) {
    form.setValue("infra_group_id", id, { shouldValidate: true });
    form.setValue("template_vmid", 0);
    form.setValue("os_id", null);
    form.setValue("template_name", null);
    form.setValue("script_ids", []);
  }

  return { groupId, templates, selectTemplate, selectGroup };
}

function IdentityPanel({ form, groups }: { form: Form; groups: InfraGroupSummary[] | null }) {
  const { groupId, templates, selectTemplate, selectGroup } = useSourceSelection(form);
  const templateVmid = form.watch("template_vmid");
  const osId = form.watch("os_id");
  const errors = form.formState.errors;

  return (
    <div className="panel bg-card">
      <PanelTitle index="01">Identité et source</PanelTitle>
      <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] p-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <FieldLabel htmlFor="name">Nom de la formation</FieldLabel>
          <Input id="name" {...form.register("name")} placeholder="ex : Linux admin, promo 15" />
          <FieldError message={errors.name?.message} className="" />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Groupe d’infrastructure</FieldLabel>
          <InfraGroupSelect groups={groups} value={groupId} onChange={selectGroup} />
          <FieldError message={errors.infra_group_id?.message} className="" />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Template</FieldLabel>
          <TemplateCombobox
            templates={templates}
            value={templateVmid}
            onChange={selectTemplate}
            disabled={!groupId}
          />
          {templateVmid > 0 && (
            <span className="flex items-center gap-1.5 text-[0.78125rem] text-muted-foreground">
              Famille déduite :
              {osId ? (
                <span className="rounded-[3px] bg-accent px-1.5 py-[3px] font-mono text-[0.625rem] leading-none font-medium tracking-[0.08em] text-accent-foreground uppercase">
                  {osId}
                </span>
              ) : (
                <span className="text-warning">aucune</span>
              )}
            </span>
          )}
          <FieldError message={errors.template_vmid?.message} className="" />
        </div>
      </div>
    </div>
  );
}

function ScriptsPanel({ form }: { form: Form }) {
  const templateVmid = form.watch("template_vmid");
  const osId = form.watch("os_id");
  const scriptIds = form.watch("script_ids");

  return (
    <div className="panel bg-card">
      <PanelTitle index="03" aside="Exécutés dans l’ordre, via le QEMU guest agent">
        Scripts à appliquer
      </PanelTitle>
      <div className="px-5 pt-4 pb-5">
        <ScriptPicker
          osId={osId ?? null}
          templateChosen={templateVmid > 0}
          value={scriptIds ?? []}
          onChange={(ids) => form.setValue("script_ids", ids)}
        />
      </div>
    </div>
  );
}

function RecapLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 text-[0.84375rem] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-[0.78125rem]">{children}</span>
    </div>
  );
}

function Recap({
  form,
  pending,
  disabled,
  onDraft,
}: {
  form: Form;
  pending: "deploy" | "draft" | null;
  disabled: boolean;
  onDraft: () => void;
}) {
  const v = form.watch();
  const count = Number.isFinite(v.vm_start_id) && Number.isFinite(v.vm_end_id) ? v.vm_end_id - v.vm_start_id + 1 : 0;
  const ramGb = v.ram_mb / 1024;

  return (
    <aside className="panel flex flex-col bg-card lg:sticky lg:top-[4.5rem]">
      <p className="eyebrow border-b border-line px-[18px] py-3.5">Récapitulatif</p>
      <div className="flex flex-col px-[18px] py-1.5">
        <RecapLine label="Template">{v.template_name ?? "à choisir"}</RecapLine>
        <RecapLine label="VMID">
          {Number.isFinite(v.vm_start_id) ? v.vm_start_id : "?"}–{Number.isFinite(v.vm_end_id) ? v.vm_end_id : "?"}
        </RecapLine>
        <RecapLine label="Machines">
          {count} × {v.cpu_cores} vCPU · {formatRam(v.ram_mb)}
        </RecapLine>
        <RecapLine label="Total réservé">
          {count * v.cpu_cores} vCPU · {formatRam(count * ramGb * 1024)}
        </RecapLine>
        <RecapLine label="Scripts optionnels">{(v.script_ids ?? []).length}</RecapLine>
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-[18px] pt-3.5 pb-[18px]">
        <Button type="submit" className="h-[38px] text-sm" disabled={disabled}>
          {pending === "deploy" ? "Création…" : "Créer et déployer"}
        </Button>
        <Button type="button" variant="outline" className="h-9" disabled={disabled} onClick={onDraft}>
          {pending === "draft" ? "Enregistrement…" : "Enregistrer en brouillon"}
        </Button>
      </div>
    </aside>
  );
}

export function CreationForm() {
  const router = useRouter();
  const [pending, setPending] = useState<"deploy" | "draft" | null>(null);
  const groups = useInfraGroups();

  const form = useForm<FormationFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formationSchema) as any,
    defaultValues: DEFAULT_VALUES,
  });

  // Brouillon : la formation est créée sans lancer le déploiement ; le déploiement se lance
  // ensuite depuis sa page. « Créer et déployer » ouvre directement le suivi, qui déclenche le job.
  function submit(mode: "deploy" | "draft") {
    return form.handleSubmit(async (data) => {
      setPending(mode);
      try {
        const formation = await createFormation(data);
        if (!formation) return;
        router.push(
          mode === "deploy" ? `/formations/${formation.id}/deploy` : `/formations/${formation.id}`
        );
      } catch {
        toast.error("Échec de la création de la formation");
      } finally {
        setPending(null);
      }
    });
  }

  const disabled = pending !== null || groups === null || groups.length === 0;

  return (
    <form
      onSubmit={submit("deploy")}
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <IdentityPanel form={form} groups={groups} />
        <MachinesPanel form={form} />
        <ScriptsPanel form={form} />
        <AccessPanel form={form} />
      </div>
      <Recap form={form} pending={pending} disabled={disabled} onDraft={() => void submit("draft")()} />
    </form>
  );
}

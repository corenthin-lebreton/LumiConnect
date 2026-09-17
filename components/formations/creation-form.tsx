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
import { ArrowRight } from "lucide-react";
import { FieldError, FieldLabel, Section } from "@/components/forms/field";
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

function ResourceSlider({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number | readonly number[]) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-sm tabular">{display}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={onChange} />
    </div>
  );
}

function ResourcesSection({ form }: { form: Form }) {
  const cpu = form.watch("cpu_cores");
  const ram = form.watch("ram_mb");

  function setSliderValue(field: "cpu_cores" | "ram_mb", next: number | readonly number[]) {
    const value = Array.isArray(next) ? next[0] : next;
    if (typeof value === "number") form.setValue(field, value);
  }

  return (
    <Section title="Ressources" description="Allocation CPU et RAM par VM clonée.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <ResourceSlider
            label="CPU Cores"
            display={String(cpu)}
            min={1}
            max={16}
            step={1}
            value={cpu}
            onChange={(v) => setSliderValue("cpu_cores", v)}
          />
          <div className="mt-1.5 flex justify-between font-mono text-micro text-muted-foreground tabular">
            <span>1</span>
            <span>16</span>
          </div>
        </div>
        <div>
          <ResourceSlider
            label="RAM"
            display={`${ram} MB`}
            min={512}
            max={32768}
            step={512}
            value={ram}
            onChange={(v) => setSliderValue("ram_mb", v)}
          />
          <div className="mt-1.5 flex justify-between font-mono text-micro text-muted-foreground tabular">
            <span>512 MB</span>
            <span>32 GB</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function FormationSection({ form }: { form: Form }) {
  const errors = form.formState.errors;
  return (
    <Section title="Formation" description="Nom et plage d'identifiants VM.">
      <div className="space-y-5">
        <div>
          <FieldLabel htmlFor="name">Nom de la formation</FieldLabel>
          <Input
            id="name"
            {...form.register("name")}
            className="mt-1.5"
            placeholder="ex: Cybersec Janvier"
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="vm_start_id">VM Start ID</FieldLabel>
            <Input
              id="vm_start_id"
              type="number"
              {...form.register("vm_start_id", { valueAsNumber: true })}
              className="mt-1.5 font-mono tabular"
            />
          </div>
          <div>
            <FieldLabel htmlFor="vm_end_id">VM End ID</FieldLabel>
            <Input
              id="vm_end_id"
              type="number"
              {...form.register("vm_end_id", { valueAsNumber: true })}
              className="mt-1.5 font-mono tabular"
            />
            <FieldError message={errors.vm_end_id?.message} />
          </div>
        </div>
      </div>
    </Section>
  );
}

function AccessSection({ form }: { form: Form }) {
  return (
    <Section title="Accès VM" description="Identifiants RDP injectés dans Guacamole.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <FieldLabel htmlFor="vm_username">Username</FieldLabel>
          <Input id="vm_username" {...form.register("vm_username")} className="mt-1.5" />
        </div>
        <div>
          <FieldLabel htmlFor="vm_password">Password</FieldLabel>
          <Input
            id="vm_password"
            type="password"
            {...form.register("vm_password")}
            className="mt-1.5"
          />
        </div>
        <div>
          <FieldLabel htmlFor="rdp_port">Port RDP</FieldLabel>
          <Input
            id="rdp_port"
            type="number"
            {...form.register("rdp_port", { valueAsNumber: true })}
            className="mt-1.5 font-mono tabular"
          />
        </div>
      </div>
    </Section>
  );
}

function SubmitBar({ loading, disabled }: { loading: boolean; disabled: boolean }) {
  return (
    <div className="grid gap-x-8 border-t border-line py-7 md:grid-cols-[14rem_1fr]">
      <p className="eyebrow hidden md:block">Validation</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="gap-1.5" disabled={disabled}>
          {loading ? "Création…" : "Créer la formation"}
          {!loading && <ArrowRight className="h-4 w-4" aria-hidden />}
        </Button>
        <p className="text-xs text-muted-foreground">
          Aucune machine n&apos;est créée à cette étape. Le déploiement se lance depuis la
          formation.
        </p>
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
    form.setValue("template_vmid", vmid);
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

function SourceSections({ form, groups }: { form: Form; groups: InfraGroupSummary[] | null }) {
  const { groupId, templates, selectTemplate, selectGroup } = useSourceSelection(form);
  const watched = form.watch();
  const errors = form.formState.errors;

  return (
    <>
      <Section
        title="Groupe d'infrastructure"
        description="Proxmox, pfSense et Guacamole sur lesquels cette formation sera déployée."
      >
        <InfraGroupSelect groups={groups} value={groupId} onChange={selectGroup} />
        <FieldError message={errors.infra_group_id?.message} className="mt-2" />
      </Section>

      <Section
        title="Template Proxmox"
        description="Image source pour les clones linked."
        className="overflow-visible"
      >
        <TemplateCombobox
          templates={templates}
          value={watched.template_vmid}
          onChange={selectTemplate}
          disabled={!groupId}
        />
        <FieldError message={errors.template_vmid?.message} className="mt-2" />
      </Section>

      <Section
        title="Configuration des VMs"
        description="Scripts exécutés dans chaque machine après son démarrage."
      >
        <ScriptPicker
          osId={watched.os_id ?? null}
          templateChosen={watched.template_vmid > 0}
          value={watched.script_ids ?? []}
          onChange={(ids) => form.setValue("script_ids", ids)}
        />
      </Section>
    </>
  );
}

export function CreationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const groups = useInfraGroups();

  const form = useForm<FormationFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formationSchema) as any,
    defaultValues: DEFAULT_VALUES,
  });

  async function onSubmit(data: FormationFormData) {
    setLoading(true);
    try {
      const formation = await createFormation(data);
      if (formation) router.push(`/formations/${formation.id}`);
    } catch {
      toast.error("Échec de la création de la formation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <SourceSections form={form} groups={groups} />
      <ResourcesSection form={form} />
      <FormationSection form={form} />
      <AccessSection form={form} />
      <SubmitBar loading={loading} disabled={loading || groups === null || groups.length === 0} />
    </form>
  );
}

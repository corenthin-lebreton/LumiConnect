"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formationSchema } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ArrowRight } from "lucide-react";
import { VmPreviewTable } from "./vm-preview-table";
import { TemplateCombobox } from "./template-combobox";
import { ScriptPicker } from "./script-picker";
import type { ProxmoxTemplate } from "@/types";
import { z } from "zod";

type FormationFormData = z.output<typeof formationSchema>;

function Section({
  title,
  description,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`grid gap-x-8 gap-y-4 border-t border-line py-7 md:grid-cols-[14rem_1fr] ${className}`}
    >
      <div className="md:sticky md:top-[4.5rem] md:self-start">
        <h2 className="display text-base">{title}</h2>
        {description && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="eyebrow">
      {children}
    </Label>
  );
}

function FieldError({ message, className = "mt-1" }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p className={`text-xs text-destructive ${className}`}>{message}</p>;
}

export function CreationForm() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ProxmoxTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormationFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formationSchema) as any,
    defaultValues: {
      name: "",
      template_vmid: 0,
      os_id: null,
      template_name: null,
      script_ids: [],
      vm_start_id: 200,
      vm_end_id: 210,
      base_ip: "192.168.143.",
      ip_start: 100,
      vm_username: "dev",
      vm_password: "",
      rdp_port: 3389,
      cpu_cores: 2,
      ram_mb: 4096,
    },
  });

  const watched = form.watch();

  function setSliderValue(field: "cpu_cores" | "ram_mb", next: number | readonly number[]) {
    const value = Array.isArray(next) ? next[0] : next;
    if (typeof value === "number") form.setValue(field, value);
  }

  function selectTemplate(vmid: number) {
    const template = templates.find((t) => t.vmid === vmid) ?? null;
    form.setValue("template_vmid", vmid);
    form.setValue("os_id", template?.os_id ?? null);
    form.setValue("template_name", template?.name ?? null);
  }

  useEffect(() => {
    fetch("/api/proxmox/templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  async function onSubmit(data: FormationFormData) {
    setLoading(true);
    const res = await fetch("/api/formations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const formation = await res.json();
      router.push(`/formations/${formation.id}`);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Section title="Template Proxmox" description="Image source pour les clones linked." className="overflow-visible">
        <TemplateCombobox
          templates={templates}
          value={watched.template_vmid}
          onChange={selectTemplate}
        />
        <FieldError message={form.formState.errors.template_vmid?.message} className="mt-2" />
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

      <Section title="Ressources" description="Allocation CPU et RAM par VM clonée.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <FieldLabel>CPU Cores</FieldLabel>
              <span className="font-mono text-sm tabular">{watched.cpu_cores}</span>
            </div>
            <Slider
              min={1}
              max={16}
              step={1}
              value={[watched.cpu_cores]}
              onValueChange={(v) => setSliderValue("cpu_cores", v)}
            />
            <div className="mt-1.5 flex justify-between font-mono text-micro text-muted-foreground tabular">
              <span>1</span>
              <span>16</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <FieldLabel>RAM</FieldLabel>
              <span className="font-mono text-sm tabular">{watched.ram_mb} MB</span>
            </div>
            <Slider
              min={512}
              max={32768}
              step={512}
              value={[watched.ram_mb]}
              onValueChange={(v) => setSliderValue("ram_mb", v)}
            />
            <div className="mt-1.5 flex justify-between font-mono text-micro text-muted-foreground tabular">
              <span>512 MB</span>
              <span>32 GB</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Formation" description="Nom et plage d'identifiants VM.">
        <div className="space-y-5">
          <div>
            <FieldLabel htmlFor="name">Nom de la formation</FieldLabel>
            <Input id="name" {...form.register("name")} className="mt-1.5" placeholder="ex: Cybersec Janvier" />
            <FieldError message={form.formState.errors.name?.message} />
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
              <FieldError message={form.formState.errors.vm_end_id?.message} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Réseau" description="Adressage IP statique attribué par pfSense.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="base_ip">Base IP</FieldLabel>
            <Input
              id="base_ip"
              placeholder="10.0.1."
              {...form.register("base_ip")}
              className="mt-1.5 font-mono tabular"
            />
            <FieldError message={form.formState.errors.base_ip?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="ip_start">IP Start Offset</FieldLabel>
            <Input
              id="ip_start"
              type="number"
              {...form.register("ip_start", { valueAsNumber: true })}
              className="mt-1.5 font-mono tabular"
            />
          </div>
        </div>
      </Section>

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

      {watched.vm_start_id > 0 && watched.vm_end_id > 0 && (
        <Section title="Aperçu" description="Cibles calculées avant déploiement.">
          <VmPreviewTable
            vmStartId={watched.vm_start_id}
            vmEndId={watched.vm_end_id}
            baseIp={watched.base_ip}
            ipStart={watched.ip_start}
          />
        </Section>
      )}

      <div className="grid gap-x-8 border-t border-line py-7 md:grid-cols-[14rem_1fr]">
        <p className="eyebrow hidden md:block">Validation</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" className="gap-1.5" disabled={loading}>
            {loading ? "Création…" : "Créer la formation"}
            {!loading && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
          <p className="text-xs text-muted-foreground">
            Aucune machine n&apos;est créée à cette étape. Le déploiement se lance depuis la
            formation.
          </p>
        </div>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRight, PlugZap } from "lucide-react";
import {
  infraGroupPatchSchema,
  infraGroupSchema,
  type InfraGroupFormData,
  type InfraGroupPatchData,
} from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, FieldHint, FieldLabel, Section } from "@/components/forms/field";
import type { InfraGroupSummary, InfraHealth, ServiceProbe } from "@/types";

type Props =
  | { mode: "create" }
  | { mode: "edit"; group: InfraGroupSummary };

type Values = InfraGroupFormData | InfraGroupPatchData;
type Form = UseFormReturn<Values>;

interface SectionProps {
  form: Form;
  errors: FieldErrors<Values>;
  secretPlaceholder: string | undefined;
}

const UNCHANGED = "•••••••• (inchangé)";

const CA_TEXTAREA_CLASS =
  "mt-1.5 w-full rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-xs " +
  "outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-sans " +
  "placeholder:text-muted-foreground/80 hover:border-foreground/30 focus-visible:border-ring " +
  "focus-visible:ring-2 focus-visible:ring-ring/25";

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  if (body?.error?.fieldErrors) {
    const first = Object.entries(body.error.fieldErrors as Record<string, string[]>)[0];
    if (first) return `${first[0]} : ${first[1][0]}`;
  }
  return fallback;
}

function ProbeLine({ label, probe }: { label: string; probe: ServiceProbe }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="font-medium">{label}</span>
      <span
        className={`flex min-w-0 items-start gap-2 text-right font-mono text-micro ${
          probe.ok ? "text-success" : "text-destructive"
        }`}
      >
        <span
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
            probe.ok ? "bg-success" : "bg-destructive"
          }`}
          aria-hidden
        />
        <span className="break-all">{probe.ok ? "OK" : (probe.error ?? "Erreur")}</span>
      </span>
    </li>
  );
}

type TextFieldName = Exclude<
  keyof InfraGroupFormData,
  "proxmox_ca_pem" | "pfsense_ca_pem" | "proxmox_insecure_tls" | "pfsense_insecure_tls"
>;

function TextField({
  form,
  field,
  label,
  error,
  placeholder,
  secret = false,
  hint,
}: {
  form: Form;
  field: TextFieldName;
  label: string;
  error: string | undefined;
  placeholder?: string;
  secret?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel htmlFor={field}>{label}</FieldLabel>
      <Input
        id={field}
        type={secret ? "password" : undefined}
        autoComplete={secret ? "new-password" : undefined}
        {...form.register(field)}
        className="mt-1.5"
        placeholder={placeholder}
      />
      {hint && <FieldHint>{hint}</FieldHint>}
      <FieldError message={error} />
    </div>
  );
}

function CaTextarea({
  form,
  field,
  error,
  hint,
}: {
  form: Form;
  field: "proxmox_ca_pem" | "pfsense_ca_pem";
  error: string | undefined;
  hint: React.ReactNode;
}) {
  return (
    <div className="md:col-span-2">
      <FieldLabel htmlFor={field}>Certificat CA (optionnel)</FieldLabel>
      <textarea
        id={field}
        {...form.register(field)}
        rows={5}
        spellCheck={false}
        placeholder="-----BEGIN CERTIFICATE-----"
        className={CA_TEXTAREA_CLASS}
      />
      <FieldHint>{hint}</FieldHint>
      <FieldError message={error} />
    </div>
  );
}

function InsecureTlsCheckbox({
  form,
  field,
  children,
}: {
  form: Form;
  field: "proxmox_insecure_tls" | "pfsense_insecure_tls";
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 md:col-span-2">
      <input type="checkbox" {...form.register(field)} className="mt-0.5 h-4 w-4 accent-primary" />
      <span className="text-sm">
        Accepter un certificat auto-signé sans CA
        <span className="block text-xs leading-relaxed text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

function ProxmoxSection({ form, errors, secretPlaceholder }: SectionProps) {
  return (
    <Section title="Proxmox" description="Jeton d'API dédié, jamais root@pam.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          form={form}
          field="proxmox_url"
          label="URL"
          error={errors.proxmox_url?.message}
          placeholder="https://pve.example.com:8006"
          hint="Base uniquement, sans chemin."
        />
        <TextField
          form={form}
          field="proxmox_node"
          label="Nœud"
          error={errors.proxmox_node?.message}
          placeholder="pve"
        />
        <TextField
          form={form}
          field="proxmox_token_id"
          label="Identifiant du token"
          error={errors.proxmox_token_id?.message}
          placeholder="lumiconnect@pve!deploy"
        />
        <TextField
          form={form}
          field="proxmox_token_secret"
          label="Secret du token"
          error={errors.proxmox_token_secret?.message}
          placeholder={secretPlaceholder}
          secret
        />
        <CaTextarea
          form={form}
          field="proxmox_ca_pem"
          error={errors.proxmox_ca_pem?.message}
          hint="CA interne de Proxmox : /etc/pve/pve-root-ca.pem sur le nœud. Vide : confiance système."
        />
        <InsecureTlsCheckbox form={form} field="proxmox_insecure_tls">
          Désactive la vérification TLS vers Proxmox : le lien devient interceptable, et le
          jeton d&apos;API y circule. Préférer la CA ci-dessus quand elle est disponible.
        </InsecureTlsCheckbox>
      </div>
    </Section>
  );
}

function PfSenseSection({ form, errors, secretPlaceholder }: SectionProps) {
  return (
    <Section title="pfSense" description="API v2 activée, clé API de lecture.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          form={form}
          field="pfsense_url"
          label="URL"
          error={errors.pfsense_url?.message}
          placeholder="https://192.168.1.1"
        />
        <TextField
          form={form}
          field="pfsense_api_key"
          label="Clé API"
          error={errors.pfsense_api_key?.message}
          placeholder={secretPlaceholder}
          secret
        />
        <CaTextarea
          form={form}
          field="pfsense_ca_pem"
          error={errors.pfsense_ca_pem?.message}
          hint="Pour un certificat auto-signé. Vide : confiance système."
        />
        <InsecureTlsCheckbox form={form} field="pfsense_insecure_tls">
          Désactive la vérification TLS vers pfSense : le lien devient interceptable. Préférer
          la CA ci-dessus quand elle est disponible.
        </InsecureTlsCheckbox>
      </div>
    </Section>
  );
}

function GuacamoleSection({ form, errors, secretPlaceholder }: SectionProps) {
  return (
    <Section
      title="Guacamole"
      description="Compte administrateur qui crée connexions et utilisateurs."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          form={form}
          field="guacamole_url"
          label="URL"
          error={errors.guacamole_url?.message}
          placeholder="http://guac.example.com:8080/guacamole"
        />
        <TextField
          form={form}
          field="guacamole_datasource"
          label="Datasource"
          error={errors.guacamole_datasource?.message}
          placeholder="postgresql"
          hint="Identifiant JDBC : « postgresql », jamais « postgres »."
        />
        <TextField
          form={form}
          field="guacamole_admin_user"
          label="Utilisateur admin"
          error={errors.guacamole_admin_user?.message}
          placeholder="guacadmin"
        />
        <TextField
          form={form}
          field="guacamole_admin_password"
          label="Mot de passe admin"
          error={errors.guacamole_admin_password?.message}
          placeholder={secretPlaceholder}
          secret
        />
      </div>
    </Section>
  );
}

function ConnectionTestSection({
  testing,
  health,
  onTest,
}: {
  testing: boolean;
  health: InfraHealth | null;
  onTest: () => void;
}) {
  return (
    <Section
      title="Connexion"
      description="Vérifie les trois services avec les valeurs ci-dessus, sans enregistrer."
    >
      <div className="space-y-4">
        <Button
          type="button"
          variant="outline"
          onClick={onTest}
          disabled={testing}
          className="gap-1.5"
        >
          <PlugZap
            className={`h-4 w-4 ${testing ? "motion-safe:animate-pulse" : ""}`}
            aria-hidden
          />
          {testing ? "Test en cours…" : "Tester la connexion"}
        </Button>
        {health && (
          <ul className="panel divide-y divide-line overflow-hidden bg-card">
            <ProbeLine label="Proxmox" probe={health.proxmox} />
            <ProbeLine label="pfSense" probe={health.pfsense} />
            <ProbeLine label="Guacamole" probe={health.guacamole} />
          </ul>
        )}
      </div>
    </Section>
  );
}

function SubmitBar({
  saving,
  editing,
  onCancel,
}: {
  saving: boolean;
  editing: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-x-8 border-t border-line py-7 md:grid-cols-[14rem_1fr]">
      <p className="eyebrow hidden md:block">Validation</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="gap-1.5" disabled={saving}>
          {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le groupe"}
          {!saving && <ArrowRight className="h-4 w-4" aria-hidden />}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Annuler
        </Button>
        <p className="text-xs text-muted-foreground">
          Les secrets sont chiffrés en base et ne sont jamais réaffichés.
          {editing && " Changer l'URL d'un service demande de ressaisir son secret."}
        </p>
      </div>
    </div>
  );
}

function defaultValues(group: InfraGroupSummary | null): Values {
  return {
    name: group?.name ?? "",
    proxmox_url: group?.proxmox_url ?? "",
    proxmox_node: group?.proxmox_node ?? "",
    proxmox_token_id: group?.proxmox_token_id ?? "",
    proxmox_token_secret: "",
    proxmox_ca_pem: group?.proxmox_ca_pem ?? "",
    proxmox_insecure_tls: group?.proxmox_insecure_tls ?? false,
    pfsense_url: group?.pfsense_url ?? "",
    pfsense_api_key: "",
    pfsense_ca_pem: group?.pfsense_ca_pem ?? "",
    pfsense_insecure_tls: group?.pfsense_insecure_tls ?? false,
    guacamole_url: group?.guacamole_url ?? "",
    guacamole_datasource: group?.guacamole_datasource ?? "postgresql",
    guacamole_admin_user: group?.guacamole_admin_user ?? "",
    guacamole_admin_password: "",
  };
}

function groupEndpoint(groupId: string | null, suffix = ""): string {
  return groupId ? `/api/infra-groups/${groupId}${suffix}` : `/api/infra-groups${suffix}`;
}

function useSaveGroup(groupId: string | null) {
  const router = useRouter();
  const editing = groupId !== null;
  const [saving, setSaving] = useState(false);

  async function save(data: Values) {
    setSaving(true);
    try {
      const res = await fetch(groupEndpoint(groupId), {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Enregistrement impossible"));
        return;
      }
      toast.success(editing ? "Groupe mis à jour" : "Groupe créé");
      router.push("/parametres");
      router.refresh();
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return { save, saving, cancel: () => router.push("/parametres") };
}

// Teste les trois services avec les valeurs saisies, sans enregistrer.
function useTestGroup(form: Form, groupId: string | null) {
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<InfraHealth | null>(null);

  async function test() {
    const valid = await form.trigger();
    if (!valid) {
      toast.error("Corriger le formulaire avant de tester");
      return;
    }
    setTesting(true);
    setHealth(null);
    try {
      const res = await fetch(groupEndpoint(groupId, "/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.getValues()),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Test impossible"));
        return;
      }
      setHealth((await res.json()) as InfraHealth);
    } catch {
      toast.error("Test impossible");
    } finally {
      setTesting(false);
    }
  }

  return { test, testing, health };
}

export function InfraGroupForm(props: Props) {
  const editing = props.mode === "edit";
  const group = editing ? props.group : null;

  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(editing ? infraGroupPatchSchema : infraGroupSchema) as any,
    defaultValues: defaultValues(group),
  });

  const { save, saving, cancel } = useSaveGroup(group?.id ?? null);
  const { test, testing, health } = useTestGroup(form, group?.id ?? null);

  const sectionProps: SectionProps = {
    form,
    errors: form.formState.errors,
    secretPlaceholder: editing ? UNCHANGED : undefined,
  };

  return (
    <form onSubmit={form.handleSubmit(save)}>
      <Section title="Groupe" description="Nom affiché lors du choix d'une infrastructure.">
        <div>
          <FieldLabel htmlFor="name">Nom du groupe</FieldLabel>
          <Input
            id="name"
            {...form.register("name")}
            className="mt-1.5 font-sans"
            placeholder="ex: Salle Lyon"
          />
          <FieldError message={sectionProps.errors.name?.message} />
        </div>
      </Section>

      <ProxmoxSection {...sectionProps} />
      <PfSenseSection {...sectionProps} />
      <GuacamoleSection {...sectionProps} />
      <ConnectionTestSection testing={testing} health={health} onTest={() => void test()} />
      <SubmitBar saving={saving} editing={editing} onCancel={cancel} />
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlugZap } from "lucide-react";
import {
  infraGroupPatchSchema,
  infraGroupSchema,
  type InfraGroupFormData,
  type InfraGroupPatchData,
} from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, FieldHint, FieldLabel, Section } from "@/components/forms/field";
import { cn } from "@/lib/utils";
import type { InfraGroupSummary, InfraHealth, ServiceProbe } from "@/types";

type Props =
  | { mode: "create" }
  | { mode: "edit"; group: InfraGroupSummary; onDelete: () => void };

type Values = InfraGroupFormData | InfraGroupPatchData;
type Form = UseFormReturn<Values>;

interface SectionProps {
  form: Form;
  errors: FieldErrors<Values>;
  editing: boolean;
  tester: TesterProps;
}

interface TesterProps {
  testing: boolean;
  health: InfraHealth | null;
  onTest: () => void;
}

const CA_TEXTAREA_CLASS =
  "mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs " +
  "outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-sans " +
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/28";

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  if (body?.error?.fieldErrors) {
    const first = Object.entries(body.error.fieldErrors as Record<string, string[]>)[0];
    if (first) return `${first[0]} : ${first[1][0]}`;
  }
  return fallback;
}

// Bouton de test dans la colonne de gauche de chaque service, et son résultat pour ce service.
function ServiceTester({ tester, service }: { tester: TesterProps; service: keyof InfraHealth }) {
  const probe: ServiceProbe | undefined = tester.health?.[service];
  return (
    <div className="flex flex-col gap-2 pt-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 self-start"
        onClick={tester.onTest}
        disabled={tester.testing}
      >
        <PlugZap className={cn("size-4", tester.testing && "motion-safe:animate-pulse")} aria-hidden />
        {tester.testing ? "Test en cours…" : "Tester la connexion"}
      </Button>
      {probe && (
        <span
          className={cn(
            "flex items-start gap-1.5 font-mono text-micro font-medium tracking-[0.06em] uppercase",
            probe.ok ? "text-success" : "text-destructive"
          )}
        >
          <span
            className={cn("mt-px size-[7px] shrink-0", probe.ok ? "rounded-full bg-success" : "rounded-[2px] bg-destructive")}
            aria-hidden
          />
          <span className="break-all normal-case tracking-normal">
            {probe.ok ? "CONNECTÉ" : (probe.error ?? "Erreur")}
          </span>
        </span>
      )}
    </div>
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
  mono = true,
  hint,
  className,
}: {
  form: Form;
  field: TextFieldName;
  label: string;
  error: string | undefined;
  placeholder?: string;
  mono?: boolean;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <FieldLabel htmlFor={field}>{label}</FieldLabel>
      <Input
        id={field}
        {...form.register(field)}
        className={mono ? "font-mono text-[0.84375rem]" : undefined}
        placeholder={placeholder}
      />
      {hint && <FieldHint>{hint}</FieldHint>}
      <FieldError message={error} className="" />
    </div>
  );
}

// Secret jamais réaffiché : en édition, « inchangé » tant qu'on ne clique pas sur Remplacer.
function SecretField({
  form,
  field,
  label,
  error,
  editing,
  hint,
  className,
}: {
  form: Form;
  field: TextFieldName;
  label: string;
  error: string | undefined;
  editing: boolean;
  hint?: React.ReactNode;
  className?: string;
}) {
  const [replacing, setReplacing] = useState(!editing);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <FieldLabel htmlFor={field}>{label}</FieldLabel>
      {replacing ? (
        <Input
          id={field}
          type="password"
          autoComplete="new-password"
          autoFocus={editing}
          {...form.register(field)}
          className="font-mono text-[0.84375rem]"
        />
      ) : (
        <div
          className={
            "flex h-9 items-center justify-between rounded-md border border-dashed border-input bg-muted " +
            "pr-1 pl-3 font-mono text-[0.8125rem] text-muted-foreground"
          }
        >
          •••••••• inchangé
          <Button type="button" variant="ghost" size="sm" className="h-7 text-foreground" onClick={() => setReplacing(true)}>
            Remplacer
          </Button>
        </div>
      )}
      {hint && <FieldHint>{hint}</FieldHint>}
      <FieldError message={error} className="" />
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
    <div className="flex flex-col md:col-span-2">
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
        <span className="mt-0.5 block text-[0.78125rem] leading-relaxed text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

function ProxmoxSection({ form, errors, editing, tester }: SectionProps) {
  return (
    <Section
      title="Proxmox VE"
      description="Clonage, configuration et suppression des VMs via l’API et le guest agent. Jeton d’API dédié, jamais root@pam."
      aside={<ServiceTester tester={tester} service="proxmox" />}
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] md:grid-cols-2">
        <TextField
          form={form}
          field="proxmox_url"
          label="URL de l’API"
          error={errors.proxmox_url?.message}
          placeholder="https://pve.example.com:8006"
          hint="Base uniquement, sans chemin."
          className="md:col-span-2"
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
        <SecretField
          form={form}
          field="proxmox_token_secret"
          label="Secret du token"
          error={errors.proxmox_token_secret?.message}
          editing={editing}
          hint="Stocké chiffré. Laissez inchangé pour conserver la valeur actuelle."
          className="md:col-span-2"
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

function PfSenseSection({ form, errors, editing, tester }: SectionProps) {
  return (
    <Section
      title="pfSense"
      description="Lecture des baux DHCP pour retrouver l’IP de chaque VM. API v2 activée, clé de lecture."
      aside={<ServiceTester tester={tester} service="pfsense" />}
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] md:grid-cols-2">
        <TextField
          form={form}
          field="pfsense_url"
          label="URL"
          error={errors.pfsense_url?.message}
          placeholder="https://192.168.1.1"
        />
        <SecretField
          form={form}
          field="pfsense_api_key"
          label="Clé API"
          error={errors.pfsense_api_key?.message}
          editing={editing}
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

function GuacamoleSection({ form, errors, editing, tester }: SectionProps) {
  return (
    <Section
      title="Guacamole"
      description="Création des connexions RDP / SSH distribuées aux stagiaires, via un compte administrateur."
      aside={<ServiceTester tester={tester} service="guacamole" />}
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] md:grid-cols-2">
        <TextField
          form={form}
          field="guacamole_url"
          label="URL"
          error={errors.guacamole_url?.message}
          placeholder="http://guac.example.com:8080/guacamole"
          className="md:col-span-2"
        />
        <TextField
          form={form}
          field="guacamole_admin_user"
          label="Utilisateur admin"
          error={errors.guacamole_admin_user?.message}
          placeholder="guacadmin"
        />
        <SecretField
          form={form}
          field="guacamole_admin_password"
          label="Mot de passe"
          error={errors.guacamole_admin_password?.message}
          editing={editing}
        />
        <TextField
          form={form}
          field="guacamole_datasource"
          label="Datasource"
          error={errors.guacamole_datasource?.message}
          placeholder="postgresql"
          hint="Identifiant JDBC : « postgresql », jamais « postgres »."
        />
      </div>
    </Section>
  );
}

function SubmitBar({
  saving,
  editing,
  onCancel,
  onDelete,
}: {
  saving: boolean;
  editing: boolean;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={
        "-mx-4 mt-8 flex flex-wrap items-center justify-between gap-3 border-t " +
        "border-line-strong bg-surface px-4 py-3.5 md:-mx-10 md:px-10"
      }
    >
      <div className="flex items-center gap-3">
        {onDelete && (
          <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
            Supprimer le groupe
          </Button>
        )}
        <p className="hidden text-xs text-muted-foreground lg:block">
          Les secrets sont chiffrés en base et ne sont jamais réaffichés.
          {editing && " Changer l'URL d'un service demande de ressaisir son secret."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le groupe"}
        </Button>
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
    editing,
    tester: { testing, health, onTest: () => void test() },
  };

  return (
    <form onSubmit={form.handleSubmit(save)} className="flex max-w-[1040px] flex-col gap-6">
      <div className="flex max-w-[420px] flex-col gap-1.5">
        <FieldLabel htmlFor="name">Nom du groupe</FieldLabel>
        <Input id="name" {...form.register("name")} placeholder="ex : Salle A, Lyon" />
        <FieldError message={sectionProps.errors.name?.message} className="" />
      </div>

      <ProxmoxSection {...sectionProps} />
      <PfSenseSection {...sectionProps} />
      <GuacamoleSection {...sectionProps} />
      <SubmitBar
        saving={saving}
        editing={editing}
        onCancel={cancel}
        onDelete={props.mode === "edit" ? props.onDelete : undefined}
      />
    </form>
  );
}

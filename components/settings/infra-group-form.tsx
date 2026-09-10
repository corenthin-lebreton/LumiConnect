"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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

const UNCHANGED = "•••••••• (inchangé)";

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
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${probe.ok ? "bg-success" : "bg-destructive"}`}
          aria-hidden
        />
        <span className="break-all">{probe.ok ? "OK" : (probe.error ?? "Erreur")}</span>
      </span>
    </li>
  );
}

export function InfraGroupForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const group = editing ? props.group : null;

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<InfraHealth | null>(null);

  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(editing ? infraGroupPatchSchema : infraGroupSchema) as any,
    defaultValues: {
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
    },
  });

  const errors = form.formState.errors;

  async function readError(res: Response, fallback: string) {
    const body = await res.json().catch(() => null);
    if (typeof body?.error === "string") return body.error;
    if (body?.error?.fieldErrors) {
      const first = Object.entries(body.error.fieldErrors as Record<string, string[]>)[0];
      if (first) return `${first[0]} : ${first[1][0]}`;
    }
    return fallback;
  }

  async function onSubmit(data: Values) {
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/infra-groups/${group!.id}` : "/api/infra-groups", {
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

  async function test() {
    const valid = await form.trigger();
    if (!valid) {
      toast.error("Corriger le formulaire avant de tester");
      return;
    }
    setTesting(true);
    setHealth(null);
    try {
      const res = await fetch(editing ? `/api/infra-groups/${group!.id}/test` : "/api/infra-groups/test", {
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

  const secretPlaceholder = editing ? UNCHANGED : undefined;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Section title="Groupe" description="Nom affiché lors du choix d'une infrastructure.">
        <div>
          <FieldLabel htmlFor="name">Nom du groupe</FieldLabel>
          <Input id="name" {...form.register("name")} className="mt-1.5 font-sans" placeholder="ex: Salle Lyon" />
          <FieldError message={errors.name?.message} />
        </div>
      </Section>

      <Section title="Proxmox" description="Jeton d'API dédié, jamais root@pam.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="proxmox_url">URL</FieldLabel>
            <Input id="proxmox_url" {...form.register("proxmox_url")} className="mt-1.5" placeholder="https://pve.example.com:8006" />
            <FieldHint>Base uniquement, sans chemin.</FieldHint>
            <FieldError message={errors.proxmox_url?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="proxmox_node">Nœud</FieldLabel>
            <Input id="proxmox_node" {...form.register("proxmox_node")} className="mt-1.5" placeholder="pve" />
            <FieldError message={errors.proxmox_node?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="proxmox_token_id">Identifiant du token</FieldLabel>
            <Input id="proxmox_token_id" {...form.register("proxmox_token_id")} className="mt-1.5" placeholder="lumiconnect@pve!deploy" />
            <FieldError message={errors.proxmox_token_id?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="proxmox_token_secret">Secret du token</FieldLabel>
            <Input id="proxmox_token_secret" type="password" autoComplete="new-password" {...form.register("proxmox_token_secret")} className="mt-1.5" placeholder={secretPlaceholder} />
            <FieldError message={errors.proxmox_token_secret?.message} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="proxmox_ca_pem">Certificat CA (optionnel)</FieldLabel>
            <textarea
              id="proxmox_ca_pem"
              {...form.register("proxmox_ca_pem")}
              rows={5}
              spellCheck={false}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="mt-1.5 w-full rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-sans placeholder:text-muted-foreground/80 hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            <FieldHint>
              CA interne de Proxmox : /etc/pve/pve-root-ca.pem sur le nœud. Vide : confiance
              système.
            </FieldHint>
            <FieldError message={errors.proxmox_ca_pem?.message} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 md:col-span-2">
            <input
              type="checkbox"
              {...form.register("proxmox_insecure_tls")}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              Accepter un certificat auto-signé sans CA
              <span className="block text-xs leading-relaxed text-muted-foreground">
                Désactive la vérification TLS vers Proxmox : le lien devient interceptable, et le
                jeton d&apos;API y circule. Préférer la CA ci-dessus quand elle est disponible.
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section title="pfSense" description="API v2 activée, clé API de lecture.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="pfsense_url">URL</FieldLabel>
            <Input id="pfsense_url" {...form.register("pfsense_url")} className="mt-1.5" placeholder="https://192.168.1.1" />
            <FieldError message={errors.pfsense_url?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="pfsense_api_key">Clé API</FieldLabel>
            <Input id="pfsense_api_key" type="password" autoComplete="new-password" {...form.register("pfsense_api_key")} className="mt-1.5" placeholder={secretPlaceholder} />
            <FieldError message={errors.pfsense_api_key?.message} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="pfsense_ca_pem">Certificat CA (optionnel)</FieldLabel>
            <textarea
              id="pfsense_ca_pem"
              {...form.register("pfsense_ca_pem")}
              rows={5}
              spellCheck={false}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="mt-1.5 w-full rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-sans placeholder:text-muted-foreground/80 hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            <FieldHint>Pour un certificat auto-signé. Vide : confiance système.</FieldHint>
            <FieldError message={errors.pfsense_ca_pem?.message} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 md:col-span-2">
            <input
              type="checkbox"
              {...form.register("pfsense_insecure_tls")}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              Accepter un certificat auto-signé sans CA
              <span className="block text-xs leading-relaxed text-muted-foreground">
                Désactive la vérification TLS vers pfSense : le lien devient interceptable. Préférer
                la CA ci-dessus quand elle est disponible.
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section title="Guacamole" description="Compte administrateur qui crée connexions et utilisateurs.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="guacamole_url">URL</FieldLabel>
            <Input id="guacamole_url" {...form.register("guacamole_url")} className="mt-1.5" placeholder="http://guac.example.com:8080/guacamole" />
            <FieldError message={errors.guacamole_url?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="guacamole_datasource">Datasource</FieldLabel>
            <Input id="guacamole_datasource" {...form.register("guacamole_datasource")} className="mt-1.5" placeholder="postgresql" />
            <FieldHint>Identifiant JDBC : « postgresql », jamais « postgres ».</FieldHint>
            <FieldError message={errors.guacamole_datasource?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="guacamole_admin_user">Utilisateur admin</FieldLabel>
            <Input id="guacamole_admin_user" {...form.register("guacamole_admin_user")} className="mt-1.5" placeholder="guacadmin" />
            <FieldError message={errors.guacamole_admin_user?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="guacamole_admin_password">Mot de passe admin</FieldLabel>
            <Input id="guacamole_admin_password" type="password" autoComplete="new-password" {...form.register("guacamole_admin_password")} className="mt-1.5" placeholder={secretPlaceholder} />
            <FieldError message={errors.guacamole_admin_password?.message} />
          </div>
        </div>
      </Section>

      <Section title="Connexion" description="Vérifie les trois services avec les valeurs ci-dessus, sans enregistrer.">
        <div className="space-y-4">
          <Button type="button" variant="outline" onClick={() => void test()} disabled={testing} className="gap-1.5">
            <PlugZap className={`h-4 w-4 ${testing ? "motion-safe:animate-pulse" : ""}`} aria-hidden />
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

      <div className="grid gap-x-8 border-t border-line py-7 md:grid-cols-[14rem_1fr]">
        <p className="eyebrow hidden md:block">Validation</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" className="gap-1.5" disabled={saving}>
            {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le groupe"}
            {!saving && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => router.push("/parametres")}>
            Annuler
          </Button>
          <p className="text-xs text-muted-foreground">
            Les secrets sont chiffrés en base et ne sont jamais réaffichés.
            {editing && " Changer l'URL d'un service demande de ressaisir son secret."}
          </p>
        </div>
      </div>
    </form>
  );
}

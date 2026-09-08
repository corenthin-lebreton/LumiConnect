import { ConsoleHead } from "@/components/layout/console-head";
import { InfraGroupForm } from "@/components/settings/infra-group-form";

export default function NewInfraGroupPage() {
  return (
    <div className="space-y-8">
      <ConsoleHead eyebrow="Paramètres" title="Nouveau groupe d'infrastructure" />
      <InfraGroupForm mode="create" />
    </div>
  );
}

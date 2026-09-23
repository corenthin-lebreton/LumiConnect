import { ConsoleHead } from "@/components/layout/console-head";
import { InfraGroupForm } from "@/components/settings/infra-group-form";

export default function NewInfraGroupPage() {
  return (
    <div className="space-y-6">
      <ConsoleHead
        back={{ href: "/parametres", label: "Paramètres" }}
        eyebrow="Groupe d’infrastructure"
        title="Nouveau groupe"
      />
      <InfraGroupForm mode="create" />
    </div>
  );
}

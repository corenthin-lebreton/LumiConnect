import { CreationForm } from "@/components/formations/creation-form";
import { ConsoleHead } from "@/components/layout/console-head";

export default function NewFormationPage() {
  return (
    <div className="space-y-7">
      <ConsoleHead
        eyebrow="Nouvelle entrée"
        title="Créer une formation"
      />
      <CreationForm />
    </div>
  );
}

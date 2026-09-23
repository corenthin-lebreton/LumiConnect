import { CreationForm } from "@/components/formations/creation-form";
import { ConsoleHead } from "@/components/layout/console-head";

export default function NewFormationPage() {
  return (
    <div className="space-y-6">
      <ConsoleHead back={{ href: "/formations", label: "Formations" }} title="Nouvelle formation" />
      <CreationForm />
    </div>
  );
}

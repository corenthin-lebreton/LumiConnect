import { Label } from "@/components/ui/label";

// Bloc de formulaire : libellé et description à gauche, champs dans une carte à droite.
export function Section({
  title,
  description,
  aside,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`grid gap-x-8 gap-y-4 border-t border-line pt-6 md:grid-cols-[260px_minmax(0,1fr)] ${className}`}
    >
      <div className="flex flex-col gap-2.5 md:sticky md:top-[4.5rem] md:self-start">
        <h2 className="text-base leading-tight font-semibold">{title}</h2>
        {description && (
          <p className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
            {description}
          </p>
        )}
        {aside}
      </div>
      <div className="panel min-w-0 bg-card p-5">{children}</div>
    </section>
  );
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <Label htmlFor={htmlFor}>{children}</Label>;
}

export function FieldError({ message, className = "mt-1.5" }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p className={`text-[0.78125rem] text-destructive ${className}`}>{message}</p>;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-[0.78125rem] leading-snug text-muted-foreground">{children}</p>
  );
}

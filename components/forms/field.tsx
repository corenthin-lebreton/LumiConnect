import { Label } from "@/components/ui/label";

export function Section({
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

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="eyebrow">
      {children}
    </Label>
  );
}

export function FieldError({ message, className = "mt-1" }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p className={`text-xs text-destructive ${className}`}>{message}</p>;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

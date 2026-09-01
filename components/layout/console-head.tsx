import { cn } from "@/lib/utils";

export interface Readout {
  label: string;
  value: string;
  tone?: "default" | "success" | "running" | "warning" | "destructive";
  sub?: string;
}

const toneClass: Record<NonNullable<Readout["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  running: "text-running",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function ConsoleHead({
  eyebrow,
  title,
  status,
  actions,
  readouts,
}: {
  eyebrow: string;
  title: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  readouts?: Readout[];
}) {
  return (
    <header className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display text-2xl break-words sm:text-3xl">{title}</h1>
          {status && <div className="pt-1">{status}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {readouts && readouts.length > 0 && <ReadoutStrip readouts={readouts} />}
    </header>
  );
}

export function ReadoutStrip({
  readouts,
  className,
}: {
  readouts: Readout[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "panel grid gap-px overflow-hidden bg-line",
        "sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]",
        className
      )}
    >
      {readouts.map((readout) => {
        const tone = readout.value === "0" ? "default" : (readout.tone ?? "default");

        return (
          <div key={readout.label} className="bg-card px-4 py-3.5">
            <dt className="eyebrow">{readout.label}</dt>
            <dd className={cn("numeral mt-2 text-2xl", toneClass[tone])}>{readout.value}</dd>
            {readout.sub && (
              <p className="mt-1.5 text-micro text-muted-foreground">{readout.sub}</p>
            )}
          </div>
        );
      })}
    </dl>
  );
}

export function Slab({
  title,
  aside,
  children,
  className,
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {title && <h2 className="display text-base">{title}</h2>}
          {aside}
        </div>
      )}
      <div className="panel overflow-hidden bg-card">{children}</div>
    </section>
  );
}

export function TableHead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hidden items-center gap-4 border-b border-line bg-muted px-4 py-2 md:flex",
        className
      )}
    >
      {children}
    </div>
  );
}

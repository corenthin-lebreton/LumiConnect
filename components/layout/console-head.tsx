import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusMark, type Tone } from "@/components/ui/pill";

export interface Readout {
  label: string;
  value: React.ReactNode;
  /** Pastille devant le libellé. */
  tone?: Tone;
  /** Valeur en rouge (échecs non nuls). */
  alert?: boolean;
  sub?: React.ReactNode;
  /** Valeur en mono (plages, identifiants) plutôt qu'en chiffre de tuile. */
  mono?: boolean;
  footer?: React.ReactNode;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "inline-flex w-fit items-center gap-1.5 rounded-sm pb-1.5 text-[0.8125rem] font-medium " +
        "text-muted-foreground outline-none transition-colors hover:text-foreground " +
        "focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function ConsoleHead({
  back,
  eyebrow,
  eyebrowTone = "accent",
  title,
  subtitle,
  status,
  actions,
  readouts,
}: {
  back?: { href: string; label: string };
  eyebrow?: string;
  eyebrowTone?: "accent" | "destructive";
  title: string;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  readouts?: Readout[];
}) {
  return (
    <header className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {back && <BackLink href={back.href}>{back.label}</BackLink>}
          {eyebrow && (
            <p
              className={cn(
                "font-mono text-micro font-medium uppercase leading-none tracking-[0.12em]",
                eyebrowTone === "destructive" ? "text-destructive" : "text-accent-foreground"
              )}
            >
              {eyebrow}
            </p>
          )}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
            <h1 className="display text-[1.625rem] break-words sm:text-[1.75rem] sm:leading-[34px]">
              {title}
            </h1>
            {status}
          </div>
          {subtitle && <p className="text-[0.84375rem] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
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
        "panel grid grid-cols-2 gap-px overflow-hidden bg-line",
        "lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]",
        className
      )}
    >
      {readouts.map((readout) => (
        <div key={readout.label} className="flex min-w-0 flex-col gap-3 bg-card px-[18px] py-4">
          <dt className="eyebrow flex items-center gap-[7px]">
            {readout.tone && <StatusMark tone={readout.tone} />}
            {readout.label}
          </dt>
          <dd className="flex min-w-0 flex-col gap-1">
            <span
              className={cn(
                readout.mono
                  ? "truncate font-mono text-[0.9375rem] leading-tight font-medium sm:text-lg"
                  : "numeral text-[1.375rem] sm:text-[1.75rem]",
                readout.alert && "text-destructive"
              )}
            >
              {readout.value}
            </span>
            {readout.sub && (
              <span className="truncate font-mono text-[0.71875rem] text-muted-foreground">
                {readout.sub}
              </span>
            )}
          </dd>
          {readout.footer}
        </div>
      ))}
    </dl>
  );
}

export function PanelTitle({
  index,
  children,
  aside,
}: {
  index?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line px-5 py-3.5">
      {index && <span className="font-mono text-[0.6875rem] text-muted-foreground">{index}</span>}
      <h2 className="text-[0.9375rem] font-semibold leading-none">{children}</h2>
      {aside && <span className="ml-auto text-[0.78125rem] text-muted-foreground">{aside}</span>}
    </div>
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
        "eyebrow hidden h-9 items-center gap-4 border-b border-line-strong bg-surface px-[18px] md:grid",
        className
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  count,
  title,
  children,
  action,
}: {
  count: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="m-4 flex flex-col items-start gap-2.5 rounded-lg border border-dashed border-line-strong p-5">
      <span className="eyebrow">{count}</span>
      <span className="text-[0.9375rem] font-semibold">{title}</span>
      <span className="max-w-md text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
        {children}
      </span>
      {action}
    </div>
  );
}

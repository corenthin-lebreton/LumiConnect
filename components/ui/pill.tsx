import { cn } from "@/lib/utils";

export type Tone = "success" | "running" | "warning" | "destructive" | "muted";

const toneText: Record<Tone, string> = {
  success: "text-success",
  running: "text-running",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

const toneBg: Record<Tone, string> = {
  success: "bg-success/12",
  running: "bg-running/12",
  warning: "bg-warning/12",
  destructive: "bg-destructive/12",
  muted: "bg-muted",
};

// La forme double la couleur : rond = OK ou en cours (pulse), carré = échec,
// losange = attention, cercle vide = neutre.
const markShape: Record<Tone, string> = {
  success: "rounded-full bg-current",
  running: "rounded-full bg-current motion-safe:animate-status-pulse",
  warning: "rounded-[1px] bg-current rotate-45 scale-[0.85]",
  destructive: "rounded-[2px] bg-current",
  muted: "rounded-full border-[1.5px] border-current",
};

export function StatusMark({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[7px] shrink-0", toneText[tone], markShape[tone], className)}
    />
  );
}

export function Pill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-[7px] rounded-sm px-2 whitespace-nowrap",
        "font-mono text-micro font-medium uppercase leading-none tracking-[0.07em]",
        toneText[tone],
        toneBg[tone],
        className
      )}
    >
      <StatusMark tone={tone} />
      {children}
    </span>
  );
}

export const toneRail: Record<Tone, string> = {
  success: "bg-success",
  running: "bg-running",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-line-strong",
};

export { toneText, toneBg };

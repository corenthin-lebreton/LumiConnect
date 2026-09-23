"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Basculer le thème"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn(
        "grid size-8 place-items-center rounded-md border border-line-strong bg-card text-foreground",
        "outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}

// Sélecteur segmenté Clair / Sombre du menu mobile.
export function ThemeSegmented() {
  const { resolvedTheme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Clair" },
    { value: "dark", label: "Sombre" },
  ] as const;

  return (
    <div role="radiogroup" aria-label="Thème" className="flex rounded-lg bg-muted p-[3px] text-[0.8125rem] font-medium">
      {options.map((o) => {
        const active = resolvedTheme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex h-[38px] items-center rounded-md px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

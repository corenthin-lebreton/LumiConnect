"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Menu, X } from "lucide-react";
import {
  SERVICES,
  ServiceStatus,
  serviceDot,
  summarize,
  useServiceHealth,
  type ServiceHealth,
} from "./service-status";
import { ThemeSegmented, ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/formations", label: "Formations" },
  { href: "/users", label: "Utilisateurs" },
  { href: "/parametres", label: "Paramètres" },
];

const ICON_BUTTON_CLASS =
  "grid size-11 place-items-center rounded-lg text-foreground outline-none " +
  "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={
          "grid size-[26px] place-items-center rounded-md bg-primary font-mono text-[0.6875rem] " +
          "font-semibold tracking-[-0.02em] text-primary-foreground"
        }
        aria-hidden
      >
        LC
      </span>
      <span className="flex flex-col gap-[3px]">
        <span className={cn("leading-none font-semibold", compact ? "text-[0.9375rem]" : "text-sm")}>
          LumiConnect
        </span>
        {!compact && (
          <span className="font-mono text-[0.59375rem] leading-none font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Lumixen
          </span>
        )}
      </span>
    </span>
  );
}

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Navigation principale" className="hidden self-stretch md:flex md:gap-0.5">
      {navItems.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center px-3 text-[0.84375rem] font-medium outline-none",
              "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              active
                ? "text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileMenu({
  pathname,
  health,
  onClose,
  onLogout,
}: {
  pathname: string;
  health: ServiceHealth;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden" role="dialog" aria-modal="true">
      <div className="flex h-[60px] items-center justify-between border-b border-line-strong bg-surface pr-3 pl-[18px]">
        <Brand compact />
        <button type="button" onClick={onClose} aria-label="Fermer le menu" className={ICON_BUTTON_CLASS}>
          <X className="size-[22px]" aria-hidden />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-4">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-14 items-center justify-between rounded-lg px-3.5 text-lg outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-accent font-semibold text-accent-foreground" : "font-medium"
              )}
            >
              {item.label}
              {active && <span className="size-2 rounded-full bg-primary" aria-hidden />}
            </Link>
          );
        })}
      </nav>

      <div className="mx-6 flex flex-col gap-3.5 border-t border-line pt-[18px]">
        <span className="eyebrow">Services</span>
        {SERVICES.map((s) => {
          const state = health.byService[s.key];
          return (
            <div key={s.key} className="flex justify-between text-sm">
              <span className="flex items-center gap-2.5">
                <span className={cn("size-2 rounded-full", serviceDot[state])} aria-hidden />
                {s.label}
              </span>
              <span
                className={cn(
                  "font-mono text-[0.6875rem] font-medium",
                  state === "ok" ? "text-success" : state === "down" ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {state === "ok" ? "OK" : state === "down" ? "Erreur" : "…"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-3 border-t border-line px-6 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Thème</span>
          <ThemeSegmented />
        </div>
        <button
          type="button"
          onClick={onLogout}
          className={
            "flex h-[46px] items-center justify-center gap-2 rounded-lg border border-line-strong bg-card " +
            "text-[0.90625rem] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          }
        >
          <LogOut className="size-[17px]" aria-hidden />
          Quitter
        </button>
      </div>
    </div>
  );
}

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const health = useServiceHealth();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line-strong bg-surface">
      <div className="mx-auto flex h-[60px] w-full max-w-[100rem] items-center gap-7 pr-3 pl-[18px] md:h-14 md:px-6">
        <Link
          href="/formations"
          className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="md:hidden">
            <Brand compact />
          </span>
          <span className="hidden md:inline">
            <Brand />
          </span>
        </Link>

        <DesktopNav pathname={pathname} />

        <div className="flex-1" />

        <div className="hidden items-center gap-2 md:flex">
          <ServiceStatus health={health} />
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            className={
              "flex h-8 items-center gap-2 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground " +
              "outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            }
          >
            <LogOut className="size-4" aria-hidden />
            Quitter
          </button>
        </div>

        <div className="flex items-center gap-1.5 md:hidden">
          <span className="flex gap-1 px-2" title={summarize(health)}>
            <span className="sr-only">{summarize(health)}</span>
            {SERVICES.map((s) => (
              <span key={s.key} className={cn("size-1.5 rounded-full", serviceDot[health.byService[s.key]])} aria-hidden />
            ))}
          </span>
          <button type="button" onClick={() => setOpen(true)} aria-label="Menu" className={ICON_BUTTON_CLASS}>
            <Menu className="size-[22px]" aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <MobileMenu
          pathname={pathname}
          health={health}
          onClose={() => setOpen(false)}
          onLogout={handleLogout}
        />
      )}
    </header>
  );
}

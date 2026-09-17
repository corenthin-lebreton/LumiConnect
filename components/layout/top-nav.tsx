"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Layers, Users, Menu, Settings, X } from "lucide-react";
import { ServiceStatus } from "./service-status";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/formations", label: "Formations", icon: Layers },
  { href: "/users", label: "Utilisateurs", icon: Users },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

const ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none " +
  "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70";

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Navigation principale" className="hidden flex-1 items-center gap-1 md:flex">
      {navItems.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8rem] font-medium",
              "transition-colors duration-150 ease-out",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-3.5 w-3.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileMenu({
  pathname,
  onClose,
  onLogout,
}: {
  pathname: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background md:hidden">
      <div className="mx-auto max-w-md p-4">
        <div className="mb-8 flex items-center justify-between">
          <span className="display text-base">LumiConnect</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className={ICON_BUTTON_CLASS}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <MobileNavList pathname={pathname} onNavigate={onClose} onLogout={onLogout} />
      </div>
    </div>
  );
}

function MobileNavList({
  pathname,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  return (
    <nav className="panel divide-y divide-line overflow-hidden bg-card">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 px-4 py-3.5 text-sm font-medium",
            pathname.startsWith(item.href) ? "bg-muted text-foreground" : "text-muted-foreground"
          )}
        >
          <item.icon className="h-4 w-4" aria-hidden />
          {item.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-muted-foreground"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Quitter
      </button>
    </nav>
  );
}

function HeaderActions({
  onLogout,
  onOpenMenu,
}: {
  onLogout: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-1 md:ml-0">
      <ServiceStatus />
      <ThemeToggle />
      <Button variant="ghost" size="sm" onClick={onLogout} className="hidden sm:inline-flex">
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Quitter
      </Button>
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Ouvrir le menu"
        className={cn(ICON_BUTTON_CLASS, "md:hidden")}
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[100rem] items-center gap-6 px-4 md:px-6">
        <Link
          href="/formations"
          className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <span className="display text-[0.95rem] leading-none">LumiConnect</span>
        </Link>

        <DesktopNav pathname={pathname} />

        <HeaderActions onLogout={handleLogout} onOpenMenu={() => setOpen(true)} />
      </div>

      {open && (
        <MobileMenu pathname={pathname} onClose={() => setOpen(false)} onLogout={handleLogout} />
      )}
    </header>
  );
}

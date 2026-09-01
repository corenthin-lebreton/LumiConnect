"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Layers, Users, Menu, X } from "lucide-react";
import { ServiceStatus } from "./service-status";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/formations", label: "Formations", icon: Layers },
  { href: "/users", label: "Utilisateurs", icon: Users },
];

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

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ServiceStatus />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="hidden sm:inline-flex"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Quitter
          </Button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 md:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          <div className="mx-auto max-w-md p-4">
            <div className="mb-8 flex items-center justify-between">
              <span className="display text-base">LumiConnect</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <nav className="panel divide-y divide-line overflow-hidden bg-card">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 text-sm font-medium",
                    pathname.startsWith(item.href)
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-muted-foreground"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Quitter
              </button>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

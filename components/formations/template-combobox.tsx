"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ProxmoxTemplate } from "@/types";

interface Props {
  templates: ProxmoxTemplate[];
  value: number;
  onChange: (vmid: number) => void;
  disabled?: boolean;
}

export function TemplateCombobox({ templates, value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.vmid === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        String(t.vmid).includes(q)
    );
  }, [templates, query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        disabled={disabled}
        className={
          "flex h-9 w-full items-center gap-2.5 rounded-md border border-input bg-card pr-2.5 pl-3 " +
          "text-left text-sm outline-none transition-[border-color,box-shadow] duration-150 " +
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/28 " +
          "aria-expanded:border-ring aria-expanded:ring-3 aria-expanded:ring-ring/28 " +
          "disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {selected ? (
          <>
            <span className="font-mono text-[0.78125rem] font-medium text-muted-foreground tabular">
              {selected.vmid}
            </span>
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">Sélectionner un template</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          className={
            "absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-lg border border-line-strong " +
            "bg-popover p-1 shadow-[0_14px_32px_-12px_rgba(30,20,10,0.45)] " +
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 " +
            "motion-safe:duration-150"
          }
        >
          <div className="relative p-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-[15px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un template"
              aria-label="Rechercher un template"
              className="h-8 pl-8"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun template trouvé
              </div>
            ) : (
              groupByFamily(filtered).map(([family, items], index) => (
                <div key={family} className={index > 0 ? "mt-1 border-t border-line" : undefined}>
                  <p className="px-2 pt-2 pb-1 font-mono text-[0.625rem] leading-none font-medium tracking-[0.09em] text-muted-foreground uppercase">
                    {family}
                  </p>
                  {items.map((t) => {
                    const isSelected = t.vmid === value;
                    return (
                      <button
                        key={t.vmid}
                        type="button"
                        onClick={() => {
                          onChange(t.vmid);
                          setOpen(false);
                          setQuery("");
                        }}
                        className={
                          "flex w-full items-center gap-2.5 rounded-sm p-2 text-left outline-none " +
                          "transition-colors duration-150 hover:bg-muted focus-visible:bg-muted " +
                          (isSelected ? "bg-accent text-accent-foreground hover:bg-accent" : "")
                        }
                      >
                        <span
                          className={
                            "w-[34px] shrink-0 font-mono text-xs tabular " +
                            (isSelected ? "font-medium" : "text-muted-foreground")
                          }
                        >
                          {t.vmid}
                        </span>
                        <span className={"flex-1 truncate text-[0.84375rem] " + (isSelected ? "font-medium" : "")}>
                          {t.name}
                        </span>
                        {isSelected && <Check className="size-3.5 shrink-0 [stroke-width:2.25]" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const FAMILY_LABEL: Record<string, string> = { linux: "Linux", windows: "Windows" };

function groupByFamily(templates: ProxmoxTemplate[]): [string, ProxmoxTemplate[]][] {
  const groups = new Map<string, ProxmoxTemplate[]>();
  for (const t of templates) {
    const key = t.os_id ? (FAMILY_LABEL[t.os_id] ?? t.os_id) : "OS non reconnu";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()];
}

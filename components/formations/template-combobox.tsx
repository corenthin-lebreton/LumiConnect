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
          "flex h-10 w-full disabled:cursor-not-allowed disabled:opacity-50 items-center " +
          "justify-between rounded-md border border-line-strong bg-card px-3 py-2 text-sm " +
          "outline-none transition-[border-color,box-shadow] duration-150 " +
          "hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-2 " +
          "focus-visible:ring-ring/25"
        }
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <span className="font-medium">{selected.name}</span>
            <span className="font-mono text-micro text-muted-foreground tabular">
              {selected.vmid}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Sélectionner un template
          </span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          className={
            "panel absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden bg-popover " +
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 " +
            "motion-safe:duration-150"
          }
        >
          <div className="relative border-b border-line bg-muted p-2">
            <Search
              className={
                "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 " +
                "text-muted-foreground"
              }
              aria-hidden
            />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un template…"
              className="h-8 bg-background pl-9"
            />
          </div>
          <div className="max-h-80 divide-y divide-line overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun template trouvé
              </div>
            ) : (
              filtered.map((t) => {
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
                      "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left " +
                      `transition-colors duration-150 hover:bg-muted ${isSelected ? "bg-accent" : ""}`
                    }
                  >
                    <span className="flex flex-col gap-0.5 truncate">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <span className="font-mono text-micro text-muted-foreground tabular">
                        VMID {t.vmid}
                      </span>
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

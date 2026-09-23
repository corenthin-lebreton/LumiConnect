"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, UserPlus } from "lucide-react";
import { ConsoleHead, EmptyState, TableHead } from "@/components/layout/console-head";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

interface User {
  id: string;
  email: string;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchUsers() {
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
      return;
    }
    toast.error(await readError(res, "Impossible de charger les comptes"));
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setUsers(await res.json());
          return;
        }
        toast.error(await readError(res, "Impossible de charger les comptes"));
      })
      .catch(() => {
        if (!cancelled) toast.error("Impossible de charger les comptes");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      setEmail("");
      setPassword("");
      fetchUsers();
    } else {
      toast.error(await readError(res, "Échec de la création du compte"));
    }
    setLoading(false);
  }

  async function handleDelete(userId: string) {
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      fetchUsers();
    } else {
      toast.error(await readError(res, "Échec de la suppression du compte"));
    }
  }

  return (
    <div className="space-y-6">
      <ConsoleHead
        eyebrow="Lumixen"
        title="Utilisateurs"
        subtitle={`${users.length} compte${users.length > 1 ? "s" : ""} actif${users.length > 1 ? "s" : ""} · accès complet à la console`}
      />

      <form
        onSubmit={handleAdd}
        className="panel grid grid-cols-1 items-end gap-3 bg-card px-[18px] py-4 md:grid-cols-[minmax(0,1fr)_240px_auto]"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="prenom.nom@lumixen.fr"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Mot de passe temporaire</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" disabled={loading} className="h-9">
          <UserPlus className="size-4" aria-hidden />
          {loading ? "Création…" : "Créer le compte"}
        </Button>
        <p className="text-xs text-muted-foreground md:col-span-3">
          Le mot de passe temporaire est communiqué hors de la console.
        </p>
      </form>

      <div className="panel overflow-hidden bg-card">
        {users.length === 0 ? (
          <EmptyState count="0 compte" title="Aucun compte pour l’instant">
            Le formulaire ci-dessus crée un compte avec un mot de passe temporaire.
          </EmptyState>
        ) : (
          <>
            <TableHead className={GRID}>
              <span>Compte</span>
              <span>Créé le</span>
              <span>Statut</span>
              <span className="text-right">Actions</span>
            </TableHead>
            <ul>
              {users.map((u) => (
                <li
                  key={u.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-[18px] py-3",
                    "transition-colors duration-150 last:border-b-0 hover:bg-muted md:h-14 md:py-0",
                    GRID
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-muted font-mono text-[0.71875rem] font-medium text-muted-foreground uppercase"
                      aria-hidden
                    >
                      {initials(u.email)}
                    </span>
                    <span className="truncate font-mono text-[0.8125rem]">{u.email}</span>
                  </span>
                  <span className="hidden text-[0.8125rem] text-muted-foreground md:block">
                    {new Date(u.created_at).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="hidden md:block">
                    <Pill tone="success">Actif</Pill>
                  </span>
                  <span className="flex justify-end">
                    <Button
                      variant="destructive-ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(u.id)}
                      aria-label={`Retirer l’accès de ${u.email}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

const GRID = "md:grid-cols-[minmax(0,2.2fr)_1.2fr_1fr_96px]";

function initials(email: string): string {
  const [local] = email.split("@");
  const parts = local.split(/[._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2)) || "?";
}

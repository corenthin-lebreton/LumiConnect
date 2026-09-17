"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, UserPlus } from "lucide-react";
import { ConsoleHead, Slab, TableHead } from "@/components/layout/console-head";

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
    <div className="space-y-8">
      <ConsoleHead
        eyebrow="Administration"
        title="Utilisateurs"
        readouts={[
          {
            label: "Comptes",
            value: String(users.length),
            sub: "accès complet à la console",
          },
        ]}
      />

      <section className="grid gap-x-8 gap-y-4 border-t border-line pt-7 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 className="display text-base">Ajouter un compte</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Le mot de passe temporaire est communiqué hors de la console.
          </p>
        </div>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <Label htmlFor="email" className="eyebrow">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5"
              placeholder="admin@lumixen.fr"
            />
          </div>
          <div>
            <Label htmlFor="password" className="eyebrow">
              Mot de passe temporaire
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={loading} size="lg" className="gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden />
            {loading ? "Ajout…" : "Ajouter"}
          </Button>
        </form>
      </section>

      <Slab title={`Comptes existants (${users.length})`}>
        <div>
          {users.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Aucun compte pour l&apos;instant. Le formulaire ci-dessus en crée un.
            </p>
          ) : (
            <div className="divide-y divide-line">
              <TableHead className="hidden grid-cols-12 md:grid">
                <div className="col-span-7 eyebrow">Adresse e-mail</div>
                <div className="col-span-3 eyebrow">Créé le</div>
                <div className="col-span-2 eyebrow text-right">Action</div>
              </TableHead>
              {users.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-12 items-center gap-4 px-4 py-2.5 transition-colors duration-150 hover:bg-muted"
                >
                  <div className="col-span-7 truncate text-sm font-medium">{u.email}</div>
                  <div className="col-span-3 font-mono text-meta text-muted-foreground tabular">
                    {new Date(u.created_at).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(u.id)}
                      aria-label="Supprimer"
                      className="hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Slab>
    </div>
  );
}

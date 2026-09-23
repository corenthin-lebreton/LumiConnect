"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Identifiants incorrects. Vérifiez l’adresse et réessayez."
          : error.message
      );
      setLoading(false);
      return;
    }

    router.push("/formations");
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-7">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-3">
        <div
          className={
            "grid size-9 place-items-center rounded-lg bg-primary font-mono text-sm font-semibold " +
            "text-primary-foreground"
          }
          aria-hidden
        >
          LC
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-lg leading-none font-semibold">LumiConnect</span>
          <span className="font-mono text-[0.625rem] leading-none font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Lumixen · environnements de formation
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5 rounded-xl border border-line-strong bg-card p-7 shadow-[0_1px_0_var(--line)]">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[1.375rem] leading-tight font-semibold">Connexion</h1>
          <p className="text-[0.84375rem] leading-snug text-muted-foreground">
            Accès réservé aux formateurs et administrateurs Lumixen.
          </p>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-[38px]"
              placeholder="prenom.nom@lumixen.fr"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-[38px] pr-10"
                placeholder="••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className={
                  "absolute top-[3px] right-[3px] grid size-8 place-items-center rounded-md text-muted-foreground " +
                  "outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                }
                aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </div>
          <Button type="submit" className="h-10 w-full text-sm" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </Button>
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2.5 rounded-md bg-destructive/10 px-3 py-2.5 text-[0.8125rem] leading-snug text-destructive"
            >
              <span className="mt-[5px] size-[7px] shrink-0 rounded-[2px] bg-destructive" aria-hidden />
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

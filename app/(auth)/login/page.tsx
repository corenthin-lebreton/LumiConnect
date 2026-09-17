"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ArrowRight, Eye, EyeOff, Mail, Lock } from "lucide-react";

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
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/formations");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="mb-7">
        <p className="eyebrow">Lumixen</p>
        <h1 className="display mt-2 text-2xl">LumiConnect</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Console interne, accès restreint aux formateurs.
        </p>
      </div>

      <div className="panel bg-card p-5">
        <h2 className="display text-base">Connexion</h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Authentifiez-vous avec votre compte formateur.
        </p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="email" className="eyebrow">
              Adresse e-mail
            </Label>
            <div className="relative mt-1.5">
              <Mail
                className={
                  "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 " +
                  "text-muted-foreground"
                }
                aria-hidden
              />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-10 pl-9"
                placeholder="prenom.nom@lumixen.fr"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="password" className="eyebrow">
              Mot de passe
            </Label>
            <div className="relative mt-1.5">
              <Lock
                className={
                  "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 " +
                  "text-muted-foreground"
                }
                aria-hidden
              />
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10 pl-9 pr-10"
                placeholder="••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className={
                  "absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center " +
                  "rounded-md text-muted-foreground outline-none transition-colors duration-150 " +
                  "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                }
                aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPw ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className={
                "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 " +
                "text-xs font-medium text-destructive"
              }
            >
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full gap-1.5" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
            {!loading && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </form>
      </div>

    </div>
  );
}

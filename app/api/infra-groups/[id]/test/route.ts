import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { infraGroupPatchSchema } from "@/lib/schemas";
import { loadInfraRow, probeInfra, secretRequiredForNewUrl, toConfig } from "@/lib/infra/groups";
import type { InfraGroupRow } from "@/types";

// Teste la configuration stockée, ou les valeurs du formulaire d'édition si un corps est fourni.
// Les secrets absents du corps sont repris du groupe : on ne les renvoie jamais au navigateur.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await loadInfraRow(id);
  if (!row) return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });

  const body = await request.json().catch(() => null);
  let merged: InfraGroupRow = row;

  if (body !== null) {
    const parsed = infraGroupPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Formulaire invalide, corriger avant de tester" }, { status: 400 });
    }
    const secretMissing = secretRequiredForNewUrl(row, parsed.data);
    if (secretMissing) return NextResponse.json({ error: secretMissing }, { status: 400 });

    const overrides = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined)
    );
    merged = { ...row, ...overrides };
    // Les secrets saisis dans le formulaire arrivent en clair, decryptSecret les laisse tels quels.
  }

  return NextResponse.json(await probeInfra(toConfig(merged)));
}

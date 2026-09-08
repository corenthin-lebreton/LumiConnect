import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { infraGroupSchema } from "@/lib/schemas";
import { probeInfra, toConfig } from "@/lib/infra/groups";
import type { InfraGroupRow } from "@/types";

// Teste une configuration avant de l'enregistrer (formulaire de création).
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = infraGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Formulaire invalide, corriger avant de tester" }, { status: 400 });
  }

  const row: InfraGroupRow = {
    id: "",
    created_by: null,
    created_at: "",
    updated_at: "",
    ...parsed.data,
  };

  return NextResponse.json(await probeInfra(toConfig(row)));
}

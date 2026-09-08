import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { infraGroupSchema } from "@/lib/schemas";
import { encryptSecrets, listInfraRows, toSummary } from "@/lib/infra/groups";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await listInfraRows();
    return NextResponse.json(rows.map(toSummary));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = infraGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("infra_groups")
    .insert({ ...encryptSecrets(parsed.data), created_by: user.id })
    .select("*, formations(count)")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "Un groupe porte déjà ce nom" : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(toSummary(data), { status: 201 });
}

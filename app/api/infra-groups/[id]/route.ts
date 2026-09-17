import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { infraGroupPatchSchema } from "@/lib/schemas";
import { encryptSecrets, loadInfraRow, secretRequiredForNewUrl, toSummary } from "@/lib/infra/groups";

type Params = { params: Promise<{ id: string }> };

async function authenticate() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await authenticate())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("infra_groups")
    .select("*, formations(count)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  return NextResponse.json(toSummary(data));
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await authenticate())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = infraGroupPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const row = await loadInfraRow(id);
  if (!row) return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });

  const secretMissing = secretRequiredForNewUrl(row, parsed.data);
  if (secretMissing) return NextResponse.json({ error: secretMissing }, { status: 400 });

  const patch = Object.fromEntries(
    Object.entries(encryptSecrets(parsed.data)).filter(([, value]) => value !== undefined)
  );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("infra_groups")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, formations(count)")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "Un groupe porte déjà ce nom" : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(toSummary(data));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await authenticate())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("formations")
    .select("id", { count: "exact", head: true })
    .eq("infra_group_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      {
        error:
          `${count} formation${count > 1 ? "s" : ""} rattachée${count > 1 ? "s" : ""} ` +
          "à ce groupe. Les supprimer d'abord.",
      },
      { status: 409 }
    );
  }

  const { data, error } = await admin.from("infra_groups").delete().eq("id", id).select("id");
  if (error) {
    const status = error.code === "23503" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

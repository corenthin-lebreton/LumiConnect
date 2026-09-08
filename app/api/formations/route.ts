import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formationSchema } from "@/lib/schemas";
import { encryptSecret } from "@/lib/crypto";
import { loadRegistry } from "@/lib/scripts/registry";
import { resolveSelection } from "@/lib/scripts/resolve";
import { loadInfraRow } from "@/lib/infra/groups";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("formations")
    .select("*, formation_vms(count)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = formationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const { script_ids, ...formationData } = parsed.data;

  try {
    if (!(await loadInfraRow(formationData.infra_group_id))) {
      return NextResponse.json({ error: "Groupe d'infrastructure introuvable" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  let resolvedIds: string[] = [];
  if (formationData.os_id) {
    try {
      const registry = await loadRegistry(formationData.os_id);
      resolvedIds = resolveSelection(registry, script_ids).map((entry) => entry.id);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  } else if (script_ids.length > 0) {
    return NextResponse.json(
      { error: "Des scripts ont été sélectionnés alors que le template n'expose aucun os_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("formations")
    .insert({
      ...formationData,
      vm_password: encryptSecret(formationData.vm_password),
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (resolvedIds.length > 0) {
    const { error: scriptsError } = await supabase.from("formation_scripts").insert(
      resolvedIds.map((script_id, position) => ({
        formation_id: data.id,
        script_id,
        position,
      }))
    );

    if (scriptsError) {
      await supabase.from("formations").delete().eq("id", data.id);
      return NextResponse.json(
        { error: `Enregistrement des scripts impossible : ${scriptsError.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(data, { status: 201 });
}

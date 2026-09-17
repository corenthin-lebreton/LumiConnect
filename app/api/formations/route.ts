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

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// Les scripts n'ont de sens qu'avec un os_id : sans registre, toute sélection est refusée.
async function resolveScriptIds(
  osId: string | null | undefined,
  scriptIds: string[]
): Promise<{ ids: string[] } | { response: NextResponse }> {
  if (!osId) {
    if (scriptIds.length === 0) return { ids: [] };
    return {
      response: NextResponse.json(
        { error: "Des scripts ont été sélectionnés alors que le template n'expose aucun os_id" },
        { status: 400 }
      ),
    };
  }

  try {
    const registry = await loadRegistry(osId);
    return { ids: resolveSelection(registry, scriptIds).map((entry) => entry.id) };
  } catch (e) {
    return { response: NextResponse.json({ error: (e as Error).message }, { status: 400 }) };
  }
}

// Échec d'insertion des scripts : la formation orpheline est supprimée pour rester cohérent.
async function insertFormationScripts(
  supabase: ServerClient,
  formationId: string,
  scriptIds: string[]
): Promise<NextResponse | null> {
  if (scriptIds.length === 0) return null;

  const { error: scriptsError } = await supabase.from("formation_scripts").insert(
    scriptIds.map((script_id, position) => ({
      formation_id: formationId,
      script_id,
      position,
    }))
  );

  if (!scriptsError) return null;

  await supabase.from("formations").delete().eq("id", formationId);
  return NextResponse.json(
    { error: `Enregistrement des scripts impossible : ${scriptsError.message}` },
    { status: 500 }
  );
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

  const resolved = await resolveScriptIds(formationData.os_id, script_ids);
  if ("response" in resolved) return resolved.response;

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

  const scriptsFailed = await insertFormationScripts(supabase, data.id, resolved.ids);
  if (scriptsFailed) return scriptsFailed;

  return NextResponse.json(data, { status: 201 });
}

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTemplates } from "@/lib/services/proxmox";
import { loadInfraRow, toConfig } from "@/lib/infra/groups";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groupId = new URL(request.url).searchParams.get("group_id");
  if (!groupId) {
    return NextResponse.json({ error: "Paramètre group_id requis" }, { status: 400 });
  }

  let row;
  try {
    row = await loadInfraRow(groupId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Groupe d'infrastructure introuvable" }, { status: 404 });

  const result = await getTemplates(toConfig(row).proxmox);
  if (!result.success) {
    console.error("[proxmox/templates]", result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}

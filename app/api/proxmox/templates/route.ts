import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTemplates } from "@/lib/services/proxmox";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await getTemplates();
  if (!result.success) {
    console.error("[proxmox/templates]", result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}

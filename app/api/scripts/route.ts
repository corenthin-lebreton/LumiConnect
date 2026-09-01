import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadRegistry } from "@/lib/scripts/registry";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const osId = new URL(request.url).searchParams.get("os_id");
  if (!osId) {
    return NextResponse.json({ error: "Paramètre os_id requis" }, { status: 400 });
  }

  try {
    const registry = await loadRegistry(osId);
    return NextResponse.json({
      os_id: registry.os_id,
      shell: registry.shell,
      scripts: registry.scripts.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.description ?? null,
        mandatory: entry.mandatory,
        requires: entry.requires,
        timeout_sec: entry.timeout_sec,
        reboot_after: entry.reboot_after,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

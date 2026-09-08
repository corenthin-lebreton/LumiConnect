import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listInfraRows, probeInfra, toConfig } from "@/lib/infra/groups";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rows;
  try {
    rows = await listInfraRows();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const groups = await Promise.all(
    rows.map(async (row) => {
      const config = toConfig(row);
      const health = await probeInfra(config);
      return { id: row.id, name: row.name, ...health };
    })
  );

  return NextResponse.json({ groups });
}

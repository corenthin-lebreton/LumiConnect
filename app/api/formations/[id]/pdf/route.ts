import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePdf } from "@/lib/services/pdf";
import type { Formation, FormationVm } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: formation } = await supabase
    .from("formations")
    .select("*")
    .eq("id", id)
    .single();

  if (!formation) {
    return NextResponse.json({ error: "Formation not found" }, { status: 404 });
  }

  const { data: vms } = await supabase
    .from("formation_vms")
    .select("*")
    .eq("formation_id", id)
    .order("vmid");

  const pdfBuffer = await generatePdf(
    formation as Formation,
    (vms ?? []) as FormationVm[]
  );

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${formation.name}-credentials.pdf"`,
    },
  });
}

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { JobAlreadyQueuedError, enqueue } from "@/lib/queue";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { confirmName } = body;

  const { data: formation } = await supabase
    .from("formations")
    .select("name")
    .eq("id", id)
    .single();

  if (!formation) {
    return NextResponse.json({ error: "Formation not found" }, { status: 404 });
  }

  if (confirmName !== formation.name) {
    return NextResponse.json({ error: "Confirmation name does not match" }, { status: 400 });
  }

  try {
    await enqueue("cleanup", id);
  } catch (err) {
    if (err instanceof JobAlreadyQueuedError) {
      return NextResponse.json({ message: "Already processing" }, { status: 202 });
    }
    return NextResponse.json({ error: String((err as Error).message) }, { status: 500 });
  }

  await supabase
    .from("formations")
    .update({ status: "deleting", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ message: "Deletion queued" });
}

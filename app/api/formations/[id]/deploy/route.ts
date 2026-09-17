import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JobAlreadyQueuedError, enqueue } from "@/lib/queue";

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// Vérifie que la formation existe, est rattachée à une infra et encore en brouillon.
async function checkDeployable(supabase: ServerClient, id: string): Promise<NextResponse | null> {
  const { data: formation, error } = await supabase
    .from("formations")
    .select("id, status, infra_group_id")
    .eq("id", id)
    .single();

  if (error || !formation) {
    return NextResponse.json({ error: "Formation not found" }, { status: 404 });
  }

  if (!formation.infra_group_id) {
    return NextResponse.json(
      { error: "Cette formation n'est rattachée à aucun groupe d'infrastructure" },
      { status: 409 }
    );
  }

  if (formation.status !== "draft") {
    return NextResponse.json(
      { error: "Formation must be in draft status. Delete and recreate to redeploy." },
      { status: 400 }
    );
  }

  return null;
}

// Passage draft → deploying conditionnel : une seule requête concurrente l'emporte.
async function claimDraft(supabase: ServerClient, id: string): Promise<NextResponse | null> {
  const { data: claimed, error: claimErr } = await supabase
    .from("formations")
    .update({ status: "deploying", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ message: "Already deploying" }, { status: 202 });
  }
  return null;
}

async function enqueueOrRollback(id: string): Promise<NextResponse> {
  try {
    await enqueue("deploy", id);
  } catch (err) {
    if (err instanceof JobAlreadyQueuedError) {
      return NextResponse.json({ message: "Already deploying" }, { status: 202 });
    }

    const admin = createAdminClient();
    await admin
      .from("formations")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ error: String((err as Error).message) }, { status: 500 });
  }

  return NextResponse.json({ message: "Deployment queued" });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notDeployable = await checkDeployable(supabase, id);
  if (notDeployable) return notDeployable;

  const notClaimed = await claimDraft(supabase, id);
  if (notClaimed) return notClaimed;

  return enqueueOrRollback(id);
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import { NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import * as guacamole from "@/lib/services/guacamole";

const pfsenseCa = readFileSync(path.join(process.cwd(), "lib/services/pfsense-ca.pem"), "utf8");
const pfsenseCn = new X509Certificate(pfsenseCa).subject
  .split("\n")
  .find((line) => line.startsWith("CN="))
  ?.slice(3);
const pfsenseAgent = new Agent({ connect: { ca: pfsenseCa, servername: pfsenseCn } });

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results: Record<string, { ok: boolean; error?: string }> = {};

  try {
    const res = await fetch(
      `${process.env.PROXMOX_URL}/api2/json/nodes/${process.env.PROXMOX_NODE}/status`,
      {
        headers: {
          Authorization: `PVEAPIToken=${process.env.PROXMOX_TOKEN_ID}=${process.env.PROXMOX_TOKEN_SECRET}`,
        },
      }
    );
    results.proxmox = res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    results.proxmox = { ok: false, error: (e as Error).message };
  }

  try {
    const res = await undiciFetch(`${process.env.PFSENSE_URL}/api/v2/status/system`, {
      headers: {
        "X-API-Key": process.env.PFSENSE_API_KEY!,
        "X-API-Secret": process.env.PFSENSE_API_SECRET!,
      },
      dispatcher: pfsenseAgent,
    });
    results.pfsense = res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    results.pfsense = { ok: false, error: (e as Error).message };
  }

  const guacResult = await guacamole.ping();
  results.guacamole = guacResult.success ? { ok: true } : { ok: false, error: guacResult.error };

  return NextResponse.json(results);
}

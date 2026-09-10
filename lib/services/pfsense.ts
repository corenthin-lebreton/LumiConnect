import type { Agent } from "undici";
import { fetch as undiciFetch } from "undici";
import type { PfsenseConfig, ServiceResult } from "@/types";
import { describeFetchError } from "@/lib/services/fetch-error";
import { tlsAgent } from "@/lib/services/tls";

const PROBE_TIMEOUT_MS = 10_000;

export async function ping(pfsense: PfsenseConfig): Promise<ServiceResult> {
  let dispatcher: Agent | null;
  try {
    // Certificat pfSense auto-signé : le CN du PEM est aussi le nom présenté par la feuille.
    dispatcher = tlsAgent(pfsense, PROBE_TIMEOUT_MS, true);
  } catch (e) {
    return { success: false, error: `certificat CA invalide : ${(e as Error).message}` };
  }

  try {
    const res = await undiciFetch(`${pfsense.url}/api/v2/status/system`, {
      headers: { "X-API-Key": pfsense.apiKey },
      dispatcher: dispatcher ?? undefined,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok ? { success: true } : { success: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: describeFetchError(e) };
  } finally {
    await dispatcher?.close();
  }
}

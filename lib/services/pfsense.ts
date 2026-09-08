import { X509Certificate } from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";
import type { PfsenseConfig, ServiceResult } from "@/types";
import { describeFetchError } from "@/lib/services/fetch-error";

const PROBE_TIMEOUT_MS = 10_000;

function dispatcherFor(pfsense: PfsenseConfig): Agent {
  if (pfsense.insecureTls) {
    return new Agent({ connect: { rejectUnauthorized: false }, connectTimeout: PROBE_TIMEOUT_MS });
  }
  if (!pfsense.caPem) {
    return new Agent({ connectTimeout: PROBE_TIMEOUT_MS });
  }
  const servername = new X509Certificate(pfsense.caPem).subject
    .split("\n")
    .find((line) => line.startsWith("CN="))
    ?.slice(3);
  return new Agent({ connect: { ca: pfsense.caPem, servername }, connectTimeout: PROBE_TIMEOUT_MS });
}

export async function ping(pfsense: PfsenseConfig): Promise<ServiceResult> {
  let dispatcher: Agent;
  try {
    dispatcher = dispatcherFor(pfsense);
  } catch (e) {
    return { success: false, error: `certificat CA invalide : ${(e as Error).message}` };
  }

  try {
    const res = await undiciFetch(`${pfsense.url}/api/v2/status/system`, {
      headers: { "X-API-Key": pfsense.apiKey },
      dispatcher,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok ? { success: true } : { success: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: describeFetchError(e) };
  } finally {
    await dispatcher.close();
  }
}

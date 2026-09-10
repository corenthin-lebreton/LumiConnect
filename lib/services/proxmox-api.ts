import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import type { ProxmoxConfig } from "@/types";
import { cachedTlsAgent } from "@/lib/services/tls";

export const POLL_INTERVAL_MS = 2000;
const CONNECT_TIMEOUT_MS = 10_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pveFetch(proxmox: ProxmoxConfig, path: string, options: RequestInit = {}) {
  // Proxmox sert un certificat signé par sa CA interne : sans dispatcher dédié, la confiance
  // système rejette la chaîne (UNABLE_TO_VERIFY_LEAF_SIGNATURE).
  const dispatcher = cachedTlsAgent(proxmox, CONNECT_TIMEOUT_MS);
  const init = {
    ...options,
    headers: {
      Authorization: `PVEAPIToken=${proxmox.tokenId}=${proxmox.tokenSecret}`,
      ...options.headers,
    },
  };
  const url = `${proxmox.url}/api2/json${path}`;
  const res = dispatcher
    ? await undiciFetch(url, { ...(init as UndiciRequestInit), dispatcher })
    : await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Proxmox ${res.status}: ${text}`);
  }
  return res.json();
}

export function form(
  body: Record<string, string> | URLSearchParams,
  method: "POST" | "PUT" = "POST"
): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  };
}

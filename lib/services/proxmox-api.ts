import type { ProxmoxConfig } from "@/types";

export const POLL_INTERVAL_MS = 2000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pveFetch(proxmox: ProxmoxConfig, path: string, options: RequestInit = {}) {
  const res = await fetch(`${proxmox.url}/api2/json${path}`, {
    ...options,
    headers: {
      Authorization: `PVEAPIToken=${proxmox.tokenId}=${proxmox.tokenSecret}`,
      ...options.headers,
    },
  });
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

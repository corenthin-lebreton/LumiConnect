const PROXMOX_URL = process.env.PROXMOX_URL!;
const PROXMOX_TOKEN_ID = process.env.PROXMOX_TOKEN_ID!;
const PROXMOX_TOKEN_SECRET = process.env.PROXMOX_TOKEN_SECRET!;

export const PROXMOX_NODE = process.env.PROXMOX_NODE!;

export const POLL_INTERVAL_MS = 2000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pveFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${PROXMOX_URL}/api2/json${path}`, {
    ...options,
    headers: {
      Authorization: `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`,
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

import type { ServiceResult } from "@/types";

const PFSENSE_URL = process.env.PFSENSE_URL!;
const PFSENSE_API_KEY = process.env.PFSENSE_API_KEY!;
const PFSENSE_API_SECRET = process.env.PFSENSE_API_SECRET!;
const PFSENSE_DHCP_INTERFACE = process.env.PFSENSE_DHCP_INTERFACE!;

async function pfSenseFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${PFSENSE_URL}${path}`, {
    ...options,
    headers: {
      "X-API-Key": PFSENSE_API_KEY,
      "X-API-Secret": PFSENSE_API_SECRET,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pfSense ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createDhcpLease(
  mac: string,
  ip: string,
  hostname: string
): Promise<ServiceResult<{ id: string }>> {
  try {
    const data = await pfSenseFetch(
      `/api/v2/services/dhcp_server/static_mapping`,
      {
        method: "POST",
        body: JSON.stringify({
          parent_id: PFSENSE_DHCP_INTERFACE,
          mac,
          ipaddr: ip,
          hostname,
        }),
      }
    );
    return { success: true, data: { id: data.data?.id ?? data.id } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteDhcpLease(id: string): Promise<ServiceResult> {
  try {
    await pfSenseFetch(`/api/v2/services/dhcp_server/static_mapping`, {
      method: "DELETE",
      body: JSON.stringify({ id, parent_id: PFSENSE_DHCP_INTERFACE }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteDhcpLeasesBulk(
  ids: string[]
): Promise<ServiceResult<{ deleted: string[]; failed: { id: string; error: string }[] }>> {
  if (ids.length === 0) return { success: true, data: { deleted: [], failed: [] } };

  const sorted = [...ids].sort((a, b) => Number(b) - Number(a));
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of sorted) {
    const r = await deleteDhcpLease(id);
    if (r.success) {
      deleted.push(id);
    } else {
      failed.push({ id, error: r.error ?? "unknown" });
      console.error(`[pfsense] deleteDhcpLease FAILED id=${id}:`, r.error);
    }
  }

  const applyResult = await applyDhcpChanges();
  if (!applyResult.success) {
    console.error("[pfsense] applyDhcpChanges failed during bulk delete:", applyResult.error);
  }

  return {
    success: failed.length === 0,
    data: { deleted, failed },
    error: failed.length > 0 ? `${failed.length}/${ids.length} delete failed` : undefined,
  };
}

export async function applyDhcpChanges(): Promise<ServiceResult> {
  try {
    await pfSenseFetch(`/api/v2/services/dhcp_server/apply`, { method: "POST" });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

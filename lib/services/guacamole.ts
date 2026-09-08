import type { GuacamoleConfig, ServiceResult } from "@/types";
import { describeFetchError } from "@/lib/services/fetch-error";

const TOKEN_TTL_MS = 10 * 60 * 1000;

// Un token par serveur et par compte : deux groupes pointant sur des Guacamole différents ne
// doivent jamais se partager une session.
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

function cacheKey(guac: GuacamoleConfig): string {
  return `${guac.url}\u0000${guac.adminUser}\u0000${guac.adminPassword}`;
}

export function clearTokenCache(): void {
  tokenCache.clear();
}

async function getToken(guac: GuacamoleConfig): Promise<string> {
  const key = cacheKey(guac);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const res = await fetch(`${guac.url}/api/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: guac.adminUser, password: guac.adminPassword }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Guacamole auth failed: ${res.status}`);
  const data = await res.json();
  tokenCache.set(key, { value: data.authToken, expiresAt: Date.now() + TOKEN_TTL_MS });
  return data.authToken;
}

async function guacFetch(guac: GuacamoleConfig, path: string, options: RequestInit = {}) {
  const token = await getToken(guac);
  const res = await fetch(
    `${guac.url}/api/session/data/${guac.datasource}${path}?token=${token}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guacamole ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function createConnectionGroup(
  guac: GuacamoleConfig,
  name: string,
  parentId = "ROOT"
): Promise<ServiceResult<{ identifier: string }>> {
  try {
    const data = await guacFetch(guac, "/connectionGroups", {
      method: "POST",
      body: JSON.stringify({
        parentIdentifier: parentId,
        name,
        type: "ORGANIZATIONAL",
        attributes: {
          "max-connections": "",
          "max-connections-per-user": "",
          "enable-session-affinity": "",
        },
      }),
    });
    return { success: true, data: { identifier: data.identifier } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function createRdpConnection(
  guac: GuacamoleConfig,
  name: string,
  hostname: string,
  port: number,
  username: string,
  password: string,
  groupId: string
): Promise<ServiceResult<{ identifier: string }>> {
  try {
    const data = await guacFetch(guac, "/connections", {
      method: "POST",
      body: JSON.stringify({
        parentIdentifier: groupId,
        name,
        protocol: "rdp",
        parameters: {
          hostname,
          port: String(port),
          username,
          password,
          "ignore-cert": "true",
          security: "",
          "clipboard-encoding": "",
          "color-depth": "",
          "console": "",
          "console-audio": "",
          "create-drive-path": "",
          "create-recording-path": "",
          "cursor": "",
          "disable-audio": "",
          "disable-auth": "",
          "disable-copy": "",
          "disable-download": "",
          "disable-paste": "",
          "disable-upload": "",
          "dpi": "",
          "enable-audio": "",
          "enable-audio-input": "",
          "enable-desktop-composition": "",
          "enable-drive": "",
          "enable-font-smoothing": "",
          "enable-full-window-drag": "",
          "enable-menu-animations": "",
          "enable-printing": "",
          "enable-theming": "",
          "enable-touch": "",
          "enable-wallpaper": "",
          "force-lossless": "",
          "height": "",
          "normalize-clipboard": "",
          "read-only": "",
          "resize-method": "",
          "server-layout": "fr-fr-azerty",
          "timezone": null,
          "width": "",
        },
        attributes: {
          "failover-only": "",
          "guacd-encryption": "",
          "guacd-hostname": "",
          "guacd-port": "",
          "max-connections": "",
          "max-connections-per-user": "",
          "weight": "",
        },
      }),
    });
    return { success: true, data: { identifier: data.identifier } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function createUserGroup(
  guac: GuacamoleConfig,
  name: string
): Promise<ServiceResult<{ identifier: string }>> {
  try {
    await guacFetch(guac, "/userGroups", {
      method: "POST",
      body: JSON.stringify({
        identifier: name,
        attributes: { disabled: "" },
      }),
    });
    return { success: true, data: { identifier: name } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function createUser(
  guac: GuacamoleConfig,
  username: string,
  password: string,
  formationName = ""
): Promise<ServiceResult> {
  try {
    await guacFetch(guac, "/users", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        attributes: {
          disabled: "",
          expired: "",
          "access-window-start": "",
          "access-window-end": "",
          "valid-from": "",
          "valid-until": "",
          timezone: null,
          "guac-full-name": username,
          "guac-organization": formationName,
          "guac-organizational-role": "",
        },
      }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function addUserToGroup(
  guac: GuacamoleConfig,
  username: string,
  groupName: string
): Promise<ServiceResult> {
  try {
    await guacFetch(guac, `/users/${encodeURIComponent(username)}/userGroups`, {
      method: "PATCH",
      body: JSON.stringify([
        { op: "add", path: "/", value: groupName },
      ]),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function assignConnectionPermission(
  guac: GuacamoleConfig,
  username: string,
  connectionId: string,
  connectionGroupId?: string
): Promise<ServiceResult> {
  try {
    const patches: { op: string; path: string; value: string }[] = [
      {
        op: "add",
        path: `/connectionPermissions/${connectionId}`,
        value: "READ",
      },
    ];
    if (connectionGroupId) {
      patches.push({
        op: "add",
        path: `/connectionGroupPermissions/${connectionGroupId}`,
        value: "READ",
      });
    }
    await guacFetch(guac, `/users/${encodeURIComponent(username)}/permissions`, {
      method: "PATCH",
      body: JSON.stringify(patches),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteUser(guac: GuacamoleConfig, username: string): Promise<ServiceResult> {
  try {
    await guacFetch(guac, `/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteUserGroup(guac: GuacamoleConfig, name: string): Promise<ServiceResult> {
  try {
    await guacFetch(guac, `/userGroups/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteConnection(guac: GuacamoleConfig, id: string): Promise<ServiceResult> {
  try {
    await guacFetch(guac, `/connections/${id}`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function findConnectionGroupByName(
  guac: GuacamoleConfig,
  name: string,
  parentId = "ROOT"
): Promise<ServiceResult<{ identifier: string } | null>> {
  try {
    const data = await guacFetch(guac, `/connectionGroups`);
    const list = Array.isArray(data) ? data : Object.values(data ?? {});
    const match = (list as Array<{ identifier: string; name: string; parentIdentifier?: string }>).find(
      (g) => g.name === name && (g.parentIdentifier ?? "ROOT") === parentId
    );
    return { success: true, data: match ? { identifier: match.identifier } : null };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function findUserGroupByName(
  guac: GuacamoleConfig,
  name: string
): Promise<ServiceResult<{ identifier: string } | null>> {
  try {
    const data = await guacFetch(guac, `/userGroups`);
    const list = Array.isArray(data) ? data : Object.values(data ?? {});
    const match = (list as Array<{ identifier: string }>).find(
      (g) => g.identifier === name
    );
    return { success: true, data: match ? { identifier: match.identifier } : null };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteConnectionGroup(guac: GuacamoleConfig, id: string): Promise<ServiceResult> {
  try {
    await guacFetch(guac, `/connectionGroups/${id}`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function ping(guac: GuacamoleConfig): Promise<ServiceResult> {
  try {
    await getToken(guac);
    return { success: true };
  } catch (e) {
    return { success: false, error: describeFetchError(e) };
  }
}

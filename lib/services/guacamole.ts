import type { ServiceResult } from "@/types";

const GUACAMOLE_URL = process.env.GUACAMOLE_URL!;
const GUACAMOLE_ADMIN_USER = process.env.GUACAMOLE_ADMIN_USER!;
const GUACAMOLE_ADMIN_PASSWORD = process.env.GUACAMOLE_ADMIN_PASSWORD!;
const GUACAMOLE_DATASOURCE = process.env.GUACAMOLE_DATASOURCE!;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const res = await fetch(`${GUACAMOLE_URL}/api/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: GUACAMOLE_ADMIN_USER,
      password: GUACAMOLE_ADMIN_PASSWORD,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Guacamole auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { value: data.authToken, expiresAt: Date.now() + 10 * 60 * 1000 };
  return data.authToken;
}

async function guacFetch(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const ds = GUACAMOLE_DATASOURCE;
  const res = await fetch(
    `${GUACAMOLE_URL}/api/session/data/${ds}${path}?token=${token}`,
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
  name: string,
  parentId = "ROOT"
): Promise<ServiceResult<{ identifier: string }>> {
  try {
    const data = await guacFetch("/connectionGroups", {
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
  name: string,
  hostname: string,
  port: number,
  username: string,
  password: string,
  groupId: string
): Promise<ServiceResult<{ identifier: string }>> {
  try {
    const data = await guacFetch("/connections", {
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
  name: string
): Promise<ServiceResult<{ identifier: string }>> {
  try {
    await guacFetch("/userGroups", {
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
  username: string,
  password: string,
  formationName = ""
): Promise<ServiceResult> {
  try {
    await guacFetch("/users", {
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
  username: string,
  groupName: string
): Promise<ServiceResult> {
  try {
    await guacFetch(`/users/${encodeURIComponent(username)}/userGroups`, {
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
    await guacFetch(`/users/${encodeURIComponent(username)}/permissions`, {
      method: "PATCH",
      body: JSON.stringify(patches),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteUser(username: string): Promise<ServiceResult> {
  try {
    await guacFetch(`/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteUserGroup(name: string): Promise<ServiceResult> {
  try {
    await guacFetch(`/userGroups/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteConnection(id: string): Promise<ServiceResult> {
  try {
    await guacFetch(`/connections/${id}`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function findConnectionGroupByName(
  name: string,
  parentId = "ROOT"
): Promise<ServiceResult<{ identifier: string } | null>> {
  try {
    const data = await guacFetch(`/connectionGroups`);
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
  name: string
): Promise<ServiceResult<{ identifier: string } | null>> {
  try {
    const data = await guacFetch(`/userGroups`);
    const list = Array.isArray(data) ? data : Object.values(data ?? {});
    const match = (list as Array<{ identifier: string }>).find(
      (g) => g.identifier === name
    );
    return { success: true, data: match ? { identifier: match.identifier } : null };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteConnectionGroup(id: string): Promise<ServiceResult> {
  try {
    await guacFetch(`/connectionGroups/${id}`, { method: "DELETE" });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function ping(): Promise<ServiceResult> {
  try {
    await getToken();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

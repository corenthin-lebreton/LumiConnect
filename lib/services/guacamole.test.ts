import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTokenCache, createRdpConnection, ping } from "./guacamole";
import type { GuacamoleConfig } from "@/types";

const a: GuacamoleConfig = { url: "http://guac-a", datasource: "postgresql", adminUser: "admin", adminPassword: "pa" };
const b: GuacamoleConfig = { url: "http://guac-b", datasource: "postgresql", adminUser: "admin", adminPassword: "pb" };

describe("cache de token Guacamole", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearTokenCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      new Response(JSON.stringify({ authToken: `token-for-${url}` }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("réutilise le token d'un même serveur", async () => {
    await ping(a);
    await ping(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ne partage jamais un token entre deux serveurs", async () => {
    await ping(a);
    await ping(b);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("http://guac-a/api/tokens");
    expect(fetchMock.mock.calls[1][0]).toBe("http://guac-b/api/tokens");
  });

  it("remonte l'échec d'authentification", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));
    const result = await ping(a);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/403/);
  });
});

describe("création d'une connexion RDP", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearTokenCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      const body = url.includes("/api/tokens")
        ? { authToken: "token" }
        : { identifier: "42" };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  async function postedParameters() {
    const result = await createRdpConnection(a, {
      name: "CODA 1234567-204",
      hostname: "10.0.0.4",
      port: 3389,
      username: "stagiaire",
      password: "secret",
      groupId: "7",
      drivePath: "/drive/coda-1234567-204",
    });
    expect(result.success).toBe(true);
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/connections"))!;
    return JSON.parse(call[1].body).parameters;
  }

  it("active le lecteur réseau Shared", async () => {
    const parameters = await postedParameters();
    expect(parameters["enable-drive"]).toBe("true");
    expect(parameters["drive-name"]).toBe("Shared");
    expect(parameters["create-drive-path"]).toBe("true");
  });

  it("monte un chemin de lecteur propre à la VM", async () => {
    const parameters = await postedParameters();
    expect(parameters["drive-path"]).toBe("/drive/coda-1234567-204");
  });
});

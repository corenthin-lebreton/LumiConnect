import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTokenCache, ping } from "./guacamole";
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

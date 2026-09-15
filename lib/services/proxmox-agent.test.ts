import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGuestCommand, sanitizeForAgent } from "@/lib/services/proxmox-agent";
import type { ProxmoxConfig } from "@/types";

describe("sanitizeForAgent", () => {
  it("laisse l'ASCII et le latin-1 intacts", () => {
    const content = "Write-Host 'déjà configuré, coût 5€'";
    expect(sanitizeForAgent(content)).toBe(content.replace("€", "?"));
  });

  it("remplace la ponctuation typographique par son équivalent ASCII", () => {
    expect(sanitizeForAgent("a — b – c")).toBe("a - b - c");
    expect(sanitizeForAgent("‘x’ “y”")).toBe("'x' \"y\"");
    expect(sanitizeForAgent("suite…")).toBe("suite...");
  });

  it("supprime le BOM", () => {
    expect(sanitizeForAgent("﻿param()")).toBe("param()");
  });

  it("replie les caractères composés vers leur base latin-1", () => {
    expect(sanitizeForAgent("Ā")).toBe("A");
  });

  it("remplace par ? ce qui n'a pas d'équivalent latin-1", () => {
    expect(sanitizeForAgent("ok 你好")).toBe("ok ??");
    expect(sanitizeForAgent("\u{1F600}")).toBe("??");
  });

  it("ne laisse jamais sortir un point de code au-dessus de 0xff", () => {
    const sanitized = sanitizeForAgent("— ’ … ﻿ 你 \u{1F600} Ā é");
    for (const char of sanitized) {
      expect(char.codePointAt(0)!).toBeLessThanOrEqual(0xff);
    }
  });
});

describe("runGuestCommand", () => {
  const proxmox: ProxmoxConfig = {
    url: "https://pve",
    node: "pve",
    tokenId: "t@pve!x",
    tokenSecret: "s",
    caPem: null,
    insecureTls: false,
  };
  const fetchMock = vi.fn();

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  const qgaTimeout = () =>
    new Response(
      JSON.stringify({ message: "VM 100 qga command 'guest-exec-status' failed - got timeout\n", data: null }),
      { status: 500 }
    );

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("tolère des délais passagers de guest-exec-status pendant un script long", async () => {
    let statusCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/agent/exec")) return json({ data: { pid: 5700 } });
      if (url.includes("/agent/exec-status")) {
        statusCalls++;
        if (statusCalls <= 3) return qgaTimeout();
        return json({ data: { exited: 1, exitcode: 0, "out-data": "ok" } });
      }
      throw new Error(`appel inattendu ${url}`);
    });

    const pending = runGuestCommand(proxmox, 100, ["cmd"], 600_000);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.success).toBe(true);
    expect(result.data?.stdout).toBe("ok");
    expect(statusCalls).toBe(4);
  });

  it("abandonne quand guest-exec-status échoue sans interruption trop longtemps", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/agent/exec")) return json({ data: { pid: 5700 } });
      if (url.includes("/agent/exec-status")) return qgaTimeout();
      throw new Error(`appel inattendu ${url}`);
    });

    const pending = runGuestCommand(proxmox, 100, ["cmd"], 3_600_000);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exec-status pid=5700/);
    expect(result.error).toMatch(/got timeout/);
  });
});

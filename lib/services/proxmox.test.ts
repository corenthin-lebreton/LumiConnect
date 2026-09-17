import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneVm, deleteVm, nextVmid, shutdownVm } from "./proxmox";
import type { ProxmoxConfig } from "@/types";

const proxmox: ProxmoxConfig = {
  url: "https://pve",
  node: "pve",
  tokenId: "t@pve!x",
  tokenSecret: "s",
  caPem: null,
  insecureTls: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("cloneVm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });


  it("réessaie quand le template est verrouillé, puis réussit", async () => {
    let cloneCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/clone")) {
        cloneCalls++;
        if (cloneCalls < 3) {
          return new Response(
            "can't lock file '/var/lock/qemu-server/lock-100.conf' - got timeout",
            { status: 500 }
          );
        }
        return json({ data: "UPID:ok" });
      }
      if (url.endsWith("/tasks/UPID%3Aok/status")) return json({ data: { status: "stopped", exitstatus: "OK" } });
      if (url.endsWith("/config")) return json({ data: { net0: "virtio=DE:AD:BE:EF:00:01,bridge=vmbr0" } });
      throw new Error(`appel inattendu ${url}`);
    });

    const pending = cloneVm(proxmox, 100, 201, "vm", 2, 2048, "f");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(cloneCalls).toBe(3);
    expect(result).toEqual({ success: true, data: { vmid: 201, mac: "DE:AD:BE:EF:00:01" } });
  });

  it("n'insiste pas sur une erreur qui n'est pas un verrou", async () => {
    let cloneCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/clone")) {
        cloneCalls++;
        return new Response("VM 201 already exists", { status: 500 });
      }
      throw new Error(`appel inattendu ${url}`);
    });

    const pending = cloneVm(proxmox, 100, 201, "vm", 2, 2048, "f");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(cloneCalls).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already exists/);
  });

  it("demande un clone complet quand l'option est posée", async () => {
    const bodies: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/clone")) {
        bodies.push(String(init?.body));
        return json({ data: "UPID:ok" });
      }
      if (url.endsWith("/tasks/UPID%3Aok/status")) return json({ data: { status: "stopped", exitstatus: "OK" } });
      if (url.endsWith("/config")) return json({ data: { net0: "virtio=DE:AD:BE:EF:00:01" } });
      throw new Error(`appel inattendu ${url}`);
    });

    await cloneVm(proxmox, 100, 900, "golden", 2, 2048, "f", { full: true });
    expect(bodies[0]).toContain("full=1");
  });
});

describe("nextVmid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lit l'identifiant proposé par le cluster", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: "412" })));
    expect(await nextVmid(proxmox)).toEqual({ success: true, data: 412 });
  });
});

describe("deleteVm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Proxmox repond 500 pour une VM absente : sans cette tolerance, la suppression d'une
  // formation dont une VM n'a jamais ete creee echoue indefiniment.
  it("considère une VM absente comme déjà supprimée, sans appeler DELETE", async () => {
    const methods: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      methods.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/status/current")) {
        return new Response(
          JSON.stringify({
            data: null,
            message: "Configuration file 'nodes/pve/qemu-server/5000.conf' does not exist\n",
          }),
          { status: 500 }
        );
      }
      throw new Error(`appel inattendu ${url}`);
    });

    const result = await deleteVm(proxmox, 5000);

    expect(result).toEqual({ success: true });
    expect(methods.some((call) => call.startsWith("DELETE"))).toBe(false);
  });

  it("arrête puis supprime une VM en marche", async () => {
    const methods: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      methods.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/status/current")) return json({ data: { status: "running" } });
      if (url.endsWith("/status/stop")) return json({ data: "UPID:stop" });
      if (url.endsWith("/tasks/UPID%3Astop/status")) {
        return json({ data: { status: "stopped", exitstatus: "OK" } });
      }
      if (init?.method === "DELETE") return json({ data: null });
      throw new Error(`appel inattendu ${url}`);
    });

    const pending = deleteVm(proxmox, 201);
    await vi.runAllTimersAsync();

    expect(await pending).toEqual({ success: true });
    expect(methods.filter((call) => call.startsWith("DELETE"))).toHaveLength(1);
  });

  it("remonte une erreur qui n'est pas une VM absente", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/status/current")) {
        return new Response(JSON.stringify({ data: null, message: "permission denied" }), { status: 403 });
      }
      throw new Error(`appel inattendu ${url}`);
    });

    const result = await deleteVm(proxmox, 201);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/permission denied/);
  });
});

describe("shutdownVm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function mockPve(opts: { shutdownTask: () => { status: string; exitstatus?: string }; stopsAfterForce?: boolean }) {
    const calls: { url: string; body?: string }[] = [];
    let forced = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.endsWith("/status/current")) {
        return json({ data: { status: forced && opts.stopsAfterForce !== false ? "stopped" : "running" } });
      }
      if (url.endsWith("/status/shutdown")) return json({ data: "UPID:shutdown" });
      if (url.endsWith("/tasks/UPID%3Ashutdown/status")) return json({ data: opts.shutdownTask() });
      if (url.endsWith("/status/stop")) {
        forced = true;
        return json({ data: "UPID:stop" });
      }
      if (url.endsWith("/tasks/UPID%3Astop/status")) return json({ data: { status: "stopped", exitstatus: "OK" } });
      throw new Error(`appel inattendu ${url}`);
    });
    return calls;
  }

  it("borne l'attente côté Proxmox avec le paramètre timeout", async () => {
    let polls = 0;
    const calls = mockPve({
      shutdownTask: () => (++polls < 2 ? { status: "running" } : { status: "stopped", exitstatus: "OK" }),
    });
    fetchMock.mockImplementationOnce(async () => json({ data: { status: "running" } }));

    const pending = shutdownVm(proxmox, 201, 300_000);
    await vi.runAllTimersAsync();
    await pending;

    const shutdown = calls.find((c) => c.url.endsWith("/status/shutdown"));
    expect(shutdown?.body).toBe("timeout=300");
  });

  it("force l'arrêt quand la tâche shutdown ne rend pas la main dans le délai", async () => {
    const calls = mockPve({ shutdownTask: () => ({ status: "running" }) });

    const pending = shutdownVm(proxmox, 201, 300_000);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(calls.some((c) => c.url.endsWith("/status/stop"))).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/arrêt forcé/);
  });

  it("force l'arrêt quand Proxmox signale lui-même le dépassement du délai", async () => {
    const calls = mockPve({
      shutdownTask: () => ({ status: "stopped", exitstatus: "VM quit/powerdown failed - got timeout" }),
    });

    const pending = shutdownVm(proxmox, 201, 300_000);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(calls.some((c) => c.url.endsWith("/status/stop"))).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/arrêt forcé/);
  });

  it("remonte sans forcer une erreur de tâche qui n'est pas un dépassement de délai", async () => {
    const calls = mockPve({ shutdownTask: () => ({ status: "stopped", exitstatus: "permission denied" }) });

    const pending = shutdownVm(proxmox, 201, 300_000);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(calls.some((c) => c.url.endsWith("/status/stop"))).toBe(false);
    expect(result).toEqual({ success: false, error: "Task failed: permission denied" });
  });
});

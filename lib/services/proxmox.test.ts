import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneVm, nextVmid } from "./proxmox";
import type { ProxmoxConfig } from "@/types";

const proxmox: ProxmoxConfig = { url: "https://pve", node: "pve", tokenId: "t@pve!x", tokenSecret: "s" };

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
        if (cloneCalls < 3) return new Response("can't lock file '/var/lock/qemu-server/lock-100.conf' - got timeout", { status: 500 });
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

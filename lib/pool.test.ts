import { describe, expect, it } from "vitest";
import { mapWithConcurrency, readConcurrency } from "./pool";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("ne dépasse jamais la limite", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick(5);
      inFlight -= 1;
    });

    expect(peak).toBe(4);
  });

  it("conserve l'ordre des résultats malgré des durées inégales", async () => {
    const results = await mapWithConcurrency([30, 5, 20, 1], 2, async (delay) => {
      await tick(delay);
      return delay;
    });

    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([30, 5, 20, 1]);
  });

  it("isole les échecs sans interrompre les autres tâches", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boum");
      return n;
    });

    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("traite toutes les tâches quand la limite dépasse leur nombre", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2], 10, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2]);
  });

  it("accepte une liste vide", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it("refuse une limite nulle plutôt que de ne rien faire", async () => {
    await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow(
      /Concurrence invalide/
    );
  });
});

describe("readConcurrency", () => {
  it("retient une valeur entière positive", () => {
    expect(readConcurrency("6", 4)).toBe(6);
  });

  it("retombe sur la valeur par défaut pour toute entrée douteuse", () => {
    for (const value of [undefined, "", "0", "-2", "abc", "2.5"]) {
      expect(readConcurrency(value, 4), String(value)).toBe(4);
    }
  });
});

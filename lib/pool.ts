export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  if (limit < 1) throw new Error(`Concurrence invalide : ${limit}`);

  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  async function consume(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;

      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, consume);
  await Promise.all(runners);

  return results;
}

export function readConcurrency(envValue: string | undefined, fallback: number): number {
  const parsed = Number(envValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

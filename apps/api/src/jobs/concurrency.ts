/**
 * Bounded-concurrency map. The worker sent WhatsApp messages strictly one at a
 * time, which was fine for a process with no clock. A serverless cron handler
 * has a hard wall (maxDuration in vercel.json), so fan-out work runs a few at a
 * time — enough to fit the budget, low enough to stay under Meta's rate limits.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function drain() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index]!, index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, drain))
  return results
}

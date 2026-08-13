/**
 * TTL for the in-process response caches.
 *
 * Those caches are correct on a container host: one process serves every
 * request, so invalidating on write is enough. Serverless breaks that
 * assumption — each concurrent instance holds its own copy of the Map, so a
 * POST that invalidates instance A leaves instance B serving its stale entry
 * until the TTL lapses. The user sees it as "I saved it and the list didn't
 * update", which is exactly when staleness is least acceptable.
 *
 * Returning 0 there makes every entry expire immediately (all readers test
 * `expiresAt > now`), so the cache is bypassed without touching the call sites.
 * The in-flight maps still collapse duplicate concurrent work, which is safe
 * because that dedupe lives entirely within a single request burst.
 *
 * Losing the cache is affordable now that the function runs in the same region
 * as the database — see `regions` in vercel.json.
 */
export function responseCacheTtl(ms: number): number {
  return process.env.VERCEL ? 0 : ms
}

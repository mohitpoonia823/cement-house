/**
 * Keeps the global `fetch` types usable regardless of which lib set the build
 * resolves.
 *
 * @types/node declares the web globals conditionally:
 *
 *   type _Response = typeof globalThis extends { onmessage: any } ? {} : undici.Response
 *   interface Response extends _Response {}
 *
 * The `onmessage` probe is meant to detect a DOM/WebWorker lib that would supply
 * its own `Response`. When something puts `onmessage` on globalThis but no
 * matching declaration follows — which is what happens in Vercel's build, though
 * not in a local `tsc` run — `Response` collapses to `{}` and every member
 * disappears, producing errors like "Property 'ok' does not exist on type
 * 'Response'".
 *
 * These declarations merge with whatever `Response`/`Headers` end up being, so
 * the members we actually use are always present. The signatures are copied
 * verbatim from undici-types (the shape Node really returns) — identical
 * declarations merge cleanly, mismatched ones would be a compile error, so this
 * stays honest rather than papering over a real difference.
 */
export {}

declare global {
  interface Response {
    readonly ok: boolean
    readonly status: number
    readonly statusText: string
    readonly headers: Headers
    readonly arrayBuffer: () => Promise<ArrayBuffer>
    readonly json: () => Promise<unknown>
    readonly text: () => Promise<string>
  }

  interface Headers {
    readonly get: (name: string) => string | null
  }
}

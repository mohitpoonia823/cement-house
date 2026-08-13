/**
 * Vercel serverless adapter.
 *
 * Fastify owns a real `http.Server` internally but never binds it here; we hand
 * Vercel's raw request/response straight to it via the 'request' event. Because
 * the stream is untouched, per-route content-type parsers still see the exact
 * bytes — which is what keeps the Razorpay webhook's HMAC signature check valid
 * (see routes/webhooks/razorpay.ts).
 *
 * The instance is cached at module scope so warm invocations skip the whole
 * build+ready cycle and reuse the Prisma connection.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { buildApp, assertBillingSchemaReady } from './app'

let appPromise: Promise<FastifyInstance> | undefined

function getApp() {
  if (!appPromise) {
    appPromise = buildApp()
      .then(async (app) => {
        await app.ready()
        return app
      })
      .catch((error) => {
        // Don't cache a failed boot: a transient DB/env hiccup would otherwise
        // poison this instance for its entire lifetime.
        appPromise = undefined
        throw error
      })

    // Advisory only — never blocks a request. A long-running server refuses to
    // start on an incomplete billing schema; serverless just surfaces it in logs.
    assertBillingSchemaReady().catch((error) =>
      console.error('[billing] schema check failed:', error instanceof Error ? error.message : error),
    )
  }
  return appPromise
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp()
    app.server.emit('request', req, res)
  } catch (error) {
    console.error('[api] failed to initialise Fastify:', error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
    }
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
  }
}

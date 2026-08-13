/**
 * Server entry.
 *
 * This single file serves both targets. Vercel detects it as the Fastify
 * entrypoint (src/index.ts is one of its recognised names), bundles the app and
 * runs it as one function; containers (Docker/Render) and `pnpm dev` run it as
 * a normal long-lived process. Both need the same thing — build, then listen.
 */
import { buildApp, assertBillingSchemaReady } from './app'

const app = await buildApp()

// Billing tables must exist before subscription routes can work. A long-lived
// process refuses to boot without them — failing loudly at deploy is correct
// there. Serverless has no boot to fail: blocking here would put a DB round
// trip on every cold start and take the whole function down if it threw, so it
// only reports.
if (process.env.VERCEL) {
  assertBillingSchemaReady().catch((error) =>
    console.error('[billing] schema check failed:', error instanceof Error ? error.message : error),
  )
} else {
  await assertBillingSchemaReady()
}

const port = Number(process.env.PORT ?? 4000)
await app.listen({ port, host: '0.0.0.0' })
console.log(`API running on port ${port}`)

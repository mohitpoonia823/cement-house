/**
 * Standalone server entry — local dev (`pnpm dev`) and container hosts
 * (Docker/Render). Vercel does not use this file; it loads api/index.ts.
 */
import { buildApp, assertBillingSchemaReady } from './app'

await assertBillingSchemaReady()

const app = await buildApp()
const port = Number(process.env.PORT ?? 4000)
await app.listen({ port, host: '0.0.0.0' })
console.log(`API running on port ${port}`)

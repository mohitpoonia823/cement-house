import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import { subscriptionsRepository } from '@cement-house/db'

import { authRoutes } from './routes/auth'
import { orderRoutes, orderChallanRoute } from './routes/orders'
import { customerRoutes } from './routes/customers'
import { ledgerRoutes, ledgerStatementRoute } from './routes/ledger'
import { inventoryRoutes } from './routes/inventory'
import { deliveryRoutes } from './routes/delivery'
import { reminderRoutes } from './routes/reminders'
import { reportRoutes } from './routes/reports'
import { settingsRoutes } from './routes/settings'
import { superAdminRoutes } from './routes/super-admin'
import { supportRoutes } from './routes/support'
import { salesReturnRoutes } from './routes/sales-returns'
import { razorpayWebhookRoutes } from './routes/webhooks/razorpay'
import { locationRoutes } from './routes/locations'
import { stockTransferRoutes } from './routes/stock-transfers'
import { referralPartnersRoutes } from './routes/referral-partners'
import { supplierRoutes } from './routes/suppliers'
import { accountingRoutes } from './routes/accounting'
import { authenticate } from './middleware/auth'

const app = Fastify({ logger: { level: 'info' } })

// Global safety net: uncaught throws become clean JSON errors instead of
// Fastify's default payload. 4xx errors (JWT, body-limit, validation) keep
// their message; 5xx details are logged but never leaked to the client.
app.setErrorHandler((error, req, reply) => {
  const statusCode = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500
  if (statusCode >= 500) {
    req.log.error({ err: error, url: req.url, method: req.method }, 'unhandled error')
    return reply.status(500).send({ success: false, error: 'Internal server error' })
  }
  return reply.status(statusCode).send({ success: false, code: (error as any).code, error: error.message })
})

app.setNotFoundHandler((req, reply) =>
  reply.status(404).send({ success: false, error: `Route ${req.method} ${req.url} not found` })
)

await app.register(helmet)
await app.register(cors, {
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  exposedHeaders: ['Content-Disposition'],
})
await app.register(jwt, { secret: process.env.JWT_SECRET! })
await subscriptionsRepository.assertBillingSchemaReady()

// ── Public ───────────────────────────────────────────────────────────────────
app.register(authRoutes, { prefix: '/api/auth' })
app.register(razorpayWebhookRoutes, { prefix: '/api/webhooks' })
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ── Protected (scoped — authenticate hook only applies inside this plugin) ──
app.register(async function protectedRoutes(scoped) {
  scoped.addHook('onRequest', authenticate)
  scoped.register(orderRoutes,          { prefix: '/api/orders' })
  scoped.register(orderChallanRoute,    { prefix: '/api/orders' })
  scoped.register(customerRoutes,       { prefix: '/api/customers' })
  scoped.register(ledgerRoutes,         { prefix: '/api/ledger' })
  scoped.register(ledgerStatementRoute, { prefix: '/api/ledger' })
  scoped.register(inventoryRoutes,      { prefix: '/api/inventory' })
  scoped.register(deliveryRoutes,       { prefix: '/api/delivery' })
  scoped.register(reminderRoutes,       { prefix: '/api/reminders' })
  scoped.register(reportRoutes,         { prefix: '/api/reports' })
  scoped.register(settingsRoutes,       { prefix: '/api/settings' })
  scoped.register(superAdminRoutes,     { prefix: '/api/super-admin' })
  scoped.register(superAdminRoutes,     { prefix: '/api/admin' })
  scoped.register(supportRoutes,        { prefix: '/api/support' })
  scoped.register(salesReturnRoutes,    { prefix: '/api/sales-returns' })
  scoped.register(locationRoutes,       { prefix: '/api/locations' })
  scoped.register(stockTransferRoutes,  { prefix: '/api/stock-transfers' })
  scoped.register(referralPartnersRoutes, { prefix: '/api/referral-partners' })
  scoped.register(supplierRoutes,       { prefix: '/api/suppliers' })
  scoped.register(accountingRoutes,     { prefix: '/api/accounting' })
})

const port = Number(process.env.PORT ?? 4000)
await app.listen({ port, host: '0.0.0.0' })
console.log(`API running on port ${port}`)

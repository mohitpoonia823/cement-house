import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'

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
import { authenticate } from './middleware/auth'

const app = Fastify({ logger: { level: 'info' } })

await app.register(helmet)
await app.register(cors, {
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  exposedHeaders: ['Content-Disposition'],
})
await app.register(jwt, { secret: process.env.JWT_SECRET! })

// ── Public ───────────────────────────────────────────────────────────────────
app.register(authRoutes, { prefix: '/api/auth' })
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
  scoped.register(supportRoutes,        { prefix: '/api/support' })
})

const port = Number(process.env.PORT ?? 4000)
await app.listen({ port, host: '0.0.0.0' })
console.log(`API running on port ${port}`)

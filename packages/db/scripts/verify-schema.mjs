import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const requiredTables = [
  'businesses',
  'users',
  'customers',
  'materials',
  'orders',
  'order_items',
  'platform_settings',
  'payment_methods',
  'payment_transactions',
  'plans',
  'plan_limits',
  'subscriptions',
  'product_variants',
]

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1)
    `,
    requiredTables,
  )

  const existing = new Set(rows.map((row) => row.table_name))
  const missing = requiredTables.filter((name) => !existing.has(name))

  if (missing.length > 0) {
    console.error('\nSchema verification failed. Missing tables:')
    for (const tableName of missing) {
      console.error(`- ${tableName}`)
    }
    console.error('\nRun: pnpm db:sync (from repo root) against the same DATABASE_URL as the API.')
    process.exit(1)
  }

  console.log('Schema verification passed.')
}

main()
  .catch((error) => {
    console.error('Schema verification failed with error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

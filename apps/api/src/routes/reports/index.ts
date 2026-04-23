import type { FastifyInstance } from 'fastify'
import { prisma }    from '@cement-house/db'
import { requireOwner, getBizId } from '../../middleware/auth'

export async function reportRoutes(app: FastifyInstance) {
  // GET /api/reports/dashboard — summary KPIs for today (scoped to business)
  app.get('/dashboard', async (req, reply) => {
    const bizId = getBizId(req)
    const start = new Date(); start.setHours(0,0,0,0)
    const end   = new Date(); end.setHours(23,59,59,999)

    const [todayOrders, allLedger, lowStock] = await Promise.all([
      prisma.order.findMany({ where: { createdAt: { gte: start, lte: end }, businessId: bizId } }),
      prisma.ledgerEntry.findMany({ where: { businessId: bizId } }),
      prisma.material.findMany({ where: { isActive: true, businessId: bizId } }),
    ])

    const todaySales     = todayOrders.reduce((s, o) => s + Number(o.totalAmount), 0)
    const cashCollected  = todayOrders.reduce((s, o) => s + Number(o.amountPaid), 0)

    // Outstanding: total debit - total credit across all customers
    const totalDebit  = allLedger.filter(e => e.type === 'DEBIT').reduce((s,e) => s + Number(e.amount), 0)
    const totalCredit = allLedger.filter(e => e.type === 'CREDIT').reduce((s,e) => s + Number(e.amount), 0)

    const lowStockCount = lowStock.filter(m => Number(m.stockQty) <= Number(m.minThreshold)).length

    return { success: true, data: {
      todaySales, cashCollected,
      totalOutstanding: totalDebit - totalCredit,
      todayOrderCount: todayOrders.length,
      lowStockCount,
    }}
  })

  // GET /api/reports/monthly?year=2026&month=4
  app.get('/monthly', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query as any
    const start = new Date(year, month - 1, 1)
    const end   = new Date(year, month, 0, 23, 59, 59)

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' }, businessId: bizId },
      include: { items: { include: { material: true } } },
    })

    const totalSales   = orders.reduce((s, o) => s + Number(o.totalAmount), 0)
    const totalMargin  = orders.reduce((s, o) => s + Number(o.marginPct ?? 0), 0)
    const avgMargin    = orders.length ? totalMargin / orders.length : 0

    return { success: true, data: { year, month, totalSales, orderCount: orders.length, avgMargin } }
  })
}

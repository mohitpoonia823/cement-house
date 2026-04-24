import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '@cement-house/db'
import { z } from 'zod'
import { requireOwner, getBizId } from '../../middleware/auth'
import { streamAnalyticsSnapshot } from '../../services/pdf'
import { createAuditLog } from '../../services/audit'

const ReportSummaryQuerySchema = z.object({
  granularity: z.enum(['monthly', 'yearly']).default('monthly'),
  year: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).optional(),
})

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function reportPeriodFromQuery(query: z.infer<typeof ReportSummaryQuerySchema>) {
  if (query.granularity === 'yearly') {
    const start = new Date(query.year, 0, 1)
    const end = new Date(query.year, 11, 31, 23, 59, 59, 999)
    return {
      granularity: 'yearly' as const,
      year: query.year,
      month: null,
      start,
      end,
      label: `${query.year}`,
      exportSuffix: `${query.year}`,
    }
  }

  const month = query.month ?? new Date().getMonth() + 1
  const start = new Date(query.year, month - 1, 1)
  const end = new Date(query.year, month, 0, 23, 59, 59, 999)
  const monthShort = start.toLocaleDateString('en-IN', { month: 'short' })
  return {
    granularity: 'monthly' as const,
    year: query.year,
    month,
    start,
    end,
    label: `${monthShort} ${query.year}`,
    exportSuffix: `${query.year}-${String(month).padStart(2, '0')}`,
  }
}

function csv(headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n')
}

async function createExportAuditLog(req: FastifyRequest, input: {
  page: string
  format: 'pdf' | 'csv'
  fileName: string
  label: string
  query?: Record<string, unknown>
}) {
  const user = req.user as any
  await createAuditLog({
    actorId: user.id,
    businessId: user.businessId ?? null,
    action: 'REPORT_EXPORTED',
    targetType: 'REPORT',
    targetId: null,
    metadata: {
      page: input.page,
      format: input.format,
      fileName: input.fileName,
      label: input.label,
      query: input.query ?? {},
    },
  })
}

async function loadReportSummary(bizId: string, queryInput: unknown) {
  const parsed = ReportSummaryQuerySchema.safeParse(queryInput)
  if (!parsed.success) throw parsed.error

  const period = reportPeriodFromQuery(parsed.data)
  const orders = await prisma.order.findMany({
    where: {
      businessId: bizId,
      status: { not: 'CANCELLED' },
      createdAt: { gte: period.start, lte: period.end },
    },
    include: {
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalSales = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0)
  const totalMargin = orders.reduce((sum, order) => sum + Number(order.marginPct ?? 0), 0)
  const avgMargin = orders.length ? totalMargin / orders.length : 0
  const paidAmount = orders.reduce((sum, order) => sum + Number(order.amountPaid), 0)
  const outstanding = orders.reduce((sum, order) => sum + (Number(order.totalAmount) - Number(order.amountPaid)), 0)

  return {
    ...period,
    totalSales,
    orderCount: orders.length,
    avgMargin,
    paidAmount,
    outstanding,
    recentOrders: orders.slice(0, 8).map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? 'Unknown customer',
      totalAmount: Number(order.totalAmount),
      amountPaid: Number(order.amountPaid),
      status: order.status,
      createdAt: order.createdAt,
    })),
  }
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/export', async (req, reply) => {
    const bizId = getBizId(req)
    const { page = 'dashboard' } = req.query as { page?: string }
    const jwtUser = req.user as any
    const generatedAt = new Date()

    const sendCsv = async (filename: string, body: string, label: string, query?: Record<string, unknown>) => {
      await createExportAuditLog(req, { page, format: 'csv', fileName: filename, label, query })
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(body)
    }

    if (page === 'dashboard') {
      const today = new Date()
      const sevenDaysAgo = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
      const [orders, ledgerEntries, materials, customers, deliveries] = await Promise.all([
        prisma.order.findMany({
          where: {
            businessId: bizId,
            status: { not: 'CANCELLED' },
            createdAt: { gte: sevenDaysAgo },
          },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.ledgerEntry.findMany({ where: { businessId: bizId }, include: { customer: { select: { name: true } } } }),
        prisma.material.findMany({ where: { businessId: bizId, isActive: true } }),
        prisma.customer.findMany({ where: { businessId: bizId, isActive: true } }),
        prisma.delivery.findMany({ where: { order: { businessId: bizId } } }),
      ])

      const totalSales = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0)
      const totalCollected = ledgerEntries.filter((entry) => entry.type === 'CREDIT').reduce((sum, entry) => sum + Number(entry.amount), 0)
      const totalDebit = ledgerEntries.filter((entry) => entry.type === 'DEBIT').reduce((sum, entry) => sum + Number(entry.amount), 0)
      const outstanding = totalDebit - totalCollected
      const lowStock = materials.filter((material) => Number(material.stockQty) <= Number(material.minThreshold))

      const customerExposure = ledgerEntries.reduce((acc, entry) => {
        const name = entry.customer?.name ?? 'Unknown customer'
        const current = acc.get(name) ?? 0
        const next = entry.type === 'DEBIT' ? current + Number(entry.amount) : current - Number(entry.amount)
        acc.set(name, next)
        return acc
      }, new Map<string, number>())

      const topExposure = [...customerExposure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      const recentOrders = orders.slice(0, 5)
      const fileName = 'dashboard-snapshot.pdf'

      await createExportAuditLog(req, {
        page,
        format: 'pdf',
        fileName,
        label: 'Dashboard snapshot',
      })

      return streamAnalyticsSnapshot(
        {
          title: 'Dashboard snapshot',
          subtitle: 'Operations and collection summary',
          generatedAt,
          businessName: jwtUser.businessName ?? 'Cement House',
          businessCity: jwtUser.businessCity ?? '',
          metrics: [
            { label: 'Sales window', value: `Rs. ${new Intl.NumberFormat('en-IN').format(totalSales)}` },
            { label: 'Collections', value: `Rs. ${new Intl.NumberFormat('en-IN').format(totalCollected)}` },
            { label: 'Outstanding', value: `Rs. ${new Intl.NumberFormat('en-IN').format(outstanding)}` },
            { label: 'Low stock items', value: String(lowStock.length) },
          ],
          sections: [
            {
              title: 'Recent orders',
              rows: recentOrders.map((order) => ({
                label: `${order.orderNumber} • ${order.customer?.name ?? 'Unknown customer'}`,
                value: `Rs. ${new Intl.NumberFormat('en-IN').format(Number(order.totalAmount))}`,
              })),
            },
            {
              title: 'Top customer exposure',
              rows: topExposure.map(([name, amount]) => ({
                label: name,
                value: `Rs. ${new Intl.NumberFormat('en-IN').format(amount)}`,
              })),
            },
            {
              title: 'Operational totals',
              rows: [
                { label: 'Active customers', value: String(customers.length) },
                { label: 'Active materials', value: String(materials.length) },
                { label: 'Deliveries created', value: String(deliveries.length) },
                { label: 'Low stock watchlist', value: lowStock.map((item) => item.name).slice(0, 5).join(', ') || 'None' },
              ],
            },
          ],
        },
        reply
      )
    }

    if (page === 'reports') {
      const summary = await loadReportSummary(bizId, req.query)
      const fileName = `business-report-${summary.exportSuffix}.pdf`

      await createExportAuditLog(req, {
        page,
        format: 'pdf',
        fileName,
        label: `${summary.granularity === 'yearly' ? 'Yearly' : 'Monthly'} report • ${summary.label}`,
        query: {
          granularity: summary.granularity,
          year: summary.year,
          month: summary.month,
        },
      })

      return streamAnalyticsSnapshot(
        {
          title: `${summary.granularity === 'yearly' ? 'Yearly' : 'Monthly'} business report`,
          subtitle: `Performance summary for ${summary.label}`,
          generatedAt,
          businessName: jwtUser.businessName ?? 'Cement House',
          businessCity: jwtUser.businessCity ?? '',
          metrics: [
            { label: 'Total sales', value: `Rs. ${new Intl.NumberFormat('en-IN').format(summary.totalSales)}` },
            { label: 'Orders', value: String(summary.orderCount) },
            { label: 'Avg margin', value: `${summary.avgMargin.toFixed(1)}%` },
            { label: 'Outstanding', value: `Rs. ${new Intl.NumberFormat('en-IN').format(summary.outstanding)}` },
          ],
          sections: [
            {
              title: 'Collections and dues',
              rows: [
                { label: 'Collected within period', value: `Rs. ${new Intl.NumberFormat('en-IN').format(summary.paidAmount)}` },
                { label: 'Outstanding within period', value: `Rs. ${new Intl.NumberFormat('en-IN').format(summary.outstanding)}` },
              ],
            },
            {
              title: 'Recent orders in selection',
              rows: summary.recentOrders.length > 0
                ? summary.recentOrders.map((order) => ({
                    label: `${order.orderNumber} • ${order.customerName}`,
                    value: `Rs. ${new Intl.NumberFormat('en-IN').format(order.totalAmount)}`,
                  }))
                : [{ label: 'No orders in selected period', value: '—' }],
            },
          ],
        },
        reply
      )
    }

    if (page === 'orders') {
      const orders = await prisma.order.findMany({
        where: { businessId: bizId },
        include: { customer: { select: { name: true } }, items: true },
        orderBy: { createdAt: 'desc' },
      })
      return sendCsv(
        'orders-snapshot.csv',
        csv(
          ['Order Number', 'Date', 'Customer', 'Status', 'Items', 'Total Amount', 'Amount Paid', 'Due'],
          orders.map((order) => [
            order.orderNumber,
            order.createdAt.toISOString(),
            order.customer?.name ?? '',
            order.status,
            order.items.length,
            Number(order.totalAmount),
            Number(order.amountPaid),
            Number(order.totalAmount) - Number(order.amountPaid),
          ])
        ),
        'Orders snapshot'
      )
    }

    if (page === 'customers') {
      const customers = await prisma.customer.findMany({
        where: { businessId: bizId, isActive: true },
        include: { _count: { select: { orders: true } } },
        orderBy: { name: 'asc' },
      })
      const rows = await Promise.all(
        customers.map(async (customer) => {
          const agg = await prisma.ledgerEntry.groupBy({
            by: ['type'],
            where: { customerId: customer.id },
            _sum: { amount: true },
          })
          const debit = Number(agg.find((a) => a.type === 'DEBIT')?._sum.amount ?? 0)
          const credit = Number(agg.find((a) => a.type === 'CREDIT')?._sum.amount ?? 0)
          return [customer.name, customer.phone, customer.riskTag, customer.address ?? '', customer._count.orders, Number(customer.creditLimit), debit - credit]
        })
      )
      return sendCsv(
        'customers-snapshot.csv',
        csv(['Name', 'Phone', 'Risk Tag', 'Address', 'Orders', 'Credit Limit', 'Outstanding'], rows),
        'Customers snapshot'
      )
    }

    if (page === 'inventory') {
      const materials = await prisma.material.findMany({
        where: { businessId: bizId, isActive: true },
        orderBy: { name: 'asc' },
      })
      return sendCsv(
        'inventory-snapshot.csv',
        csv(
          ['Material', 'Unit', 'Stock Qty', 'Min Threshold', 'Max Threshold', 'Purchase Price', 'Sale Price'],
          materials.map((material) => [
            material.name,
            material.unit,
            Number(material.stockQty),
            Number(material.minThreshold),
            Number(material.maxThreshold ?? 0),
            Number(material.purchasePrice),
            Number(material.salePrice),
          ])
        ),
        'Inventory snapshot'
      )
    }

    if (page === 'delivery') {
      const start = startOfDay(generatedAt)
      const end = endOfDay(generatedAt)
      const deliveries = await prisma.delivery.findMany({
        where: { createdAt: { gte: start, lte: end }, order: { businessId: bizId } },
        include: { order: { include: { customer: { select: { name: true, address: true } } } } },
        orderBy: { createdAt: 'asc' },
      })
      return sendCsv(
        'delivery-board-snapshot.csv',
        csv(
          ['Challan Number', 'Created At', 'Customer', 'Address', 'Status', 'Driver', 'Vehicle'],
          deliveries.map((delivery) => [
            delivery.challanNumber,
            delivery.createdAt.toISOString(),
            delivery.order?.customer?.name ?? '',
            delivery.order?.customer?.address ?? '',
            delivery.status,
            delivery.driverName ?? '',
            delivery.vehicleNumber ?? '',
          ])
        ),
        'Delivery snapshot'
      )
    }

    if (page === 'khata') {
      const customers = await prisma.customer.findMany({ where: { isActive: true, businessId: bizId }, orderBy: { name: 'asc' } })
      const rows = await Promise.all(
        customers.map(async (customer) => {
          const agg = await prisma.ledgerEntry.groupBy({
            by: ['type'],
            where: { customerId: customer.id },
            _sum: { amount: true },
          })
          const debit = Number(agg.find((a) => a.type === 'DEBIT')?._sum.amount ?? 0)
          const credit = Number(agg.find((a) => a.type === 'CREDIT')?._sum.amount ?? 0)
          return [customer.name, customer.phone, customer.riskTag, debit, credit, debit - credit]
        })
      )
      return sendCsv(
        'khata-snapshot.csv',
        csv(['Customer', 'Phone', 'Risk Tag', 'Total Debit', 'Total Credit', 'Outstanding'], rows),
        'Khata snapshot'
      )
    }

    if (page === 'settings') {
      const business = await prisma.business.findUnique({ where: { id: bizId }, include: { users: { where: { isActive: true } } } })
      if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
      return sendCsv(
        'workspace-snapshot.csv',
        csv(
          ['Business Name', 'City', 'Phone', 'GSTIN', 'User Name', 'Role', 'Permissions'],
          business.users.map((user) => [
            business.name,
            business.city,
            business.phone ?? '',
            business.gstin ?? '',
            user.name,
            user.role,
            (user.permissions ?? []).join(' | '),
          ])
        ),
        'Workspace snapshot'
      )
    }

    return reply.status(400).send({ success: false, error: 'Unsupported export page' })
  })

  app.get('/dashboard', async (req) => {
    const bizId = getBizId(req)
    const today = new Date()
    const start = startOfDay(today)
    const end = endOfDay(today)
    const sevenDaysAgo = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))

    const [todayOrders, recentOrders, allLedger, materials, customers, deliveries] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: start, lte: end }, businessId: bizId, status: { not: 'CANCELLED' } },
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sevenDaysAgo }, businessId: bizId, status: { not: 'CANCELLED' } },
        include: {
          customer: { select: { name: true } },
          items: { select: { quantity: true, material: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ledgerEntry.findMany({
        where: { businessId: bizId },
        include: { customer: { select: { id: true, name: true, riskTag: true } } },
      }),
      prisma.material.findMany({ where: { isActive: true, businessId: bizId } }),
      prisma.customer.findMany({
        where: { isActive: true, businessId: bizId },
        include: { _count: { select: { orders: true } } },
      }),
      prisma.delivery.findMany({
        where: { order: { businessId: bizId } },
        include: { order: { include: { customer: { select: { name: true } } } } },
      }),
    ])

    const todaySales = todayOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0)
    const cashCollected = todayOrders.reduce((sum, order) => sum + Number(order.amountPaid), 0)
    const totalDebit = allLedger.filter((entry) => entry.type === 'DEBIT').reduce((sum, entry) => sum + Number(entry.amount), 0)
    const totalCredit = allLedger.filter((entry) => entry.type === 'CREDIT').reduce((sum, entry) => sum + Number(entry.amount), 0)
    const totalOutstanding = totalDebit - totalCredit
    const lowStockCount = materials.filter((material) => Number(material.stockQty) <= Number(material.minThreshold)).length

    const series = Array.from({ length: 7 }).map((_, index) => {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index))
      const dayStart = startOfDay(day)
      const dayEnd = endOfDay(day)
      const ordersForDay = recentOrders.filter((order) => order.createdAt >= dayStart && order.createdAt <= dayEnd)
      const ledgerForDay = allLedger.filter((entry) => entry.createdAt >= dayStart && entry.createdAt <= dayEnd && entry.type === 'CREDIT')

      return {
        date: day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        sales: ordersForDay.reduce((sum, order) => sum + Number(order.totalAmount), 0),
        collected: ledgerForDay.reduce((sum, entry) => sum + Number(entry.amount), 0),
        orders: ordersForDay.length,
      }
    })

    const statusCounts = recentOrders.reduce(
      (acc, order) => {
        acc[order.status] = (acc[order.status] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const riskCounts = customers.reduce(
      (acc, customer) => {
        acc[customer.riskTag] = (acc[customer.riskTag] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const customerBalances = allLedger.reduce((acc, entry) => {
      if (!entry.customer) return acc
      const current = acc.get(entry.customer.id) ?? {
        customerId: entry.customer.id,
        customerName: entry.customer.name,
        riskTag: entry.customer.riskTag,
        outstanding: 0,
        totalSales: 0,
      }

      if (entry.type === 'DEBIT') {
        current.outstanding += Number(entry.amount)
        current.totalSales += Number(entry.amount)
      } else {
        current.outstanding -= Number(entry.amount)
      }

      acc.set(entry.customer.id, current)
      return acc
    }, new Map<string, { customerId: string; customerName: string; riskTag: string; outstanding: number; totalSales: number }>())

    const topCustomers = [...customerBalances.values()]
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 5)

    const stockAlerts = materials
      .map((material) => {
        const qty = Number(material.stockQty)
        const min = Number(material.minThreshold)
        return {
          id: material.id,
          name: material.name,
          unit: material.unit,
          stockQty: qty,
          minThreshold: min,
          purchasePrice: Number(material.purchasePrice),
          salePrice: Number(material.salePrice),
          status: qty <= 0 ? 'OUT_OF_STOCK' : qty <= min ? 'LOW' : 'OK',
        }
      })
      .filter((material) => material.status !== 'OK')
      .sort((a, b) => a.stockQty - b.stockQty)
      .slice(0, 6)

    const deliverySnapshot = deliveries.reduce(
      (acc, delivery) => {
        acc.total += 1
        acc[delivery.status] += 1
        return acc
      },
      { total: 0, SCHEDULED: 0, IN_TRANSIT: 0, DELIVERED: 0, FAILED: 0 }
    )

    const recentOrdersList = recentOrders.slice(0, 6).map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? 'Unknown customer',
      totalAmount: Number(order.totalAmount),
      amountPaid: Number(order.amountPaid),
      status: order.status,
      createdAt: order.createdAt,
      itemSummary: order.items.map((item) => item.material?.name).filter(Boolean).slice(0, 2).join(', '),
    }))

    return {
      success: true,
      data: {
        todaySales,
        cashCollected,
        totalOutstanding,
        todayOrderCount: todayOrders.length,
        lowStockCount,
        totalCustomers: customers.length,
        activeMaterials: materials.length,
        collectionRate: totalDebit > 0 ? Number(((totalCredit / totalDebit) * 100).toFixed(1)) : 0,
        revenueSeries: series,
        orderStatus: [
          { name: 'Confirmed', value: statusCounts.CONFIRMED ?? 0 },
          { name: 'Dispatched', value: statusCounts.DISPATCHED ?? 0 },
          { name: 'Delivered', value: statusCounts.DELIVERED ?? 0 },
          { name: 'Cancelled', value: statusCounts.CANCELLED ?? 0 },
        ],
        riskSegments: [
          { name: 'Reliable', value: riskCounts.RELIABLE ?? 0 },
          { name: 'Watch', value: riskCounts.WATCH ?? 0 },
          { name: 'Blocked', value: riskCounts.BLOCKED ?? 0 },
        ],
        topCustomers,
        stockAlerts,
        deliverySnapshot,
        recentOrders: recentOrdersList,
      },
    }
  })

  app.get('/summary', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const summary = await loadReportSummary(bizId, req.query)
    return { success: true, data: summary }
  })

  app.get('/history', async (req) => {
    const bizId = getBizId(req)
    const userId = (req.user as any).id

    const exports = await prisma.auditLog.findMany({
      where: {
        businessId: bizId,
        actorId: userId,
        action: 'REPORT_EXPORTED',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return {
      success: true,
      data: exports.map((entry) => {
        const meta = (entry.metadata ?? {}) as Record<string, any>
        return {
          id: entry.id,
          report: meta.page ?? 'unknown',
          label: meta.label ?? 'Report export',
          format: meta.format ?? 'file',
          fileName: meta.fileName ?? 'export',
          exportedAt: entry.createdAt,
          query: meta.query ?? {},
        }
      }),
    }
  })

  app.get('/monthly', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const query = typeof req.query === 'object' && req.query !== null ? req.query as Record<string, unknown> : {}
    const summary = await loadReportSummary(bizId, {
      ...query,
      granularity: 'monthly',
    })

    return {
      success: true,
      data: {
        year: summary.year,
        month: summary.month,
        totalSales: summary.totalSales,
        orderCount: summary.orderCount,
        avgMargin: summary.avgMargin,
      },
    }
  })
}

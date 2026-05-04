import type { FastifyInstance, FastifyRequest } from 'fastify'
import { reportsRepository } from '@cement-house/db'
import { z } from 'zod'
import { requireOwner, getBizId } from '../../middleware/auth'
import { streamAnalyticsSnapshot } from '../../services/pdf'
import { createAuditLog } from '../../services/audit'
import { checkPlanLimit } from '../../services/subscription-access'
import * as XLSX from 'xlsx'

const ReportSummaryQuerySchema = z.object({
  granularity: z.enum(['monthly', 'yearly']).default('monthly'),
  year: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).optional(),
})

const DashboardQuerySchema = z.object({
  range: z.enum(['7d', '1m', '2m', '1y', 'custom']).default('7d'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  recentOrdersLimit: z.coerce.number().int().min(1).max(50).optional(),
  topCustomersLimit: z.coerce.number().int().min(1).max(50).optional(),
  stockAlertsLimit: z.coerce.number().int().min(1).max(50).optional(),
})

const ReportsFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  customerId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  paymentStatus: z.enum(['PAID', 'PARTIAL', 'UNPAID']).optional(),
  orderStatus: z.enum(['DRAFT', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED']).optional(),
  locationId: z.string().optional(),
  topLimit: z.coerce.number().int().min(1).max(50).default(10),
})

function clampListLimit(value: number | undefined, fallback = 5) {
  if (!value || Number.isNaN(value)) return fallback
  return Math.min(50, Math.max(1, Math.trunc(value)))
}

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

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfWeek(date: Date) {
  const next = startOfDay(date)
  const diff = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - diff)
  return next
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInput(value?: string) {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isFeatureEnabled(req: FastifyRequest, key: string) {
  const flags = ((req.user as any)?.featureFlags ?? {}) as Record<string, unknown>
  return flags[key] === true
}

function isModuleEnabled(req: FastifyRequest, key: string) {
  const modules = ((req.user as any)?.enabledModules ?? []) as unknown[]
  return modules.some((entry) => entry === key)
}

function resolveFilter(req: FastifyRequest, bizId: string) {
  const parsed = ReportsFilterSchema.safeParse(req.query ?? {})
  const q = parsed.success ? parsed.data : ReportsFilterSchema.parse({})
  const start = parseDateInput(q.startDate) ?? startOfDay(addDays(new Date(), -29))
  const end = q.endDate ? endOfDay(parseDateInput(q.endDate) ?? new Date()) : endOfDay(new Date())
  return {
    businessId: bizId,
    start,
    end,
    customerId: q.customerId,
    materialId: q.materialId,
    paymentStatus: q.paymentStatus,
    orderStatus: q.orderStatus,
    topLimit: q.topLimit,
    locationId: q.locationId ?? null,
  }
}

function diffInDaysInclusive(start: Date, end: Date) {
  const startMs = startOfDay(start).getTime()
  const endMs = startOfDay(end).getTime()
  return Math.max(1, Math.floor((endMs - startMs) / 86_400_000) + 1)
}

function percentageChange(current: number, previous: number) {
  if (current === 0 && previous === 0) return 0
  if (previous === 0) return 100
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

function dashboardRangeFromQuery(queryInput: unknown, now = new Date()) {
  const parsed = DashboardQuerySchema.safeParse(queryInput)
  const query = parsed.success ? parsed.data : DashboardQuerySchema.parse({})
  const today = startOfDay(now)

  let start = startOfDay(addDays(today, -6))
  let end = endOfDay(now)
  let label = 'Last 7 days'
  let granularity: 'day' | 'week' | 'month' = 'day'

  if (query.range === '1m') {
    start = startOfDay(addDays(today, -29))
    label = 'Last 30 days'
  } else if (query.range === '2m') {
    start = startOfDay(addDays(today, -59))
    label = 'Last 60 days'
  } else if (query.range === '1y') {
    start = startOfDay(addDays(today, -364))
    label = 'Last 12 months'
    granularity = 'month'
  } else if (query.range === 'custom') {
    const parsedStart = parseDateInput(query.startDate)
    const parsedEnd = parseDateInput(query.endDate)

    if (parsedStart && parsedEnd) {
      const [rawStart, rawEnd] = parsedStart <= parsedEnd ? [parsedStart, parsedEnd] : [parsedEnd, parsedStart]
      start = startOfDay(rawStart)
      end = endOfDay(rawEnd)
      label = `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${rawEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

      const spanDays = diffInDaysInclusive(start, rawEnd)
      if (spanDays > 120) granularity = 'month'
      else if (spanDays > 45) granularity = 'week'
      else granularity = 'day'
    }
  }

  const spanDays = diffInDaysInclusive(start, end)
  const comparisonEnd = endOfDay(addDays(start, -1))
  const comparisonStart = startOfDay(addDays(start, -spanDays))

  return {
    preset: query.range,
    start,
    end,
    label,
    granularity,
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
    spanDays,
    comparisonStart,
    comparisonEnd,
    comparisonLabel: `Previous ${spanDays}-day period`,
    exportSuffix: `${query.range}-${formatDateInput(start)}-to-${formatDateInput(end)}`,
  }
}

function bucketKey(date: Date, granularity: 'day' | 'week' | 'month') {
  if (granularity === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  if (granularity === 'week') {
    return formatDateInput(startOfWeek(date))
  }

  return formatDateInput(startOfDay(date))
}

function createSeriesBuckets(range: ReturnType<typeof dashboardRangeFromQuery>) {
  if (range.granularity === 'month') {
    const buckets: Array<{ key: string; date: string; tooltipLabel: string }> = []
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1)

    while (cursor <= range.end) {
      buckets.push({
        key: bucketKey(cursor, 'month'),
        date: cursor.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        tooltipLabel: cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }

    return buckets
  }

  if (range.granularity === 'week') {
    const buckets: Array<{ key: string; date: string; tooltipLabel: string }> = []
    let cursor = startOfWeek(range.start)

    while (cursor <= range.end) {
      const bucketStart = cursor < range.start ? range.start : startOfDay(cursor)
      const bucketEndCandidate = endOfDay(addDays(cursor, 6))
      const bucketEnd = bucketEndCandidate > range.end ? range.end : bucketEndCandidate
      buckets.push({
        key: bucketKey(cursor, 'week'),
        date: `${bucketStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${bucketEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        tooltipLabel: `${bucketStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${bucketEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      })
      cursor = addDays(cursor, 7)
    }

    return buckets
  }

  const buckets: Array<{ key: string; date: string; tooltipLabel: string }> = []
  let cursor = startOfDay(range.start)

  while (cursor <= range.end) {
    buckets.push({
      key: bucketKey(cursor, 'day'),
      date: cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      tooltipLabel: cursor.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    })
    cursor = addDays(cursor, 1)
  }

  return buckets
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

const DASHBOARD_CACHE_TTL_MS = 10_000
const dashboardCache = new Map<string, { expiresAt: number; value: any }>()
const dashboardInFlight = new Map<string, Promise<any>>()

function dashboardCacheKey(bizId: string, queryInput: unknown) {
  const normalizedQuery =
    typeof queryInput === 'object' && queryInput !== null
      ? JSON.stringify(queryInput)
      : String(queryInput ?? '')
  return `${bizId}:${normalizedQuery}`
}

async function loadDashboardDataCached(bizId: string, queryInput: unknown) {
  const key = dashboardCacheKey(bizId, queryInput)
  const now = Date.now()
  const cached = dashboardCache.get(key)
  if (cached && cached.expiresAt > now) return cached.value

  const inflight = dashboardInFlight.get(key)
  if (inflight) return inflight

  const promise = loadDashboardData(bizId, queryInput)
    .then((value) => {
      dashboardCache.set(key, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => {
      dashboardInFlight.delete(key)
    })

  dashboardInFlight.set(key, promise)
  return promise
}

async function createExportAuditLog(req: FastifyRequest, input: {
  page: string
  format: 'pdf' | 'csv' | 'xlsx'
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
  const orders = await reportsRepository.getSummaryOrders({
    businessId: bizId,
    start: period.start,
    end: period.end,
  })

  const totalSales = orders.reduce((sum: number, order: reportsRepository.SummaryOrderRow) => sum + Number(order.totalAmount), 0)
  const totalMargin = orders.reduce((sum: number, order: reportsRepository.SummaryOrderRow) => sum + Number(order.marginPct ?? 0), 0)
  const avgMargin = orders.length ? totalMargin / orders.length : 0
  const paidAmount = orders.reduce((sum: number, order: reportsRepository.SummaryOrderRow) => sum + Number(order.amountPaid), 0)
  const outstanding = orders.reduce((sum: number, order: reportsRepository.SummaryOrderRow) => sum + (Number(order.totalAmount) - Number(order.amountPaid)), 0)

  return {
    ...period,
    totalSales,
    orderCount: orders.length,
    avgMargin,
    paidAmount,
    outstanding,
    recentOrders: orders.slice(0, 8).map((order: reportsRepository.SummaryOrderRow) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName ?? 'Unknown customer',
      totalAmount: Number(order.totalAmount),
      amountPaid: Number(order.amountPaid),
      status: order.status,
      createdAt: order.createdAt,
    })),
  }
}

async function loadDashboardData(bizId: string, queryInput: unknown) {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const parsedQuery = DashboardQuerySchema.safeParse(queryInput)
  const query = parsedQuery.success ? parsedQuery.data : DashboardQuerySchema.parse({})
  const recentOrdersLimit = clampListLimit(query.recentOrdersLimit, 5)
  const topCustomersLimit = clampListLimit(query.topCustomersLimit, 5)
  const stockAlertsLimit = clampListLimit(query.stockAlertsLimit, 5)
  const range = dashboardRangeFromQuery(queryInput, now)

  const [windowedOrders, windowedCredits] = await Promise.all([
    reportsRepository.getWindowedDashboardOrders({
      businessId: bizId,
      todayStart,
      todayEnd,
      rangeStart: range.start,
      rangeEnd: range.end,
      previousStart: range.comparisonStart,
      previousEnd: range.comparisonEnd,
    }),
    reportsRepository.getWindowedCreditEntries({
      businessId: bizId,
      todayStart,
      todayEnd,
      rangeStart: range.start,
      rangeEnd: range.end,
      previousStart: range.comparisonStart,
      previousEnd: range.comparisonEnd,
    }),
  ])

  const todayOrders = windowedOrders.filter((row) => row.windowKey === 'TODAY')
  const rangeOrders = windowedOrders.filter((row) => row.windowKey === 'RANGE')
  const previousOrders = windowedOrders.filter((row) => row.windowKey === 'PREVIOUS')
  const todayCredits = windowedCredits.filter((row) => row.windowKey === 'TODAY')
  const rangeCredits = windowedCredits.filter((row) => row.windowKey === 'RANGE')
  const previousCredits = windowedCredits.filter((row) => row.windowKey === 'PREVIOUS')

  // Keep this as a second wave, after windowed aggregates, to avoid long burst fan-out.
  const [materials, customers, deliveries] = await Promise.all([
    reportsRepository.getActiveMaterials(bizId),
    reportsRepository.getActiveCustomersWithOrderCount(bizId),
    reportsRepository.getDeliveriesForBusiness(bizId),
  ])

  const totalSales = rangeOrders.reduce((sum: number, order: reportsRepository.DashboardOrderRow) => sum + Number(order.totalAmount), 0)
  const totalCollected = rangeCredits.reduce((sum: number, entry: reportsRepository.AmountRow) => sum + Number(entry.amount), 0)
  const totalOutstanding = rangeOrders.reduce((sum: number, order: reportsRepository.DashboardOrderRow) => sum + (Number(order.totalAmount) - Number(order.amountPaid)), 0)
  const todaySales = todayOrders.reduce((sum: number, order: reportsRepository.DashboardOrderRow) => sum + Number(order.totalAmount), 0)
  const todayCollected = todayCredits.reduce((sum: number, entry: reportsRepository.AmountRow) => sum + Number(entry.amount), 0)
  const previousSales = previousOrders.reduce((sum: number, order: reportsRepository.DashboardOrderRow) => sum + Number(order.totalAmount), 0)
  const previousCollected = previousCredits.reduce((sum: number, entry: reportsRepository.AmountRow) => sum + Number(entry.amount), 0)
  const previousOutstanding = previousOrders.reduce((sum: number, order: reportsRepository.DashboardOrderRow) => sum + (Number(order.totalAmount) - Number(order.amountPaid)), 0)
  const lowStockCount = materials.filter((material: reportsRepository.MaterialRow) => Number(material.stockQty) <= Number(material.minThreshold)).length

  const seriesBuckets = createSeriesBuckets(range)
  const orderSeriesMap = new Map<string, { sales: number; orders: number }>()
  const collectionSeriesMap = new Map<string, number>()

  for (const order of rangeOrders) {
    const key = bucketKey(order.createdAt, range.granularity)
    const current = orderSeriesMap.get(key) ?? { sales: 0, orders: 0 }
    current.sales += Number(order.totalAmount)
    current.orders += 1
    orderSeriesMap.set(key, current)
  }

  for (const entry of rangeCredits) {
    const key = bucketKey(entry.createdAt, range.granularity)
    collectionSeriesMap.set(key, (collectionSeriesMap.get(key) ?? 0) + Number(entry.amount))
  }

  const series = seriesBuckets.map((bucket) => {
    const salesBucket = orderSeriesMap.get(bucket.key)
    return {
      date: bucket.date,
      tooltipLabel: bucket.tooltipLabel,
      sales: salesBucket?.sales ?? 0,
      collected: collectionSeriesMap.get(bucket.key) ?? 0,
      orders: salesBucket?.orders ?? 0,
    }
  })

  const statusCounts = rangeOrders.reduce(
    (acc: Record<string, number>, order: reportsRepository.DashboardOrderRow) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const riskCounts = customers.reduce(
    (acc: Record<string, number>, customer: reportsRepository.CustomerCountRow) => {
      acc[customer.riskTag] = (acc[customer.riskTag] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const customerPerformance = rangeOrders.reduce((acc, order: reportsRepository.DashboardOrderRow) => {
    const customerId = order.customerId
    const customerName = order.customerName ?? 'Unknown customer'
    const riskTag = order.riskTag ?? 'WATCH'
    const current = acc.get(customerId) ?? {
      customerId,
      customerName,
      riskTag,
      outstanding: 0,
      totalSales: 0,
      orderCount: 0,
    }

    current.totalSales += Number(order.totalAmount)
    current.outstanding += Number(order.totalAmount) - Number(order.amountPaid)
    current.orderCount += 1
    acc.set(customerId, current)
    return acc
  }, new Map<string, { customerId: string; customerName: string; riskTag: string; outstanding: number; totalSales: number; orderCount: number }>())

  const topCustomers = [...customerPerformance.values()]
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, topCustomersLimit)

  const stockAlerts = materials
    .map((material: reportsRepository.MaterialRow) => {
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
    .filter((material: { status: string }) => material.status !== 'OK')
    .sort((a: { stockQty: number }, b: { stockQty: number }) => a.stockQty - b.stockQty)
    .slice(0, stockAlertsLimit)

  const deliverySnapshot = deliveries.reduce(
    (acc: { total: number; SCHEDULED: number; IN_TRANSIT: number; DELIVERED: number; FAILED: number }, delivery: reportsRepository.DeliveryRow) => {
      acc.total += 1
      acc[delivery.status] += 1
      return acc
    },
    { total: 0, SCHEDULED: 0, IN_TRANSIT: 0, DELIVERED: 0, FAILED: 0 }
  )

  const recentOrders = rangeOrders.slice(0, recentOrdersLimit).map((order: reportsRepository.DashboardOrderRow) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName ?? 'Unknown customer',
    totalAmount: Number(order.totalAmount),
    amountPaid: Number(order.amountPaid),
    status: order.status,
    createdAt: order.createdAt,
    itemSummary: order.itemSummary
      .split(',')
      .map((part: string) => part.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(', '),
  }))

  const strongestBucket = [...series].sort((a, b) => b.sales - a.sales)[0]
  const activeCustomersInRange = new Set(rangeOrders.map((order: reportsRepository.DashboardOrderRow) => order.customerId)).size

  return {
    range: {
      preset: range.preset,
      label: range.label,
      startDate: range.startDate,
      endDate: range.endDate,
      comparisonLabel: range.comparisonLabel,
      granularity: range.granularity,
      exportSuffix: range.exportSuffix,
    },
    summary: {
      totalSales,
      cashCollected: totalCollected,
      totalOutstanding,
      orderCount: rangeOrders.length,
      activeCustomersInRange,
      lowStockCount,
      totalCustomers: customers.length,
      activeMaterials: materials.length,
      collectionRate: totalSales > 0 ? Number(((totalCollected / totalSales) * 100).toFixed(1)) : 0,
      averageOrderValue: rangeOrders.length > 0 ? Math.round(totalSales / rangeOrders.length) : 0,
    },
    todaySnapshot: {
      sales: todaySales,
      collected: todayCollected,
      orderCount: todayOrders.length,
    },
    comparison: {
      salesDeltaPct: percentageChange(totalSales, previousSales),
      collectedDeltaPct: percentageChange(totalCollected, previousCollected),
      outstandingDeltaPct: percentageChange(totalOutstanding, previousOutstanding),
      orderDeltaPct: percentageChange(rangeOrders.length, previousOrders.length),
    },
    highlights: {
      strongestBucketLabel: strongestBucket?.tooltipLabel ?? null,
      strongestBucketSales: strongestBucket?.sales ?? 0,
      averagePerBucket: series.length > 0 ? Math.round(totalSales / series.length) : 0,
      totalCollections: totalCollected,
    },
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
    recentOrders,
    displayLimits: {
      recentOrders: recentOrdersLimit,
      topCustomers: topCustomersLimit,
      stockAlerts: stockAlertsLimit,
    },
  }
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/filters', async (req) => {
    const bizId = getBizId(req)
    const options = await reportsRepository.getReportFilterOptions(bizId)
    return { success: true, data: options }
  })

  app.get('/catalog', async (req) => {
    return {
      success: true,
      data: {
        tabs: [
          { key: 'sales', enabled: true },
          { key: 'inventory', enabled: isModuleEnabled(req, 'inventory') },
          { key: 'gst', enabled: isFeatureEnabled(req, 'gstBilling') },
          { key: 'payments', enabled: true },
          { key: 'profit-loss', enabled: true },
          { key: 'customers', enabled: isModuleEnabled(req, 'customers') },
          { key: 'returns', enabled: true },
          { key: 'expenses', enabled: isModuleEnabled(req, 'expenses') },
          { key: 'transport', enabled: isFeatureEnabled(req, 'transportManagement') || isFeatureEnabled(req, 'transport') },
          { key: 'expiry', enabled: isFeatureEnabled(req, 'expiryTracking') },
          { key: 'batch', enabled: isFeatureEnabled(req, 'batchTracking') },
          { key: 'serial', enabled: isFeatureEnabled(req, 'serialTracking') },
        ],
      },
    }
  })

  app.get('/sales-summary', async (req, reply) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const summary = await reportsRepository.getSalesSummaryByFilter(filter)
    return { success: true, data: summary[0] ?? null }
  })

  app.get('/sales-invoices', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getSalesInvoicesByFilter(filter)
    return { success: true, data: rows }
  })

  app.get('/inventory-stock', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getInventorySnapshot(bizId, filter.locationId)
    return { success: true, data: rows }
  })

  app.get('/low-stock', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getInventorySnapshot(bizId, filter.locationId)
    const low = rows.filter((r) => Number(r.stockQty) <= Number(r.minThreshold))
    return { success: true, data: low }
  })

  app.get('/customer-dues', async (req) => {
    const bizId = getBizId(req)
    const rows = await reportsRepository.getKhataSnapshot(bizId)
    return { success: true, data: rows.filter((row) => Number(row.outstanding) > 0) }
  })

  app.get('/supplier-dues', async () => {
    return { success: true, data: [], message: 'Suppliers module/report is not implemented yet in this workspace.' }
  })

  app.get('/profit-loss', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const data = await reportsRepository.getProfitLossByFilter(filter)
    return { success: true, data }
  })

  app.get('/gst-summary', async (req, reply) => {
    if (!isFeatureEnabled(req, 'gstBilling')) {
      return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'GST billing is not enabled for this business.' })
    }
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const data = await reportsRepository.getGstSummaryForRange({ businessId: bizId, start: filter.start, end: filter.end })
    return { success: true, data }
  })

  app.get('/hsn-summary', async (req, reply) => {
    if (!isFeatureEnabled(req, 'gstBilling')) {
      return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'GST billing is not enabled for this business.' })
    }
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getHsnSummaryByFilter(filter)
    return { success: true, data: rows }
  })

  app.get('/payment-collections', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getPaymentCollectionsByFilter(filter)
    return { success: true, data: rows }
  })

  app.get('/expenses', async (req) => {
    if (!isModuleEnabled(req, 'expenses')) {
      return { success: true, data: [], message: 'Expenses module is not enabled for this business.' }
    }
    return { success: true, data: [], message: 'Expenses report API placeholder. Add expenses table integration next.' }
  })

  app.get('/sales-returns', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const data = await reportsRepository.getSalesReturnsByFilter(filter)
    return { success: true, data }
  })

  app.get('/top-products', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getTopSellingProductsByFilter(filter, filter.topLimit)
    return { success: true, data: rows }
  })

  app.get('/top-customers', async (req) => {
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getTopCustomersByFilter(filter, filter.topLimit)
    return { success: true, data: rows }
  })

  app.get('/transport', async (req, reply) => {
    if (!isFeatureEnabled(req, 'transportManagement') && !isFeatureEnabled(req, 'transport')) {
      return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'Transport management is not enabled for this business.' })
    }
    const bizId = getBizId(req)
    const filter = resolveFilter(req, bizId)
    const rows = await reportsRepository.getTransportReportByFilter(filter)
    return { success: true, data: rows }
  })

  app.get('/expiry', async (req, reply) => {
    if (!isFeatureEnabled(req, 'expiryTracking')) {
      return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'Expiry tracking is not enabled for this business.' })
    }
    const bizId = getBizId(req)
    const days = Number((req.query as any)?.days ?? 60)
    const rows = await reportsRepository.getExpiryItemsReport(bizId, Number.isFinite(days) ? Math.min(Math.max(days, 1), 365) : 60)
    return { success: true, data: rows }
  })

  app.get('/batch', async (req, reply) => {
    if (!isFeatureEnabled(req, 'batchTracking')) {
      return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'Batch tracking is not enabled for this business.' })
    }
    const bizId = getBizId(req)
    const rows = await reportsRepository.getBatchReport(bizId)
    return { success: true, data: rows }
  })

  app.get('/serial', async (req, reply) => {
    if (!isFeatureEnabled(req, 'serialTracking')) {
      return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'Serial tracking is not enabled for this business.' })
    }
    const bizId = getBizId(req)
    const rows = await reportsRepository.getSerialTrackingReport(bizId)
    return { success: true, data: rows }
  })

  app.get('/purchase-summary', async (req) => {
    if (!isModuleEnabled(req, 'purchases')) {
      return { success: true, data: [], message: 'Purchases module is not enabled for this business.' }
    }
    return { success: true, data: [], message: 'Purchase summary placeholder. Add purchase table integration next.' }
  })

  app.get('/export', async (req, reply) => {
    const bizId = getBizId(req)
    const exportGate = await checkPlanLimit(bizId, 'allowExports')
    if (!exportGate.allowed) {
      return reply.status(exportGate.reason === 'PLAN_EXPIRED' ? 402 : 403).send({
        success: false,
        code: exportGate.reason === 'PLAN_EXPIRED' ? 'PLAN_EXPIRED' : 'LIMIT_EXCEEDED',
        error: exportGate.reason === 'PLAN_EXPIRED' ? 'Plan expired. Please renew your subscription.' : 'Exports are not available on your current plan.',
      })
    }
    const { page = 'dashboard', format } = req.query as { page?: string; format?: string }
    const jwtUser = req.user as any
    const generatedAt = new Date()
    const exportFormat = format === 'pdf' ? 'pdf' : format === 'xlsx' ? 'xlsx' : 'csv'

    const sendCsv = async (filename: string, body: string, label: string, query?: Record<string, unknown>) => {
      await createExportAuditLog(req, { page, format: 'csv', fileName: filename, label, query })
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(body)
    }

    const sendXlsx = async (filename: string, headers: string[], rows: Array<Array<string | number>>, label: string, query?: Record<string, unknown>) => {
      await createExportAuditLog(req, { page, format: 'xlsx', fileName: filename, label, query })
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Report')
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(buffer)
    }

    const sendTabularExport = async (baseFilename: string, headers: string[], rows: Array<Array<string | number>>, label: string, query?: Record<string, unknown>) => {
      if (exportFormat === 'xlsx') {
        return sendXlsx(baseFilename.replace(/\.csv$/i, '.xlsx'), headers, rows, label, query)
      }
      return sendCsv(baseFilename, csv(headers, rows), label, query)
    }

    if (page === 'dashboard') {
      const dashboard = await loadDashboardData(bizId, req.query)
      return sendTabularExport(
        `dashboard-${dashboard.range.exportSuffix}.csv`,
        ['Metric', 'Value'],
        [
            ['Range', dashboard.range.label],
            ['Orders in selection', dashboard.summary.orderCount],
            ['Total sales', dashboard.summary.totalSales],
            ['Cash collected', dashboard.summary.cashCollected],
            ['Outstanding', dashboard.summary.totalOutstanding],
            ['Collection rate %', dashboard.summary.collectionRate],
            ['Average order value', dashboard.summary.averageOrderValue],
            ['Active customers in range', dashboard.summary.activeCustomersInRange],
            ['Active materials', dashboard.summary.activeMaterials],
            ['Low stock items', dashboard.summary.lowStockCount],
            ['Today sales', dashboard.todaySnapshot.sales],
            ['Today collected', dashboard.todaySnapshot.collected],
            ['Today orders', dashboard.todaySnapshot.orderCount],
            ['Sales delta %', dashboard.comparison.salesDeltaPct],
            ['Collected delta %', dashboard.comparison.collectedDeltaPct],
            ['Outstanding delta %', dashboard.comparison.outstandingDeltaPct],
            ['Order delta %', dashboard.comparison.orderDeltaPct],
          ],
        `Dashboard snapshot - ${dashboard.range.label}`,
        {
          range: dashboard.range.preset,
          startDate: dashboard.range.startDate,
          endDate: dashboard.range.endDate,
        }
      )
    }

    if (page === 'reports') {
      const summary = await loadReportSummary(bizId, req.query)
      if (exportFormat === 'csv') {
        return sendTabularExport(
          `business-report-${summary.exportSuffix}.csv`,
          ['Metric', 'Value'],
          [
              ['Granularity', summary.granularity],
              ['Period', summary.label],
              ['Total sales', summary.totalSales],
              ['Order count', summary.orderCount],
              ['Avg margin %', Number(summary.avgMargin.toFixed(2))],
              ['Collected', summary.paidAmount],
              ['Outstanding', summary.outstanding],
            ],
          `${summary.granularity === 'yearly' ? 'Yearly' : 'Monthly'} report - ${summary.label}`,
          {
            granularity: summary.granularity,
            year: summary.year,
            month: summary.month,
          }
        )
      }

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
          businessName: jwtUser.businessName ?? 'Business Hub',
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
                ? summary.recentOrders.map((order: { orderNumber: string; customerName: string; totalAmount: number }) => ({
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
      const orders = await reportsRepository.getOrdersSnapshot(bizId)
      return sendTabularExport(
        'orders-snapshot.csv',
        ['Order Number', 'Date', 'Customer', 'Status', 'Items', 'Total Amount', 'Amount Paid', 'Due'],
        orders.map((order: reportsRepository.OrderSnapshotRow) => [
            order.orderNumber,
            order.createdAt.toISOString(),
            order.customerName,
            order.status,
            order.itemCount,
            order.totalAmount,
            order.amountPaid,
            order.dueAmount,
          ]),
        'Orders snapshot'
      )
    }

    if (page === 'customers') {
      const customers = await reportsRepository.getCustomersSnapshot(bizId)
      return sendTabularExport(
        'customers-snapshot.csv',
        ['Name', 'Phone', 'Risk Tag', 'Address', 'Orders', 'Credit Limit', 'Outstanding'],
        customers.map((customer: reportsRepository.CustomerSnapshotRow) => [
            customer.name,
            customer.phone,
            customer.riskTag,
            customer.address ?? '',
            customer.orderCount,
            customer.creditLimit,
            customer.outstanding,
          ]),
        'Customers snapshot'
      )
    }

    if (page === 'inventory') {
      const materials = await reportsRepository.getInventorySnapshot(bizId)
      return sendTabularExport(
        'inventory-snapshot.csv',
        ['Material', 'Unit', 'Stock Qty', 'Min Threshold', 'Max Threshold', 'Purchase Price', 'Sale Price'],
        materials.map((material: reportsRepository.InventorySnapshotRow) => [
            material.name,
            material.unit,
            material.stockQty,
            material.minThreshold,
            material.maxThreshold,
            material.purchasePrice,
            material.salePrice,
          ]),
        'Inventory snapshot'
      )
    }

    if (page === 'delivery') {
      const start = startOfDay(generatedAt)
      const end = endOfDay(generatedAt)
      const deliveries = await reportsRepository.getDeliverySnapshotForRange({ businessId: bizId, start, end })
      return sendTabularExport(
        'delivery-board-snapshot.csv',
        ['Challan Number', 'Created At', 'Customer', 'Address', 'Status', 'Driver', 'Vehicle'],
        deliveries.map((delivery: reportsRepository.DeliverySnapshotRow) => [
            delivery.challanNumber,
            delivery.createdAt.toISOString(),
            delivery.customerName,
            delivery.customerAddress,
            delivery.status,
            delivery.driverName ?? '',
            delivery.vehicleNumber ?? '',
          ]),
        'Delivery snapshot'
      )
    }

    if (page === 'khata') {
      const rows = await reportsRepository.getKhataSnapshot(bizId)
      return sendTabularExport(
        'khata-snapshot.csv',
        ['Customer', 'Phone', 'Risk Tag', 'Total Debit', 'Total Credit', 'Outstanding'],
        rows.map((row: reportsRepository.KhataSnapshotRow) => [
            row.name,
            row.phone,
            row.riskTag,
            row.debit,
            row.credit,
            row.outstanding,
          ]),
        'Khata snapshot'
      )
    }

    if (page === 'settings') {
      const rows = await reportsRepository.getWorkspaceSnapshotRows(bizId)
      if (rows.length === 0) return reply.status(404).send({ success: false, error: 'Business not found' })
      return sendTabularExport(
        'workspace-snapshot.csv',
        ['Business Name', 'City', 'Phone', 'GSTIN', 'User Name', 'Role', 'Permissions'],
        rows.map((row: reportsRepository.WorkspaceSnapshotRow) => [
            row.businessName,
            row.city,
            row.phone ?? '',
            row.gstin ?? '',
            row.userName ?? '',
            row.role ?? '',
            row.permissions,
          ]),
        'Workspace snapshot'
      )
    }

    if (page === 'sales-summary') {
      const filter = resolveFilter(req, bizId)
      const sales = await reportsRepository.getSalesSummaryByFilter(filter)
      const row = sales[0]
      return sendTabularExport(
        'sales-summary.csv',
        ['Invoices', 'Grand Total', 'Paid', 'Due', 'Taxable', 'GST', 'CGST', 'SGST', 'IGST'],
        [[row?.invoiceCount ?? 0, row?.grandTotal ?? 0, row?.paidAmount ?? 0, row?.dueAmount ?? 0, row?.taxableAmount ?? 0, row?.gstTotal ?? 0, row?.cgstTotal ?? 0, row?.sgstTotal ?? 0, row?.igstTotal ?? 0]],
        'Sales summary export'
      )
    }

    if (page === 'gst-summary') {
      if (!isFeatureEnabled(req, 'gstBilling')) {
        return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'GST billing is not enabled for this business.' })
      }
      const filter = resolveFilter(req, bizId)
      const gst = await reportsRepository.getGstSummaryForRange({ businessId: bizId, start: filter.start, end: filter.end })
      return sendTabularExport(
        'gst-summary.csv',
        ['Taxable', 'GST', 'CGST', 'SGST', 'IGST', 'Invoice Count'],
        [[gst.taxableAmount, gst.gstTotal, gst.cgstTotal, gst.sgstTotal, gst.igstTotal, gst.invoiceCount]],
        'GST summary export'
      )
    }

    if (page === 'gstr1') {
      if (!isFeatureEnabled(req, 'gstBilling')) {
        return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'GST billing is not enabled for this business.' })
      }
      const filter = resolveFilter(req, bizId)
      const invoices = await reportsRepository.getSalesInvoicesByFilter(filter)
      return sendTabularExport(
        'gstr1-export.csv',
        ['Date', 'Invoice Number', 'Customer', 'Taxable', 'GST', 'CGST', 'SGST', 'IGST', 'Invoice Total'],
        invoices.map((inv) => [
          inv.date.toISOString(),
          inv.invoiceNumber,
          inv.customerName,
          inv.taxableAmount,
          inv.gstTotal,
          inv.cgstTotal,
          inv.sgstTotal,
          inv.igstTotal,
          inv.amount,
        ]),
        'GSTR-1 export'
      )
    }

    if (page === 'hsn-summary') {
      if (!isFeatureEnabled(req, 'gstBilling')) {
        return reply.status(403).send({ success: false, code: 'FEATURE_DISABLED', error: 'GST billing is not enabled for this business.' })
      }
      const filter = resolveFilter(req, bizId)
      const hsn = await reportsRepository.getHsnSummaryByFilter(filter)
      return sendTabularExport(
        'hsn-summary.csv',
        ['HSN/SAC', 'Taxable', 'GST', 'CGST', 'SGST', 'IGST', 'Qty'],
        hsn.map((row) => [row.hsnCode, row.taxableAmount, row.gstAmount, row.cgstAmount, row.sgstAmount, row.igstAmount, row.qty]),
        'HSN summary export'
      )
    }

    if (page === 'payment-collections') {
      const filter = resolveFilter(req, bizId)
      const payments = await reportsRepository.getPaymentCollectionsByFilter(filter)
      return sendTabularExport(
        'payment-collections.csv',
        ['Mode', 'Paid Amount', 'Invoice Count'],
        payments.map((row) => [row.paymentMode, row.totalPaid, row.invoiceCount]),
        'Payment collections export'
      )
    }

    if (page === 'top-products') {
      const filter = resolveFilter(req, bizId)
      const rows = await reportsRepository.getTopSellingProductsByFilter(filter, filter.topLimit)
      return sendTabularExport(
        'top-products.csv',
        ['Product', 'Quantity Sold', 'Sales Amount'],
        rows.map((row) => [row.materialName, row.quantitySold, row.salesAmount]),
        'Top products export'
      )
    }

    if (page === 'top-customers') {
      const filter = resolveFilter(req, bizId)
      const rows = await reportsRepository.getTopCustomersByFilter(filter, filter.topLimit)
      return sendTabularExport(
        'top-customers.csv',
        ['Customer', 'Orders', 'Sales', 'Paid', 'Due'],
        rows.map((row) => [row.customerName, row.orderCount, row.salesAmount, row.paidAmount, row.dueAmount]),
        'Top customers export'
      )
    }

    return reply.status(400).send({ success: false, error: 'Unsupported export page' })
  })

  app.get('/dashboard', async (req, reply) => {
    const bizId = getBizId(req)
    // Keep dashboard resilient for all active users. Advanced plan gates are enforced
    // on detailed reports/exports, while overview cards should not hard-fail.
    return {
      success: true,
      data: await loadDashboardDataCached(bizId, req.query),
    }
  })

  app.get('/summary', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const reportsGate = await checkPlanLimit(bizId, 'allowAdvancedReports')
    if (!reportsGate.allowed) {
      return reply.status(reportsGate.reason === 'PLAN_EXPIRED' ? 402 : 403).send({
        success: false,
        code: reportsGate.reason === 'PLAN_EXPIRED' ? 'PLAN_EXPIRED' : 'LIMIT_EXCEEDED',
        error: reportsGate.reason === 'PLAN_EXPIRED' ? 'Plan expired. Please renew your subscription.' : 'Advanced reports are not available on your current plan.',
      })
    }
    const summary = await loadReportSummary(bizId, req.query)
    return { success: true, data: summary }
  })

  app.get('/history', async (req) => {
    const bizId = getBizId(req)
    const userId = (req.user as { id: string }).id

    const exports = await reportsRepository.getReportExportHistory({
      businessId: bizId,
      actorId: userId,
      limit: 50,
    })

    return {
      success: true,
      data: exports.map((entry: reportsRepository.AuditHistoryRow) => {
        const meta = (entry.metadata ?? {}) as Record<string, unknown>
        return {
          id: entry.id,
          report: typeof meta.page === 'string' ? meta.page : 'unknown',
          label: typeof meta.label === 'string' ? meta.label : 'Report export',
          format: typeof meta.format === 'string' ? meta.format : 'file',
          fileName: typeof meta.fileName === 'string' ? meta.fileName : 'export',
          exportedAt: entry.createdAt,
          query: typeof meta.query === 'object' && meta.query !== null ? meta.query : {},
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

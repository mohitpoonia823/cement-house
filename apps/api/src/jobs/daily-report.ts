/** Nightly per-business sales summary to the owner — ported from apps/worker. */
import { prisma } from '@cement-house/db'
import { formatRupees } from '@cement-house/utils'
import { sendWhatsAppText } from './whatsapp'
import { mapWithConcurrency } from './concurrency'

export async function runDailyReport() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)

  const businesses = await prisma.business.findMany({ where: { isActive: true } })
  const businessIds = businesses.map((business) => business.id)
  if (businessIds.length === 0) return { businesses: 0, sent: 0, failed: 0 }

  const orderAgg = await prisma.order.groupBy({
    by: ['businessId'],
    where: {
      businessId: { in: businessIds },
      createdAt: { gte: start, lte: end },
      status: { not: 'CANCELLED' },
    },
    _sum: { totalAmount: true, amountPaid: true },
    _count: { id: true },
  })

  const owners = await prisma.user.findMany({
    where: { role: 'OWNER', isActive: true, businessId: { in: businessIds } },
    select: { businessId: true, phone: true, name: true },
  })

  const statsMap = new Map(orderAgg.map((row) => [row.businessId, row]))
  const ownerMap = new Map(owners.map((owner) => [owner.businessId ?? '', owner]))

  const targets = businesses.flatMap((biz) => {
    const owner = ownerMap.get(biz.id)
    return owner ? [{ biz, owner }] : []
  })

  const outcomes = await mapWithConcurrency(targets, 5, async ({ biz, owner }) => {
    const stats = statsMap.get(biz.id)
    const totalSales = Number(stats?._sum.totalAmount ?? 0)
    const cashCollected = Number(stats?._sum.amountPaid ?? 0)
    const orderCount = Number(stats?._count.id ?? 0)

    const summary =
      `*${biz.name} - Aaj ki Report*\n\n` +
      `Tarikh: ${new Date().toLocaleDateString('hi-IN')}\n` +
      `Kul Bikri: *${formatRupees(totalSales)}*\n` +
      `Naqdh Mila: *${formatRupees(cashCollected)}*\n` +
      `Orders: ${orderCount}\n\n` +
      'Shubh Ratri!'

    const result = await sendWhatsAppText(owner.phone, summary)
    if (!result.ok) console.error(`[daily-report] ${biz.name}: ${result.error ?? result.status}`)
    return result.ok
  })

  const sent = outcomes.filter(Boolean).length
  const stats = { businesses: businesses.length, sent, failed: outcomes.length - sent }
  console.log(`[daily-report] ${JSON.stringify(stats)}`)
  return stats
}

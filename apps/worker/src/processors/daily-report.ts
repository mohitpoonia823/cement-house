import { prisma } from '@cement-house/db'
import { formatRupees } from '@cement-house/utils'

export async function processDailyReport() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)

  const businesses = await prisma.business.findMany({ where: { isActive: true } })
  const businessIds = businesses.map((business) => business.id)

  const orderAgg = businessIds.length > 0
    ? await prisma.order.groupBy({
        by: ['businessId'],
        where: {
          businessId: { in: businessIds },
          createdAt: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
        },
        _sum: { totalAmount: true, amountPaid: true },
        _count: { id: true },
      })
    : []

  const owners = businessIds.length > 0
    ? await prisma.user.findMany({
        where: { role: 'OWNER', isActive: true, businessId: { in: businessIds } },
        select: { businessId: true, phone: true, name: true },
      })
    : []

  const statsMap = new Map(orderAgg.map((row) => [row.businessId, row]))
  const ownerMap = new Map(owners.map((owner) => [owner.businessId ?? '', owner]))

  for (const biz of businesses) {
    const stats = statsMap.get(biz.id)
    const totalSales = Number(stats?._sum.totalAmount ?? 0)
    const cashCollected = Number(stats?._sum.amountPaid ?? 0)
    const orderCount = Number(stats?._count.id ?? 0)

    const owner = ownerMap.get(biz.id)
    if (!owner) continue

    const summary =
      `*${biz.name} - Aaj ki Report*\n\n` +
      `Tarikh: ${new Date().toLocaleDateString('hi-IN')}\n` +
      `Kul Bikri: *${formatRupees(totalSales)}*\n` +
      `Naqdh Mila: *${formatRupees(cashCollected)}*\n` +
      `Orders: ${orderCount}\n\n` +
      'Shubh Ratri!'

    await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `91${owner.phone}`,
        type: 'text',
        text: { body: summary },
      }),
    })
    console.log(`[daily-report] ${biz.name}: Sent to ${owner.name}`)
  }
}
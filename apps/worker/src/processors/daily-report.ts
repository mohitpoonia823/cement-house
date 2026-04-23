import { prisma }    from '@cement-house/db'
import { formatRupees } from '@cement-house/utils'

export async function processDailyReport() {
  const start = new Date(); start.setHours(0,0,0,0)
  const end   = new Date(); end.setHours(23,59,59,999)

  // Process for each business
  const businesses = await prisma.business.findMany({ where: { isActive: true } })

  for (const biz of businesses) {
    const todayOrders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' }, businessId: biz.id },
    })

    const totalSales    = todayOrders.reduce((s, o) => s + Number(o.totalAmount), 0)
    const cashCollected = todayOrders.reduce((s, o) => s + Number(o.amountPaid), 0)

    const owner = await prisma.user.findFirst({ where: { role: 'OWNER', businessId: biz.id } })
    if (!owner) continue

    const summary = `*${biz.name} — Aaj ki Report*\n\n` +
      `Tarikh: ${new Date().toLocaleDateString('hi-IN')}\n` +
      `Kul Bikri: *${formatRupees(totalSales)}*\n` +
      `Naqdh Mila: *${formatRupees(cashCollected)}*\n` +
      `Orders: ${todayOrders.length}\n\n` +
      `Shubh Ratri! 🙏`

    await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: `91${owner.phone}`,
          type: 'text', text: { body: summary },
        }),
      }
    )
    console.log(`[daily-report] ${biz.name}: Sent to ${owner.name}`)
  }
}

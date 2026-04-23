import { prisma }    from '@cement-house/db'

export async function processStockAlert() {
  // Process for each business
  const businesses = await prisma.business.findMany({ where: { isActive: true } })

  for (const biz of businesses) {
    const lowItems = await prisma.material.findMany({
      where: { isActive: true, businessId: biz.id },
    })

    const critical = lowItems.filter(m => Number(m.stockQty) <= Number(m.minThreshold))
    if (critical.length === 0) continue

    const owner = await prisma.user.findFirst({ where: { role: 'OWNER', businessId: biz.id } })
    if (!owner) continue

    const lines = critical.map(m =>
      `• ${m.name}: *${m.stockQty} ${m.unit}* (min: ${m.minThreshold})`
    ).join('\n')

    const message = `*Stock Alert — ${biz.name}*\n\nNeeche items ka stock kam ho gaya hai:\n\n${lines}\n\nKripya order karen.`

    await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: `91${owner.phone}`,
          type: 'text', text: { body: message },
        }),
      }
    )
    console.log(`[stock-alert] ${biz.name}: Alerted for ${critical.length} items`)
  }
}

import { prisma } from '@cement-house/db'

export async function processStockAlert() {
  const businesses = await prisma.business.findMany({ where: { isActive: true } })
  const businessIds = businesses.map((business) => business.id)

  const materials = businessIds.length > 0
    ? await prisma.material.findMany({
        where: { isActive: true, businessId: { in: businessIds } },
        select: { id: true, businessId: true, name: true, unit: true, stockQty: true, minThreshold: true },
      })
    : []

  const owners = businessIds.length > 0
    ? await prisma.user.findMany({
        where: { role: 'OWNER', isActive: true, businessId: { in: businessIds } },
        select: { businessId: true, phone: true, name: true },
      })
    : []

  const materialsByBusiness = new Map<string, typeof materials>()
  for (const material of materials) {
    const current = materialsByBusiness.get(material.businessId) ?? []
    current.push(material)
    materialsByBusiness.set(material.businessId, current)
  }
  const ownerMap = new Map(owners.map((owner) => [owner.businessId ?? '', owner]))

  for (const biz of businesses) {
    const allItems = materialsByBusiness.get(biz.id) ?? []
    const critical = allItems.filter((item) => Number(item.stockQty) <= Number(item.minThreshold))
    if (critical.length === 0) continue

    const owner = ownerMap.get(biz.id)
    if (!owner) continue

    const lines = critical
      .map((item) => `- ${item.name}: *${item.stockQty} ${item.unit}* (min: ${item.minThreshold})`)
      .join('\n')

    const message = `*Stock Alert - ${biz.name}*\n\nNeeche items ka stock kam ho gaya hai:\n\n${lines}\n\nKripya order karen.`

    await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `91${owner.phone}`,
        type: 'text',
        text: { body: message },
      }),
    })
    console.log(`[stock-alert] ${biz.name}: Alerted for ${critical.length} items`)
  }
}
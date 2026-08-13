/** Low-stock alert to each business owner — ported from apps/worker. */
import { prisma } from '@cement-house/db'
import { sendWhatsAppText } from './whatsapp'
import { mapWithConcurrency } from './concurrency'

export async function runStockAlert() {
  const businesses = await prisma.business.findMany({ where: { isActive: true } })
  const businessIds = businesses.map((business) => business.id)
  if (businessIds.length === 0) return { businesses: 0, alerted: 0, failed: 0 }

  const materials = await prisma.material.findMany({
    where: { isActive: true, businessId: { in: businessIds } },
    select: { id: true, businessId: true, name: true, unit: true, stockQty: true, minThreshold: true },
  })

  const owners = await prisma.user.findMany({
    where: { role: 'OWNER', isActive: true, businessId: { in: businessIds } },
    select: { businessId: true, phone: true, name: true },
  })

  const materialsByBusiness = new Map<string, typeof materials>()
  for (const material of materials) {
    const current = materialsByBusiness.get(material.businessId) ?? []
    current.push(material)
    materialsByBusiness.set(material.businessId, current)
  }
  const ownerMap = new Map(owners.map((owner) => [owner.businessId ?? '', owner]))

  const targets = businesses.flatMap((biz) => {
    const critical = (materialsByBusiness.get(biz.id) ?? []).filter(
      (item) => Number(item.stockQty) <= Number(item.minThreshold),
    )
    const owner = ownerMap.get(biz.id)
    return critical.length > 0 && owner ? [{ biz, owner, critical }] : []
  })

  const outcomes = await mapWithConcurrency(targets, 5, async ({ biz, owner, critical }) => {
    const lines = critical
      .map((item) => `- ${item.name}: *${item.stockQty} ${item.unit}* (min: ${item.minThreshold})`)
      .join('\n')
    const message = `*Stock Alert - ${biz.name}*\n\nNeeche items ka stock kam ho gaya hai:\n\n${lines}\n\nKripya order karen.`

    const result = await sendWhatsAppText(owner.phone, message)
    if (!result.ok) console.error(`[stock-alert] ${biz.name}: ${result.error ?? result.status}`)
    return result.ok
  })

  const alerted = outcomes.filter(Boolean).length
  const stats = { businesses: businesses.length, alerted, failed: outcomes.length - alerted }
  console.log(`[stock-alert] ${JSON.stringify(stats)}`)
  return stats
}

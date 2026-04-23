import type { FastifyInstance } from 'fastify'
import { z }            from 'zod'
import { prisma }       from '@cement-house/db'
import { generateOrderNumber, generateChallanNumber, marginPct } from '@cement-house/utils'
import { getBizId }     from '../../middleware/auth'

const CreateOrderSchema = z.object({
  customerId:   z.string().uuid(),
  deliveryDate: z.string().min(1).optional(),
  paymentMode:  z.enum(['CASH','UPI','CHEQUE','CREDIT','PARTIAL']),
  amountPaid:   z.number().min(0),
  notes:        z.string().optional(),
  items: z.array(z.object({
    materialId:    z.string().uuid(),
    quantity:      z.number().positive(),
    unitPrice:     z.number().positive(),
    purchasePrice: z.number().positive(),
  })).min(1),
})

export async function orderRoutes(app: FastifyInstance) {
  // GET /api/orders — list with filters (scoped to business)
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const { status, customerId, page = 1 } = req.query as any
    const take = 20, skip = (page - 1) * take
    const where: any = { businessId: bizId }
    if (status)     where.status = status
    if (customerId) where.customerId = customerId
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } }, items: true } }),
      prisma.order.count({ where }),
    ])
    return { success: true, data: { items, total, page, pageSize: take } }
  })

  // GET /api/orders/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as any
    const order = await prisma.order.findUnique({ where: { id },
      include: { customer: true, items: { include: { material: true } }, deliveries: true } })
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
    return { success: true, data: order }
  })

  // POST /api/orders — create order + ledger debit + stock movement
  app.post('/', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = CreateOrderSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const { customerId, paymentMode, amountPaid, notes, items, deliveryDate } = body.data
    const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const avgMargin   = items.reduce((s, i) => s + marginPct(i.unitPrice, i.purchasePrice), 0) / items.length

    // Get next sequence number (scoped to business)
    const count = await prisma.order.count({ where: { businessId: bizId } })
    const orderNumber = generateOrderNumber(count + 1)

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber, customerId, createdById: user.id, paymentMode,
          amountPaid, totalAmount, marginPct: avgMargin, notes,
          businessId: bizId,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
          items: { create: items.map(i => ({ ...i, lineTotal: i.quantity * i.unitPrice })) },
        },
      })

      // Ledger: debit for sale
      await tx.ledgerEntry.create({
        data: { customerId, orderId: o.id, type: 'DEBIT', amount: totalAmount,
                paymentMode, recordedById: user.id, notes: `Order ${orderNumber}`, businessId: bizId }
      })

      // Ledger: credit for amount paid now (if any)
      if (amountPaid > 0) {
        await tx.ledgerEntry.create({
          data: { customerId, orderId: o.id, type: 'CREDIT', amount: amountPaid,
                  paymentMode, recordedById: user.id, notes: `Payment with order ${orderNumber}`, businessId: bizId }
        })
      }

      // Stock: deduct each material
      for (const item of items) {
        const mat = await tx.material.findUnique({ where: { id: item.materialId } })
        if (!mat) throw new Error(`Material ${item.materialId} not found`)
        const stockAfter = Number(mat.stockQty) - item.quantity
        await tx.material.update({ where: { id: item.materialId }, data: { stockQty: stockAfter } })
        await tx.stockMovement.create({
          data: { materialId: item.materialId, orderId: o.id, type: 'OUT',
                  quantity: item.quantity, stockAfter, reason: `Order ${orderNumber}`, recordedById: user.id }
        })
      }

      return o
    })

    return { success: true, data: order }
  })

  // PATCH /api/orders/:id/status
  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as any
    const { status } = req.body as any
    
    if (status === 'DISPATCHED') {
      const order = await prisma.order.findUnique({ where: { id }, include: { items: true, deliveries: true } })
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
      
      if (order.deliveries.length === 0) {
        const count = await prisma.delivery.count()
        const challanNumber = generateChallanNumber(count + 1)
        
        await prisma.$transaction(async (tx) => {
          await tx.delivery.create({
            data: {
              orderId: id,
              challanNumber,
              status: 'IN_TRANSIT',
              items: {
                create: order.items.map((i: any) => ({
                  materialId: i.materialId,
                  orderedQty: i.quantity,
                  deliveredQty: i.quantity,
                }))
              }
            }
          })
          await tx.order.update({ where: { id }, data: { status } })
        })
        return { success: true, data: { ...order, status } }
      }
    } else if (status === 'DELIVERED') {
      const order = await prisma.order.findUnique({ where: { id }, include: { deliveries: true } })
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id }, data: { status } })
        for (const d of order.deliveries) {
          if (d.status !== 'DELIVERED' && d.status !== 'FAILED') {
            await tx.delivery.update({ where: { id: d.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
          }
        }
      })
      return { success: true }
    }

    const order = await prisma.order.update({ where: { id }, data: { status } })
    return { success: true, data: order }
  })

  // DELETE /api/orders/:id — delete order + reverse stock + clean ledger
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as any
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.material.update({
          where: { id: item.materialId },
          data:  { stockQty: { increment: item.quantity } },
        })
      }
      await tx.stockMovement.deleteMany({ where: { orderId: id } })
      await tx.ledgerEntry.deleteMany({ where: { orderId: id } })
      await tx.deliveryItem.deleteMany({ where: { delivery: { orderId: id } } })
      await tx.delivery.deleteMany({ where: { orderId: id } })
      await tx.order.delete({ where: { id } })
    })

    return { success: true }
  })

  // POST /api/orders/bulk-delete — delete multiple orders at once
  app.post('/bulk-delete', async (req, reply) => {
    const { ids } = req.body as { ids: string[] }
    if (!ids?.length) return reply.status(400).send({ success: false, error: 'No order IDs provided' })

    const orders = await prisma.order.findMany({ where: { id: { in: ids } }, include: { items: true } })

    await prisma.$transaction(async (tx) => {
      for (const order of orders) {
        for (const item of order.items) {
          await tx.material.update({
            where: { id: item.materialId },
            data:  { stockQty: { increment: item.quantity } },
          })
        }
        await tx.stockMovement.deleteMany({ where: { orderId: order.id } })
        await tx.ledgerEntry.deleteMany({ where: { orderId: order.id } })
        await tx.deliveryItem.deleteMany({ where: { delivery: { orderId: order.id } } })
        await tx.delivery.deleteMany({ where: { orderId: order.id } })
      }
      await tx.orderItem.deleteMany({ where: { orderId: { in: ids } } })
      await tx.order.deleteMany({ where: { id: { in: ids } } })
    })

    return { success: true, data: { deleted: orders.length } }
  })
}

// GET /api/orders/:id/challan  — stream PDF challan
import { streamChallan } from '../../services/pdf'

export async function orderChallanRoute(app: FastifyInstance) {
  app.get('/:id/challan', async (req, reply) => {
    const { id } = req.params as any
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items:    { include: { material: true } },
        deliveries: { orderBy: { createdAt: 'desc' }, take: 1, include: { items: { include: { material: true } } } },
      },
    })
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

    const delivery = order.deliveries[0]
    const items = (delivery?.items ?? order.items).map((i: any) => ({
      materialName: i.material?.name ?? 'Unknown',
      unit:         i.material?.unit ?? '',
      orderedQty:   Number(i.orderedQty  ?? i.quantity),
      deliveredQty: Number(i.deliveredQty ?? i.quantity),
    }))

    const jwtUser = req.user as any

    streamChallan({
      challanNumber:    delivery?.challanNumber ?? `CH-${order.orderNumber}`,
      orderNumber:      order.orderNumber,
      date:             order.createdAt,
      customerName:     order.customer.name,
      customerPhone:    order.customer.phone,
      customerAddress:  order.customer.address ?? undefined,
      driverName:       delivery?.driverName   ?? undefined,
      vehicleNumber:    delivery?.vehicleNumber ?? undefined,
      businessName:     jwtUser.businessName ?? 'Cement House',
      businessCity:     jwtUser.businessCity ?? '',
      items,
    }, reply)
  })
}

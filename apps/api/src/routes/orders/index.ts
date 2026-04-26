import type { FastifyInstance } from 'fastify'
import { z }            from 'zod'
import { prisma }       from '@cement-house/db'
import { generateOrderNumber, generateChallanNumber, marginPct } from '@cement-house/utils'
import { getBizId }     from '../../middleware/auth'
import { createAuditLog } from '../../services/audit'

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

const AddItemSchema = z.object({
  materialId:    z.string().uuid(),
  quantity:      z.number().positive(),
  unitPrice:     z.number().positive(),
  purchasePrice: z.number().positive(),
})

export async function orderRoutes(app: FastifyInstance) {
  // GET /api/orders — list with filters (scoped to business)
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const { status, customerId, page = 1 } = req.query as any
    const take = 20, skip = (page - 1) * take
    const where: any = { businessId: bizId, isDeleted: false }
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
    const bizId = getBizId(req)
    const { id } = req.params as any
    const order = await prisma.order.findFirst({ where: { id, businessId: bizId, isDeleted: false },
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

    const orderNumber = generateOrderNumber()

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
                  quantity: item.quantity, stockAfter, reason: `Order ${orderNumber}`, recordedById: user.id, businessId: bizId }
        })
      }

      return o
    }, { maxWait: 10000, timeout: 15000 })

    return { success: true, data: order }
  })

  // POST /api/orders/:id/items — append item to existing order
  app.post('/:id/items', async (req, reply) => {
    const { id } = req.params as any
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = AddItemSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const itemData = body.data

    const order = await prisma.order.findFirst({ where: { id, businessId: bizId, isDeleted: false }, include: { items: true } })
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

    await prisma.$transaction(async (tx) => {
      // 1. Add order item
      const lineTotal = itemData.quantity * itemData.unitPrice
      await tx.orderItem.create({
        data: {
          orderId: id,
          materialId: itemData.materialId,
          quantity: itemData.quantity,
          unitPrice: itemData.unitPrice,
          purchasePrice: itemData.purchasePrice,
          lineTotal
        }
      })

      // 2. Update order total & margin
      const allItems = [...order.items, { ...itemData, lineTotal }]
      const newTotal = allItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
      const newMargin = allItems.reduce((s, i) => s + marginPct(Number(i.unitPrice), Number(i.purchasePrice)), 0) / allItems.length

      await tx.order.update({
        where: { id },
        data: { totalAmount: newTotal, marginPct: newMargin }
      })

      // 3. Update Ledger
      await tx.ledgerEntry.create({
        data: {
          customerId: order.customerId,
          orderId: id,
          type: 'DEBIT',
          amount: lineTotal,
          paymentMode: order.paymentMode,
          recordedById: user.id,
          businessId: bizId,
          notes: `Added item to Order ${order.orderNumber}`
        }
      })

      // 4. Update Stock
      const mat = await tx.material.findUnique({ where: { id: itemData.materialId } })
      if (!mat) throw new Error('Material not found')
      const stockAfter = Number(mat.stockQty) - itemData.quantity
      await tx.material.update({ where: { id: itemData.materialId }, data: { stockQty: stockAfter } })
      
      await tx.stockMovement.create({
        data: {
          materialId: itemData.materialId,
          orderId: id,
          type: 'OUT',
          quantity: itemData.quantity,
          stockAfter,
          reason: `Added to Order ${order.orderNumber}`,
          recordedById: user.id,
          businessId: bizId
        }
      })
    }, { maxWait: 10000, timeout: 15000 })

    return { success: true }
  })

  // PATCH /api/orders/:id/status
  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as any
    const bizId = getBizId(req)
    const { status } = req.body as any
    
    if (status === 'DISPATCHED') {
      const order = await prisma.order.findFirst({ where: { id, businessId: bizId, isDeleted: false }, include: { items: true, deliveries: true } })
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
      
      if (order.deliveries.length === 0) {
        const challanNumber = generateChallanNumber()
        
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
        }, { maxWait: 10000, timeout: 15000 })
        return { success: true, data: { ...order, status } }
      }
    } else if (status === 'DELIVERED') {
      const order = await prisma.order.findFirst({ where: { id, businessId: bizId, isDeleted: false }, include: { deliveries: true } })
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id }, data: { status } })
        for (const d of order.deliveries) {
          if (d.status !== 'DELIVERED' && d.status !== 'FAILED') {
            await tx.delivery.update({ where: { id: d.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
          }
        }
      }, { maxWait: 10000, timeout: 15000 })
      return { success: true }
    }

    const existing = await prisma.order.findFirst({ where: { id, businessId: bizId, isDeleted: false }, select: { id: true } })
    if (!existing) return reply.status(404).send({ success: false, error: 'Order not found' })
    const order = await prisma.order.update({ where: { id }, data: { status } })
    return { success: true, data: order }
  })

  // DELETE /api/orders/:id — delete order + reverse stock + clean ledger
  app.delete('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const { id } = req.params as any
    const order = await prisma.order.findFirst({ where: { id, businessId: bizId, isDeleted: false }, include: { items: true } })
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
      await tx.order.update({ where: { id }, data: { isDeleted: true } })
    }, { maxWait: 10000, timeout: 15000 })

    return { success: true }
  })

  // POST /api/orders/bulk-delete — delete multiple orders at once
  app.post('/bulk-delete', async (req, reply) => {
    const bizId = getBizId(req)
    const { ids } = req.body as { ids: string[] }
    if (!ids?.length) return reply.status(400).send({ success: false, error: 'No order IDs provided' })

    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, businessId: bizId, isDeleted: false },
      include: { items: true },
    })

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
      await tx.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { isDeleted: true } })
    }, { maxWait: 10000, timeout: 15000 })

    return { success: true, data: { deleted: orders.length } }
  })
}

// GET /api/orders/:id/challan  — stream PDF challan
import { streamChallan } from '../../services/pdf'

export async function orderChallanRoute(app: FastifyInstance) {
  app.get('/:id/challan', async (req, reply) => {
    const { id } = req.params as any
    const bizId = getBizId(req)
    const order = await prisma.order.findFirst({
      where: { id, businessId: bizId, isDeleted: false },
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

    createAuditLog({
      actorId: jwtUser.id,
      businessId: bizId,
      action: 'CHALLAN_PDF_GENERATED',
      targetType: 'ORDER',
      targetId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        challanNumber: delivery?.challanNumber ?? `CH-${order.orderNumber}`,
      },
    }).catch(() => undefined)

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

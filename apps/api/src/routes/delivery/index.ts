import type { FastifyInstance } from 'fastify'
import { z }            from 'zod'
import { prisma }       from '@cement-house/db'
import { generateChallanNumber } from '@cement-house/utils'
import { getBizId }     from '../../middleware/auth'

const CreateDeliverySchema = z.object({
  orderId:     z.string().uuid(),
  driverName:  z.string().optional(),
  vehicleNumber: z.string().optional(),
  items: z.array(z.object({
    materialId:  z.string().uuid(),
    orderedQty:  z.number().positive(),
    deliveredQty: z.number().min(0),
  })),
})

const ConfirmDeliverySchema = z.object({
  confirmationType: z.enum(['OTP','PHOTO','MANUAL']),
  confirmationRef:  z.string().optional(),
})

export async function deliveryRoutes(app: FastifyInstance) {
  // GET /api/delivery  — list deliveries with optional date/status filter
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const { status, date } = req.query as any
    const where: any = { order: { businessId: bizId, isDeleted: false } }
    if (status) where.status = status
    if (date) {
      const d = new Date(date)
      const next = new Date(d); next.setDate(next.getDate() + 1)
      where.createdAt = { gte: d, lt: next }
    }
    const deliveries = await prisma.delivery.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: {
        order: { include: { customer: { select: { name: true, phone: true, address: true } } } },
        items: { include: { material: true } },
      },
    })
    return { success: true, data: deliveries }
  })

  // GET /api/delivery/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as any
    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: {
        order: { include: { customer: true } },
        items: { include: { material: true } },
      },
    })
    if (!delivery) return reply.status(404).send({ success: false, error: 'Delivery not found' })
    return { success: true, data: delivery }
  })

  // POST /api/delivery  — create challan from order
  app.post('/', async (req, reply) => {
    const body = CreateDeliverySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const bizId = getBizId(req)
    const order = await prisma.order.findFirst({ where: { id: body.data.orderId, businessId: bizId, isDeleted: false } })
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
    if (order.status === 'CANCELLED') return reply.status(400).send({ success: false, error: 'Cannot deliver a cancelled order' })

    const challanNumber = generateChallanNumber()

    const delivery = await prisma.$transaction(async (tx) => {
      const d = await tx.delivery.create({
        data: {
          orderId:      body.data.orderId,
          challanNumber,
          driverName:   body.data.driverName,
          vehicleNumber: body.data.vehicleNumber,
          status:       'SCHEDULED',
          items: { create: body.data.items },
        },
        include: { items: { include: { material: true } } },
      })
      // Mark order as dispatched
      await tx.order.update({ where: { id: body.data.orderId }, data: { status: 'DISPATCHED' } })
      return d
    })

    return { success: true, data: delivery }
  })

  // PATCH /api/delivery/:id/dispatch  — mark as in transit
  app.patch('/:id/dispatch', async (req, reply) => {
    const { id } = req.params as any
    const delivery = await prisma.delivery.update({
      where: { id }, data: { status: 'IN_TRANSIT' },
    })
    return { success: true, data: delivery }
  })

  // PATCH /api/delivery/:id/confirm  — mark delivered with OTP/photo proof
  app.patch('/:id/confirm', async (req, reply) => {
    const { id } = req.params as any
    const body = ConfirmDeliverySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const delivery = await prisma.delivery.findUnique({
      where: { id }, include: { items: true },
    })
    if (!delivery) return reply.status(404).send({ success: false, error: 'Delivery not found' })

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.delivery.update({
        where: { id },
        data: {
          status:           'DELIVERED',
          confirmationType: body.data.confirmationType,
          confirmationRef:  body.data.confirmationRef,
          deliveredAt:      new Date(),
        },
      })
      // Mark order as delivered
      await tx.order.update({ where: { id: delivery.orderId }, data: { status: 'DELIVERED' } })
      return d
    })

    return { success: true, data: updated }
  })

  // PATCH /api/delivery/:id/fail  — mark delivery failed
  app.patch('/:id/fail', async (req, reply) => {
    const { id } = req.params as any
    const { reason } = req.body as any
    const delivery = await prisma.delivery.update({
      where: { id }, data: { status: 'FAILED' },
    })
    // Revert order to confirmed so it can be re-dispatched
    await prisma.order.update({ where: { id: delivery.orderId }, data: { status: 'CONFIRMED' } })
    return { success: true, data: delivery }
  })

  // GET /api/delivery/today/summary  — today's dispatch board
  app.get('/today/summary', async (req) => {
    const bizId = getBizId(req)
    const start = new Date(); start.setHours(0,0,0,0)
    const end   = new Date(); end.setHours(23,59,59,999)
    const deliveries = await prisma.delivery.findMany({
      where: { createdAt: { gte: start, lte: end }, order: { businessId: bizId, isDeleted: false } },
      include: { order: { include: { customer: { select: { name: true, address: true } } } } },
      orderBy: { createdAt: 'asc' },
    })
    const summary = {
      total:     deliveries.length,
      scheduled: deliveries.filter(d => d.status === 'SCHEDULED').length,
      inTransit: deliveries.filter(d => d.status === 'IN_TRANSIT').length,
      delivered: deliveries.filter(d => d.status === 'DELIVERED').length,
      failed:    deliveries.filter(d => d.status === 'FAILED').length,
      list:      deliveries,
    }
    return { success: true, data: summary }
  })
}

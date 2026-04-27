import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { deliveryRepository } from '@cement-house/db'
import { generateChallanNumber } from '@cement-house/utils'
import { getBizId } from '../../middleware/auth'

const DeliveryIdParamsSchema = z.object({
  id: z.string().uuid(),
})

const ListQuerySchema = z.object({
  status: z.string().optional(),
  date: z.string().optional(),
})

const CreateDeliverySchema = z.object({
  orderId: z.string().uuid(),
  driverName: z.string().optional(),
  vehicleNumber: z.string().optional(),
  items: z.array(z.object({
    materialId: z.string().uuid(),
    orderedQty: z.number().positive(),
    deliveredQty: z.number().min(0),
  })),
})

const ConfirmDeliverySchema = z.object({
  confirmationType: z.enum(['OTP', 'PHOTO', 'MANUAL']),
  confirmationRef: z.string().optional(),
})

export async function deliveryRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    const bizId = getBizId(req)
    const query = ListQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const deliveries = await deliveryRepository.listDeliveries(bizId, query.data.status, query.data.date)
    return { success: true, data: deliveries }
  })

  app.get('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = DeliveryIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const delivery = await deliveryRepository.getDeliveryById(params.data.id, bizId)
    if (!delivery) return reply.status(404).send({ success: false, error: 'Delivery not found' })
    return { success: true, data: delivery }
  })

  app.post('/', async (req, reply) => {
    const body = CreateDeliverySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const bizId = getBizId(req)
    const order = await deliveryRepository.getOrderForDelivery(body.data.orderId, bizId)
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
    if (order.status === 'CANCELLED') {
      return reply.status(400).send({ success: false, error: 'Cannot deliver a cancelled order' })
    }

    const challanNumber = generateChallanNumber()
    const delivery = await deliveryRepository.createDeliveryAndDispatch({
      orderId: body.data.orderId,
      challanNumber,
      driverName: body.data.driverName,
      vehicleNumber: body.data.vehicleNumber,
      items: body.data.items,
    })

    if (!delivery) return reply.status(500).send({ success: false, error: 'Failed to create delivery' })
    return { success: true, data: delivery }
  })

  app.patch('/:id/dispatch', async (req, reply) => {
    const params = DeliveryIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const delivery = await deliveryRepository.updateDeliveryStatus(params.data.id, 'IN_TRANSIT')
    if (!delivery) return reply.status(404).send({ success: false, error: 'Delivery not found' })
    return { success: true, data: delivery }
  })

  app.patch('/:id/confirm', async (req, reply) => {
    const params = DeliveryIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const body = ConfirmDeliverySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const updated = await deliveryRepository.confirmDelivery({
      id: params.data.id,
      confirmationType: body.data.confirmationType,
      confirmationRef: body.data.confirmationRef,
    })

    if (!updated) return reply.status(404).send({ success: false, error: 'Delivery not found' })
    return { success: true, data: updated }
  })

  app.patch('/:id/fail', async (req, reply) => {
    const params = DeliveryIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const updated = await deliveryRepository.failDelivery(params.data.id)
    if (!updated) return reply.status(404).send({ success: false, error: 'Delivery not found' })
    return { success: true, data: updated }
  })

  app.get('/today/summary', async (req) => {
    const bizId = getBizId(req)
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)

    const deliveries = await deliveryRepository.listTodayDeliveries(bizId, start, end)
    const summary = {
      total: deliveries.length,
      scheduled: deliveries.filter((delivery) => delivery.status === 'SCHEDULED').length,
      inTransit: deliveries.filter((delivery) => delivery.status === 'IN_TRANSIT').length,
      delivered: deliveries.filter((delivery) => delivery.status === 'DELIVERED').length,
      failed: deliveries.filter((delivery) => delivery.status === 'FAILED').length,
      list: deliveries,
    }

    return { success: true, data: summary }
  })
}

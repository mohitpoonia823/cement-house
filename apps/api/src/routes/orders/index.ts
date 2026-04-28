import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ordersRepository } from '@cement-house/db'
import { generateOrderNumber, generateChallanNumber, marginPct } from '@cement-house/utils'
import { getBizId } from '../../middleware/auth'
import { createAuditLog } from '../../services/audit'

const ORDERS_LIST_CACHE_TTL_MS = 10_000
const ORDER_DETAIL_CACHE_TTL_MS = 10_000
const ordersListCache = new Map<string, { expiresAt: number; value: any }>()
const ordersListInFlight = new Map<string, Promise<any>>()
const orderDetailCache = new Map<string, { expiresAt: number; value: any }>()
const orderDetailInFlight = new Map<string, Promise<any>>()

function invalidateOrderCachesForBusiness(businessId: string) {
  for (const key of ordersListCache.keys()) {
    if (key.startsWith(`${businessId}:`)) ordersListCache.delete(key)
  }
  for (const key of ordersListInFlight.keys()) {
    if (key.startsWith(`${businessId}:`)) ordersListInFlight.delete(key)
  }
  for (const key of orderDetailCache.keys()) {
    if (key.startsWith(`${businessId}:`)) orderDetailCache.delete(key)
  }
  for (const key of orderDetailInFlight.keys()) {
    if (key.startsWith(`${businessId}:`)) orderDetailInFlight.delete(key)
  }
}

const OrderIdParamsSchema = z.object({
  id: z.string().uuid(),
})

const ListOrdersQuerySchema = z.object({
  status: z.string().optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
})

const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  deliveryDate: z.string().min(1).optional(),
  paymentMode: z.enum(['CASH', 'UPI', 'CHEQUE', 'CREDIT', 'PARTIAL']),
  amountPaid: z.number().min(0),
  notes: z.string().optional(),
  items: z.array(z.object({
    materialId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    purchasePrice: z.number().positive(),
  })).min(1),
})

const AddItemSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  purchasePrice: z.number().positive(),
})

const UpdateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED']),
})

const BulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
})

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export async function orderRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    const bizId = getBizId(req)
    const query = ListOrdersQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const pageSize = 20
    const cacheKey = `${bizId}:${query.data.page}:${query.data.status ?? ''}:${query.data.customerId ?? ''}`
    const now = Date.now()
    const cached = ordersListCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return {
        success: true,
        data: {
          items: cached.value.items,
          total: cached.value.total,
          page: query.data.page,
          pageSize,
        },
      }
    }

    const inFlight = ordersListInFlight.get(cacheKey)
    if (inFlight) {
      const value = await inFlight
      return {
        success: true,
        data: {
          items: value.items,
          total: value.total,
          page: query.data.page,
          pageSize,
        },
      }
    }

    const compute = ordersRepository
      .listOrders({
        businessId: bizId,
        page: query.data.page,
        pageSize,
        status: query.data.status,
        customerId: query.data.customerId,
      })
      .finally(() => ordersListInFlight.delete(cacheKey))
    ordersListInFlight.set(cacheKey, compute)
    const result = await compute
    ordersListCache.set(cacheKey, { expiresAt: Date.now() + ORDERS_LIST_CACHE_TTL_MS, value: result })

    return {
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page: query.data.page,
        pageSize,
      },
    }
  })

  app.get('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = OrderIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const cacheKey = `${bizId}:${params.data.id}`
    const now = Date.now()
    const cached = orderDetailCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return { success: true, data: cached.value }
    }

    const inFlight = orderDetailInFlight.get(cacheKey)
    if (inFlight) {
      const value = await inFlight
      if (!value) return reply.status(404).send({ success: false, error: 'Order not found' })
      return { success: true, data: value }
    }

    const compute = ordersRepository
      .getOrderDetail(params.data.id, bizId)
      .finally(() => orderDetailInFlight.delete(cacheKey))
    orderDetailInFlight.set(cacheKey, compute)
    const order = await compute
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
    orderDetailCache.set(cacheKey, { expiresAt: Date.now() + ORDER_DETAIL_CACHE_TTL_MS, value: order })
    return { success: true, data: order }
  })

  app.post('/', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = CreateOrderSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const { customerId, paymentMode, amountPaid, notes, items, deliveryDate } = body.data
    if (deliveryDate) {
      const parsedDeliveryDate = new Date(`${deliveryDate}T00:00:00`)
      if (Number.isNaN(parsedDeliveryDate.getTime())) {
        return reply.status(400).send({ success: false, error: 'Invalid delivery date' })
      }
      if (startOfDay(parsedDeliveryDate) < startOfDay(new Date())) {
        return reply.status(400).send({ success: false, error: 'Delivery date cannot be earlier than order creation date' })
      }
    }

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const avgMargin = items.reduce((sum, item) => sum + marginPct(item.unitPrice, item.purchasePrice), 0) / items.length

    const orderNumber = generateOrderNumber()
    const order = await ordersRepository.createOrder({
      orderNumber,
      customerId,
      createdById: user.id,
      paymentMode,
      amountPaid,
      totalAmount,
      marginPct: avgMargin,
      notes,
      businessId: bizId,
      deliveryDate,
      items,
    })

    if (!order) return reply.status(500).send({ success: false, error: 'Failed to create order' })
    invalidateOrderCachesForBusiness(bizId)
    return { success: true, data: order }
  })

  app.post('/:id/items', async (req, reply) => {
    const params = OrderIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = AddItemSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const order = await ordersRepository.getOrderDetail(params.data.id, bizId)
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

    await ordersRepository.appendItemToOrder({
      orderId: params.data.id,
      businessId: bizId,
      materialId: body.data.materialId,
      quantity: body.data.quantity,
      unitPrice: body.data.unitPrice,
      purchasePrice: body.data.purchasePrice,
      userId: user.id,
      orderNumber: order.orderNumber,
      paymentMode: order.paymentMode,
      customerId: order.customerId,
    })

    invalidateOrderCachesForBusiness(bizId)
    return { success: true }
  })

  app.patch('/:id/status', async (req, reply) => {
    const params = OrderIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const bizId = getBizId(req)
    const body = UpdateStatusSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    if (body.data.status === 'DISPATCHED') {
      const order = await ordersRepository.getOrderDetail(params.data.id, bizId)
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

      if ((order.deliveries ?? []).length === 0) {
        const challanNumber = generateChallanNumber()
        await ordersRepository.createDispatchDelivery(params.data.id, challanNumber)
        invalidateOrderCachesForBusiness(bizId)
        return { success: true, data: { ...order, status: body.data.status } }
      }
    } else if (body.data.status === 'DELIVERED') {
      const order = await ordersRepository.getOrderDetail(params.data.id, bizId)
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

      const pendingDeliveryIds = (order.deliveries ?? [])
        .filter((delivery: any) => delivery.status !== 'DELIVERED' && delivery.status !== 'FAILED')
        .map((delivery: any) => delivery.id)

      await ordersRepository.markDeliveredAndCloseDeliveries(params.data.id, pendingDeliveryIds)
      invalidateOrderCachesForBusiness(bizId)
      return { success: true }
    }

    const updated = await ordersRepository.setOrderStatus(params.data.id, bizId, body.data.status)
    if (!updated) return reply.status(404).send({ success: false, error: 'Order not found' })
    invalidateOrderCachesForBusiness(bizId)
    return { success: true, data: updated }
  })

  app.delete('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = OrderIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const order = await ordersRepository.getOrderDetail(params.data.id, bizId)
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

    await ordersRepository.softDeleteOrder(params.data.id, bizId)
    invalidateOrderCachesForBusiness(bizId)
    return { success: true }
  })

  app.post('/bulk-delete', async (req, reply) => {
    const bizId = getBizId(req)
    const body = BulkDeleteSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const deleted = await ordersRepository.bulkSoftDeleteOrders(body.data.ids, bizId)
    invalidateOrderCachesForBusiness(bizId)
    return { success: true, data: { deleted } }
  })
}

import { streamChallan } from '../../services/pdf'

export async function orderChallanRoute(app: FastifyInstance) {
  app.get('/:id/challan', async (req, reply) => {
    const params = OrderIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const bizId = getBizId(req)
    const order = await ordersRepository.getOrderForChallan(params.data.id, bizId)
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

    const delivery = (order.deliveries ?? [])[0]
    const sourceItems = delivery?.items ?? order.items
    const items = sourceItems.map((item: any) => ({
      materialName: item.material?.name ?? 'Unknown',
      unit: item.material?.unit ?? '',
      orderedQty: Number(item.orderedQty ?? item.quantity),
      deliveredQty: Number(item.deliveredQty ?? item.quantity),
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
      challanNumber: delivery?.challanNumber ?? `CH-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      customerAddress: order.customer.address ?? undefined,
      driverName: delivery?.driverName ?? undefined,
      vehicleNumber: delivery?.vehicleNumber ?? undefined,
      businessName: jwtUser.businessName ?? 'Cement House',
      businessCity: jwtUser.businessCity ?? '',
      items,
    }, reply)
  })
}

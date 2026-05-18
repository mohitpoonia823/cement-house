import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ordersRepository, type Prisma } from '@cement-house/db'
import { generateChallanNumber, marginPct } from '@cement-house/utils'
import { getBizId } from '../../middleware/auth'
import { createAuditLog } from '../../services/audit'
import { calculateInvoice, validateInvoiceInput } from '../../services/billing-engine'
import { ensureUsageAllowed } from '../../services/subscription-access'

const ORDERS_LIST_CACHE_TTL_MS = 10_000
const ORDER_DETAIL_CACHE_TTL_MS = 10_000
const ordersListCache = new Map<string, { expiresAt: number; value: any }>()
const ordersListInFlight = new Map<string, Promise<any>>()
const orderDetailCache = new Map<string, { expiresAt: number; value: any }>()
const orderDetailInFlight = new Map<string, Promise<any>>()
const ordersCacheVersionByBusiness = new Map<string, number>()

function invalidateOrderCachesForBusiness(businessId: string) {
  ordersCacheVersionByBusiness.set(businessId, (ordersCacheVersionByBusiness.get(businessId) ?? 0) + 1)
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
  sourceLocationId: z.string().uuid().optional(),
  deliveryDate: z.string().min(1).optional(),
  gstEnabled: z.boolean().optional(),
  isInterState: z.boolean().optional(),
  invoiceDiscount: z.number().min(0).optional(),
  roundOff: z.number().optional(),
  transportCharges: z.number().min(0).optional(),
  loadingCharges: z.number().min(0).optional(),
  allowAdvancePayment: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  paymentMode: z.enum(['CASH', 'UPI', 'CHEQUE', 'CREDIT', 'PARTIAL']),
  amountPaid: z.number().min(0),
  notes: z.string().optional(),
  items: z.array(z.object({
    materialId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    purchasePrice: z.number().min(0),
    discount: z.number().min(0).optional(),
    hsnCode: z.string().trim().max(30).optional(),
    gstRate: z.number().min(0).max(100).optional(),
    barcode: z.string().optional(),
    batchNumber: z.string().optional(),
    expiryDate: z.string().optional(),
    serialNumber: z.string().optional(),
    imeiNumber: z.string().optional(),
    grossWeight: z.number().min(0).optional(),
    tareWeight: z.number().min(0).optional(),
    netWeight: z.number().min(0).optional(),
  })).min(1),
})

const AddItemSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  purchasePrice: z.number().min(0),
  hsnCode: z.string().trim().max(30).optional(),
  discount: z.number().min(0).optional(),
  gstRate: z.number().min(0).max(100).optional(),
  netWeight: z.number().min(0).optional(),
  grossWeight: z.number().min(0).optional(),
  tareWeight: z.number().min(0).optional(),
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

    const cacheVersionAtStart = ordersCacheVersionByBusiness.get(bizId) ?? 0
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
    const cacheVersionAtEnd = ordersCacheVersionByBusiness.get(bizId) ?? 0
    if (cacheVersionAtStart === cacheVersionAtEnd) {
      ordersListCache.set(cacheKey, { expiresAt: Date.now() + ORDERS_LIST_CACHE_TTL_MS, value: result })
    }

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
    const user = req.user as { id: string; featureFlags?: Record<string, boolean> | null; defaultSettings?: Record<string, unknown> | null }
    const bizId = getBizId(req)
    const body = CreateOrderSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    try {
      await ensureUsageAllowed(bizId, 'ordersPerMonth')
      await ensureUsageAllowed(bizId, 'invoicesPerMonth')
    } catch (error: any) {
      if (error.message === 'PLAN_EXPIRED') {
        return reply.status(402).send({ success: false, code: 'PLAN_EXPIRED', error: 'Plan expired. Please renew your subscription.' })
      }
      if (error.message === 'LIMIT_EXCEEDED') {
        return reply.status(403).send({ success: false, code: 'LIMIT_EXCEEDED', error: 'Monthly order/invoice limit reached for your plan.' })
      }
      throw error
    }

    const {
      customerId,
      sourceLocationId,
      paymentMode,
      amountPaid,
      notes,
      items,
      deliveryDate,
      gstEnabled,
      isInterState,
      invoiceDiscount,
      roundOff,
      transportCharges,
      loadingCharges,
      allowAdvancePayment,
      allowNegativeStock,
    } = body.data
    if (deliveryDate) {
      const parsedDeliveryDate = new Date(`${deliveryDate}T00:00:00`)
      if (Number.isNaN(parsedDeliveryDate.getTime())) {
        return reply.status(400).send({ success: false, error: 'Invalid delivery date' })
      }
      if (startOfDay(parsedDeliveryDate) < startOfDay(new Date())) {
        return reply.status(400).send({ success: false, error: 'Delivery date cannot be earlier than order creation date' })
      }
    }

    const billingValidationError = validateInvoiceInput({
      items,
      paymentMode,
      paidAmount: amountPaid,
      invoiceDiscount,
      roundOff,
      transportCharges,
      loadingCharges,
      gstEnabled,
      isInterState,
      allowAdvancePayment,
      featureFlags: user.featureFlags ?? {},
    })
    if (billingValidationError) {
      return reply.status(400).send({ success: false, error: billingValidationError })
    }

    const computed = calculateInvoice({
      items,
      paymentMode,
      paidAmount: amountPaid,
      invoiceDiscount,
      roundOff,
      transportCharges,
      loadingCharges,
      gstEnabled,
      isInterState,
      allowAdvancePayment,
      featureFlags: user.featureFlags ?? {},
    })

    const totalAmount = computed.grandTotal
    const avgMargin = items.reduce((sum, item) => sum + marginPct(item.unitPrice, item.purchasePrice), 0) / items.length
    const nowYear = new Date().getFullYear()
    const seq = await ordersRepository.getNextInvoiceSequence(bizId, nowYear)
    const orderNumber = `INV-${nowYear}-${String(seq).padStart(6, '0')}`
    let order
    try {
      order = await ordersRepository.createOrder({
        orderNumber,
        invoiceNumber: orderNumber,
        customerId,
        createdById: user.id,
        paymentMode,
        amountPaid: computed.paidAmount,
        paidAmount: computed.paidAmount,
        dueAmount: computed.dueAmount,
        subtotal: computed.subtotal,
        itemDiscountTotal: computed.itemDiscountTotal,
        invoiceDiscount: computed.invoiceDiscount,
        taxableAmount: computed.taxableTotal,
        gstTotal: computed.gstTotal,
        cgstTotal: computed.cgstTotal,
        sgstTotal: computed.sgstTotal,
        igstTotal: computed.igstTotal,
        transportCharges: computed.transportCharges,
        loadingCharges: computed.loadingCharges,
        roundOff: computed.roundOff,
        grandTotal: computed.grandTotal,
        billingSnapshot: JSON.parse(
          JSON.stringify({
            lines: computed.lines,
            gstEnabled: gstEnabled ?? Boolean(user.featureFlags?.gstBilling),
            isInterState: isInterState ?? false,
          })
        ) as Prisma.JsonValue,
        totalAmount,
        marginPct: avgMargin,
        notes,
        businessId: bizId,
        sourceLocationId,
        deliveryDate,
        allowNegativeStock: allowNegativeStock === true || user.defaultSettings?.allowNegativeStock === true,
        items: computed.lines.map((line, i) => ({
          materialId: line.materialId,
          quantity: items[i].quantity,
          unitPrice: items[i].unitPrice,
          purchasePrice: items[i].purchasePrice,
          lineTotal: line.lineTotal,
          hsnCode: items[i].hsnCode,
          gstRate: line.gstRate,
          taxableAmount: line.taxableAmount,
          gstAmount: line.gstAmount,
          cgstAmount: line.cgstAmount,
          sgstAmount: line.sgstAmount,
          igstAmount: line.igstAmount,
          discountAmount: line.itemDiscount,
          deductionQty: line.deductionQty,
        })),
      })
    } catch (error: any) {
      const message = String(error?.message ?? '')
      if (message.includes('Transaction API error: Transaction not found')) {
        const recovered = await ordersRepository.getOrderByNumber(orderNumber, bizId)
        if (recovered) {
          invalidateOrderCachesForBusiness(bizId)
          return reply.send({ success: true, data: recovered, recovered: true })
        }
        return reply.status(503).send({
          success: false,
          code: 'ORDER_TX_RETRY',
          error: 'Order creation timed out internally. Please retry once.',
        })
      }
      return reply.status(400).send({ success: false, error: message || 'Failed to create order' })
    }

    if (!order) return reply.status(500).send({ success: false, error: 'Failed to create order' })
    invalidateOrderCachesForBusiness(bizId)
    return { success: true, data: order }
  })

  app.post('/:id/items', async (req, reply) => {
    const params = OrderIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const user = req.user as { id: string; featureFlags?: Record<string, boolean> | null; defaultSettings?: Record<string, unknown> | null }
    const bizId = getBizId(req)
    const body = AddItemSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const order = await ordersRepository.getOrderDetail(params.data.id, bizId)
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

    const lineValidationError = validateInvoiceInput({
      items: [{
        ...body.data,
        grossWeight: body.data.grossWeight,
        tareWeight: body.data.tareWeight,
        netWeight: body.data.netWeight,
      }],
      paymentMode: order.paymentMode,
      paidAmount: 0,
      featureFlags: user.featureFlags ?? {},
      allowAdvancePayment: true,
    })
    if (lineValidationError) {
      return reply.status(400).send({ success: false, error: lineValidationError })
    }

    const lineComputed = calculateInvoice({
      items: [{
        ...body.data,
        grossWeight: body.data.grossWeight,
        tareWeight: body.data.tareWeight,
        netWeight: body.data.netWeight,
      }],
      paymentMode: order.paymentMode,
      paidAmount: 0,
      featureFlags: user.featureFlags ?? {},
      allowAdvancePayment: true,
    }).lines[0]

    await ordersRepository.appendItemToOrder({
      orderId: params.data.id,
      businessId: bizId,
      materialId: body.data.materialId,
      quantity: body.data.quantity,
      unitPrice: body.data.unitPrice,
      purchasePrice: body.data.purchasePrice,
      lineTotal: lineComputed?.lineTotal ?? body.data.quantity * body.data.unitPrice,
      hsnCode: body.data.hsnCode,
      gstRate: body.data.gstRate ?? lineComputed?.gstRate ?? 0,
      taxableAmount: lineComputed?.taxableAmount ?? body.data.quantity * body.data.unitPrice,
      gstAmount: lineComputed?.gstAmount ?? 0,
      cgstAmount: lineComputed?.cgstAmount ?? 0,
      sgstAmount: lineComputed?.sgstAmount ?? 0,
      igstAmount: lineComputed?.igstAmount ?? 0,
      discountAmount: lineComputed?.itemDiscount ?? (body.data.discount ?? 0),
      deductionQty: lineComputed?.deductionQty ?? body.data.quantity,
      allowNegativeStock: user.defaultSettings?.allowNegativeStock === true,
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
        // Tenant guard: repository validates order ownership via businessId from auth context.
        await ordersRepository.createDispatchDelivery(params.data.id, bizId, challanNumber)
        invalidateOrderCachesForBusiness(bizId)
        return { success: true, data: { ...order, status: body.data.status } }
      }
    } else if (body.data.status === 'DELIVERED') {
      const order = await ordersRepository.getOrderDetail(params.data.id, bizId)
      if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })

      const pendingDeliveryIds = (order.deliveries ?? [])
        .filter((delivery: any) => delivery.status !== 'DELIVERED' && delivery.status !== 'FAILED')
        .map((delivery: any) => delivery.id)

      // Tenant guard: repository validates all delivery mutations under the same business.
      await ordersRepository.markDeliveredAndCloseDeliveries(params.data.id, bizId, pendingDeliveryIds)
      invalidateOrderCachesForBusiness(bizId)
      return { success: true }
    }

    if (body.data.status === 'CANCELLED') {
      try {
        await ordersRepository.cancelOrderWithReversal(params.data.id, bizId)
      } catch (error: any) {
        if (error?.message === 'ORDER_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Order not found' })
        if (error?.message === 'DELIVERED_ORDER_CANNOT_BE_CANCELLED') {
          return reply.status(409).send({
            success: false,
            error: 'Delivered orders cannot be cancelled. Create a return/credit note flow instead.',
          })
        }
        throw error
      }
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
    try {
      await ordersRepository.softDeleteOrder(params.data.id, bizId)
    } catch (error: any) {
      if (error?.message === 'ORDER_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Order not found' })
      throw error
    }
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
      businessName: jwtUser.businessName ?? 'Business Hub',
      businessCity: jwtUser.businessCity ?? '',
      totalAmount: Number(order.totalAmount ?? 0),
      amountPaid: Number(order.amountPaid ?? 0),
      paymentMode: String(order.paymentMode ?? 'CASH'),
      items,
    }, reply)
  })
}

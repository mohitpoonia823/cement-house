import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { accountingRepository } from '@cement-house/db'
import { requireOwner, getBizId } from '../../middleware/auth'
import { formatZodError } from '../../utils/validation'
import { responseCacheTtl } from '../../utils/cache'

const SUPPLIERS_CACHE_TTL_MS = responseCacheTtl(10_000)
const suppliersCache = new Map<string, { expiresAt: number; value: any }>()
const suppliersInFlight = new Map<string, Promise<any>>()

function invalidateSuppliersCache(businessId: string) {
  for (const key of suppliersCache.keys()) if (key.startsWith(`${businessId}:`)) suppliersCache.delete(key)
  for (const key of suppliersInFlight.keys()) if (key.startsWith(`${businessId}:`)) suppliersInFlight.delete(key)
}

const SupplierIdParamsSchema = z.object({ id: z.string().uuid() })

const CreateSupplierSchema = z.object({
  name: z.string().min(2),
  phone: z.string().trim().optional(),
  altPhone: z.string().trim().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  stateCode: z.string().trim().length(2).optional(),
  openingBalance: z.number().min(0).default(0),
  notes: z.string().optional(),
})

const UpdateSupplierSchema = CreateSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
})

const PurchaseItemSchema = z.object({
  materialId: z.string().uuid().optional(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
  hsnCode: z.string().optional(),
  gstRate: z.number().min(0).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
})

const CreatePurchaseSchema = z.object({
  supplierInvoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  isInterState: z.boolean().optional(),
  roundOff: z.number().optional(),
  notes: z.string().optional(),
  locationId: z.string().uuid().optional(),
  items: z.array(PurchaseItemSchema).min(1),
})

const RecordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(['CASH', 'UPI', 'CHEQUE', 'BANK']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

function stateCodeFromGstin(gstin?: string | null) {
  const trimmed = String(gstin ?? '').trim()
  const match = trimmed.match(/^(\d{2})[A-Za-z0-9]{13}$/)
  return match ? match[1] : undefined
}

export async function supplierRoutes(app: FastifyInstance) {
  // List suppliers with live payable balances.
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const search = typeof (req.query as any)?.search === 'string' ? (req.query as any).search.trim() : ''
    const cacheKey = `${bizId}:list:${search}`
    const now = Date.now()
    const cached = suppliersCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }

    const inFlight = suppliersInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = accountingRepository
      .listSuppliersWithBalance({ businessId: bizId, search: search || undefined })
      .finally(() => suppliersInFlight.delete(cacheKey))
    suppliersInFlight.set(cacheKey, compute)
    const data = await compute
    suppliersCache.set(cacheKey, { expiresAt: Date.now() + SUPPLIERS_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  // Supplier detail + full payables ledger + recent bills.
  app.get('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = SupplierIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: formatZodError(params.error) })

    const supplier = await accountingRepository.getSupplierById(params.data.id, bizId)
    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' })

    const [ledger, purchases] = await Promise.all([
      accountingRepository.getSupplierLedger(params.data.id, bizId),
      accountingRepository.listPurchasesBySupplier(params.data.id, bizId),
    ])

    return {
      success: true,
      data: { ...supplier, ...ledger, purchases },
    }
  })

  app.post('/', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = CreateSupplierSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: formatZodError(body.error) })

    if (body.data.phone) {
      const existing = await accountingRepository.findSupplierByPhone(body.data.phone, bizId)
      if (existing) return reply.status(409).send({ success: false, error: 'Supplier with this phone already exists' })
    }

    const supplier = await accountingRepository.createSupplier({
      ...body.data,
      stateCode: body.data.stateCode ?? stateCodeFromGstin(body.data.gstin),
      businessId: bizId,
      createdById: user.id,
    })
    invalidateSuppliersCache(bizId)
    return { success: true, data: supplier }
  })

  app.patch('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = SupplierIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: formatZodError(params.error) })
    const body = UpdateSupplierSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: formatZodError(body.error) })

    const supplier = await accountingRepository.updateSupplier(params.data.id, bizId, {
      ...body.data,
      stateCode: body.data.stateCode ?? stateCodeFromGstin(body.data.gstin),
    })
    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' })
    invalidateSuppliersCache(bizId)
    return { success: true, data: supplier }
  })

  app.delete('/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const params = SupplierIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: formatZodError(params.error) })

    await accountingRepository.softDeleteSupplier(params.data.id, bizId)
    invalidateSuppliersCache(bizId)
    return { success: true }
  })

  // Record a purchase bill (posts Dr Purchases/Input GST, Cr Supplier).
  app.post('/:id/purchases', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const params = SupplierIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: formatZodError(params.error) })
    const body = CreatePurchaseSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: formatZodError(body.error) })

    try {
      const purchase = await accountingRepository.createPurchase({
        businessId: bizId,
        createdById: user.id,
        supplierId: params.data.id,
        supplierInvoiceNumber: body.data.supplierInvoiceNumber,
        invoiceDate: body.data.invoiceDate ? new Date(body.data.invoiceDate) : undefined,
        isInterState: body.data.isInterState,
        roundOff: body.data.roundOff,
        notes: body.data.notes,
        locationId: body.data.locationId,
        items: body.data.items,
      })
      invalidateSuppliersCache(bizId)
      return { success: true, data: purchase }
    } catch (error: any) {
      if (error.message === 'SUPPLIER_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Supplier not found' })
      }
      throw error
    }
  })

  // Record a payment to a supplier (posts Dr Supplier, Cr Cash/Bank).
  app.post('/:id/payment', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const params = SupplierIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: formatZodError(params.error) })
    const body = RecordPaymentSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: formatZodError(body.error) })

    try {
      const entry = await accountingRepository.recordSupplierPayment({
        businessId: bizId,
        createdById: user.id,
        supplierId: params.data.id,
        amount: body.data.amount,
        paymentMode: body.data.paymentMode,
        reference: body.data.reference,
        notes: body.data.notes,
      })
      invalidateSuppliersCache(bizId)
      return { success: true, data: entry }
    } catch (error: any) {
      if (error.message === 'SUPPLIER_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Supplier not found' })
      }
      throw error
    }
  })
}

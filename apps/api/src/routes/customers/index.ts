import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { customersRepository } from '@cement-house/db'
import { requireOwner, getBizId } from '../../middleware/auth'
const CUSTOMERS_LIST_CACHE_TTL_MS = 10_000
const customersListCache = new Map<string, { expiresAt: number; value: any }>()
const customersListInFlight = new Map<string, Promise<any>>()

function invalidateCustomersListCacheForBusiness(businessId: string) {
  for (const key of customersListCache.keys()) {
    if (key.startsWith(`${businessId}:`)) customersListCache.delete(key)
  }
  for (const key of customersListInFlight.keys()) {
    if (key.startsWith(`${businessId}:`)) customersListInFlight.delete(key)
  }
}

const RiskTagSchema = z.enum(['RELIABLE', 'WATCH', 'BLOCKED'])

const ListCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  riskTag: RiskTagSchema.optional(),
})

const CustomerIdParamsSchema = z.object({
  id: z.string().uuid(),
})

const CreateCustomerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(10),
  altPhone: z.string().optional(),
  address: z.string().optional(),
  siteAddress: z.string().optional(),
  gstin: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  notes: z.string().optional(),
})

const UpdateCustomerSchema = CreateCustomerSchema.partial().extend({
  riskTag: RiskTagSchema.optional(),
  isActive: z.boolean().optional(),
})

const UpdateRiskSchema = z.object({
  riskTag: RiskTagSchema,
})

const BulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
})

export async function customerRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    const bizId = getBizId(req)
    const query = ListCustomersQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const cacheKey = `${bizId}:${query.data.search ?? ''}:${query.data.riskTag ?? ''}`
    const now = Date.now()
    const cached = customersListCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return { success: true, data: cached.value }
    }

    const inflight = customersListInFlight.get(cacheKey)
    if (inflight) {
      const value = await inflight
      return { success: true, data: value }
    }

    const compute = customersRepository
      .listActiveCustomersWithStats({
        businessId: bizId,
        search: query.data.search,
        riskTag: query.data.riskTag,
      })
      .then((customers) =>
        customers.map((customer) => ({
          ...customer,
          _count: { orders: customer.orderCount },
        }))
      )
      .finally(() => customersListInFlight.delete(cacheKey))

    customersListInFlight.set(cacheKey, compute)
    const data = await compute
    customersListCache.set(cacheKey, { expiresAt: Date.now() + CUSTOMERS_LIST_CACHE_TTL_MS, value: data })

    return {
      success: true,
      data,
    }
  })

  app.get('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = CustomerIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const customer = await customersRepository.getCustomerById(params.data.id, bizId)
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })

    const [orders, reminders, orderCount, lifetimeBusiness, ledger] = await Promise.all([
      customersRepository.getRecentOrdersWithItems(params.data.id, 10),
      customersRepository.getRecentReminders(params.data.id, 5),
      customersRepository.getCustomerOrderCount(params.data.id),
      customersRepository.getCustomerLifetimeBusiness(params.data.id),
      customersRepository.getCustomerLedgerTotals(params.data.id),
    ])

    const balance = ledger.debit - ledger.credit

    return {
      success: true,
      data: {
        ...customer,
        orders,
        reminders,
        _count: { orders: orderCount },
        balance,
        lifetimeBusiness,
        availableCredit: Number(customer.creditLimit) - balance,
      },
    }
  })

  app.post('/', async (req, reply) => {
    const bizId = getBizId(req)
    const body = CreateCustomerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const existing = await customersRepository.findCustomerByPhoneInBusiness(body.data.phone, bizId)
    if (existing) return reply.status(409).send({ success: false, error: 'Customer with this phone already exists' })

    const customer = await customersRepository.createCustomer({
      ...body.data,
      businessId: bizId,
    })
    invalidateCustomersListCacheForBusiness(bizId)

    return { success: true, data: customer }
  })

  app.patch('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = CustomerIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const body = UpdateCustomerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const customer = await customersRepository.updateCustomer(params.data.id, bizId, body.data)
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })
    invalidateCustomersListCacheForBusiness(bizId)

    return { success: true, data: customer }
  })

  app.patch('/:id/risk', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const params = CustomerIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const body = UpdateRiskSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const customer = await customersRepository.updateCustomer(params.data.id, bizId, { riskTag: body.data.riskTag })
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })
    invalidateCustomersListCacheForBusiness(bizId)

    return { success: true, data: customer }
  })

  app.delete('/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const params = CustomerIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    await customersRepository.softDeleteCustomer(params.data.id, bizId)
    invalidateCustomersListCacheForBusiness(bizId)
    return { success: true }
  })

  app.post('/bulk-delete', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = BulkDeleteSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const deleted = await customersRepository.bulkSoftDeleteCustomers(body.data.ids, bizId)
    invalidateCustomersListCacheForBusiness(bizId)
    return { success: true, data: { deleted } }
  })
}

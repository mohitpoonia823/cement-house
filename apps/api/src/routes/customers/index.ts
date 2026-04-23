import type { FastifyInstance } from 'fastify'
import { z }               from 'zod'
import { prisma }          from '@cement-house/db'
import { requireOwner, getBizId } from '../../middleware/auth'

const CreateCustomerSchema = z.object({
  name:        z.string().min(2),
  phone:       z.string().min(10).max(10),
  altPhone:    z.string().optional(),
  address:     z.string().optional(),
  siteAddress: z.string().optional(),
  gstin:       z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  notes:       z.string().optional(),
})

const UpdateCustomerSchema = CreateCustomerSchema.partial().extend({
  riskTag: z.enum(['RELIABLE','WATCH','BLOCKED']).optional(),
  isActive: z.boolean().optional(),
})

export async function customerRoutes(app: FastifyInstance) {
  // GET /api/customers  — list all active customers for this business
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const { search, riskTag } = req.query as any
    const where: any = { isActive: true, businessId: bizId }
    if (riskTag)  where.riskTag = riskTag
    if (search)   where.name    = { contains: search, mode: 'insensitive' }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { orders: true } },
      },
    })

    // Attach outstanding balance to each customer
    const withBalance = await Promise.all(customers.map(async (c) => {
      const agg = await prisma.ledgerEntry.groupBy({
        by: ['type'],
        where: { customerId: c.id },
        _sum: { amount: true },
      })
      const debit  = Number(agg.find(a => a.type === 'DEBIT')?._sum.amount  ?? 0)
      const credit = Number(agg.find(a => a.type === 'CREDIT')?._sum.amount ?? 0)
      return { ...c, balance: debit - credit, orderCount: c._count.orders }
    }))

    return { success: true, data: withBalance }
  })

  // GET /api/customers/:id  — single customer with full stats
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as any
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { items: { include: { material: true } } },
        },
        reminders: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { orders: true } },
      },
    })
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })

    // Compute lifetime stats
    const allOrders = await prisma.order.findMany({
      where: { customerId: id, status: { not: 'CANCELLED' } },
      select: { totalAmount: true, amountPaid: true },
    })
    const lifetimeBusiness = allOrders.reduce((s, o) => s + Number(o.totalAmount), 0)

    const agg = await prisma.ledgerEntry.groupBy({
      by: ['type'], where: { customerId: id }, _sum: { amount: true },
    })
    const debit  = Number(agg.find(a => a.type === 'DEBIT')?._sum.amount  ?? 0)
    const credit = Number(agg.find(a => a.type === 'CREDIT')?._sum.amount ?? 0)

    return { success: true, data: {
      ...customer,
      balance: debit - credit,
      lifetimeBusiness,
      availableCredit: Number(customer.creditLimit) - (debit - credit),
    }}
  })

  // POST /api/customers  — create
  app.post('/', async (req, reply) => {
    const bizId = getBizId(req)
    const body = CreateCustomerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const existing = await prisma.customer.findFirst({ where: { phone: body.data.phone, businessId: bizId } })
    if (existing) return reply.status(409).send({ success: false, error: 'Customer with this phone already exists' })

    const customer = await prisma.customer.create({ data: { ...body.data, businessId: bizId } })
    return { success: true, data: customer }
  })

  // PATCH /api/customers/:id  — update
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as any
    const body = UpdateCustomerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const customer = await prisma.customer.update({ where: { id }, data: body.data })
    return { success: true, data: customer }
  })

  // PATCH /api/customers/:id/risk  — owner-only: change risk tag
  app.patch('/:id/risk', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const { id } = req.params as any
    const { riskTag } = req.body as any
    const customer = await prisma.customer.update({ where: { id }, data: { riskTag } })
    return { success: true, data: customer }
  })

  // DELETE /api/customers/:id  — soft delete (owner only)
  app.delete('/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const { id } = req.params as any
    await prisma.customer.update({ where: { id }, data: { isActive: false } })
    return { success: true }
  })

  // POST /api/customers/bulk-delete — soft-delete multiple customers
  app.post('/bulk-delete', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const { ids } = req.body as { ids: string[] }
    if (!ids?.length) return reply.status(400).send({ success: false, error: 'No customer IDs provided' })
    await prisma.customer.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })
    return { success: true, data: { deleted: ids.length } }
  })
}

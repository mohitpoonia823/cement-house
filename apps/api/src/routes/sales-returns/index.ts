import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { salesReturnsRepository } from '@cement-house/db'
import { getBizId } from '../../middleware/auth'

const ReturnIdParamsSchema = z.object({ id: z.string().uuid() })
const CreateReturnSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    orderItemId: z.string().uuid(),
    quantityReturned: z.number().positive(),
  })).min(1),
})

export async function salesReturnRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const data = await salesReturnsRepository.listSalesReturns(bizId)
    return { success: true, data }
  })

  app.get('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = ReturnIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })
    const detail = await salesReturnsRepository.getSalesReturnDetail(params.data.id, bizId)
    if (!detail) return reply.status(404).send({ success: false, error: 'Sales return not found' })
    return { success: true, data: detail }
  })

  app.post('/', async (req, reply) => {
    const bizId = getBizId(req)
    const user = req.user as { id: string }
    const body = CreateReturnSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    try {
      const created = await salesReturnsRepository.createSalesReturn({
        businessId: bizId,
        createdById: user.id,
        orderId: body.data.orderId,
        reason: body.data.reason,
        items: body.data.items,
      })
      return { success: true, data: created }
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error?.message ?? 'Failed to create sales return' })
    }
  })
}

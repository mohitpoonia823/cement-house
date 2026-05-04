import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { multiLocationRepository } from '@cement-house/db'
import { getBizId } from '../../middleware/auth'

const CreateTransferSchema = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  notes: z.string().trim().max(250).optional(),
  items: z.array(z.object({
    materialId: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1),
})

const ListTransferQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const TransferParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function stockTransferRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const businessId = getBizId(req)
    const user = req.user as { id: string }
    const body = CreateTransferSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    try {
      const transferId = await multiLocationRepository.createStockTransfer({
        businessId,
        createdById: user.id,
        ...body.data,
      })
      return { success: true, data: { id: transferId } }
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error?.message ?? 'Failed to create stock transfer' })
    }
  })

  app.get('/', async (req, reply) => {
    const businessId = getBizId(req)
    const query = ListTransferQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })
    const rows = await multiLocationRepository.listStockTransfers({
      businessId,
      limit: query.data.limit,
    })
    return { success: true, data: rows }
  })

  app.get('/:id', async (req, reply) => {
    const businessId = getBizId(req)
    const params = TransferParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })
    const row = await multiLocationRepository.getStockTransferDetail({
      businessId,
      transferId: params.data.id,
    })
    if (!row) return reply.status(404).send({ success: false, error: 'Stock transfer not found' })
    return { success: true, data: row }
  })
}

import type { FastifyInstance } from 'fastify'
import { z }         from 'zod'
import { prisma }    from '@cement-house/db'
import { getBizId }  from '../../middleware/auth'

const StockInSchema = z.object({
  materialId:    z.string().uuid(),
  quantity:      z.number().positive(),
  purchasePrice: z.number().positive(),
  reason:        z.string().optional(),
})

const AdjustSchema = z.object({
  materialId: z.string().uuid(),
  newQty:     z.number().min(0),
  reason:     z.string(),
})

export async function inventoryRoutes(app: FastifyInstance) {
  // GET /api/inventory — all materials with stock status for this business
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const materials = await prisma.material.findMany({ where: { isActive: true, businessId: bizId } })
    const withStatus = materials.map(m => ({
      ...m,
      stockStatus: Number(m.stockQty) <= Number(m.minThreshold)
        ? (Number(m.stockQty) <= 0 ? 'OUT_OF_STOCK' : 'LOW')
        : 'OK',
    }))
    return { success: true, data: withStatus }
  })

  // POST /api/inventory/stock-in — purchase from supplier
  app.post('/stock-in', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = StockInSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const mat = await prisma.material.findUnique({ where: { id: body.data.materialId } })
    if (!mat) return reply.status(404).send({ success: false, error: 'Material not found' })

    const stockAfter = Number(mat.stockQty) + body.data.quantity
    const [updated] = await prisma.$transaction([
      prisma.material.update({
        where: { id: body.data.materialId },
        data:  { stockQty: stockAfter, purchasePrice: body.data.purchasePrice },
      }),
      prisma.stockMovement.create({
        data: { materialId: body.data.materialId, type: 'IN', quantity: body.data.quantity,
                stockAfter, reason: body.data.reason ?? 'Purchase', recordedById: user.id, businessId: bizId }
      }),
    ])
    return { success: true, data: updated }
  })

  // POST /api/inventory/adjust — manual stock correction
  app.post('/adjust', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = AdjustSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const mat = await prisma.material.findUnique({ where: { id: body.data.materialId } })
    if (!mat) return reply.status(404).send({ success: false, error: 'Material not found' })

    const diff = body.data.newQty - Number(mat.stockQty)
    await prisma.$transaction([
      prisma.material.update({ where: { id: body.data.materialId }, data: { stockQty: body.data.newQty } }),
      prisma.stockMovement.create({
        data: { materialId: body.data.materialId, type: 'ADJUSTMENT',
                quantity: Math.abs(diff), stockAfter: body.data.newQty,
                reason: body.data.reason, recordedById: user.id, businessId: bizId }
      }),
    ])
    return { success: true }
  })

  // GET /api/inventory/:id/movements — audit trail for one material
  app.get('/:id/movements', async (req) => {
    const bizId = getBizId(req)
    const { id } = req.params as any
    const movements = await prisma.stockMovement.findMany({
      where: { materialId: id, businessId: bizId }, orderBy: { createdAt: 'desc' }, take: 50,
      include: { order: { select: { orderNumber: true } } },
    })
    return { success: true, data: movements }
  })

  // POST /api/inventory — create a new material
  app.post('/', async (req, reply) => {
    const bizId = getBizId(req)
    const schema = z.object({
      name:          z.string().min(2),
      unit:          z.string().min(1),
      stockQty:      z.number().min(0).default(0),
      minThreshold:  z.number().min(0).default(0),
      maxThreshold:  z.number().min(0).optional(),
      purchasePrice: z.number().min(0),
      salePrice:     z.number().min(0),
    })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const material = await prisma.material.create({ data: { ...body.data, businessId: bizId } })
    return { success: true, data: material }
  })

  // DELETE /api/inventory/:id — soft-delete material
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as any
    await prisma.material.update({ where: { id }, data: { isActive: false } })
    return { success: true }
  })

  // POST /api/inventory/bulk-delete — soft-delete multiple materials
  app.post('/bulk-delete', async (req, reply) => {
    const { ids } = req.body as { ids: string[] }
    if (!ids?.length) return reply.status(400).send({ success: false, error: 'No material IDs provided' })
    await prisma.material.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })
    return { success: true, data: { deleted: ids.length } }
  })
}

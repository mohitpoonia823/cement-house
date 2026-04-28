import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { inventoryRepository } from '@cement-house/db'
import { getBizId } from '../../middleware/auth'

const INVENTORY_LIST_CACHE_TTL_MS = 10_000
const INVENTORY_MOVEMENTS_CACHE_TTL_MS = 10_000
const inventoryListCache = new Map<string, { expiresAt: number; value: any }>()
const inventoryListInFlight = new Map<string, Promise<any>>()
const inventoryMovementsCache = new Map<string, { expiresAt: number; value: any }>()
const inventoryMovementsInFlight = new Map<string, Promise<any>>()

function invalidateInventoryCacheForBusiness(businessId: string) {
  for (const key of inventoryListCache.keys()) {
    if (key.startsWith(`${businessId}:`)) inventoryListCache.delete(key)
  }
  for (const key of inventoryListInFlight.keys()) {
    if (key.startsWith(`${businessId}:`)) inventoryListInFlight.delete(key)
  }
  for (const key of inventoryMovementsCache.keys()) {
    if (key.startsWith(`${businessId}:`)) inventoryMovementsCache.delete(key)
  }
  for (const key of inventoryMovementsInFlight.keys()) {
    if (key.startsWith(`${businessId}:`)) inventoryMovementsInFlight.delete(key)
  }
}

const MaterialIdParamsSchema = z.object({
  id: z.string().uuid(),
})

const StockInSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.number().positive(),
  purchasePrice: z.number().positive(),
  reason: z.string().optional(),
})

const AdjustSchema = z.object({
  materialId: z.string().uuid(),
  newQty: z.number().min(0),
  reason: z.string(),
})

const CreateMaterialSchema = z.object({
  name: z.string().min(2),
  unit: z.string().min(1),
  stockQty: z.number().min(0).default(0),
  minThreshold: z.number().min(0).default(0),
  maxThreshold: z.number().min(0).optional(),
  purchasePrice: z.number().min(0),
  salePrice: z.number().min(0),
})

const BulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
})

export async function inventoryRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const cacheKey = `${bizId}:list`
    const now = Date.now()
    const cached = inventoryListCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }

    const inFlight = inventoryListInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = inventoryRepository
      .listActiveMaterials(bizId)
      .finally(() => inventoryListInFlight.delete(cacheKey))
    inventoryListInFlight.set(cacheKey, compute)
    const materials = await compute
    inventoryListCache.set(cacheKey, { expiresAt: Date.now() + INVENTORY_LIST_CACHE_TTL_MS, value: materials })
    return { success: true, data: materials }
  })

  app.post('/stock-in', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = StockInSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const updated = await inventoryRepository.stockInMaterial({
      materialId: body.data.materialId,
      businessId: bizId,
      recordedById: user.id,
      quantity: body.data.quantity,
      purchasePrice: body.data.purchasePrice,
      reason: body.data.reason,
    })

    if (!updated) return reply.status(404).send({ success: false, error: 'Material not found' })
    invalidateInventoryCacheForBusiness(bizId)
    return { success: true, data: updated }
  })

  app.post('/adjust', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = AdjustSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const adjusted = await inventoryRepository.adjustMaterialStock({
      materialId: body.data.materialId,
      businessId: bizId,
      recordedById: user.id,
      newQty: body.data.newQty,
      reason: body.data.reason,
    })

    if (!adjusted) return reply.status(404).send({ success: false, error: 'Material not found' })
    invalidateInventoryCacheForBusiness(bizId)
    return { success: true }
  })

  app.get('/:id/movements', async (req, reply) => {
    const bizId = getBizId(req)
    const params = MaterialIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const cacheKey = `${bizId}:movements:${params.data.id}`
    const now = Date.now()
    const cached = inventoryMovementsCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }

    const inFlight = inventoryMovementsInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = inventoryRepository
      .listMaterialMovements(params.data.id, bizId, 50)
      .finally(() => inventoryMovementsInFlight.delete(cacheKey))
    inventoryMovementsInFlight.set(cacheKey, compute)
    const movements = await compute
    inventoryMovementsCache.set(cacheKey, { expiresAt: Date.now() + INVENTORY_MOVEMENTS_CACHE_TTL_MS, value: movements })
    return { success: true, data: movements }
  })

  app.post('/', async (req, reply) => {
    const bizId = getBizId(req)
    const body = CreateMaterialSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const material = await inventoryRepository.createMaterial({
      ...body.data,
      businessId: bizId,
    })

    invalidateInventoryCacheForBusiness(bizId)
    return { success: true, data: material }
  })

  app.delete('/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = MaterialIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    await inventoryRepository.softDeleteMaterial(params.data.id, bizId)
    invalidateInventoryCacheForBusiness(bizId)
    return { success: true }
  })

  app.post('/bulk-delete', async (req, reply) => {
    const bizId = getBizId(req)
    const body = BulkDeleteSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const deleted = await inventoryRepository.bulkSoftDeleteMaterials(body.data.ids, bizId)
    invalidateInventoryCacheForBusiness(bizId)
    return { success: true, data: { deleted } }
  })
}

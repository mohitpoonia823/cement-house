import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { inventoryRepository } from '@cement-house/db'
import { getBizId } from '../../middleware/auth'
import { createHash } from 'node:crypto'
import { PurchaseBillScannerConfigError, scanPurchaseBillImage } from '../../services/purchase-bill-scanner'
import {
  deleteBillImageFromStorage,
  downloadBillImageFromStorage,
  listBillImagesForBusiness,
  uploadBillImageIfConfigured,
} from '../../services/bill-image-storage'

const INVENTORY_LIST_CACHE_TTL_MS = 10_000
const INVENTORY_MOVEMENTS_CACHE_TTL_MS = 10_000
const INVENTORY_BILL_SCANS_CACHE_TTL_MS = 20_000
const inventoryListCache = new Map<string, { expiresAt: number; value: any }>()
const inventoryListInFlight = new Map<string, Promise<any>>()
const inventoryMovementsCache = new Map<string, { expiresAt: number; value: any }>()
const inventoryMovementsInFlight = new Map<string, Promise<any>>()
const inventoryBillScansCache = new Map<string, { expiresAt: number; value: any }>()
const inventoryBillScansInFlight = new Map<string, Promise<any>>()

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
  for (const key of inventoryBillScansCache.keys()) {
    if (key.startsWith(`${businessId}:`)) inventoryBillScansCache.delete(key)
  }
  for (const key of inventoryBillScansInFlight.keys()) {
    if (key.startsWith(`${businessId}:`)) inventoryBillScansInFlight.delete(key)
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

const BillScanSchema = z.object({
  fileName: z.string().trim().max(180).optional(),
  dataUrl: z.string().min(100).max(12_000_000),
})

const BillScanListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(300).default(100),
  search: z.string().trim().max(120).optional(),
})

const CommitBillLineSchema = z.object({
  lineId: z.string().uuid(),
  action: z.enum(['APPLY', 'SKIP']),
  materialId: z.string().uuid().optional(),
  createMaterial: z.object({
    name: z.string().trim().min(2),
    unit: z.string().trim().min(1),
    salePrice: z.number().min(0),
    minThreshold: z.number().min(0).optional(),
    maxThreshold: z.number().min(0).optional(),
  }).optional(),
  unit: z.string().trim().min(1),
  quantity: z.number().positive(),
  purchasePrice: z.number().min(0),
  lineTotal: z.number().min(0).nullable().optional(),
}).superRefine((line, ctx) => {
  if (line.action === 'APPLY' && !line.materialId && !line.createMaterial) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['materialId'],
      message: 'Select an inventory material or create a new one',
    })
  }
})

const CommitBillScanSchema = z.object({
  lines: z.array(CommitBillLineSchema).min(1),
})

const CleanupOrphanBillImagesSchema = z.object({
  dryRun: z.boolean().default(true),
  maxDeletes: z.coerce.number().int().min(1).max(500).default(100),
})

const ALLOWED_BILL_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_BILL_IMAGE_BYTES = 8 * 1024 * 1024

function parseBillImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\s]+)$/i)
  if (!match) {
    throw new Error('Upload a JPG, PNG, or WEBP bill image')
  }
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  if (!ALLOWED_BILL_IMAGE_TYPES.has(mimeType)) {
    throw new Error('Upload a JPG, PNG, or WEBP bill image')
  }
  const base64 = match[2].replace(/\s/g, '')
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) throw new Error('Bill image is empty')
  if (bytes.length > MAX_BILL_IMAGE_BYTES) throw new Error('Bill image must be under 8 MB')
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  }
}

async function withBillCandidates(draft: Awaited<ReturnType<typeof inventoryRepository.getPurchaseBillDraft>>, businessId: string) {
  if (!draft) return null
  const catalog = await inventoryRepository.listMaterialMatchCatalog(businessId)
  return {
    ...draft,
    lines: draft.lines.map((line) => ({
      ...line,
      candidateMatches: inventoryRepository.getMaterialCandidates(line.scannedName, catalog),
    })),
  }
}

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

  app.post('/bill-scans', { bodyLimit: 12_000_000 }, async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = BillScanSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    let image: ReturnType<typeof parseBillImageDataUrl>
    try {
      image = parseBillImageDataUrl(body.data.dataUrl)
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message ?? 'Invalid bill image' })
    }

    const duplicateImage = await inventoryRepository.findPurchaseBillScanByImageHash(bizId, image.sha256)
    if (duplicateImage?.status === 'COMMITTED') {
      return reply.status(409).send({
        success: false,
        code: 'BILL_ALREADY_IMPORTED',
        error: 'This bill image has already been imported into inventory.',
        data: duplicateImage,
      })
    }
    if (duplicateImage?.status === 'DRAFT') {
      const existingDraft = await withBillCandidates(await inventoryRepository.getPurchaseBillDraft(duplicateImage.id, bizId), bizId)
      return { success: true, data: { scan: existingDraft, duplicate: true, warnings: ['This image already has a draft. Reusing it to avoid another scan.'] } }
    }

    try {
      const scanned = await scanPurchaseBillImage({
        dataUrl: image.dataUrl,
        fileName: body.data.fileName ?? null,
      })
      const storedImage = await uploadBillImageIfConfigured({
        businessId: bizId,
        imageSha256: image.sha256,
        mimeType: image.mimeType,
        bytes: image.bytes,
        originalFileName: body.data.fileName ?? null,
      })
      const catalog = await inventoryRepository.listMaterialMatchCatalog(bizId)
      const preparedLines = inventoryRepository.preparePurchaseBillLines(scanned.scan.items, catalog)
      const warnings: string[] = []

      if (scanned.scan.invoiceNumber) {
        const duplicateInvoice = await inventoryRepository.findCommittedPurchaseBillByInvoice(bizId, scanned.scan.invoiceNumber)
        if (duplicateInvoice) {
          warnings.push(`Invoice ${scanned.scan.invoiceNumber} already appears in a committed import. Review before committing.`)
        }
      }
      if (preparedLines.length === 0) {
        warnings.push('No material lines were detected. Try a clearer bill image or add lines manually after rescanning.')
      }

      let draft
      try {
        draft = await inventoryRepository.createPurchaseBillDraft({
          businessId: bizId,
          createdById: user.id,
          supplierName: scanned.scan.supplierName,
          invoiceNumber: scanned.scan.invoiceNumber,
          invoiceDate: scanned.scan.invoiceDate,
          fileName: body.data.fileName ?? null,
          imageMimeType: image.mimeType,
          imageSha256: image.sha256,
          storageProvider: storedImage?.provider ?? null,
          storageBucket: storedImage?.bucket ?? null,
          storageObjectPath: storedImage?.objectPath ?? null,
          originalFileName: storedImage?.originalFileName ?? body.data.fileName ?? null,
          imageSizeBytes: storedImage?.sizeBytes ?? image.bytes.byteLength,
          scanProvider: scanned.provider,
          scanModel: scanned.model,
          confidence: scanned.scan.confidence,
          subtotal: scanned.scan.subtotal,
          taxAmount: scanned.scan.taxAmount,
          totalAmount: scanned.scan.totalAmount,
          rawText: scanned.rawText,
          notes: scanned.scan.notes,
          lines: preparedLines.map(({ candidateMatches, ...line }) => line),
        })
      } catch (dbError) {
        if (storedImage) {
          try {
            await deleteBillImageFromStorage({
              provider: storedImage.provider,
              bucket: storedImage.bucket,
              objectPath: storedImage.objectPath,
            })
          } catch (cleanupError) {
            req.log.error({ err: cleanupError }, 'failed to cleanup uploaded bill image after db failure')
          }
        }
        throw dbError
      }

      const responseDraft = draft
        ? {
            ...draft,
            lines: draft.lines.map((line) => ({
              ...line,
              candidateMatches: preparedLines.find((prepared) => prepared.lineIndex === line.lineIndex)?.candidateMatches ?? [],
            })),
          }
        : null

      invalidateInventoryCacheForBusiness(bizId)
      return { success: true, data: { scan: responseDraft, duplicate: false, warnings } }
    } catch (error: any) {
      if (error instanceof PurchaseBillScannerConfigError) {
        return reply.status(503).send({
          success: false,
          code: 'BILL_SCANNER_NOT_CONFIGURED',
          error: error.message,
        })
      }
      req.log.error({ err: error }, 'purchase bill scan failed')
      return reply.status(502).send({ success: false, error: error.message ?? 'Unable to scan bill image' })
    }
  })

  app.get('/bill-scans', async (req, reply) => {
    const bizId = getBizId(req)
    const query = BillScanListQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const normalizedSearch = query.data.search?.trim().toLowerCase() ?? ''
    const cacheKey = `${bizId}:bill-scans:${query.data.limit}:${normalizedSearch}`
    const now = Date.now()
    const cached = inventoryBillScansCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }

    const inFlight = inventoryBillScansInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = inventoryRepository
      .listPurchaseBillScans(bizId, query.data.limit, query.data.search)
      .finally(() => inventoryBillScansInFlight.delete(cacheKey))
    inventoryBillScansInFlight.set(cacheKey, compute)
    const scans = await compute
    inventoryBillScansCache.set(cacheKey, { expiresAt: Date.now() + INVENTORY_BILL_SCANS_CACHE_TTL_MS, value: scans })
    return { success: true, data: scans }
  })

  app.get('/bill-scans/:id', async (req, reply) => {
    const bizId = getBizId(req)
    const params = MaterialIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const draft = await withBillCandidates(await inventoryRepository.getPurchaseBillDraft(params.data.id, bizId), bizId)
    if (!draft) return reply.status(404).send({ success: false, error: 'Bill scan not found' })
    return { success: true, data: draft }
  })

  app.get('/bill-scans/:id/download', async (req, reply) => {
    const bizId = getBizId(req)
    const params = MaterialIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const draft = await withBillCandidates(await inventoryRepository.getPurchaseBillDraft(params.data.id, bizId), bizId)
    if (!draft) return reply.status(404).send({ success: false, error: 'Bill scan not found' })

    if (draft.storageProvider && draft.storageBucket && draft.storageObjectPath) {
      try {
        const original = await downloadBillImageFromStorage({
          provider: draft.storageProvider,
          bucket: draft.storageBucket,
          objectPath: draft.storageObjectPath,
        })
        if (original) {
          const ext = draft.imageMimeType === 'image/png'
            ? 'png'
            : draft.imageMimeType === 'image/webp'
              ? 'webp'
              : 'jpg'
          const safeBase = (draft.originalFileName ?? draft.invoiceNumber ?? `bill-scan-${draft.id}`)
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/[^a-zA-Z0-9-_]+/g, '-')
          const fileName = `${safeBase || `bill-scan-${draft.id}`}.${ext}`
          return reply
            .header('Content-Type', original.mimeType)
            .header('Content-Disposition', `attachment; filename="${fileName}"`)
            .send(original.bytes)
        }
      } catch (error) {
        req.log.error({ err: error, scanId: draft.id }, 'bill image download failed; falling back to json export')
      }
    }

    const safeInvoice = (draft.invoiceNumber ?? `bill-scan-${draft.id}`).replace(/[^a-zA-Z0-9-_]+/g, '-')
    const fileName = `${safeInvoice}.json`
    const payload = {
      id: draft.id,
      status: draft.status,
      supplierName: draft.supplierName,
      invoiceNumber: draft.invoiceNumber,
      invoiceDate: draft.invoiceDate,
      fileName: draft.fileName,
      imageMimeType: draft.imageMimeType,
      imageSha256: draft.imageSha256,
      scanProvider: draft.scanProvider,
      scanModel: draft.scanModel,
      confidence: draft.confidence,
      subtotal: draft.subtotal,
      taxAmount: draft.taxAmount,
      totalAmount: draft.totalAmount,
      notes: draft.notes,
      committedAt: draft.committedAt,
      createdAt: draft.createdAt,
      lines: draft.lines,
    }

    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(JSON.stringify(payload, null, 2))
  })

  app.post('/bill-scans/:id/commit', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const params = MaterialIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })
    const body = CommitBillScanSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    try {
      const result = await inventoryRepository.commitPurchaseBillScan({
        scanId: params.data.id,
        businessId: bizId,
        recordedById: user.id,
        lines: body.data.lines,
      })
      invalidateInventoryCacheForBusiness(bizId)
      return { success: true, data: result }
    } catch (error: any) {
      const message = error.message ?? 'Failed to import bill'
      if (message.includes('not found')) return reply.status(404).send({ success: false, error: message })
      if (message.includes('already')) return reply.status(409).send({ success: false, error: message })
      return reply.status(400).send({ success: false, error: message })
    }
  })

  app.post('/bill-scans/cleanup-orphans', async (req, reply) => {
    const bizId = getBizId(req)
    const body = CleanupOrphanBillImagesSchema.safeParse(req.body ?? {})
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    try {
      const referenced = await inventoryRepository.listReferencedBillStorageObjects(bizId, 'supabase')
      const refSet = new Set(
        referenced
          .map((row) => row.storageObjectPath?.trim())
          .filter((path): path is string => Boolean(path)),
      )

      const listed = await listBillImagesForBusiness({ businessId: bizId })
      if (!listed.bucket) {
        return reply.status(503).send({
          success: false,
          code: 'BILL_STORAGE_NOT_CONFIGURED',
          error: 'Supabase bill storage is not configured on server.',
        })
      }

      const orphans = listed.objects.filter((obj) => !refSet.has(obj.objectPath))
      const limited = orphans.slice(0, body.data.maxDeletes)
      let deletedCount = 0

      if (!body.data.dryRun) {
        for (const orphan of limited) {
          await deleteBillImageFromStorage({
            provider: 'supabase',
            bucket: listed.bucket,
            objectPath: orphan.objectPath,
          })
          deletedCount += 1
        }
      }

      return {
        success: true,
        data: {
          dryRun: body.data.dryRun,
          bucket: listed.bucket,
          referencedCount: refSet.size,
          foundCount: listed.objects.length,
          orphanCount: orphans.length,
          deleteLimit: body.data.maxDeletes,
          deletedCount,
          candidates: limited.map((orphan) => ({
            objectPath: orphan.objectPath,
            sizeBytes: orphan.sizeBytes,
            updatedAt: orphan.updatedAt,
          })),
        },
      }
    } catch (error: any) {
      req.log.error({ err: error }, 'bill scan orphan cleanup failed')
      return reply.status(502).send({ success: false, error: error.message ?? 'Failed to cleanup orphan bill images' })
    }
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

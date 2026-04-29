import { Prisma } from '@prisma/client'
import { prisma } from '../client'
import { randomUUID } from 'node:crypto'

export type PurchaseBillScanStatus = 'DRAFT' | 'COMMITTED' | 'CANCELLED'
export type PurchaseBillLineStatus = 'MATCHED' | 'NEEDS_REVIEW' | 'APPLIED' | 'SKIPPED'

const BILL_MATCH_THRESHOLD = 0.82
const BILL_LOW_MATCH_THRESHOLD = 0.58

let ensurePurchaseBillTablesPromise: Promise<void> | null = null

export interface MaterialRow {
  id: string
  name: string
  unit: string
  stockQty: number
  minThreshold: number
  maxThreshold: number | null
  purchasePrice: number
  salePrice: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  businessId: string
}

export interface InventoryMaterialRow extends MaterialRow {
  stockStatus: 'OUT_OF_STOCK' | 'LOW' | 'OK'
}

export interface StockMovementWithOrderRow {
  id: string
  materialId: string
  orderId: string | null
  type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  stockAfter: number
  reason: string | null
  recordedById: string
  createdAt: Date
  businessId: string
  order: { orderNumber: string } | null
}

export interface MaterialMatchCandidate {
  materialId: string
  name: string
  unit: string
  score: number
  source: 'name' | 'alias'
  alias?: string
}

export interface MaterialMatchCatalogItem {
  id: string
  name: string
  unit: string
  normalizedName: string
  aliases: Array<{ alias: string; normalizedAlias: string }>
}

export interface PurchaseBillDraftLineInput {
  lineIndex: number
  scannedName: string
  unit: string | null
  quantity: number | null
  purchasePrice: number | null
  lineTotal: number | null
  confidence: number
  materialId: string | null
  matchConfidence: number
  status: PurchaseBillLineStatus
}

export interface PurchaseBillDraftLineRow {
  id: string
  scanId: string
  lineIndex: number
  businessId: string
  materialId: string | null
  scannedName: string
  normalizedName: string
  unit: string | null
  quantity: number | null
  purchasePrice: number | null
  lineTotal: number | null
  confidence: number
  matchConfidence: number
  status: PurchaseBillLineStatus
  createdAt: Date
  updatedAt: Date
}

export interface PurchaseBillDraftRow {
  id: string
  businessId: string
  createdById: string
  status: PurchaseBillScanStatus
  supplierName: string | null
  invoiceNumber: string | null
  invoiceDate: Date | null
  fileName: string | null
  imageMimeType: string | null
  imageSha256: string
  storageProvider: string | null
  storageBucket: string | null
  storageObjectPath: string | null
  originalFileName: string | null
  imageSizeBytes: number | null
  scanProvider: string
  scanModel: string | null
  confidence: number
  subtotal: number | null
  taxAmount: number | null
  totalAmount: number | null
  rawText: string | null
  notes: string | null
  committedById: string | null
  committedAt: Date | null
  createdAt: Date
  updatedAt: Date
  lines: PurchaseBillDraftLineRow[]
}

export interface PurchaseBillScanListRow {
  id: string
  businessId: string
  status: PurchaseBillScanStatus
  supplierName: string | null
  invoiceNumber: string | null
  invoiceDate: Date | null
  fileName: string | null
  storageProvider: string | null
  originalFileName: string | null
  scanProvider: string
  scanModel: string | null
  confidence: number
  subtotal: number | null
  taxAmount: number | null
  totalAmount: number | null
  lineCount: number
  appliedCount: number
  skippedCount: number
  needsReviewCount: number
  matchedCount: number
  committedAt: Date | null
  createdAt: Date
}

export interface PreparedPurchaseBillLine extends PurchaseBillDraftLineInput {
  candidateMatches: MaterialMatchCandidate[]
}

export interface CommitPurchaseBillLineInput {
  lineId: string
  action: 'APPLY' | 'SKIP'
  materialId?: string
  createMaterial?: {
    name: string
    unit: string
    salePrice: number
    minThreshold?: number
    maxThreshold?: number
  }
  unit: string
  quantity: number
  purchasePrice: number
  lineTotal?: number | null
}

export interface CommitPurchaseBillScanResult {
  scanId: string
  importedLineCount: number
  skippedLineCount: number
  materialCount: number
  movementCount: number
}

interface CreateMaterialInput {
  businessId: string
  name: string
  unit: string
  stockQty: number
  minThreshold: number
  maxThreshold?: number
  purchasePrice: number
  salePrice: number
}

async function ensurePurchaseBillTables() {
  if (!ensurePurchaseBillTablesPromise) {
    ensurePurchaseBillTablesPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS material_aliases (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          alias TEXT NOT NULL,
          normalized_alias TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (business_id, normalized_alias)
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS material_aliases_material_idx
          ON material_aliases (business_id, material_id)
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS purchase_bill_scans (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          created_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          supplier_name TEXT,
          invoice_number TEXT,
          invoice_date DATE,
          file_name TEXT,
          image_mime_type TEXT,
          image_sha256 TEXT NOT NULL,
          storage_provider TEXT,
          storage_bucket TEXT,
          storage_object_path TEXT,
          original_file_name TEXT,
          image_size_bytes INTEGER,
          scan_provider TEXT NOT NULL DEFAULT 'gemini',
          scan_model TEXT,
          confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
          subtotal NUMERIC(12, 2),
          tax_amount NUMERIC(12, 2),
          total_amount NUMERIC(12, 2),
          raw_text TEXT,
          notes TEXT,
          committed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          committed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`ALTER TABLE purchase_bill_scans ADD COLUMN IF NOT EXISTS storage_provider TEXT`)
      await prisma.$executeRawUnsafe(`ALTER TABLE purchase_bill_scans ADD COLUMN IF NOT EXISTS storage_bucket TEXT`)
      await prisma.$executeRawUnsafe(`ALTER TABLE purchase_bill_scans ADD COLUMN IF NOT EXISTS storage_object_path TEXT`)
      await prisma.$executeRawUnsafe(`ALTER TABLE purchase_bill_scans ADD COLUMN IF NOT EXISTS original_file_name TEXT`)
      await prisma.$executeRawUnsafe(`ALTER TABLE purchase_bill_scans ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER`)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS purchase_bill_scans_business_status_idx
          ON purchase_bill_scans (business_id, status, created_at DESC)
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS purchase_bill_scans_image_hash_idx
          ON purchase_bill_scans (business_id, image_sha256)
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS purchase_bill_scans_invoice_idx
          ON purchase_bill_scans (business_id, invoice_number)
          WHERE invoice_number IS NOT NULL
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS purchase_bill_lines (
          id TEXT PRIMARY KEY,
          scan_id TEXT NOT NULL REFERENCES purchase_bill_scans(id) ON DELETE CASCADE,
          line_index INTEGER NOT NULL DEFAULT 0,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          material_id TEXT REFERENCES materials(id) ON DELETE SET NULL,
          scanned_name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          unit TEXT,
          quantity NUMERIC(12, 3),
          purchase_price NUMERIC(10, 2),
          line_total NUMERIC(12, 2),
          confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
          match_confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS purchase_bill_lines_scan_idx
          ON purchase_bill_lines (business_id, scan_id, line_index)
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS purchase_bill_lines_material_idx
          ON purchase_bill_lines (business_id, material_id)
      `)
    })().catch((error) => {
      ensurePurchaseBillTablesPromise = null
      throw error
    })
  }
  await ensurePurchaseBillTablesPromise
}

export function normalizeMaterialName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:pvt|ltd|private|limited|gst|hsn|sac|nos|no)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeUnit(value: string | null | undefined) {
  const unit = normalizeMaterialName(value ?? '')
  const map: Record<string, string> = {
    bag: 'bags',
    bags: 'bags',
    bgs: 'bags',
    mt: 'MT',
    ton: 'MT',
    tons: 'MT',
    tonne: 'MT',
    tonnes: 'MT',
    feet: 'feet',
    foot: 'feet',
    ft: 'feet',
    piece: 'pieces',
    pieces: 'pieces',
    pcs: 'pieces',
    pc: 'pieces',
    kg: 'kg',
    kgs: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    litre: 'litres',
    liter: 'litres',
    litres: 'litres',
    liters: 'litres',
    ltr: 'litres',
  }
  return map[unit] ?? (value?.trim() || '')
}

function tokenize(value: string) {
  return normalizeMaterialName(value)
    .split(' ')
    .filter((token) => token.length > 1)
}

function levenshteinSimilarity(a: string, b: string) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const maxLength = Math.max(a.length, b.length)
  if (Math.abs(a.length - b.length) > Math.max(8, Math.floor(maxLength * 0.55))) return 0

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }
  return 1 - previous[b.length] / maxLength
}

function scoreNameMatch(scannedName: string, candidateName: string) {
  const scanned = normalizeMaterialName(scannedName)
  const candidate = normalizeMaterialName(candidateName)
  if (!scanned || !candidate) return 0
  if (scanned === candidate) return 1
  if (scanned.includes(candidate) || candidate.includes(scanned)) {
    const ratio = Math.min(scanned.length, candidate.length) / Math.max(scanned.length, candidate.length)
    return Math.max(0.78, 0.9 * ratio)
  }

  const scannedTokens = new Set(tokenize(scanned))
  const candidateTokens = new Set(tokenize(candidate))
  if (scannedTokens.size === 0 || candidateTokens.size === 0) return 0

  let overlap = 0
  for (const token of scannedTokens) {
    if (candidateTokens.has(token)) overlap += 1
  }
  const union = new Set([...scannedTokens, ...candidateTokens]).size
  const tokenScore = overlap / union
  const coverage = overlap / Math.min(scannedTokens.size, candidateTokens.size)
  const editScore = levenshteinSimilarity(scanned, candidate)
  return Math.max(tokenScore * 0.85, coverage * 0.78, editScore * 0.92)
}

export function getMaterialCandidates(scannedName: string, catalog: MaterialMatchCatalogItem[]) {
  return catalog
    .map((material) => {
      const nameScore = scoreNameMatch(scannedName, material.name)
      const aliasScores = material.aliases.map((alias) => ({
        score: scoreNameMatch(scannedName, alias.alias),
        alias: alias.alias,
      }))
      const bestAlias = aliasScores.sort((a, b) => b.score - a.score)[0]
      const bestAliasScore = bestAlias?.score ?? 0
      const source: 'name' | 'alias' = bestAliasScore > nameScore ? 'alias' : 'name'
      const score = Math.max(nameScore, bestAliasScore)
      return {
        materialId: material.id,
        name: material.name,
        unit: material.unit,
        score,
        source,
        alias: source === 'alias' ? bestAlias?.alias : undefined,
      } satisfies MaterialMatchCandidate
    })
    .filter((candidate) => candidate.score >= BILL_LOW_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

export function preparePurchaseBillLines(
  lines: Array<{
    description: string
    unit: string | null
    quantity: number | null
    unitPrice: number | null
    lineTotal: number | null
    confidence: number
  }>,
  catalog: MaterialMatchCatalogItem[],
) {
  return lines.map((line, index) => {
    const scannedName = line.description.trim()
    const candidateMatches = getMaterialCandidates(scannedName, catalog)
    const bestMatch = candidateMatches[0]
    const unit = normalizeUnit(line.unit)
    const unitCompatible = !unit || !bestMatch || normalizeUnit(bestMatch.unit) === unit
    const hasRequiredNumbers = Number(line.quantity ?? 0) > 0 && Number(line.unitPrice ?? 0) >= 0
    const isMatched = Boolean(bestMatch && bestMatch.score >= BILL_MATCH_THRESHOLD && unitCompatible && hasRequiredNumbers)

    return {
      lineIndex: index,
      scannedName,
      unit: unit || null,
      quantity: line.quantity,
      purchasePrice: line.unitPrice,
      lineTotal: line.lineTotal,
      confidence: Math.max(0, Math.min(1, line.confidence || 0)),
      materialId: isMatched ? bestMatch!.materialId : null,
      matchConfidence: bestMatch?.score ?? 0,
      status: isMatched ? 'MATCHED' : 'NEEDS_REVIEW',
      candidateMatches,
    } satisfies PreparedPurchaseBillLine
  })
}

function materialSelectSql() {
  return Prisma.sql`
    SELECT
      id,
      name,
      unit,
      "stockQty"::double precision AS "stockQty",
      "minThreshold"::double precision AS "minThreshold",
      "maxThreshold"::double precision AS "maxThreshold",
      "purchasePrice"::double precision AS "purchasePrice",
      "salePrice"::double precision AS "salePrice",
      "isActive" AS "isActive",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt",
      "businessId" AS "businessId"
    FROM materials
  `
}

export async function listActiveMaterials(businessId: string) {
  const rows = await prisma.$queryRaw<MaterialRow[]>(Prisma.sql`
    ${materialSelectSql()}
    WHERE "businessId" = ${businessId} AND "isActive" = true
    ORDER BY name ASC
  `)

  return rows.map((material) => ({
    ...material,
    stockStatus: material.stockQty <= material.minThreshold
      ? (material.stockQty <= 0 ? 'OUT_OF_STOCK' : 'LOW')
      : 'OK',
  })) as InventoryMaterialRow[]
}

export async function listMaterialMatchCatalog(businessId: string) {
  await ensurePurchaseBillTables()

  const rows = await prisma.$queryRaw<Array<{
    id: string
    name: string
    unit: string
    alias: string | null
    normalizedAlias: string | null
  }>>(Prisma.sql`
    SELECT
      m.id,
      m.name,
      m.unit,
      ma.alias,
      ma.normalized_alias AS "normalizedAlias"
    FROM materials m
    LEFT JOIN material_aliases ma
      ON ma.material_id = m.id AND ma.business_id = m."businessId"
    WHERE m."businessId" = ${businessId} AND m."isActive" = true
    ORDER BY m.name ASC
  `)

  const byMaterial = new Map<string, MaterialMatchCatalogItem>()
  for (const row of rows) {
    const current = byMaterial.get(row.id) ?? {
      id: row.id,
      name: row.name,
      unit: row.unit,
      normalizedName: normalizeMaterialName(row.name),
      aliases: [],
    }
    if (row.alias && row.normalizedAlias) {
      current.aliases.push({ alias: row.alias, normalizedAlias: row.normalizedAlias })
    }
    byMaterial.set(row.id, current)
  }

  return [...byMaterial.values()]
}

async function getPurchaseBillLineRows(scanId: string, businessId: string) {
  return prisma.$queryRaw<PurchaseBillDraftLineRow[]>(Prisma.sql`
    SELECT
      id,
      scan_id AS "scanId",
      line_index AS "lineIndex",
      business_id AS "businessId",
      material_id AS "materialId",
      scanned_name AS "scannedName",
      normalized_name AS "normalizedName",
      unit,
      quantity::double precision AS quantity,
      purchase_price::double precision AS "purchasePrice",
      line_total::double precision AS "lineTotal",
      confidence::double precision AS confidence,
      match_confidence::double precision AS "matchConfidence",
      status,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM purchase_bill_lines
    WHERE scan_id = ${scanId} AND business_id = ${businessId}
    ORDER BY line_index ASC, created_at ASC
  `)
}

export async function getPurchaseBillDraft(scanId: string, businessId: string) {
  await ensurePurchaseBillTables()

  const rows = await prisma.$queryRaw<Array<Omit<PurchaseBillDraftRow, 'lines'>>>(Prisma.sql`
    SELECT
      id,
      business_id AS "businessId",
      created_by_id AS "createdById",
      status,
      supplier_name AS "supplierName",
      invoice_number AS "invoiceNumber",
      invoice_date AS "invoiceDate",
      file_name AS "fileName",
      image_mime_type AS "imageMimeType",
      image_sha256 AS "imageSha256",
      storage_provider AS "storageProvider",
      storage_bucket AS "storageBucket",
      storage_object_path AS "storageObjectPath",
      original_file_name AS "originalFileName",
      image_size_bytes AS "imageSizeBytes",
      scan_provider AS "scanProvider",
      scan_model AS "scanModel",
      confidence::double precision AS confidence,
      subtotal::double precision AS subtotal,
      tax_amount::double precision AS "taxAmount",
      total_amount::double precision AS "totalAmount",
      raw_text AS "rawText",
      notes,
      committed_by_id AS "committedById",
      committed_at AS "committedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM purchase_bill_scans
    WHERE id = ${scanId} AND business_id = ${businessId}
    LIMIT 1
  `)
  const draft = rows[0]
  if (!draft) return null

  const lines = await getPurchaseBillLineRows(scanId, businessId)
  return { ...draft, lines } satisfies PurchaseBillDraftRow
}

export async function findPurchaseBillScanByImageHash(businessId: string, imageSha256: string) {
  await ensurePurchaseBillTables()

  const rows = await prisma.$queryRaw<Array<{
    id: string
    status: PurchaseBillScanStatus
    invoiceNumber: string | null
    supplierName: string | null
    committedAt: Date | null
  }>>(Prisma.sql`
    SELECT
      id,
      status,
      invoice_number AS "invoiceNumber",
      supplier_name AS "supplierName",
      committed_at AS "committedAt"
    FROM purchase_bill_scans
    WHERE business_id = ${businessId}
      AND image_sha256 = ${imageSha256}
      AND status IN ('DRAFT', 'COMMITTED')
    ORDER BY created_at DESC
    LIMIT 1
  `)

  return rows[0] ?? null
}

export async function findCommittedPurchaseBillByInvoice(businessId: string, invoiceNumber: string) {
  await ensurePurchaseBillTables()

  const normalizedInvoice = invoiceNumber.trim()
  if (!normalizedInvoice) return null

  const rows = await prisma.$queryRaw<Array<{
    id: string
    supplierName: string | null
    committedAt: Date | null
  }>>(Prisma.sql`
    SELECT
      id,
      supplier_name AS "supplierName",
      committed_at AS "committedAt"
    FROM purchase_bill_scans
    WHERE business_id = ${businessId}
      AND status = 'COMMITTED'
      AND lower(invoice_number) = lower(${normalizedInvoice})
    ORDER BY committed_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `)

  return rows[0] ?? null
}

export async function listPurchaseBillScans(businessId: string, limit = 100, search?: string) {
  await ensurePurchaseBillTables()

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(300, Math.floor(limit))) : 100
  const searchText = search?.trim() ?? ''
  const hasSearch = searchText.length > 0
  const searchLike = `%${searchText}%`

  return prisma.$queryRaw<PurchaseBillScanListRow[]>(Prisma.sql`
    SELECT
      pbs.id,
      pbs.business_id AS "businessId",
      pbs.status,
      pbs.supplier_name AS "supplierName",
      pbs.invoice_number AS "invoiceNumber",
      pbs.invoice_date AS "invoiceDate",
      pbs.file_name AS "fileName",
      pbs.storage_provider AS "storageProvider",
      pbs.original_file_name AS "originalFileName",
      pbs.scan_provider AS "scanProvider",
      pbs.scan_model AS "scanModel",
      pbs.confidence::double precision AS confidence,
      pbs.subtotal::double precision AS subtotal,
      pbs.tax_amount::double precision AS "taxAmount",
      pbs.total_amount::double precision AS "totalAmount",
      COUNT(pbl.id)::int AS "lineCount",
      COUNT(*) FILTER (WHERE pbl.status = 'APPLIED')::int AS "appliedCount",
      COUNT(*) FILTER (WHERE pbl.status = 'SKIPPED')::int AS "skippedCount",
      COUNT(*) FILTER (WHERE pbl.status = 'NEEDS_REVIEW')::int AS "needsReviewCount",
      COUNT(*) FILTER (WHERE pbl.status = 'MATCHED')::int AS "matchedCount",
      pbs.committed_at AS "committedAt",
      pbs.created_at AS "createdAt"
    FROM purchase_bill_scans pbs
    LEFT JOIN purchase_bill_lines pbl
      ON pbl.scan_id = pbs.id
      AND pbl.business_id = pbs.business_id
    WHERE pbs.business_id = ${businessId}
      AND (
        ${hasSearch} = false
        OR pbs.supplier_name ILIKE ${searchLike}
        OR pbs.invoice_number ILIKE ${searchLike}
        OR pbs.file_name ILIKE ${searchLike}
        OR pbs.status ILIKE ${searchLike}
        OR pbs.scan_provider ILIKE ${searchLike}
      )
    GROUP BY pbs.id
    ORDER BY pbs.created_at DESC
    LIMIT ${safeLimit}
  `)
}

export async function listReferencedBillStorageObjects(businessId: string, provider = 'supabase') {
  await ensurePurchaseBillTables()
  return prisma.$queryRaw<Array<{
    id: string
    storageProvider: string | null
    storageBucket: string | null
    storageObjectPath: string | null
  }>>(Prisma.sql`
    SELECT
      id,
      storage_provider AS "storageProvider",
      storage_bucket AS "storageBucket",
      storage_object_path AS "storageObjectPath"
    FROM purchase_bill_scans
    WHERE business_id = ${businessId}
      AND storage_provider = ${provider}
      AND storage_object_path IS NOT NULL
  `)
}

export async function createPurchaseBillDraft(input: {
  businessId: string
  createdById: string
  supplierName?: string | null
  invoiceNumber?: string | null
  invoiceDate?: string | null
  fileName?: string | null
  imageMimeType?: string | null
  imageSha256: string
  storageProvider?: string | null
  storageBucket?: string | null
  storageObjectPath?: string | null
  originalFileName?: string | null
  imageSizeBytes?: number | null
  scanProvider: string
  scanModel?: string | null
  confidence: number
  subtotal?: number | null
  taxAmount?: number | null
  totalAmount?: number | null
  rawText?: string | null
  notes?: string | null
  lines: PurchaseBillDraftLineInput[]
}) {
  await ensurePurchaseBillTables()

  const scanId = randomUUID()
  const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : null

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO purchase_bill_scans (
        id,
        business_id,
        created_by_id,
        status,
        supplier_name,
        invoice_number,
        invoice_date,
        file_name,
        image_mime_type,
        image_sha256,
        storage_provider,
        storage_bucket,
        storage_object_path,
        original_file_name,
        image_size_bytes,
        scan_provider,
        scan_model,
        confidence,
        subtotal,
        tax_amount,
        total_amount,
        raw_text,
        notes,
        created_at,
        updated_at
      ) VALUES (
        ${scanId},
        ${input.businessId},
        ${input.createdById},
        'DRAFT',
        ${input.supplierName ?? null},
        ${input.invoiceNumber ?? null},
        ${invoiceDate},
        ${input.fileName ?? null},
        ${input.imageMimeType ?? null},
        ${input.imageSha256},
        ${input.storageProvider ?? null},
        ${input.storageBucket ?? null},
        ${input.storageObjectPath ?? null},
        ${input.originalFileName ?? null},
        ${input.imageSizeBytes ?? null},
        ${input.scanProvider},
        ${input.scanModel ?? null},
        ${Math.max(0, Math.min(1, input.confidence || 0))},
        ${input.subtotal ?? null},
        ${input.taxAmount ?? null},
        ${input.totalAmount ?? null},
        ${input.rawText ?? null},
        ${input.notes ?? null},
        NOW(),
        NOW()
      )
    `)

    if (input.lines.length > 0) {
      const values = input.lines.map((line) => Prisma.sql`(
        ${randomUUID()},
        ${scanId},
        ${line.lineIndex},
        ${input.businessId},
        ${line.materialId},
        ${line.scannedName},
        ${normalizeMaterialName(line.scannedName)},
        ${line.unit ? normalizeUnit(line.unit) : null},
        ${line.quantity},
        ${line.purchasePrice},
        ${line.lineTotal},
        ${Math.max(0, Math.min(1, line.confidence || 0))},
        ${Math.max(0, Math.min(1, line.matchConfidence || 0))},
        ${line.status},
        NOW(),
        NOW()
      )`)

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO purchase_bill_lines (
          id,
          scan_id,
          line_index,
          business_id,
          material_id,
          scanned_name,
          normalized_name,
          unit,
          quantity,
          purchase_price,
          line_total,
          confidence,
          match_confidence,
          status,
          created_at,
          updated_at
        ) VALUES ${Prisma.join(values)}
      `)
    }
  })

  return getPurchaseBillDraft(scanId, input.businessId)
}

export async function getMaterialById(materialId: string, businessId: string) {
  const rows = await prisma.$queryRaw<MaterialRow[]>(Prisma.sql`
    ${materialSelectSql()}
    WHERE id = ${materialId} AND "businessId" = ${businessId}
    LIMIT 1
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function stockInMaterial(input: {
  materialId: string
  businessId: string
  recordedById: string
  quantity: number
  purchasePrice: number
  reason?: string
}) {
  const current = await getMaterialById(input.materialId, input.businessId)
  if (!current) return null

  const stockAfter = current.stockQty + input.quantity

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE materials
      SET
        "stockQty" = ${stockAfter},
        "purchasePrice" = ${input.purchasePrice},
        "updatedAt" = NOW()
      WHERE id = ${input.materialId} AND "businessId" = ${input.businessId}
    `)

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO stock_movements (
        id,
        "materialId",
        "orderId",
        type,
        quantity,
        "stockAfter",
        reason,
        "recordedById",
        "createdAt",
        "businessId"
      ) VALUES (
        ${randomUUID()},
        ${input.materialId},
        NULL,
        'IN'::"StockMovementType",
        ${input.quantity},
        ${stockAfter},
        ${input.reason ?? 'Purchase'},
        ${input.recordedById},
        NOW(),
        ${input.businessId}
      )
    `)
  })

  return getMaterialById(input.materialId, input.businessId)
}

export async function adjustMaterialStock(input: {
  materialId: string
  businessId: string
  recordedById: string
  newQty: number
  reason: string
}) {
  const current = await getMaterialById(input.materialId, input.businessId)
  if (!current) return null

  const diff = Math.abs(input.newQty - current.stockQty)

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE materials
      SET
        "stockQty" = ${input.newQty},
        "updatedAt" = NOW()
      WHERE id = ${input.materialId} AND "businessId" = ${input.businessId}
    `)

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO stock_movements (
        id,
        "materialId",
        "orderId",
        type,
        quantity,
        "stockAfter",
        reason,
        "recordedById",
        "createdAt",
        "businessId"
      ) VALUES (
        ${randomUUID()},
        ${input.materialId},
        NULL,
        'ADJUSTMENT'::"StockMovementType",
        ${diff},
        ${input.newQty},
        ${input.reason},
        ${input.recordedById},
        NOW(),
        ${input.businessId}
      )
    `)
  })

  return true
}

export async function listMaterialMovements(materialId: string, businessId: string, limit: number) {
  return prisma.$queryRaw<StockMovementWithOrderRow[]>(Prisma.sql`
    SELECT
      sm.id,
      sm."materialId" AS "materialId",
      sm."orderId" AS "orderId",
      sm.type::text AS type,
      sm.quantity::double precision AS quantity,
      sm."stockAfter"::double precision AS "stockAfter",
      sm.reason,
      sm."recordedById" AS "recordedById",
      sm."createdAt" AS "createdAt",
      sm."businessId" AS "businessId",
      CASE
        WHEN o.id IS NULL THEN NULL
        ELSE json_build_object('orderNumber', o."orderNumber")
      END AS "order"
    FROM stock_movements sm
    LEFT JOIN orders o ON o.id = sm."orderId"
    WHERE sm."materialId" = ${materialId} AND sm."businessId" = ${businessId}
    ORDER BY sm."createdAt" DESC
    LIMIT ${limit}
  `)
}

export async function createMaterial(input: CreateMaterialInput) {
  const materialId = randomUUID()
  const rows = await prisma.$queryRaw<MaterialRow[]>(Prisma.sql`
    INSERT INTO materials (
      id,
      name,
      unit,
      "stockQty",
      "minThreshold",
      "maxThreshold",
      "purchasePrice",
      "salePrice",
      "isActive",
      "createdAt",
      "updatedAt",
      "businessId"
    ) VALUES (
      ${materialId},
      ${input.name},
      ${input.unit},
      ${input.stockQty},
      ${input.minThreshold},
      ${input.maxThreshold ?? null},
      ${input.purchasePrice},
      ${input.salePrice},
      true,
      NOW(),
      NOW(),
      ${input.businessId}
    )
    RETURNING
      id,
      name,
      unit,
      "stockQty"::double precision AS "stockQty",
      "minThreshold"::double precision AS "minThreshold",
      "maxThreshold"::double precision AS "maxThreshold",
      "purchasePrice"::double precision AS "purchasePrice",
      "salePrice"::double precision AS "salePrice",
      "isActive" AS "isActive",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt",
      "businessId" AS "businessId"
  `)
  return rows[0]
}

export async function commitPurchaseBillScan(input: {
  scanId: string
  businessId: string
  recordedById: string
  lines: CommitPurchaseBillLineInput[]
}) {
  await ensurePurchaseBillTables()

  const appliedLines = input.lines.filter((line) => line.action === 'APPLY')
  const skippedLines = input.lines.filter((line) => line.action === 'SKIP')
  if (appliedLines.length === 0) {
    throw new Error('At least one bill line must be applied')
  }

  return prisma.$transaction(async (tx) => {
    const scanRows = await tx.$queryRaw<Array<{
      id: string
      status: PurchaseBillScanStatus
      supplierName: string | null
      invoiceNumber: string | null
    }>>(Prisma.sql`
      SELECT
        id,
        status,
        supplier_name AS "supplierName",
        invoice_number AS "invoiceNumber"
      FROM purchase_bill_scans
      WHERE id = ${input.scanId} AND business_id = ${input.businessId}
      FOR UPDATE
    `)
    const scan = scanRows[0]
    if (!scan) throw new Error('Purchase bill scan not found')
    if (scan.status !== 'DRAFT') throw new Error('Purchase bill scan has already been committed')

    const draftLines = await tx.$queryRaw<Array<{
      id: string
      scannedName: string
    }>>(Prisma.sql`
      SELECT id, scanned_name AS "scannedName"
      FROM purchase_bill_lines
      WHERE scan_id = ${input.scanId} AND business_id = ${input.businessId}
      FOR UPDATE
    `)
    const draftLineIds = new Set(draftLines.map((line) => line.id))
    const draftLineNameById = new Map(draftLines.map((line) => [line.id, line.scannedName]))

    for (const line of input.lines) {
      if (!draftLineIds.has(line.lineId)) {
        throw new Error('One or more bill lines are invalid for this scan')
      }
    }

    const existingMaterialIds = [...new Set(appliedLines.map((line) => line.materialId).filter(Boolean))] as string[]
    const existingMaterials = existingMaterialIds.length > 0
      ? await tx.$queryRaw<Array<{ id: string; name: string; unit: string }>>(Prisma.sql`
          SELECT id, name, unit
          FROM materials
          WHERE "businessId" = ${input.businessId}
            AND "isActive" = true
            AND id IN (${Prisma.join(existingMaterialIds)})
        `)
      : []
    const existingMaterialById = new Map(existingMaterials.map((material) => [material.id, material]))
    if (existingMaterialById.size !== existingMaterialIds.length) {
      throw new Error('One or more selected materials were not found')
    }

    const newMaterials = appliedLines
      .filter((line) => line.createMaterial)
      .map((line) => {
        const materialId = randomUUID()
        return {
          lineId: line.lineId,
          materialId,
          name: line.createMaterial!.name.trim(),
          unit: normalizeUnit(line.createMaterial!.unit || line.unit),
          minThreshold: line.createMaterial!.minThreshold ?? 0,
          maxThreshold: line.createMaterial!.maxThreshold ?? null,
          purchasePrice: line.purchasePrice,
          salePrice: line.createMaterial!.salePrice,
        }
      })

    if (newMaterials.length > 0) {
      const values = newMaterials.map((material) => Prisma.sql`(
        ${material.materialId},
        ${material.name},
        ${material.unit},
        0,
        ${material.minThreshold},
        ${material.maxThreshold},
        ${material.purchasePrice},
        ${material.salePrice},
        true,
        NOW(),
        NOW(),
        ${input.businessId}
      )`)

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO materials (
          id,
          name,
          unit,
          "stockQty",
          "minThreshold",
          "maxThreshold",
          "purchasePrice",
          "salePrice",
          "isActive",
          "createdAt",
          "updatedAt",
          "businessId"
        ) VALUES ${Prisma.join(values)}
      `)
    }

    const newMaterialByLineId = new Map(newMaterials.map((material) => [material.lineId, material]))
    const appliedLineDetails = appliedLines.map((line) => {
      const newMaterial = newMaterialByLineId.get(line.lineId)
      const materialId = newMaterial?.materialId ?? line.materialId
      if (!materialId) throw new Error('Every applied line must map to a material')
      const materialName = newMaterial?.name ?? existingMaterialById.get(materialId)?.name ?? ''
      const materialUnit = newMaterial?.unit ?? existingMaterialById.get(materialId)?.unit ?? normalizeUnit(line.unit)
      const quantity = Number(line.quantity)
      const purchasePrice = Number(line.purchasePrice)
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Applied bill lines need a positive quantity')
      if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error('Applied bill lines need a valid purchase price')
      return {
        lineId: line.lineId,
        scannedName: draftLineNameById.get(line.lineId) ?? '',
        materialId,
        materialName,
        unit: normalizeUnit(line.unit || materialUnit),
        quantity,
        purchasePrice,
        lineTotal: line.lineTotal ?? quantity * purchasePrice,
      }
    })

    const groupedByMaterial = new Map<string, {
      materialId: string
      quantity: number
      weightedPriceTotal: number
      materialName: string
      unit: string
    }>()

    for (const line of appliedLineDetails) {
      const current = groupedByMaterial.get(line.materialId) ?? {
        materialId: line.materialId,
        quantity: 0,
        weightedPriceTotal: 0,
        materialName: line.materialName,
        unit: line.unit,
      }
      current.quantity += line.quantity
      current.weightedPriceTotal += line.quantity * line.purchasePrice
      groupedByMaterial.set(line.materialId, current)
    }

    const materialUpdates = [...groupedByMaterial.values()].map((material) => ({
      ...material,
      purchasePrice: material.quantity > 0 ? material.weightedPriceTotal / material.quantity : 0,
    }))

    const updateValues = materialUpdates.map((material) => Prisma.sql`(
      ${material.materialId},
      ${material.quantity},
      ${material.purchasePrice}
    )`)

    const updatedMaterials = await tx.$queryRaw<Array<{
      id: string
      stockQty: number
      quantity: number
      purchasePrice: number
    }>>(Prisma.sql`
      WITH updates(material_id, quantity, purchase_price) AS (
        VALUES ${Prisma.join(updateValues)}
      ),
      updated AS (
        UPDATE materials m
        SET
          "stockQty" = m."stockQty" + updates.quantity::numeric,
          "purchasePrice" = updates.purchase_price::numeric,
          "updatedAt" = NOW()
        FROM updates
        WHERE m.id = updates.material_id::text
          AND m."businessId" = ${input.businessId}
          AND m."isActive" = true
        RETURNING
          m.id,
          m."stockQty"::double precision AS "stockQty",
          updates.quantity::double precision AS quantity,
          updates.purchase_price::double precision AS "purchasePrice"
      )
      SELECT * FROM updated
    `)

    if (updatedMaterials.length !== materialUpdates.length) {
      throw new Error('Unable to update one or more materials')
    }

    const reasonParts = ['Bill import']
    if (scan.invoiceNumber) reasonParts.push(`#${scan.invoiceNumber}`)
    if (scan.supplierName) reasonParts.push(scan.supplierName)
    const reason = reasonParts.join(' - ')
    const movementValues = updatedMaterials.map((material) => Prisma.sql`(
      ${randomUUID()},
      ${material.id},
      NULL,
      'IN'::"StockMovementType",
      ${material.quantity},
      ${material.stockQty},
      ${reason},
      ${input.recordedById},
      NOW(),
      ${input.businessId}
    )`)

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO stock_movements (
        id,
        "materialId",
        "orderId",
        type,
        quantity,
        "stockAfter",
        reason,
        "recordedById",
        "createdAt",
        "businessId"
      ) VALUES ${Prisma.join(movementValues)}
    `)

    const lineUpdateValues = [
      ...appliedLineDetails.map((line) => Prisma.sql`(
        ${line.lineId},
        ${line.materialId},
        ${line.unit},
        ${line.quantity},
        ${line.purchasePrice},
        ${line.lineTotal},
        'APPLIED'
      )`),
      ...skippedLines.map((line) => Prisma.sql`(
        ${line.lineId},
        NULL,
        ${normalizeUnit(line.unit)},
        ${line.quantity},
        ${line.purchasePrice},
        ${line.lineTotal ?? null},
        'SKIPPED'
      )`),
    ]

    await tx.$executeRaw(Prisma.sql`
      UPDATE purchase_bill_lines AS pbl
      SET
        material_id = line_updates.material_id,
        unit = line_updates.unit,
        quantity = line_updates.quantity::numeric,
        purchase_price = line_updates.purchase_price::numeric,
        line_total = line_updates.line_total::numeric,
        status = line_updates.status,
        updated_at = NOW()
      FROM (
        VALUES ${Prisma.join(lineUpdateValues)}
      ) AS line_updates(id, material_id, unit, quantity, purchase_price, line_total, status)
      WHERE pbl.id = line_updates.id::text
        AND pbl.scan_id = ${input.scanId}
        AND pbl.business_id = ${input.businessId}
    `)

    const aliasRows = appliedLineDetails
      .map((line) => ({
        alias: line.scannedName.trim(),
        normalizedAlias: normalizeMaterialName(line.scannedName),
        materialId: line.materialId,
        materialName: line.materialName,
      }))
      .filter((line) => line.alias.length >= 2 && line.normalizedAlias !== normalizeMaterialName(line.materialName))

    if (aliasRows.length > 0) {
      const seen = new Set<string>()
      const aliasValues = aliasRows
        .filter((line) => {
          const key = `${input.businessId}:${line.normalizedAlias}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map((line) => Prisma.sql`(
          ${randomUUID()},
          ${input.businessId},
          ${line.materialId},
          ${line.alias},
          ${line.normalizedAlias},
          NOW(),
          NOW()
        )`)

      if (aliasValues.length > 0) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO material_aliases (
            id,
            business_id,
            material_id,
            alias,
            normalized_alias,
            created_at,
            updated_at
          ) VALUES ${Prisma.join(aliasValues)}
          ON CONFLICT (business_id, normalized_alias)
          DO UPDATE SET
            material_id = EXCLUDED.material_id,
            alias = EXCLUDED.alias,
            updated_at = NOW()
        `)
      }
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE purchase_bill_scans
      SET
        status = 'COMMITTED',
        committed_by_id = ${input.recordedById},
        committed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${input.scanId} AND business_id = ${input.businessId}
    `)

    return {
      scanId: input.scanId,
      importedLineCount: appliedLineDetails.length,
      skippedLineCount: skippedLines.length,
      materialCount: materialUpdates.length,
      movementCount: updatedMaterials.length,
    } satisfies CommitPurchaseBillScanResult
  })
}

export async function softDeleteMaterial(materialId: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE materials
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE id = ${materialId} AND "businessId" = ${businessId}
    RETURNING id
  `
  return rows.length > 0
}

export async function bulkSoftDeleteMaterials(ids: string[], businessId: string) {
  if (ids.length === 0) return 0

  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    WITH updated AS (
      UPDATE materials
      SET "isActive" = false, "updatedAt" = NOW()
      WHERE id IN (${Prisma.join(ids)}) AND "businessId" = ${businessId}
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM updated
  `)

  return rows[0]?.count ?? 0
}

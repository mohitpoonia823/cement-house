import { Prisma } from '@prisma/client'
import { prisma } from '../client'
import { randomUUID } from 'node:crypto'

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

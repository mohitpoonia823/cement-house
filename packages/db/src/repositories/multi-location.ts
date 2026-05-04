import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'

export interface LocationRow {
  id: string
  businessId: string
  name: string
  type: 'STORE' | 'GODOWN' | 'WAREHOUSE' | 'YARD'
  address: string | null
  isDefault: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export async function listLocations(businessId: string) {
  return prisma.$queryRaw<LocationRow[]>(Prisma.sql`
    SELECT
      id,
      "businessId" AS "businessId",
      name,
      type::text AS type,
      address,
      "isDefault" AS "isDefault",
      "isActive" AS "isActive",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
    FROM locations
    WHERE "businessId" = ${businessId}
    ORDER BY "isDefault" DESC, name ASC
  `)
}

export async function getDefaultLocation(businessId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM locations
    WHERE "businessId" = ${businessId}
      AND "isDefault" = true
      AND "isActive" = true
    LIMIT 1
  `)
  return rows[0]?.id ?? null
}

export async function resolveSourceLocationId(businessId: string, sourceLocationId?: string | null) {
  if (sourceLocationId) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM locations
      WHERE id = ${sourceLocationId}
        AND "businessId" = ${businessId}
        AND "isActive" = true
      LIMIT 1
    `)
    if (rows[0]?.id) return rows[0].id
    throw new Error('Source location not found for this business')
  }
  const fallback = await getDefaultLocation(businessId)
  if (!fallback) throw new Error('Default location is not configured for this business')
  return fallback
}

export async function createLocation(input: {
  businessId: string
  name: string
  type: 'STORE' | 'GODOWN' | 'WAREHOUSE' | 'YARD'
  address?: string | null
  isDefault?: boolean
  isActive?: boolean
}) {
  const id = randomUUID()
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE locations
        SET "isDefault" = false, "updatedAt" = NOW()
        WHERE "businessId" = ${input.businessId}
      `)
    }
    const rows = await tx.$queryRaw<LocationRow[]>(Prisma.sql`
      INSERT INTO locations (
        id, "businessId", name, type, address, "isDefault", "isActive", "createdAt", "updatedAt"
      ) VALUES (
        ${id},
        ${input.businessId},
        ${input.name},
        ${input.type}::"LocationType",
        ${input.address ?? null},
        ${input.isDefault === true},
        ${input.isActive !== false},
        NOW(),
        NOW()
      )
      RETURNING
        id,
        "businessId" AS "businessId",
        name,
        type::text AS type,
        address,
        "isDefault" AS "isDefault",
        "isActive" AS "isActive",
        "createdAt" AS "createdAt",
        "updatedAt" AS "updatedAt"
    `)
    return rows[0] ?? null
  })
}

export async function updateLocation(input: {
  businessId: string
  locationId: string
  name?: string
  type?: 'STORE' | 'GODOWN' | 'WAREHOUSE' | 'YARD'
  address?: string | null
  isDefault?: boolean
  isActive?: boolean
}) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM locations WHERE id = ${input.locationId} AND "businessId" = ${input.businessId} LIMIT 1
    `)
    if (!owned[0]?.id) throw new Error('Location not found for this business')

    if (input.isDefault) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE locations
        SET "isDefault" = false, "updatedAt" = NOW()
        WHERE "businessId" = ${input.businessId}
      `)
    }

    const rows = await tx.$queryRaw<LocationRow[]>(Prisma.sql`
      UPDATE locations
      SET
        name = COALESCE(${input.name ?? null}, name),
        type = COALESCE(${input.type ?? null}::"LocationType", type),
        address = COALESCE(${input.address ?? null}, address),
        "isDefault" = COALESCE(${input.isDefault ?? null}, "isDefault"),
        "isActive" = COALESCE(${input.isActive ?? null}, "isActive"),
        "updatedAt" = NOW()
      WHERE id = ${input.locationId} AND "businessId" = ${input.businessId}
      RETURNING
        id,
        "businessId" AS "businessId",
        name,
        type::text AS type,
        address,
        "isDefault" AS "isDefault",
        "isActive" AS "isActive",
        "createdAt" AS "createdAt",
        "updatedAt" AS "updatedAt"
    `)
    return rows[0] ?? null
  })
}

export async function syncMaterialTotalStock(tx: Prisma.TransactionClient, businessId: string, materialId: string) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE materials m
    SET
      "stockQty" = COALESCE((
        SELECT SUM(ms.quantity)
        FROM material_stock ms
        WHERE ms."businessId" = ${businessId}
          AND ms."materialId" = ${materialId}
      ), 0),
      "updatedAt" = NOW()
    WHERE m.id = ${materialId}
      AND m."businessId" = ${businessId}
  `)
}

export async function adjustMaterialLocationStock(tx: Prisma.TransactionClient, input: {
  businessId: string
  materialId: string
  locationId: string
  deltaQty: number
  allowNegativeStock?: boolean
}) {
  const rows = await tx.$queryRaw<Array<{ quantity: number }>>(Prisma.sql`
    SELECT quantity::double precision AS quantity
    FROM material_stock
    WHERE "businessId" = ${input.businessId}
      AND "materialId" = ${input.materialId}
      AND "locationId" = ${input.locationId}
    LIMIT 1
  `)
  const currentQty = rows[0]?.quantity ?? 0
  const nextQty = currentQty + input.deltaQty
  if (!input.allowNegativeStock && nextQty < 0) {
    throw new Error('Insufficient stock in selected location')
  }

  if (rows[0]) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE material_stock
      SET quantity = ${nextQty}, "updatedAt" = NOW()
      WHERE "businessId" = ${input.businessId}
        AND "materialId" = ${input.materialId}
        AND "locationId" = ${input.locationId}
    `)
  } else {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO material_stock (id, "businessId", "materialId", "locationId", quantity, "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${input.businessId}, ${input.materialId}, ${input.locationId}, ${nextQty}, NOW(), NOW())
    `)
  }

  await syncMaterialTotalStock(tx, input.businessId, input.materialId)
  return nextQty
}

export async function getStockByLocation(input: { businessId: string; materialId?: string; locationId?: string }) {
  return prisma.$queryRaw<Array<{
    materialId: string
    materialName: string
    unit: string
    locationId: string
    locationName: string
    locationType: string
    quantity: number
  }>>(Prisma.sql`
    SELECT
      ms."materialId" AS "materialId",
      m.name AS "materialName",
      m.unit AS unit,
      ms."locationId" AS "locationId",
      l.name AS "locationName",
      l.type::text AS "locationType",
      ms.quantity::double precision AS quantity
    FROM material_stock ms
    INNER JOIN materials m
      ON m.id = ms."materialId"
     AND m."businessId" = ms."businessId"
    INNER JOIN locations l
      ON l.id = ms."locationId"
     AND l."businessId" = ms."businessId"
    WHERE ms."businessId" = ${input.businessId}
      ${input.materialId ? Prisma.sql`AND ms."materialId" = ${input.materialId}` : Prisma.empty}
      ${input.locationId ? Prisma.sql`AND ms."locationId" = ${input.locationId}` : Prisma.empty}
    ORDER BY m.name ASC, l.name ASC
  `)
}

export async function createStockTransfer(input: {
  businessId: string
  fromLocationId: string
  toLocationId: string
  createdById: string
  notes?: string
  items: Array<{ materialId: string; quantity: number }>
}) {
  if (input.fromLocationId === input.toLocationId) throw new Error('Source and destination location cannot be same')
  if (!input.items.length) throw new Error('Transfer items are required')

  const transferId = randomUUID()
  return prisma.$transaction(async (tx) => {
    const actor = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM users
      WHERE id = ${input.createdById}
        AND "businessId" = ${input.businessId}
        AND "isActive" = true
      LIMIT 1
    `)
    if (!actor[0]?.id) throw new Error('Transfer actor is invalid for this business')

    const locs = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM locations
      WHERE "businessId" = ${input.businessId}
        AND id IN (${Prisma.join([input.fromLocationId, input.toLocationId])})
        AND "isActive" = true
    `)
    if (locs.length !== 2) throw new Error('Transfer locations are invalid for this business')

    const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO stock_transfers (
        id, "businessId", "fromLocationId", "toLocationId", status, "createdById", notes, "createdAt"
      ) VALUES (
        ${transferId},
        ${input.businessId},
        ${input.fromLocationId},
        ${input.toLocationId},
        'COMPLETED'::"StockTransferStatus",
        ${input.createdById},
        ${input.notes ?? null},
        NOW()
      )
      RETURNING id
    `)
    if (!created[0]?.id) throw new Error('Failed to create stock transfer')

    for (const item of input.items) {
      if (item.quantity <= 0) throw new Error('Transfer quantity should be greater than 0')

      const mat = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM materials
        WHERE id = ${item.materialId}
          AND "businessId" = ${input.businessId}
          AND "isActive" = true
        LIMIT 1
      `)
      if (!mat[0]?.id) throw new Error('Transfer material not found for this business')

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO stock_transfer_items (id, "transferId", "materialId", quantity)
        VALUES (${randomUUID()}, ${transferId}, ${item.materialId}, ${item.quantity})
      `)

      await adjustMaterialLocationStock(tx, {
        businessId: input.businessId,
        materialId: item.materialId,
        locationId: input.fromLocationId,
        deltaQty: -item.quantity,
        allowNegativeStock: false,
      })

      await adjustMaterialLocationStock(tx, {
        businessId: input.businessId,
        materialId: item.materialId,
        locationId: input.toLocationId,
        deltaQty: item.quantity,
        allowNegativeStock: true,
      })
    }

    return transferId
  })
}

export async function listStockTransfers(input: { businessId: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  return prisma.$queryRaw<Array<{
    id: string
    businessId: string
    fromLocationId: string
    toLocationId: string
    status: string
    createdById: string
    notes: string | null
    createdAt: Date
    fromLocationName: string
    toLocationName: string
    itemCount: number
  }>>(Prisma.sql`
    SELECT
      st.id,
      st."businessId" AS "businessId",
      st."fromLocationId" AS "fromLocationId",
      st."toLocationId" AS "toLocationId",
      st.status::text AS status,
      st."createdById" AS "createdById",
      st.notes,
      st."createdAt" AS "createdAt",
      lf.name AS "fromLocationName",
      lt.name AS "toLocationName",
      COUNT(sti.id)::int AS "itemCount"
    FROM stock_transfers st
    INNER JOIN locations lf ON lf.id = st."fromLocationId" AND lf."businessId" = st."businessId"
    INNER JOIN locations lt ON lt.id = st."toLocationId" AND lt."businessId" = st."businessId"
    LEFT JOIN stock_transfer_items sti ON sti."transferId" = st.id
    WHERE st."businessId" = ${input.businessId}
    GROUP BY st.id, lf.name, lt.name
    ORDER BY st."createdAt" DESC
    LIMIT ${limit}
  `)
}

export async function getStockTransferDetail(input: { businessId: string; transferId: string }) {
  const rows = await prisma.$queryRaw<Array<{
    id: string
    businessId: string
    fromLocationId: string
    toLocationId: string
    status: string
    createdById: string
    notes: string | null
    createdAt: Date
    fromLocationName: string
    toLocationName: string
    items: Prisma.JsonValue
  }>>(Prisma.sql`
    SELECT
      st.id,
      st."businessId" AS "businessId",
      st."fromLocationId" AS "fromLocationId",
      st."toLocationId" AS "toLocationId",
      st.status::text AS status,
      st."createdById" AS "createdById",
      st.notes,
      st."createdAt" AS "createdAt",
      lf.name AS "fromLocationName",
      lt.name AS "toLocationName",
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'id', sti.id,
            'materialId', sti."materialId",
            'quantity', sti.quantity::double precision,
            'materialName', m.name,
            'unit', m.unit
          ))
          FROM stock_transfer_items sti
          INNER JOIN materials m
            ON m.id = sti."materialId"
           AND m."businessId" = st."businessId"
          WHERE sti."transferId" = st.id
        ),
        '[]'::json
      ) AS items
    FROM stock_transfers st
    INNER JOIN locations lf ON lf.id = st."fromLocationId" AND lf."businessId" = st."businessId"
    INNER JOIN locations lt ON lt.id = st."toLocationId" AND lt."businessId" = st."businessId"
    WHERE st.id = ${input.transferId}
      AND st."businessId" = ${input.businessId}
    LIMIT 1
  `)
  return rows[0] ?? null
}

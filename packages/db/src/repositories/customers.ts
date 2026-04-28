import { Prisma } from '@prisma/client'
import { prisma } from '../client'
import { randomUUID } from 'node:crypto'

export type RiskTag = 'RELIABLE' | 'WATCH' | 'BLOCKED'

export interface CustomerRow {
  id: string
  name: string
  phone: string
  altPhone: string | null
  address: string | null
  siteAddress: string | null
  gstin: string | null
  creditLimit: number
  riskTag: RiskTag
  notes: string | null
  isActive: boolean
  remindersEnabled: boolean
  createdAt: Date
  updatedAt: Date
  businessId: string
}

export interface CustomerListRow extends CustomerRow {
  orderCount: number
  balance: number
}

export interface ReminderRow {
  id: string
  customerId: string
  channel: 'WHATSAPP' | 'SMS'
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  messageBody: string
  scheduledAt: Date
  sentAt: Date | null
  createdAt: Date
}

export interface MaterialLiteRow {
  id: string
  name: string
  unit: string
  stockQty: number
  minThreshold: number
  maxThreshold: number | null
  purchasePrice: number
  salePrice: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  businessId: string
}

export interface OrderItemWithMaterialRow {
  id: string
  orderId: string
  materialId: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  lineTotal: number
  material: MaterialLiteRow | null
}

export interface CustomerOrderWithItemsRow {
  id: string
  orderNumber: string
  customerId: string
  createdById: string
  orderDate: Date
  deliveryDate: Date | null
  status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
  totalAmount: number
  marginPct: number | null
  notes: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
  businessId: string
  items: OrderItemWithMaterialRow[]
}

interface ListCustomersInput {
  businessId: string
  search?: string
  riskTag?: RiskTag
}

interface CreateCustomerInput {
  businessId: string
  name: string
  phone: string
  altPhone?: string
  address?: string
  siteAddress?: string
  gstin?: string
  creditLimit: number
  notes?: string
}

interface UpdateCustomerInput {
  name?: string
  phone?: string
  altPhone?: string
  address?: string
  siteAddress?: string
  gstin?: string
  creditLimit?: number
  notes?: string
  riskTag?: RiskTag
  isActive?: boolean
}

function customerSelectSql() {
  return Prisma.sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c."altPhone" AS "altPhone",
      c.address,
      c."siteAddress" AS "siteAddress",
      c.gstin,
      c."creditLimit"::double precision AS "creditLimit",
      c."riskTag"::text AS "riskTag",
      c.notes,
      c."isActive" AS "isActive",
      c."remindersEnabled" AS "remindersEnabled",
      c."createdAt" AS "createdAt",
      c."updatedAt" AS "updatedAt",
      c."businessId" AS "businessId"
    FROM customers c
  `
}

export async function listActiveCustomersWithStats(input: ListCustomersInput) {
  const filters: Prisma.Sql[] = [Prisma.sql`c."businessId" = ${input.businessId}`, Prisma.sql`c."isActive" = true`]
  if (input.riskTag) filters.push(Prisma.sql`c."riskTag" = ${input.riskTag}::"RiskTag"`)
  if (input.search) filters.push(Prisma.sql`c.name ILIKE ${`%${input.search}%`}`)

  return prisma.$queryRaw<CustomerListRow[]>(Prisma.sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c."altPhone" AS "altPhone",
      c.address,
      c."siteAddress" AS "siteAddress",
      c.gstin,
      c."creditLimit"::double precision AS "creditLimit",
      c."riskTag"::text AS "riskTag",
      c.notes,
      c."isActive" AS "isActive",
      c."remindersEnabled" AS "remindersEnabled",
      c."createdAt" AS "createdAt",
      c."updatedAt" AS "updatedAt",
      c."businessId" AS "businessId",
      COALESCE(o.order_count, 0)::int AS "orderCount",
      (COALESCE(l.debit, 0) - COALESCE(l.credit, 0))::double precision AS balance
    FROM customers c
    LEFT JOIN (
      SELECT
        "customerId",
        COUNT(*) FILTER (WHERE "isDeleted" = false) AS order_count
      FROM orders
      WHERE "businessId" = ${input.businessId}
      GROUP BY "customerId"
    ) o ON o."customerId" = c.id
    LEFT JOIN (
      SELECT
        "customerId",
        SUM(CASE WHEN type = 'DEBIT'::"LedgerEntryType" THEN amount ELSE 0 END)::double precision AS debit,
        SUM(CASE WHEN type = 'CREDIT'::"LedgerEntryType" THEN amount ELSE 0 END)::double precision AS credit
      FROM ledger_entries
      WHERE "businessId" = ${input.businessId}
      GROUP BY "customerId"
    ) l ON l."customerId" = c.id
    WHERE ${Prisma.join(filters, ' AND ')}
    ORDER BY c.name ASC
  `)
}

export async function getCustomerById(customerId: string, businessId: string) {
  const rows = await prisma.$queryRaw<CustomerRow[]>(Prisma.sql`
    ${customerSelectSql()}
    WHERE c.id = ${customerId} AND c."businessId" = ${businessId}
    LIMIT 1
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function getRecentOrdersWithItems(customerId: string, limit: number) {
  return prisma.$queryRaw<CustomerOrderWithItemsRow[]>(Prisma.sql`
    SELECT
      o.id,
      o."orderNumber" AS "orderNumber",
      o."customerId" AS "customerId",
      o."createdById" AS "createdById",
      o."orderDate" AS "orderDate",
      o."deliveryDate" AS "deliveryDate",
      o.status::text AS status,
      o."paymentMode"::text AS "paymentMode",
      o."amountPaid"::double precision AS "amountPaid",
      o."totalAmount"::double precision AS "totalAmount",
      o."marginPct"::double precision AS "marginPct",
      o.notes,
      o."isDeleted" AS "isDeleted",
      o."createdAt" AS "createdAt",
      o."updatedAt" AS "updatedAt",
      o."businessId" AS "businessId",
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'orderId', oi."orderId",
            'materialId', oi."materialId",
            'quantity', (oi.quantity::double precision),
            'unitPrice', (oi."unitPrice"::double precision),
            'purchasePrice', (oi."purchasePrice"::double precision),
            'lineTotal', (oi."lineTotal"::double precision),
            'material', CASE WHEN m.id IS NULL THEN NULL ELSE json_build_object(
              'id', m.id,
              'name', m.name,
              'unit', m.unit,
              'stockQty', (m."stockQty"::double precision),
              'minThreshold', (m."minThreshold"::double precision),
              'maxThreshold', (m."maxThreshold"::double precision),
              'purchasePrice', (m."purchasePrice"::double precision),
              'salePrice', (m."salePrice"::double precision),
              'isActive', m."isActive",
              'createdAt', m."createdAt",
              'updatedAt', m."updatedAt",
              'businessId', m."businessId"
            ) END
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi."orderId" = o.id
    LEFT JOIN materials m ON m.id = oi."materialId"
    WHERE o."customerId" = ${customerId} AND o."isDeleted" = false
    GROUP BY o.id
    ORDER BY o."createdAt" DESC
    LIMIT ${limit}
  `)
}

export async function getRecentReminders(customerId: string, limit: number) {
  return prisma.$queryRaw<ReminderRow[]>`
    SELECT
      id,
      "customerId" AS "customerId",
      channel::text AS channel,
      status::text AS status,
      "messageBody" AS "messageBody",
      "scheduledAt" AS "scheduledAt",
      "sentAt" AS "sentAt",
      "createdAt" AS "createdAt"
    FROM reminders
    WHERE "customerId" = ${customerId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `
}

export async function getCustomerOrderCount(customerId: string) {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM orders
    WHERE "customerId" = ${customerId} AND "isDeleted" = false
  `
  return rows[0]?.count ?? 0
}

export async function getCustomerLifetimeBusiness(customerId: string) {
  const rows = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT COALESCE(SUM("totalAmount"), 0)::double precision AS total
    FROM orders
    WHERE "customerId" = ${customerId}
      AND "isDeleted" = false
      AND status <> 'CANCELLED'::"OrderStatus"
  `
  return rows[0]?.total ?? 0
}

export async function getCustomerLedgerTotals(customerId: string) {
  const rows = await prisma.$queryRaw<Array<{ debit: number; credit: number }>>`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'DEBIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)::double precision AS debit,
      COALESCE(SUM(CASE WHEN type = 'CREDIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)::double precision AS credit
    FROM ledger_entries
    WHERE "customerId" = ${customerId}
  `
  return rows[0] ?? { debit: 0, credit: 0 }
}

export async function findCustomerByPhoneInBusiness(phone: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM customers
    WHERE phone = ${phone} AND "businessId" = ${businessId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function createCustomer(input: CreateCustomerInput) {
  const customerId = randomUUID()
  const rows = await prisma.$queryRaw<CustomerRow[]>(Prisma.sql`
    INSERT INTO customers (
      id,
      name,
      phone,
      "altPhone",
      address,
      "siteAddress",
      gstin,
      "creditLimit",
      notes,
      "businessId",
      "riskTag",
      "isActive",
      "remindersEnabled",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${customerId},
      ${input.name},
      ${input.phone},
      ${input.altPhone ?? null},
      ${input.address ?? null},
      ${input.siteAddress ?? null},
      ${input.gstin ?? null},
      ${input.creditLimit},
      ${input.notes ?? null},
      ${input.businessId},
      'RELIABLE'::"RiskTag",
      true,
      true,
      NOW(),
      NOW()
    )
    RETURNING
      id,
      name,
      phone,
      "altPhone" AS "altPhone",
      address,
      "siteAddress" AS "siteAddress",
      gstin,
      "creditLimit"::double precision AS "creditLimit",
      "riskTag"::text AS "riskTag",
      notes,
      "isActive" AS "isActive",
      "remindersEnabled" AS "remindersEnabled",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt",
      "businessId" AS "businessId"
  `)
  return rows[0]
}

export async function updateCustomer(customerId: string, businessId: string, input: UpdateCustomerInput) {
  const updates: Prisma.Sql[] = []
  if (input.name !== undefined) updates.push(Prisma.sql`name = ${input.name}`)
  if (input.phone !== undefined) updates.push(Prisma.sql`phone = ${input.phone}`)
  if (input.altPhone !== undefined) updates.push(Prisma.sql`"altPhone" = ${input.altPhone}`)
  if (input.address !== undefined) updates.push(Prisma.sql`address = ${input.address}`)
  if (input.siteAddress !== undefined) updates.push(Prisma.sql`"siteAddress" = ${input.siteAddress}`)
  if (input.gstin !== undefined) updates.push(Prisma.sql`gstin = ${input.gstin}`)
  if (input.creditLimit !== undefined) updates.push(Prisma.sql`"creditLimit" = ${input.creditLimit}`)
  if (input.notes !== undefined) updates.push(Prisma.sql`notes = ${input.notes}`)
  if (input.riskTag !== undefined) updates.push(Prisma.sql`"riskTag" = ${input.riskTag}::"RiskTag"`)
  if (input.isActive !== undefined) updates.push(Prisma.sql`"isActive" = ${input.isActive}`)
  if (updates.length === 0) return getCustomerById(customerId, businessId)
  updates.push(Prisma.sql`"updatedAt" = NOW()`)

  const rows = await prisma.$queryRaw<CustomerRow[]>(Prisma.sql`
    UPDATE customers
    SET ${Prisma.join(updates, ', ')}
    WHERE id = ${customerId} AND "businessId" = ${businessId}
    RETURNING
      id,
      name,
      phone,
      "altPhone" AS "altPhone",
      address,
      "siteAddress" AS "siteAddress",
      gstin,
      "creditLimit"::double precision AS "creditLimit",
      "riskTag"::text AS "riskTag",
      notes,
      "isActive" AS "isActive",
      "remindersEnabled" AS "remindersEnabled",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt",
      "businessId" AS "businessId"
  `)

  return rows.length > 0 ? rows[0] : null
}

export async function softDeleteCustomer(customerId: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE customers
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE id = ${customerId} AND "businessId" = ${businessId}
    RETURNING id
  `
  return rows.length > 0
}

export async function bulkSoftDeleteCustomers(ids: string[], businessId: string) {
  if (ids.length === 0) return 0
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    WITH updated AS (
      UPDATE customers
      SET "isActive" = false, "updatedAt" = NOW()
      WHERE id IN (${Prisma.join(ids)}) AND "businessId" = ${businessId}
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM updated
  `)
  return rows[0]?.count ?? 0
}

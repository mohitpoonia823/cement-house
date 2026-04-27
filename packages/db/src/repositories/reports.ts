import { prisma } from '../client'

export interface SummaryOrderRow {
  id: string
  orderNumber: string
  totalAmount: number
  amountPaid: number
  marginPct: number
  status: string
  createdAt: Date
  customerName: string
}

export interface DashboardOrderRow {
  id: string
  orderNumber: string
  customerId: string
  totalAmount: number
  amountPaid: number
  status: string
  createdAt: Date
  customerName: string
  riskTag: string
  itemSummary: string
}

export interface AmountRow {
  amount: number
  createdAt: Date
}

export interface MaterialRow {
  id: string
  name: string
  unit: string
  stockQty: number
  minThreshold: number
  purchasePrice: number
  salePrice: number
}

export interface CustomerCountRow {
  id: string
  riskTag: string
  orderCount: number
}

export interface DeliveryRow {
  id: string
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
  createdAt: Date
  customerName: string | null
}

export interface AuditHistoryRow {
  id: string
  metadata: unknown | null
  createdAt: Date
}

export interface OrderSnapshotRow {
  orderNumber: string
  createdAt: Date
  customerName: string
  status: string
  itemCount: number
  totalAmount: number
  amountPaid: number
  dueAmount: number
}

export interface CustomerSnapshotRow {
  id: string
  name: string
  phone: string
  riskTag: string
  address: string | null
  orderCount: number
  creditLimit: number
  outstanding: number
}

export interface InventorySnapshotRow {
  name: string
  unit: string
  stockQty: number
  minThreshold: number
  maxThreshold: number
  purchasePrice: number
  salePrice: number
}

export interface DeliverySnapshotRow {
  challanNumber: string
  createdAt: Date
  customerName: string
  customerAddress: string
  status: string
  driverName: string | null
  vehicleNumber: string | null
}

export interface KhataSnapshotRow {
  name: string
  phone: string
  riskTag: string
  debit: number
  credit: number
  outstanding: number
}

export interface WorkspaceSnapshotRow {
  businessName: string
  city: string
  phone: string | null
  gstin: string | null
  userName: string | null
  role: string | null
  permissions: string
}

export async function getSummaryOrders(params: {
  businessId: string
  start: Date
  end: Date
}) {
  return prisma.$queryRaw<SummaryOrderRow[]>`
    SELECT
      o.id,
      o."orderNumber" AS "orderNumber",
      o."totalAmount"::double precision AS "totalAmount",
      o."amountPaid"::double precision AS "amountPaid",
      COALESCE(o."marginPct", 0)::double precision AS "marginPct",
      o.status,
      o."createdAt" AS "createdAt",
      COALESCE(c.name, 'Unknown customer') AS "customerName"
    FROM orders o
    LEFT JOIN customers c ON c.id = o."customerId"
    WHERE
      o."businessId" = ${params.businessId}
      AND o."isDeleted" = false
      AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${params.start}
      AND o."createdAt" <= ${params.end}
    ORDER BY o."createdAt" DESC
  `
}

export async function getDashboardOrders(params: {
  businessId: string
  start: Date
  end: Date
}) {
  return prisma.$queryRaw<DashboardOrderRow[]>`
    SELECT
      o.id,
      o."orderNumber" AS "orderNumber",
      o."customerId" AS "customerId",
      o."totalAmount"::double precision AS "totalAmount",
      o."amountPaid"::double precision AS "amountPaid",
      o.status,
      o."createdAt" AS "createdAt",
      COALESCE(c.name, 'Unknown customer') AS "customerName",
      COALESCE(c."riskTag"::text, 'WATCH') AS "riskTag",
      COALESCE(
        string_agg(DISTINCT m.name, ', ' ORDER BY m.name) FILTER (WHERE m.name IS NOT NULL),
        ''
      ) AS "itemSummary"
    FROM orders o
    LEFT JOIN customers c ON c.id = o."customerId"
    LEFT JOIN order_items oi ON oi."orderId" = o.id
    LEFT JOIN materials m ON m.id = oi."materialId"
    WHERE
      o."businessId" = ${params.businessId}
      AND o."isDeleted" = false
      AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${params.start}
      AND o."createdAt" <= ${params.end}
    GROUP BY o.id, c.name, c."riskTag"
    ORDER BY o."createdAt" DESC
  `
}

export async function getCreditEntries(params: {
  businessId: string
  start: Date
  end: Date
}) {
  return prisma.$queryRaw<AmountRow[]>`
    SELECT
      amount::double precision AS amount,
      "createdAt" AS "createdAt"
    FROM ledger_entries
    WHERE
      "businessId" = ${params.businessId}
      AND type = 'CREDIT'
      AND "createdAt" >= ${params.start}
      AND "createdAt" <= ${params.end}
  `
}

export async function getActiveMaterials(businessId: string) {
  return prisma.$queryRaw<MaterialRow[]>`
    SELECT
      id,
      name,
      unit,
      "stockQty"::double precision AS "stockQty",
      "minThreshold"::double precision AS "minThreshold",
      "purchasePrice"::double precision AS "purchasePrice",
      "salePrice"::double precision AS "salePrice"
    FROM materials
    WHERE "businessId" = ${businessId} AND "isActive" = true
  `
}

export async function getActiveCustomersWithOrderCount(businessId: string) {
  return prisma.$queryRaw<CustomerCountRow[]>`
    SELECT
      c.id,
      c."riskTag"::text AS "riskTag",
      COUNT(o.id)::int AS "orderCount"
    FROM customers c
    LEFT JOIN orders o
      ON o."customerId" = c.id
      AND o."isDeleted" = false
    WHERE c."businessId" = ${businessId} AND c."isActive" = true
    GROUP BY c.id, c."riskTag"
  `
}

export async function getDeliveriesForBusiness(businessId: string) {
  return prisma.$queryRaw<DeliveryRow[]>`
    SELECT
      d.id,
      d.status::text AS status,
      d."createdAt" AS "createdAt",
      c.name AS "customerName"
    FROM deliveries d
    INNER JOIN orders o ON o.id = d."orderId"
    LEFT JOIN customers c ON c.id = o."customerId"
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false
  `
}

export async function getReportExportHistory(params: {
  businessId: string
  actorId: string
  limit: number
}) {
  return prisma.$queryRaw<AuditHistoryRow[]>`
    SELECT
      id,
      metadata,
      "createdAt" AS "createdAt"
    FROM audit_logs
    WHERE
      "businessId" = ${params.businessId}
      AND "actorId" = ${params.actorId}
      AND action = 'REPORT_EXPORTED'
    ORDER BY "createdAt" DESC
    LIMIT ${params.limit}
  `
}

export async function getOrdersSnapshot(businessId: string) {
  return prisma.$queryRaw<OrderSnapshotRow[]>`
    SELECT
      o."orderNumber" AS "orderNumber",
      o."createdAt" AS "createdAt",
      COALESCE(c.name, '') AS "customerName",
      o.status::text AS status,
      COUNT(oi.id)::int AS "itemCount",
      o."totalAmount"::double precision AS "totalAmount",
      o."amountPaid"::double precision AS "amountPaid",
      (o."totalAmount" - o."amountPaid")::double precision AS "dueAmount"
    FROM orders o
    LEFT JOIN customers c ON c.id = o."customerId"
    LEFT JOIN order_items oi ON oi."orderId" = o.id
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false
    GROUP BY o.id, c.name
    ORDER BY o."createdAt" DESC
  `
}

export async function getCustomersSnapshot(businessId: string) {
  return prisma.$queryRaw<CustomerSnapshotRow[]>`
    SELECT
      c.id,
      c.name,
      c.phone,
      c."riskTag"::text AS "riskTag",
      c.address,
      COALESCE(oc.order_count, 0)::int AS "orderCount",
      c."creditLimit"::double precision AS "creditLimit",
      (COALESCE(la.debit_total, 0) - COALESCE(la.credit_total, 0))::double precision AS outstanding
    FROM customers c
    LEFT JOIN (
      SELECT "customerId", COUNT(*) AS order_count
      FROM orders
      WHERE "isDeleted" = false
      GROUP BY "customerId"
    ) oc ON oc."customerId" = c.id
    LEFT JOIN (
      SELECT
        "customerId",
        SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END)::double precision AS debit_total,
        SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END)::double precision AS credit_total
      FROM ledger_entries
      GROUP BY "customerId"
    ) la ON la."customerId" = c.id
    WHERE c."businessId" = ${businessId} AND c."isActive" = true
    ORDER BY c.name ASC
  `
}

export async function getInventorySnapshot(businessId: string) {
  return prisma.$queryRaw<InventorySnapshotRow[]>`
    SELECT
      name,
      unit,
      "stockQty"::double precision AS "stockQty",
      "minThreshold"::double precision AS "minThreshold",
      COALESCE("maxThreshold", 0)::double precision AS "maxThreshold",
      "purchasePrice"::double precision AS "purchasePrice",
      "salePrice"::double precision AS "salePrice"
    FROM materials
    WHERE "businessId" = ${businessId} AND "isActive" = true
    ORDER BY name ASC
  `
}

export async function getDeliverySnapshotForRange(params: {
  businessId: string
  start: Date
  end: Date
}) {
  return prisma.$queryRaw<DeliverySnapshotRow[]>`
    SELECT
      d."challanNumber" AS "challanNumber",
      d."createdAt" AS "createdAt",
      COALESCE(c.name, '') AS "customerName",
      COALESCE(c.address, '') AS "customerAddress",
      d.status::text AS status,
      d."driverName" AS "driverName",
      d."vehicleNumber" AS "vehicleNumber"
    FROM deliveries d
    INNER JOIN orders o ON o.id = d."orderId"
    LEFT JOIN customers c ON c.id = o."customerId"
    WHERE
      o."businessId" = ${params.businessId}
      AND o."isDeleted" = false
      AND d."createdAt" >= ${params.start}
      AND d."createdAt" <= ${params.end}
    ORDER BY d."createdAt" ASC
  `
}

export async function getKhataSnapshot(businessId: string) {
  return prisma.$queryRaw<KhataSnapshotRow[]>`
    SELECT
      c.name,
      c.phone,
      c."riskTag"::text AS "riskTag",
      COALESCE(la.debit_total, 0)::double precision AS debit,
      COALESCE(la.credit_total, 0)::double precision AS credit,
      (COALESCE(la.debit_total, 0) - COALESCE(la.credit_total, 0))::double precision AS outstanding
    FROM customers c
    LEFT JOIN (
      SELECT
        "customerId",
        SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END)::double precision AS debit_total,
        SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END)::double precision AS credit_total
      FROM ledger_entries
      GROUP BY "customerId"
    ) la ON la."customerId" = c.id
    WHERE c."businessId" = ${businessId} AND c."isActive" = true
    ORDER BY c.name ASC
  `
}

export async function getWorkspaceSnapshotRows(businessId: string) {
  return prisma.$queryRaw<WorkspaceSnapshotRow[]>`
    SELECT
      b.name AS "businessName",
      b.city,
      b.phone,
      b.gstin,
      u.name AS "userName",
      u.role::text AS role,
      COALESCE(array_to_string(u.permissions, ' | '), '') AS permissions
    FROM businesses b
    LEFT JOIN users u
      ON u."businessId" = b.id
      AND u."isActive" = true
    WHERE b.id = ${businessId}
    ORDER BY u."createdAt" ASC
  `
}

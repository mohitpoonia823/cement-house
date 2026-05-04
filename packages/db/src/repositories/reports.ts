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
export interface WindowedDashboardOrderRow extends DashboardOrderRow {
  windowKey: 'TODAY' | 'RANGE' | 'PREVIOUS'
}
export interface WindowedAmountRow extends AmountRow {
  windowKey: 'TODAY' | 'RANGE' | 'PREVIOUS'
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

export interface GstSummaryRow {
  taxableAmount: number
  gstTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  invoiceCount: number
}

export interface HsnSummaryRow {
  hsnCode: string
  taxableAmount: number
  gstAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  qty: number
}

export interface PaymentCollectionSummaryRow {
  paymentMode: string
  totalPaid: number
  invoiceCount: number
}

export interface ProfitLossSummaryRow {
  salesRevenue: number
  purchaseCost: number
  grossProfit: number
  grossMarginPct: number
}

export interface SalesReturnSummaryRow {
  returnCount: number
  totalReturnAmount: number
  gstReversalAmount: number
  ledgerAdjustmentAmount: number
}

export interface TopProductRow {
  materialId: string
  materialName: string
  quantitySold: number
  salesAmount: number
}

export interface TopCustomerRow {
  customerId: string
  customerName: string
  orderCount: number
  salesAmount: number
  paidAmount: number
  dueAmount: number
}

export interface ExpiryItemRow {
  id: string
  name: string
  batchNumber: string | null
  expiryDate: Date | null
  stockQty: number
}

export interface SerialItemRow {
  id: string
  name: string
  serialNumber: string | null
  imeiNumber: string | null
  stockQty: number
}

export interface BatchItemRow {
  id: string
  name: string
  batchNumber: string | null
  manufactureDate: Date | null
  expiryDate: Date | null
  stockQty: number
}

export interface TransportReportRow {
  orderId: string
  orderNumber: string
  createdAt: Date
  transportCharges: number
  loadingCharges: number
  grandTotal: number
}

export interface SalesInvoiceRow {
  date: Date
  invoiceNumber: string
  customerName: string
  amount: number
  paid: number
  due: number
  taxableAmount: number
  gstTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
}

export interface TenantReportFilter {
  businessId: string
  start: Date
  end: Date
  customerId?: string
  materialId?: string
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID'
  orderStatus?: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
  locationId?: string | null
}

export async function getReportFilterOptions(businessId: string) {
  const [customers, materials] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name
      FROM customers
      WHERE "businessId" = ${businessId} AND "isActive" = true
      ORDER BY name ASC
      LIMIT 1000
    `,
    prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name
      FROM materials
      WHERE "businessId" = ${businessId} AND "isActive" = true
      ORDER BY name ASC
      LIMIT 1000
    `,
  ])
  return { customers, materials }
}

export async function getSalesInvoicesByFilter(filter: TenantReportFilter) {
  return prisma.$queryRaw<SalesInvoiceRow[]>`
    SELECT
      o."createdAt" AS date,
      COALESCE(o."invoiceNumber", o."orderNumber") AS "invoiceNumber",
      COALESCE(c.name, 'Unknown') AS "customerName",
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS amount,
      COALESCE(o."paidAmount", o."amountPaid")::double precision AS paid,
      COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid")))::double precision AS due,
      COALESCE(o."taxableAmount", o."totalAmount")::double precision AS "taxableAmount",
      COALESCE(o."gstTotal", 0)::double precision AS "gstTotal",
      COALESCE(o."cgstTotal", 0)::double precision AS "cgstTotal",
      COALESCE(o."sgstTotal", 0)::double precision AS "sgstTotal",
      COALESCE(o."igstTotal", 0)::double precision AS "igstTotal"
    FROM orders o
    LEFT JOIN customers c ON c.id = o."customerId"
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
      AND (
        ${filter.paymentStatus ?? null}::text IS NULL
        OR (
          ${filter.paymentStatus ?? null}::text = 'PAID'
          AND COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid"))) <= 0
        )
        OR (
          ${filter.paymentStatus ?? null}::text = 'PARTIAL'
          AND COALESCE(o."paidAmount", o."amountPaid") > 0
          AND COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid"))) > 0
        )
        OR (
          ${filter.paymentStatus ?? null}::text = 'UNPAID'
          AND COALESCE(o."paidAmount", o."amountPaid") <= 0
        )
      )
      AND (${filter.locationId ?? null}::text IS NULL OR o."sourceLocationId" = ${filter.locationId ?? null})
    ORDER BY o."createdAt" DESC
    LIMIT 5000
  `
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
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS "totalAmount",
      COALESCE(o."paidAmount", o."amountPaid")::double precision AS "amountPaid",
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
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS "totalAmount",
      COALESCE(o."paidAmount", o."amountPaid")::double precision AS "amountPaid",
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

export async function getWindowedDashboardOrders(params: {
  businessId: string
  todayStart: Date
  todayEnd: Date
  rangeStart: Date
  rangeEnd: Date
  previousStart: Date
  previousEnd: Date
}) {
  return prisma.$queryRaw<WindowedDashboardOrderRow[]>`
    WITH windows(window_key, start_at, end_at) AS (
      VALUES
        ('TODAY'::text, ${params.todayStart}::timestamptz, ${params.todayEnd}::timestamptz),
        ('RANGE'::text, ${params.rangeStart}::timestamptz, ${params.rangeEnd}::timestamptz),
        ('PREVIOUS'::text, ${params.previousStart}::timestamptz, ${params.previousEnd}::timestamptz)
    )
    SELECT
      w.window_key AS "windowKey",
      o.id,
      o."orderNumber" AS "orderNumber",
      o."customerId" AS "customerId",
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS "totalAmount",
      COALESCE(o."paidAmount", o."amountPaid")::double precision AS "amountPaid",
      o.status,
      o."createdAt" AS "createdAt",
      COALESCE(c.name, 'Unknown customer') AS "customerName",
      COALESCE(c."riskTag"::text, 'WATCH') AS "riskTag",
      COALESCE(
        string_agg(DISTINCT m.name, ', ' ORDER BY m.name) FILTER (WHERE m.name IS NOT NULL),
        ''
      ) AS "itemSummary"
    FROM windows w
    JOIN orders o
      ON o."createdAt" >= w.start_at
      AND o."createdAt" <= w.end_at
      AND o."businessId" = ${params.businessId}
      AND o."isDeleted" = false
      AND o.status <> 'CANCELLED'
    LEFT JOIN customers c ON c.id = o."customerId"
    LEFT JOIN order_items oi ON oi."orderId" = o.id
    LEFT JOIN materials m ON m.id = oi."materialId"
    GROUP BY w.window_key, o.id, c.name, c."riskTag"
    ORDER BY o."createdAt" DESC
  `
}

export async function getWindowedCreditEntries(params: {
  businessId: string
  todayStart: Date
  todayEnd: Date
  rangeStart: Date
  rangeEnd: Date
  previousStart: Date
  previousEnd: Date
}) {
  return prisma.$queryRaw<WindowedAmountRow[]>`
    WITH windows(window_key, start_at, end_at) AS (
      VALUES
        ('TODAY'::text, ${params.todayStart}::timestamptz, ${params.todayEnd}::timestamptz),
        ('RANGE'::text, ${params.rangeStart}::timestamptz, ${params.rangeEnd}::timestamptz),
        ('PREVIOUS'::text, ${params.previousStart}::timestamptz, ${params.previousEnd}::timestamptz)
    )
    SELECT
      w.window_key AS "windowKey",
      le.amount::double precision AS amount,
      le."createdAt" AS "createdAt"
    FROM windows w
    JOIN ledger_entries le
      ON le."createdAt" >= w.start_at
      AND le."createdAt" <= w.end_at
      AND le."businessId" = ${params.businessId}
      AND le.type = 'CREDIT'
    ORDER BY le."createdAt" DESC
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
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS "totalAmount",
      COALESCE(o."paidAmount", o."amountPaid")::double precision AS "amountPaid",
      COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid")))::double precision AS "dueAmount"
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
      WHERE "isDeleted" = false AND "businessId" = ${businessId}
      GROUP BY "customerId"
    ) oc ON oc."customerId" = c.id
    LEFT JOIN (
      SELECT
        "customerId",
        SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END)::double precision AS debit_total,
        SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END)::double precision AS credit_total
      FROM ledger_entries
      WHERE "businessId" = ${businessId}
      GROUP BY "customerId"
    ) la ON la."customerId" = c.id
    WHERE c."businessId" = ${businessId} AND c."isActive" = true
    ORDER BY c.name ASC
  `
}

export async function getInventorySnapshot(businessId: string, locationId?: string | null) {
  if (!locationId) {
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
  return prisma.$queryRaw<InventorySnapshotRow[]>`
    SELECT
      m.name,
      m.unit,
      COALESCE(ms.quantity, 0)::double precision AS "stockQty",
      m."minThreshold"::double precision AS "minThreshold",
      COALESCE(m."maxThreshold", 0)::double precision AS "maxThreshold",
      m."purchasePrice"::double precision AS "purchasePrice",
      m."salePrice"::double precision AS "salePrice"
    FROM materials m
    LEFT JOIN material_stock ms
      ON ms."materialId" = m.id
     AND ms."businessId" = m."businessId"
     AND ms."locationId" = ${locationId}
    WHERE m."businessId" = ${businessId}
      AND m."isActive" = true
    ORDER BY m.name ASC
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
      WHERE "businessId" = ${businessId}
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

export async function getGstSummaryForRange(params: {
  businessId: string
  start: Date
  end: Date
}) {
  const rows = await prisma.$queryRaw<GstSummaryRow[]>`
    SELECT
      COALESCE(SUM(COALESCE(o."taxableAmount", o."totalAmount")), 0)::double precision AS "taxableAmount",
      COALESCE(SUM(COALESCE(o."gstTotal", 0)), 0)::double precision AS "gstTotal",
      COALESCE(SUM(COALESCE(o."cgstTotal", 0)), 0)::double precision AS "cgstTotal",
      COALESCE(SUM(COALESCE(o."sgstTotal", 0)), 0)::double precision AS "sgstTotal",
      COALESCE(SUM(COALESCE(o."igstTotal", 0)), 0)::double precision AS "igstTotal",
      COUNT(*)::int AS "invoiceCount"
    FROM orders o
    WHERE o."businessId" = ${params.businessId}
      AND o."isDeleted" = false
      AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${params.start}
      AND o."createdAt" <= ${params.end}
  `
  return rows[0] ?? {
    taxableAmount: 0,
    gstTotal: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 0,
    invoiceCount: 0,
  }
}

export async function getSalesSummaryByFilter(filter: TenantReportFilter) {
  return prisma.$queryRaw<Array<{
    invoiceCount: number
    grandTotal: number
    paidAmount: number
    dueAmount: number
    taxableAmount: number
    gstTotal: number
    cgstTotal: number
    sgstTotal: number
    igstTotal: number
  }>>`
    SELECT
      COUNT(*)::int AS "invoiceCount",
      COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0)::double precision AS "grandTotal",
      COALESCE(SUM(COALESCE(o."paidAmount", o."amountPaid")), 0)::double precision AS "paidAmount",
      COALESCE(SUM(COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid")))), 0)::double precision AS "dueAmount",
      COALESCE(SUM(COALESCE(o."taxableAmount", o."totalAmount")), 0)::double precision AS "taxableAmount",
      COALESCE(SUM(COALESCE(o."gstTotal", 0)), 0)::double precision AS "gstTotal",
      COALESCE(SUM(COALESCE(o."cgstTotal", 0)), 0)::double precision AS "cgstTotal",
      COALESCE(SUM(COALESCE(o."sgstTotal", 0)), 0)::double precision AS "sgstTotal",
      COALESCE(SUM(COALESCE(o."igstTotal", 0)), 0)::double precision AS "igstTotal"
    FROM orders o
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
      AND (
        ${filter.paymentStatus ?? null}::text IS NULL
        OR (
          ${filter.paymentStatus ?? null}::text = 'PAID'
          AND COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid"))) <= 0
        )
        OR (
          ${filter.paymentStatus ?? null}::text = 'PARTIAL'
          AND COALESCE(o."paidAmount", o."amountPaid") > 0
          AND COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid"))) > 0
        )
        OR (
          ${filter.paymentStatus ?? null}::text = 'UNPAID'
          AND COALESCE(o."paidAmount", o."amountPaid") <= 0
        )
      )
  `
}

export async function getHsnSummaryByFilter(filter: TenantReportFilter) {
  return prisma.$queryRaw<HsnSummaryRow[]>`
    SELECT
      COALESCE(NULLIF(oi."hsnCode", ''), 'UNSPECIFIED') AS "hsnCode",
      COALESCE(SUM(COALESCE(oi."taxableAmount", oi."lineTotal")), 0)::double precision AS "taxableAmount",
      COALESCE(SUM(COALESCE(oi."gstAmount", 0)), 0)::double precision AS "gstAmount",
      COALESCE(SUM(COALESCE(oi."cgstAmount", 0)), 0)::double precision AS "cgstAmount",
      COALESCE(SUM(COALESCE(oi."sgstAmount", 0)), 0)::double precision AS "sgstAmount",
      COALESCE(SUM(COALESCE(oi."igstAmount", 0)), 0)::double precision AS "igstAmount",
      COALESCE(SUM(oi.quantity), 0)::double precision AS qty
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.materialId ?? null}::text IS NULL OR oi."materialId" = ${filter.materialId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
    GROUP BY COALESCE(NULLIF(oi."hsnCode", ''), 'UNSPECIFIED')
    ORDER BY "taxableAmount" DESC
  `
}

export async function getPaymentCollectionsByFilter(filter: TenantReportFilter) {
  return prisma.$queryRaw<PaymentCollectionSummaryRow[]>`
    SELECT
      COALESCE(o."paymentMode"::text, 'UNKNOWN') AS "paymentMode",
      COALESCE(SUM(COALESCE(o."paidAmount", o."amountPaid")), 0)::double precision AS "totalPaid",
      COUNT(*)::int AS "invoiceCount"
    FROM orders o
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
    GROUP BY COALESCE(o."paymentMode"::text, 'UNKNOWN')
    ORDER BY "totalPaid" DESC
  `
}

export async function getProfitLossByFilter(filter: TenantReportFilter) {
  const rows = await prisma.$queryRaw<ProfitLossSummaryRow[]>`
    SELECT
      COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0)::double precision AS "salesRevenue",
      COALESCE(SUM(COALESCE(oi."purchasePrice", 0) * oi.quantity), 0)::double precision AS "purchaseCost",
      (
        COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0)
        - COALESCE(SUM(COALESCE(oi."purchasePrice", 0) * oi.quantity), 0)
      )::double precision AS "grossProfit",
      CASE
        WHEN COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0) <= 0 THEN 0
        ELSE (
          (
            COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0)
            - COALESCE(SUM(COALESCE(oi."purchasePrice", 0) * oi.quantity), 0)
          ) / COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0) * 100
        )
      END::double precision AS "grossMarginPct"
    FROM orders o
    LEFT JOIN order_items oi ON oi."orderId" = o.id
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
  `
  return rows[0] ?? { salesRevenue: 0, purchaseCost: 0, grossProfit: 0, grossMarginPct: 0 }
}

export async function getSalesReturnsByFilter(filter: TenantReportFilter) {
  const rows = await prisma.$queryRaw<SalesReturnSummaryRow[]>`
    SELECT
      COUNT(*)::int AS "returnCount",
      COALESCE(SUM(sr."totalReturnAmount"), 0)::double precision AS "totalReturnAmount",
      COALESCE(SUM(sr."gstReversalAmount"), 0)::double precision AS "gstReversalAmount",
      COALESCE(SUM(sr."ledgerAdjustmentAmount"), 0)::double precision AS "ledgerAdjustmentAmount"
    FROM sales_returns sr
    WHERE
      sr."businessId" = ${filter.businessId}
      AND sr."createdAt" >= ${filter.start}
      AND sr."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR sr."customerId" = ${filter.customerId ?? null})
  `
  return rows[0] ?? { returnCount: 0, totalReturnAmount: 0, gstReversalAmount: 0, ledgerAdjustmentAmount: 0 }
}

export async function getTopSellingProductsByFilter(filter: TenantReportFilter, limit = 10) {
  return prisma.$queryRaw<TopProductRow[]>`
    SELECT
      oi."materialId" AS "materialId",
      COALESCE(m.name, 'Unknown') AS "materialName",
      COALESCE(SUM(oi.quantity), 0)::double precision AS "quantitySold",
      COALESCE(SUM(COALESCE(oi."lineTotal", (oi.quantity * oi."unitPrice"))), 0)::double precision AS "salesAmount"
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    LEFT JOIN materials m ON m.id = oi."materialId"
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.materialId ?? null}::text IS NULL OR oi."materialId" = ${filter.materialId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
    GROUP BY oi."materialId", m.name
    ORDER BY "salesAmount" DESC
    LIMIT ${limit}
  `
}

export async function getTopCustomersByFilter(filter: TenantReportFilter, limit = 10) {
  return prisma.$queryRaw<TopCustomerRow[]>`
    SELECT
      o."customerId" AS "customerId",
      COALESCE(c.name, 'Unknown') AS "customerName",
      COUNT(*)::int AS "orderCount",
      COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0)::double precision AS "salesAmount",
      COALESCE(SUM(COALESCE(o."paidAmount", o."amountPaid")), 0)::double precision AS "paidAmount",
      COALESCE(SUM(COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid")))), 0)::double precision AS "dueAmount"
    FROM orders o
    LEFT JOIN customers c ON c.id = o."customerId"
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
    GROUP BY o."customerId", c.name
    ORDER BY "salesAmount" DESC
    LIMIT ${limit}
  `
}

export async function getExpiryItemsReport(businessId: string, days = 60) {
  const to = new Date()
  const from = new Date()
  to.setDate(to.getDate() + days)
  return prisma.$queryRaw<ExpiryItemRow[]>`
    SELECT
      id, name, "batchNumber", "expiryDate", "stockQty"::double precision AS "stockQty"
    FROM materials
    WHERE
      "businessId" = ${businessId}
      AND "isActive" = true
      AND "expiryDate" IS NOT NULL
      AND "expiryDate" >= ${from}
      AND "expiryDate" <= ${to}
    ORDER BY "expiryDate" ASC
    LIMIT 500
  `
}

export async function getBatchReport(businessId: string) {
  return prisma.$queryRaw<BatchItemRow[]>`
    SELECT
      id, name, "batchNumber", "manufactureDate", "expiryDate",
      "stockQty"::double precision AS "stockQty"
    FROM materials
    WHERE
      "businessId" = ${businessId}
      AND "isActive" = true
      AND "batchNumber" IS NOT NULL
    ORDER BY name ASC
    LIMIT 1000
  `
}

export async function getSerialTrackingReport(businessId: string) {
  return prisma.$queryRaw<SerialItemRow[]>`
    SELECT
      id, name, "serialNumber", "imeiNumber",
      "stockQty"::double precision AS "stockQty"
    FROM materials
    WHERE
      "businessId" = ${businessId}
      AND "isActive" = true
      AND ("serialNumber" IS NOT NULL OR "imeiNumber" IS NOT NULL)
    ORDER BY name ASC
    LIMIT 1000
  `
}

export async function getTransportReportByFilter(filter: TenantReportFilter) {
  return prisma.$queryRaw<TransportReportRow[]>`
    SELECT
      o.id AS "orderId",
      o."orderNumber" AS "orderNumber",
      o."createdAt" AS "createdAt",
      COALESCE(o."transportCharges", 0)::double precision AS "transportCharges",
      COALESCE(o."loadingCharges", 0)::double precision AS "loadingCharges",
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS "grandTotal"
    FROM orders o
    WHERE
      o."businessId" = ${filter.businessId}
      AND o."isDeleted" = false
      AND o."createdAt" >= ${filter.start}
      AND o."createdAt" <= ${filter.end}
      AND (${filter.customerId ?? null}::text IS NULL OR o."customerId" = ${filter.customerId ?? null})
      AND (${filter.orderStatus ?? null}::text IS NULL OR o.status::text = ${filter.orderStatus ?? null})
    ORDER BY o."createdAt" DESC
    LIMIT 1000
  `
}

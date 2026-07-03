/**
 * Accounting repository — double-entry bookkeeping (Tally-style).
 *
 * Every financial event is posted as a balanced JournalEntry (voucher) whose
 * JournalLines always satisfy  SUM(debit) = SUM(credit).  Party balances are
 * derived from those lines, never stored, so the ledger can never drift.
 *
 * Supplier (Sundry Creditor) balance convention:  payable = SUM(credit) - SUM(debit).
 *   - Purchase bill   → Cr Supplier            (increases what we owe)
 *   - Payment made    → Dr Supplier            (reduces what we owe)
 *   - Opening balance → Cr Supplier / Dr Capital
 */
import { Prisma } from '@prisma/client'
import type { AccountType, VoucherType } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'
import { adjustMaterialLocationStock, getDefaultLocation } from './multi-location'

type Tx = Prisma.TransactionClient

// ── System accounts (created lazily, one set per business) ───────────────────
const SYSTEM_ACCOUNTS: Array<{ name: string; type: AccountType; group: string }> = [
  { name: 'Purchase Account', type: 'EXPENSE', group: 'Purchase Accounts' },
  { name: 'Input CGST', type: 'ASSET', group: 'Duties & Taxes' },
  { name: 'Input SGST', type: 'ASSET', group: 'Duties & Taxes' },
  { name: 'Input IGST', type: 'ASSET', group: 'Duties & Taxes' },
  { name: 'Cash', type: 'ASSET', group: 'Cash-in-hand' },
  { name: 'Bank', type: 'ASSET', group: 'Bank Accounts' },
  { name: 'Round Off', type: 'EXPENSE', group: 'Indirect Expenses' },
  { name: 'Opening Balance Adjustment', type: 'EQUITY', group: 'Capital Account' },
  // Sales side (output / income)
  { name: 'Sales Account', type: 'INCOME', group: 'Sales Accounts' },
  { name: 'Output CGST', type: 'LIABILITY', group: 'Duties & Taxes' },
  { name: 'Output SGST', type: 'LIABILITY', group: 'Duties & Taxes' },
  { name: 'Output IGST', type: 'LIABILITY', group: 'Duties & Taxes' },
  { name: 'Other Charges Income', type: 'INCOME', group: 'Indirect Incomes' },
  { name: 'Discount Allowed', type: 'EXPENSE', group: 'Indirect Expenses' },
]

const VOUCHER_PREFIX: Record<VoucherType, string> = {
  OPENING: 'OB',
  PURCHASE: 'PB',
  PAYMENT: 'PAY',
  RECEIPT: 'RCPT',
  SALE: 'SV',
  CONTRA: 'CTR',
  JOURNAL: 'JV',
  EXPENSE: 'EXP',
}

const n = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0)
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

// Accounting transactions do several round-trips (ensure accounts, post voucher,
// stock-in). Prisma's default interactive-transaction timeout is 5s, which is too
// tight against a remote DB — especially the first write per business, which also
// seeds the chart of accounts. Give them generous headroom.
const TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 } as const

// ─────────────────────────────────────────────────────────────────────────────
// Chart of accounts
// ─────────────────────────────────────────────────────────────────────────────

/** Ensure the system accounts exist for a business; returns a name→account map.
 *  Batched (findMany + createMany) to keep the order/purchase hot path fast. */
export async function ensureSystemAccounts(businessId: string, client: Tx | typeof prisma = prisma) {
  const names = SYSTEM_ACCOUNTS.map((a) => a.name)
  const existing = await client.ledgerAccount.findMany({
    where: { businessId, name: { in: names } },
    select: { id: true, name: true },
  })
  const have = new Set(existing.map((a) => a.name))
  const missing = SYSTEM_ACCOUNTS.filter((a) => !have.has(a.name))
  if (missing.length > 0) {
    await client.ledgerAccount.createMany({
      data: missing.map((a) => ({ businessId, name: a.name, type: a.type, group: a.group, isSystem: true })),
      skipDuplicates: true,
    })
  }
  const all = missing.length > 0
    ? await client.ledgerAccount.findMany({
        where: { businessId, name: { in: names } },
        select: { id: true, name: true },
      })
    : existing
  return new Map(all.map((a) => [a.name, { id: a.id, name: a.name }]))
}

/** Find-or-create a customer's party ledger (Sundry Debtors). */
async function ensureCustomerAccount(
  businessId: string,
  customerId: string,
  customerName: string,
  client: Tx | typeof prisma,
) {
  const existing = await client.ledgerAccount.findFirst({ where: { businessId, customerId }, select: { id: true } })
  if (existing) return existing
  return client.ledgerAccount.create({
    data: {
      businessId,
      customerId,
      name: `${customerName} (Customer)`,
      type: 'ASSET',
      group: 'Sundry Debtors',
      openingIsDebit: true,
    },
    select: { id: true },
  })
}

async function requireSystemAccount(businessId: string, name: string, client: Tx | typeof prisma) {
  const map = await ensureSystemAccounts(businessId, client)
  const acc = map.get(name)
  if (!acc) throw new Error(`System account "${name}" missing`)
  return acc
}

// Default expense heads seeded on first use so the picker is never empty.
const DEFAULT_EXPENSE_ACCOUNTS = [
  'Rent',
  'Salaries & Wages',
  'Electricity',
  'Transport & Freight',
  'Office Expenses',
  'Miscellaneous Expenses',
]

/** Find-or-create an EXPENSE ledger head by name. Throws if the name is a non-expense account. */
async function ensureExpenseAccount(businessId: string, name: string, client: Tx | typeof prisma) {
  const trimmed = name.trim()
  const existing = await client.ledgerAccount.findFirst({
    where: { businessId, name: trimmed },
    select: { id: true, type: true },
  })
  if (existing) {
    if (existing.type !== 'EXPENSE') throw new Error('ACCOUNT_NAME_TAKEN')
    return { id: existing.id }
  }
  const created = await client.ledgerAccount.create({
    data: { businessId, name: trimmed, type: 'EXPENSE', group: 'Indirect Expenses' },
    select: { id: true },
  })
  return created
}

/** All expense heads for the picker; seeds the defaults on first call. */
export async function listExpenseAccounts(businessId: string) {
  const existing = await prisma.ledgerAccount.findMany({
    where: { businessId, type: 'EXPENSE' },
    select: { id: true, name: true, group: true },
  })
  const have = new Set(existing.map((a) => a.name))
  const missing = DEFAULT_EXPENSE_ACCOUNTS.filter((name) => !have.has(name))
  if (missing.length > 0) {
    await prisma.ledgerAccount.createMany({
      data: missing.map((name) => ({ businessId, name, type: 'EXPENSE' as AccountType, group: 'Indirect Expenses' })),
      skipDuplicates: true,
    })
  }
  return prisma.ledgerAccount.findMany({
    where: { businessId, type: 'EXPENSE' },
    select: { id: true, name: true, group: true },
    orderBy: { name: 'asc' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales & customer receipts — posted alongside the legacy customer khata so the
// double-entry ledger, Day Book and Trial Balance stay complete. Both helpers
// take the caller's transaction (tx) so they commit atomically with the order /
// payment they belong to. Always balanced (a Round Off leg absorbs any residual).
// ─────────────────────────────────────────────────────────────────────────────

interface SaleVoucherInput {
  businessId: string
  createdById: string
  customerId: string
  customerName: string
  orderId: string
  orderNumber: string
  date: Date
  taxableAmount: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  otherCharges: number     // transport + loading
  invoiceDiscount: number
  grandTotal: number
}

/** Post a sale invoice → Dr Customer, Cr Sales/Output GST/Other income (Round Off balances). */
export async function postSaleVoucher(tx: Tx, input: SaleVoucherInput) {
  const sys = await ensureSystemAccounts(input.businessId, tx)
  const customer = await ensureCustomerAccount(input.businessId, input.customerId, input.customerName, tx)
  const acc = (name: string) => {
    const a = sys.get(name)
    if (!a) throw new Error(`System account "${name}" missing`)
    return a.id
  }

  const lines: Array<{ accountId: string; debit?: number; credit?: number }> = [
    { accountId: customer.id, debit: round2(input.grandTotal) },
  ]
  if (input.invoiceDiscount > 0) lines.push({ accountId: acc('Discount Allowed'), debit: round2(input.invoiceDiscount) })
  if (input.taxableAmount !== 0) lines.push({ accountId: acc('Sales Account'), credit: round2(input.taxableAmount) })
  if (input.cgstTotal > 0) lines.push({ accountId: acc('Output CGST'), credit: round2(input.cgstTotal) })
  if (input.sgstTotal > 0) lines.push({ accountId: acc('Output SGST'), credit: round2(input.sgstTotal) })
  if (input.igstTotal > 0) lines.push({ accountId: acc('Output IGST'), credit: round2(input.igstTotal) })
  if (input.otherCharges > 0) lines.push({ accountId: acc('Other Charges Income'), credit: round2(input.otherCharges) })

  // Balance defensively with a Round Off leg (covers rounding + invoice discount math).
  const debit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0))
  const credit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0))
  const diff = round2(debit - credit)
  if (diff > 0) lines.push({ accountId: acc('Round Off'), credit: diff })
  else if (diff < 0) lines.push({ accountId: acc('Round Off'), debit: -diff })

  return postVoucher(tx, {
    businessId: input.businessId,
    voucherType: 'SALE',
    date: input.date,
    createdById: input.createdById,
    narration: `Sale to ${input.customerName}`,
    reference: input.orderNumber,
    customerId: input.customerId,
    orderId: input.orderId,
    lines,
  })
}

interface CustomerReceiptInput {
  businessId: string
  createdById: string
  customerId: string
  customerName: string
  amount: number
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  date: Date
  reference?: string | null
  narration?: string | null
  orderId?: string | null
  ledgerEntryId?: string | null   // legacy khata entry id → idempotency for backfill
}

/** Post a customer receipt → Dr Cash/Bank, Cr Customer. */
export async function postCustomerReceiptVoucher(tx: Tx, input: CustomerReceiptInput) {
  const amount = round2(input.amount)
  if (amount <= 0) return null
  const sys = await ensureSystemAccounts(input.businessId, tx)
  const customer = await ensureCustomerAccount(input.businessId, input.customerId, input.customerName, tx)
  const intoName = input.paymentMode === 'CASH' ? 'Cash' : 'Bank'
  const into = sys.get(intoName)
  if (!into) throw new Error(`System account "${intoName}" missing`)

  return postVoucher(tx, {
    businessId: input.businessId,
    voucherType: 'RECEIPT',
    date: input.date,
    createdById: input.createdById,
    narration: input.narration ?? `Receipt from ${input.customerName}`,
    reference: input.ledgerEntryId ?? input.reference ?? null,
    customerId: input.customerId,
    orderId: input.orderId ?? null,
    lines: [
      { accountId: into.id, debit: amount },
      { accountId: customer.id, credit: amount },
    ],
  })
}

/** Next voucher number for a type, e.g. PB-2026-0001. Called inside a transaction. */
async function nextVoucherNumber(tx: Tx, businessId: string, type: VoucherType, date: Date) {
  const count = await tx.journalEntry.count({ where: { businessId, voucherType: type } })
  const year = date.getFullYear()
  const seq = String(count + 1).padStart(4, '0')
  return `${VOUCHER_PREFIX[type]}-${year}-${seq}`
}

/** Post a balanced voucher. Throws if debits ≠ credits. */
async function postVoucher(
  tx: Tx,
  input: {
    businessId: string
    voucherType: VoucherType
    date: Date
    createdById: string
    narration?: string | null
    reference?: string | null
    supplierId?: string | null
    purchaseId?: string | null
    customerId?: string | null
    orderId?: string | null
    lines: Array<{ accountId: string; debit?: number; credit?: number }>
  },
) {
  const debitTotal = round2(input.lines.reduce((s, l) => s + (l.debit ?? 0), 0))
  const creditTotal = round2(input.lines.reduce((s, l) => s + (l.credit ?? 0), 0))
  if (debitTotal !== creditTotal) {
    throw new Error(`Unbalanced voucher: debit ${debitTotal} ≠ credit ${creditTotal}`)
  }
  const voucherNumber = await nextVoucherNumber(tx, input.businessId, input.voucherType, input.date)
  return tx.journalEntry.create({
    data: {
      businessId: input.businessId,
      voucherType: input.voucherType,
      voucherNumber,
      date: input.date,
      narration: input.narration ?? null,
      reference: input.reference ?? null,
      supplierId: input.supplierId ?? null,
      purchaseId: input.purchaseId ?? null,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      createdById: input.createdById,
      lines: {
        create: input.lines
          .filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0)
          .map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
      },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppliers
// ─────────────────────────────────────────────────────────────────────────────

interface CreateSupplierInput {
  businessId: string
  createdById: string
  name: string
  phone?: string
  altPhone?: string
  address?: string
  gstin?: string
  stateCode?: string
  openingBalance?: number
  notes?: string
}

export async function createSupplier(input: CreateSupplierInput) {
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        phone: input.phone ?? null,
        altPhone: input.altPhone ?? null,
        address: input.address ?? null,
        gstin: input.gstin ?? null,
        stateCode: input.stateCode ?? null,
        openingBalance: input.openingBalance ?? 0,
        notes: input.notes ?? null,
      },
    })

    // Every supplier gets its own party ledger under "Sundry Creditors".
    const account = await tx.ledgerAccount.create({
      data: {
        businessId: input.businessId,
        name: `${input.name} (Supplier)`,
        type: 'LIABILITY',
        group: 'Sundry Creditors',
        supplierId: supplier.id,
        openingBalance: input.openingBalance ?? 0,
        openingIsDebit: false,
      },
    })

    // Opening payable → Cr Supplier, Dr Opening Balance Adjustment.
    const opening = input.openingBalance ?? 0
    if (opening > 0) {
      const capital = await requireSystemAccount(input.businessId, 'Opening Balance Adjustment', tx)
      await postVoucher(tx, {
        businessId: input.businessId,
        voucherType: 'OPENING',
        date: new Date(),
        createdById: input.createdById,
        narration: 'Opening balance',
        supplierId: supplier.id,
        lines: [
          { accountId: capital.id, debit: opening },
          { accountId: account.id, credit: opening },
        ],
      })
    }

    return supplier
  }, TX_OPTIONS)
}

interface UpdateSupplierInput {
  name?: string
  phone?: string
  altPhone?: string
  address?: string
  gstin?: string
  stateCode?: string
  notes?: string
  isActive?: boolean
}

export async function updateSupplier(supplierId: string, businessId: string, input: UpdateSupplierInput) {
  const result = await prisma.supplier.updateMany({
    where: { id: supplierId, businessId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.altPhone !== undefined ? { altPhone: input.altPhone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
      ...(input.stateCode !== undefined ? { stateCode: input.stateCode } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  })
  if (result.count === 0) return null
  return getSupplierById(supplierId, businessId)
}

export async function softDeleteSupplier(supplierId: string, businessId: string) {
  const result = await prisma.supplier.updateMany({
    where: { id: supplierId, businessId },
    data: { isActive: false },
  })
  return result.count > 0
}

export async function getSupplierById(supplierId: string, businessId: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, businessId } })
  if (!supplier) return null
  return {
    ...supplier,
    openingBalance: n(supplier.openingBalance),
  }
}

export async function findSupplierByPhone(phone: string, businessId: string) {
  return prisma.supplier.findFirst({ where: { phone, businessId }, select: { id: true } })
}

/** All suppliers with their live payable balance (SUM credit − SUM debit). */
export async function listSuppliersWithBalance(input: {
  businessId: string
  search?: string
  activeOnly?: boolean
}) {
  const suppliers = await prisma.supplier.findMany({
    where: {
      businessId: input.businessId,
      ...(input.activeOnly === false ? {} : { isActive: true }),
      ...(input.search ? { name: { contains: input.search, mode: 'insensitive' } } : {}),
    },
    include: { account: { select: { id: true } } },
    orderBy: { name: 'asc' },
  })

  const accountIds = suppliers.map((s) => s.account?.id).filter((id): id is string => Boolean(id))
  const sums = accountIds.length
    ? await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: accountIds } },
        _sum: { debit: true, credit: true },
      })
    : []
  const balanceByAccount = new Map(
    sums.map((row) => [row.accountId, round2(n(row._sum.credit) - n(row._sum.debit))]),
  )

  return suppliers.map((s) => ({
    id: s.id,
    supplierId: s.id,
    supplierName: s.name,
    name: s.name,
    phone: s.phone,
    gstin: s.gstin,
    isActive: s.isActive,
    accountId: s.account?.id ?? null,
    balance: s.account ? (balanceByAccount.get(s.account.id) ?? 0) : n(s.openingBalance),
  }))
}

/** Full supplier statement: every voucher line touching the supplier's account. */
export async function getSupplierLedger(supplierId: string, businessId: string) {
  const account = await prisma.ledgerAccount.findFirst({
    where: { supplierId, businessId },
    select: { id: true },
  })
  if (!account) return { entries: [], currentBalance: 0 }

  const lines = await prisma.journalLine.findMany({
    where: { accountId: account.id },
    include: {
      entry: {
        select: { id: true, voucherType: true, voucherNumber: true, date: true, narration: true, reference: true },
      },
    },
  })

  // Chronological, tie-break by voucher number for stable ordering.
  lines.sort((a, b) => {
    const t = a.entry.date.getTime() - b.entry.date.getTime()
    if (t !== 0) return t
    return a.entry.voucherNumber.localeCompare(b.entry.voucherNumber)
  })

  let balance = 0
  const entries = lines.map((line) => {
    const debit = n(line.debit)
    const credit = n(line.credit)
    balance = round2(balance + credit - debit)
    return {
      id: line.id,
      entryId: line.entry.id,
      voucherType: line.entry.voucherType,
      voucherNumber: line.entry.voucherNumber,
      date: line.entry.date,
      createdAt: line.entry.date,
      narration: line.entry.narration,
      reference: line.entry.reference,
      // For a creditor, a credit raises what we owe (a "bill"), a debit is a payment.
      billAmount: credit,
      paidAmount: debit,
      runningBalance: balance,
    }
  })

  return { entries, currentBalance: balance }
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchases (supplier bills) — posts Dr Purchases/Input GST, Cr Supplier
// ─────────────────────────────────────────────────────────────────────────────

interface PurchaseItemInput {
  materialId?: string | null
  description?: string | null
  quantity: number
  unitCost: number
  hsnCode?: string | null
  gstRate?: number | null
  discountAmount?: number | null
}

interface CreatePurchaseInput {
  businessId: string
  createdById: string
  supplierId: string
  supplierInvoiceNumber?: string
  invoiceDate?: Date
  isInterState?: boolean
  roundOff?: number
  notes?: string
  locationId?: string | null
  items: PurchaseItemInput[]
}

export async function createPurchase(input: CreatePurchaseInput) {
  const date = input.invoiceDate ?? new Date()
  const isInterState = Boolean(input.isInterState)

  // Compute line + header totals from items — single source of truth.
  const computedItems = input.items.map((item) => {
    const gross = round2(item.quantity * item.unitCost)
    const discount = round2(item.discountAmount ?? 0)
    const taxable = round2(gross - discount)
    const gstAmount = round2((taxable * (item.gstRate ?? 0)) / 100)
    return {
      materialId: item.materialId ?? null,
      description: item.description ?? null,
      quantity: item.quantity,
      unitCost: item.unitCost,
      hsnCode: item.hsnCode ?? null,
      gstRate: item.gstRate ?? null,
      discountAmount: discount,
      taxableAmount: taxable,
      gstAmount,
      lineTotal: round2(taxable + gstAmount),
    }
  })

  const subtotal = round2(computedItems.reduce((s, i) => s + i.quantity * i.unitCost, 0))
  const discountTotal = round2(computedItems.reduce((s, i) => s + i.discountAmount, 0))
  const taxableAmount = round2(computedItems.reduce((s, i) => s + i.taxableAmount, 0))
  const gstTotal = round2(computedItems.reduce((s, i) => s + i.gstAmount, 0))
  const cgstTotal = isInterState ? 0 : round2(gstTotal / 2)
  const sgstTotal = isInterState ? 0 : round2(gstTotal - cgstTotal)
  const igstTotal = isInterState ? gstTotal : 0
  const roundOff = round2(input.roundOff ?? 0)
  const grandTotal = round2(taxableAmount + gstTotal + roundOff)

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, businessId: input.businessId },
      include: { account: { select: { id: true } } },
    })
    if (!supplier) throw new Error('SUPPLIER_NOT_FOUND')
    if (!supplier.account) throw new Error('SUPPLIER_ACCOUNT_MISSING')

    const count = await tx.purchase.count({ where: { businessId: input.businessId } })
    const purchaseNumber = `PB-${date.getFullYear()}-${String(count + 1).padStart(4, '0')}`

    const purchase = await tx.purchase.create({
      data: {
        businessId: input.businessId,
        supplierId: input.supplierId,
        createdById: input.createdById,
        purchaseNumber,
        supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
        invoiceDate: date,
        subtotal,
        discountTotal,
        taxableAmount,
        cgstTotal,
        sgstTotal,
        igstTotal,
        gstTotal,
        roundOff,
        grandTotal,
        paidAmount: 0,
        notes: input.notes ?? null,
        items: { create: computedItems },
      },
    })

    const purchaseAcc = await requireSystemAccount(input.businessId, 'Purchase Account', tx)
    const inputCgst = await requireSystemAccount(input.businessId, 'Input CGST', tx)
    const inputSgst = await requireSystemAccount(input.businessId, 'Input SGST', tx)
    const inputIgst = await requireSystemAccount(input.businessId, 'Input IGST', tx)
    const roundOffAcc = await requireSystemAccount(input.businessId, 'Round Off', tx)

    const lines: Array<{ accountId: string; debit?: number; credit?: number }> = [
      { accountId: purchaseAcc.id, debit: taxableAmount },
    ]
    if (cgstTotal) lines.push({ accountId: inputCgst.id, debit: cgstTotal })
    if (sgstTotal) lines.push({ accountId: inputSgst.id, debit: sgstTotal })
    if (igstTotal) lines.push({ accountId: inputIgst.id, debit: igstTotal })
    if (roundOff > 0) lines.push({ accountId: roundOffAcc.id, debit: roundOff })
    if (roundOff < 0) lines.push({ accountId: roundOffAcc.id, credit: -roundOff })
    lines.push({ accountId: supplier.account.id, credit: grandTotal })

    await postVoucher(tx, {
      businessId: input.businessId,
      voucherType: 'PURCHASE',
      date,
      createdById: input.createdById,
      narration: `Purchase from ${supplier.name}`,
      reference: input.supplierInvoiceNumber ?? null,
      supplierId: input.supplierId,
      purchaseId: purchase.id,
      lines,
    })

    // Stock-in: raise inventory for any line linked to a material. Falls back to
    // the default location; if the business has no location configured we skip
    // the stock update (the financial voucher above is still posted).
    const targetLocationId = input.locationId ?? (await getDefaultLocation(input.businessId))
    if (targetLocationId) {
      for (const item of computedItems) {
        if (!item.materialId || item.quantity <= 0) continue
        await adjustMaterialLocationStock(tx, {
          businessId: input.businessId,
          materialId: item.materialId,
          locationId: targetLocationId,
          deltaQty: item.quantity,
          allowNegativeStock: true,
        })
        const mat = await tx.material.findFirst({
          where: { id: item.materialId, businessId: input.businessId },
          select: { stockQty: true },
        })
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO stock_movements (
            id, "materialId", "orderId", type, quantity, "stockAfter", reason, "recordedById", "createdAt", "businessId"
          ) VALUES (
            ${randomUUID()}, ${item.materialId}, NULL, 'IN'::"StockMovementType",
            ${item.quantity}, ${n(mat?.stockQty)}, ${`Purchase ${purchase.purchaseNumber}`},
            ${input.createdById}, NOW(), ${input.businessId}
          )
        `)
        // Keep the material's cost price current with the latest purchase.
        await tx.$executeRaw(Prisma.sql`
          UPDATE materials SET "purchasePrice" = ${item.unitCost}, "updatedAt" = NOW()
          WHERE id = ${item.materialId} AND "businessId" = ${input.businessId}
        `)
      }
    }

    return purchase
  }, TX_OPTIONS)
}

// ─────────────────────────────────────────────────────────────────────────────
// Supplier payments — posts Dr Supplier, Cr Cash/Bank
// ─────────────────────────────────────────────────────────────────────────────

interface RecordSupplierPaymentInput {
  businessId: string
  createdById: string
  supplierId: string
  amount: number
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'BANK'
  reference?: string
  notes?: string
}

export async function recordSupplierPayment(input: RecordSupplierPaymentInput) {
  const amount = round2(input.amount)
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, businessId: input.businessId },
      include: { account: { select: { id: true } } },
    })
    if (!supplier) throw new Error('SUPPLIER_NOT_FOUND')
    if (!supplier.account) throw new Error('SUPPLIER_ACCOUNT_MISSING')

    // Cash goes to the Cash account; everything else settles through Bank.
    const paidFrom = await requireSystemAccount(
      input.businessId,
      input.paymentMode === 'CASH' ? 'Cash' : 'Bank',
      tx,
    )

    const entry = await postVoucher(tx, {
      businessId: input.businessId,
      voucherType: 'PAYMENT',
      date: new Date(),
      createdById: input.createdById,
      narration: input.notes ?? `Payment to ${supplier.name}`,
      reference: input.reference ?? null,
      supplierId: input.supplierId,
      lines: [
        { accountId: supplier.account.id, debit: amount },
        { accountId: paidFrom.id, credit: amount },
      ],
    })

    // Allocate against oldest unpaid bills (FIFO) for per-bill paid tracking.
    let remaining = amount
    const openBills = await tx.purchase.findMany({
      where: { businessId: input.businessId, supplierId: input.supplierId, status: 'CONFIRMED' },
      orderBy: { invoiceDate: 'asc' },
    })
    for (const bill of openBills) {
      if (remaining <= 0) break
      const due = round2(n(bill.grandTotal) - n(bill.paidAmount))
      if (due <= 0) continue
      const apply = Math.min(due, remaining)
      await tx.purchase.update({
        where: { id: bill.id },
        data: { paidAmount: round2(n(bill.paidAmount) + apply) },
      })
      remaining = round2(remaining - apply)
    }

    return entry
  }, TX_OPTIONS)
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchases list (for the supplier detail / bills view)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Expenses & Contra vouchers
// ─────────────────────────────────────────────────────────────────────────────

interface RecordExpenseInput {
  businessId: string
  createdById: string
  accountName: string           // expense head, e.g. "Rent" (created if new)
  amount: number
  paidVia: 'CASH' | 'BANK'
  date?: Date
  reference?: string
  narration?: string
}

/** Record an expense → Dr <Expense head>, Cr Cash/Bank. */
export async function recordExpense(input: RecordExpenseInput) {
  const amount = round2(input.amount)
  const date = input.date ?? new Date()
  return prisma.$transaction(async (tx) => {
    const expenseAcc = await ensureExpenseAccount(input.businessId, input.accountName, tx)
    const paidFrom = await requireSystemAccount(input.businessId, input.paidVia === 'CASH' ? 'Cash' : 'Bank', tx)
    return postVoucher(tx, {
      businessId: input.businessId,
      voucherType: 'EXPENSE',
      date,
      createdById: input.createdById,
      narration: input.narration ?? input.accountName.trim(),
      reference: input.reference ?? null,
      lines: [
        { accountId: expenseAcc.id, debit: amount },
        { accountId: paidFrom.id, credit: amount },
      ],
    })
  }, TX_OPTIONS)
}

interface RecordContraInput {
  businessId: string
  createdById: string
  direction: 'CASH_TO_BANK' | 'BANK_TO_CASH'
  amount: number
  date?: Date
  reference?: string
  narration?: string
}

/** Move money between cash and bank → Dr <to>, Cr <from>. */
export async function recordContra(input: RecordContraInput) {
  const amount = round2(input.amount)
  const date = input.date ?? new Date()
  return prisma.$transaction(async (tx) => {
    const cash = await requireSystemAccount(input.businessId, 'Cash', tx)
    const bank = await requireSystemAccount(input.businessId, 'Bank', tx)
    const toCash = input.direction === 'BANK_TO_CASH'
    return postVoucher(tx, {
      businessId: input.businessId,
      voucherType: 'CONTRA',
      date,
      createdById: input.createdById,
      narration: input.narration ?? (toCash ? 'Bank to cash' : 'Cash to bank'),
      reference: input.reference ?? null,
      lines: toCash
        ? [{ accountId: cash.id, debit: amount }, { accountId: bank.id, credit: amount }]
        : [{ accountId: bank.id, debit: amount }, { accountId: cash.id, credit: amount }],
    })
  }, TX_OPTIONS)
}

/** Live Cash and Bank balances (asset: debit − credit). */
export async function getCashBankBalances(businessId: string) {
  const accounts = await prisma.ledgerAccount.findMany({
    where: { businessId, name: { in: ['Cash', 'Bank'] } },
    select: { id: true, name: true },
  })
  const byName = new Map(accounts.map((a) => [a.name, a.id]))
  const ids = accounts.map((a) => a.id)
  const sums = ids.length
    ? await prisma.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: ids } }, _sum: { debit: true, credit: true } })
    : []
  const balByAccount = new Map(sums.map((r) => [r.accountId, round2(n(r._sum.debit) - n(r._sum.credit))]))
  const cashId = byName.get('Cash')
  const bankId = byName.get('Bank')
  return {
    cash: cashId ? (balByAccount.get(cashId) ?? 0) : 0,
    bank: bankId ? (balByAccount.get(bankId) ?? 0) : 0,
  }
}

/** Recent vouchers of the given types (for the Cash & Expenses page). */
export async function listVouchers(input: { businessId: string; types?: VoucherType[]; limit?: number }) {
  const entries = await prisma.journalEntry.findMany({
    where: {
      businessId: input.businessId,
      ...(input.types && input.types.length ? { voucherType: { in: input.types } } : {}),
    },
    include: { lines: { include: { account: { select: { name: true, group: true } } } } },
    orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
    take: input.limit ?? 100,
  })
  return entries.map((e) => {
    const lines = e.lines.map((l) => ({ accountName: l.account.name, debit: n(l.debit), credit: n(l.credit) }))
    return {
      id: e.id,
      voucherType: e.voucherType,
      voucherNumber: e.voucherNumber,
      date: e.date,
      narration: e.narration,
      reference: e.reference,
      amount: round2(lines.reduce((s, l) => s + l.debit, 0)),
      lines,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports — Day Book (chronological vouchers) and Trial Balance
// ─────────────────────────────────────────────────────────────────────────────

/** Day Book — vouchers in the date range, newest first, paginated. */
export async function getDayBook(input: {
  businessId: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number
}) {
  const dateFilter: Prisma.DateTimeFilter = {}
  if (input.startDate) dateFilter.gte = input.startDate
  if (input.endDate) dateFilter.lte = input.endDate
  const where: Prisma.JournalEntryWhereInput = {
    businessId: input.businessId,
    ...(input.startDate || input.endDate ? { date: dateFilter } : {}),
  }
  const limit = Math.min(input.limit ?? 25, 100)
  const offset = input.offset ?? 0

  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: { select: { name: true, group: true } } } } },
      orderBy: [{ date: 'desc' }, { voucherNumber: 'desc' }],
      skip: offset,
      take: limit,
    }),
    prisma.journalEntry.count({ where }),
  ])

  const items = entries.map((e) => {
    const lines = e.lines.map((l) => ({
      accountId: l.accountId,
      accountName: l.account.name,
      group: l.account.group,
      debit: n(l.debit),
      credit: n(l.credit),
    }))
    return {
      id: e.id,
      voucherType: e.voucherType,
      voucherNumber: e.voucherNumber,
      date: e.date,
      narration: e.narration,
      reference: e.reference,
      amount: round2(lines.reduce((s, l) => s + l.debit, 0)),
      lines,
    }
  })
  return { items, total, offset, limit, hasMore: offset + items.length < total }
}

/** Account ledger (drill-down) — every line touching one account, with a
 *  running balance on the account's normal side (Dr for assets/expenses). */
export async function getAccountLedger(input: {
  businessId: string; accountId: string; startDate?: Date; endDate?: Date
}) {
  const account = await prisma.ledgerAccount.findFirst({
    where: { id: input.accountId, businessId: input.businessId },
    select: { id: true, name: true, group: true, type: true },
  })
  if (!account) return null

  const dateFilter: Prisma.DateTimeFilter = {}
  if (input.startDate) dateFilter.gte = input.startDate
  if (input.endDate) dateFilter.lte = input.endDate

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: input.accountId,
      ...(input.startDate || input.endDate ? { entry: { date: dateFilter } } : {}),
    },
    include: {
      entry: { select: { voucherType: true, voucherNumber: true, date: true, narration: true, reference: true } },
    },
  })
  lines.sort((a, b) => {
    const t = a.entry.date.getTime() - b.entry.date.getTime()
    return t !== 0 ? t : a.entry.voucherNumber.localeCompare(b.entry.voucherNumber)
  })

  const debitNormal = account.type === 'ASSET' || account.type === 'EXPENSE'
  let balance = 0
  let totalDebit = 0
  let totalCredit = 0
  const entries = lines.map((l) => {
    const debit = n(l.debit)
    const credit = n(l.credit)
    totalDebit += debit
    totalCredit += credit
    balance = round2(balance + (debitNormal ? debit - credit : credit - debit))
    return {
      id: l.id,
      voucherType: l.entry.voucherType,
      voucherNumber: l.entry.voucherNumber,
      date: l.entry.date,
      narration: l.entry.narration,
      reference: l.entry.reference,
      debit,
      credit,
      balance,
    }
  })

  return {
    account: { ...account, debitNormal },
    entries,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    closingBalance: round2(balance),
  }
}

/**
 * Trial Balance — closing debit/credit per account as of a date.
 * Because every voucher is balanced, total debit always equals total credit.
 */
export async function getTrialBalance(input: { businessId: string; asOf?: Date }) {
  const accounts = await prisma.ledgerAccount.findMany({
    where: { businessId: input.businessId },
    select: { id: true, name: true, group: true, type: true },
  })
  if (accounts.length === 0) {
    return { rows: [], totalDebit: 0, totalCredit: 0, balanced: true }
  }

  const sums = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      ...(input.asOf ? { entry: { date: { lte: input.asOf } } } : {}),
    },
    _sum: { debit: true, credit: true },
  })
  const sumByAccount = new Map(sums.map((r) => [r.accountId, { debit: n(r._sum.debit), credit: n(r._sum.credit) }]))

  const rows = accounts
    .map((acc) => {
      const s = sumByAccount.get(acc.id) ?? { debit: 0, credit: 0 }
      const net = round2(s.debit - s.credit)
      return {
        accountId: acc.id,
        name: acc.name,
        group: acc.group,
        type: acc.type,
        debit: net > 0 ? net : 0,
        credit: net < 0 ? -net : 0,
      }
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0)
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))

  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0))
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0))
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit }
}

export async function listPurchasesBySupplier(supplierId: string, businessId: string, limit = 50) {
  const rows = await prisma.purchase.findMany({
    where: { supplierId, businessId },
    orderBy: { invoiceDate: 'desc' },
    take: limit,
  })
  return rows.map((p) => ({
    id: p.id,
    purchaseNumber: p.purchaseNumber,
    supplierInvoiceNumber: p.supplierInvoiceNumber,
    invoiceDate: p.invoiceDate,
    taxableAmount: n(p.taxableAmount),
    gstTotal: n(p.gstTotal),
    grandTotal: n(p.grandTotal),
    paidAmount: n(p.paidAmount),
    dueAmount: round2(n(p.grandTotal) - n(p.paidAmount)),
    status: p.status,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial statements — Profit & Loss, Balance Sheet, Payables Aging
//
// The business runs perpetual inventory (each sale snapshots purchasePrice as
// COGS), so P&L = Net sales (ex-GST) − COGS − Operating expenses. Purchases are
// inventory, NOT a P&L expense — operating expenses come only from EXPENSE
// vouchers, so purchases are never double-counted. GST is excluded from revenue
// (it is a pass-through liability), unlike the legacy reports P&L.
// ─────────────────────────────────────────────────────────────────────────────

interface PeriodInput {
  businessId: string
  start: Date
  end: Date
}

export async function getProfitAndLoss(input: PeriodInput) {
  const salesRows = await prisma.$queryRaw<Array<{
    netSales: number; gst: number; grand: number; otherCharges: number; invoiceCount: number
  }>>(Prisma.sql`
    SELECT
      COALESCE(SUM(COALESCE(o."taxableAmount", o."totalAmount")), 0)::double precision AS "netSales",
      COALESCE(SUM(COALESCE(o."gstTotal", 0)), 0)::double precision AS gst,
      COALESCE(SUM(COALESCE(o."grandTotal", o."totalAmount")), 0)::double precision AS grand,
      COALESCE(SUM(COALESCE(o."transportCharges", 0) + COALESCE(o."loadingCharges", 0)), 0)::double precision AS "otherCharges",
      COUNT(*)::int AS "invoiceCount"
    FROM orders o
    WHERE o."businessId" = ${input.businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${input.start} AND o."createdAt" <= ${input.end}
  `)
  const sales = salesRows[0] ?? { netSales: 0, gst: 0, grand: 0, otherCharges: 0, invoiceCount: 0 }

  // COGS in a separate query so multi-item orders don't fan out the sales total.
  const cogsRows = await prisma.$queryRaw<Array<{ cogs: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(COALESCE(oi."purchasePrice", 0) * oi.quantity), 0)::double precision AS cogs
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    WHERE o."businessId" = ${input.businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${input.start} AND o."createdAt" <= ${input.end}
  `)
  const cogs = round2(cogsRows[0]?.cogs ?? 0)

  // Sales returns reduce revenue (net of GST reversal).
  const returnsRows = await prisma.$queryRaw<Array<{ returns: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(sr."totalReturnAmount" - sr."gstReversalAmount"), 0)::double precision AS returns
    FROM sales_returns sr
    WHERE sr."businessId" = ${input.businessId} AND sr.status = 'COMPLETED'
      AND sr."returnDate" >= ${input.start} AND sr."returnDate" <= ${input.end}
  `)
  const salesReturns = round2(returnsRows[0]?.returns ?? 0)

  // Operating expenses grouped by head — EXPENSE vouchers only (never purchases).
  const expenseSums = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      debit: { gt: 0 },
      entry: { businessId: input.businessId, voucherType: 'EXPENSE', date: { gte: input.start, lte: input.end } },
    },
    _sum: { debit: true },
  })
  const expenseAccounts = expenseSums.length
    ? await prisma.ledgerAccount.findMany({
        where: { id: { in: expenseSums.map((e) => e.accountId) } },
        select: { id: true, name: true },
      })
    : []
  const nameById = new Map(expenseAccounts.map((a) => [a.id, a.name]))
  const expenses = expenseSums
    .map((e) => ({ name: nameById.get(e.accountId) ?? 'Expense', amount: round2(n(e._sum.debit)) }))
    .sort((a, b) => b.amount - a.amount)
  const totalExpenses = round2(expenses.reduce((s, e) => s + e.amount, 0))

  const netSales = round2(sales.netSales - salesReturns)
  const grossProfit = round2(netSales - cogs)
  const otherCharges = round2(sales.otherCharges)
  const netProfit = round2(grossProfit + otherCharges - totalExpenses)

  return {
    netSales,
    salesReturns,
    cogs,
    grossProfit,
    grossMarginPct: netSales > 0 ? round2((grossProfit / netSales) * 100) : 0,
    otherCharges,
    expenses,
    totalExpenses,
    netProfit,
    netMarginPct: netSales > 0 ? round2((netProfit / netSales) * 100) : 0,
    invoiceCount: sales.invoiceCount,
    gstCollected: round2(sales.gst),
  }
}

export async function getBalanceSheet(input: { businessId: string; asOf: Date }) {
  const { businessId, asOf } = input

  const cashBankRows = await prisma.$queryRaw<Array<{ name: string; bal: number }>>(Prisma.sql`
    SELECT la.name, SUM(jl.debit - jl.credit)::double precision AS bal
    FROM ledger_accounts la
    JOIN journal_lines jl ON jl."accountId" = la.id
    JOIN journal_entries je ON je.id = jl."entryId"
    WHERE la."businessId" = ${businessId} AND la.name IN ('Cash', 'Bank') AND je.date <= ${asOf}
    GROUP BY la.name
  `)
  const cash = round2(cashBankRows.find((r) => r.name === 'Cash')?.bal ?? 0)
  const bank = round2(cashBankRows.find((r) => r.name === 'Bank')?.bal ?? 0)

  const invRows = await prisma.$queryRaw<Array<{ value: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(m."stockQty" * m."purchasePrice"), 0)::double precision AS value
    FROM materials m WHERE m."businessId" = ${businessId} AND m."isActive" = true
  `)
  const inventory = round2(invRows[0]?.value ?? 0)

  const recvRows = await prisma.$queryRaw<Array<{ receivable: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(GREATEST(0, bal)), 0)::double precision AS receivable FROM (
      SELECT le."customerId",
        SUM(CASE WHEN le.type = 'DEBIT' THEN le.amount ELSE -le.amount END)::double precision AS bal
      FROM ledger_entries le
      WHERE le."businessId" = ${businessId} AND le."createdAt" <= ${asOf}
      GROUP BY le."customerId"
    ) t
  `)
  const receivables = round2(recvRows[0]?.receivable ?? 0)

  const payRows = await prisma.$queryRaw<Array<{ payable: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(GREATEST(0, bal)), 0)::double precision AS payable FROM (
      SELECT la.id, SUM(jl.credit - jl.debit)::double precision AS bal
      FROM ledger_accounts la
      JOIN journal_lines jl ON jl."accountId" = la.id
      JOIN journal_entries je ON je.id = jl."entryId"
      WHERE la."businessId" = ${businessId} AND la."supplierId" IS NOT NULL AND je.date <= ${asOf}
      GROUP BY la.id
    ) t
  `)
  const payables = round2(payRows[0]?.payable ?? 0)

  const assets = [
    { name: 'Cash in hand', amount: cash },
    { name: 'Bank accounts', amount: bank },
    { name: 'Inventory (at cost)', amount: inventory },
    { name: 'Sundry debtors (receivable)', amount: receivables },
  ]
  const totalAssets = round2(cash + bank + inventory + receivables)
  const liabilities = [{ name: 'Sundry creditors (payable)', amount: payables }]
  const totalLiabilities = round2(payables)
  const netWorth = round2(totalAssets - totalLiabilities)

  return {
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    netWorth,
    equity: [{ name: "Owner's equity / net worth", amount: netWorth }],
  }
}

export async function getPayablesAging(input: { businessId: string; asOf: Date }) {
  const rows = await prisma.$queryRaw<Array<{
    supplierId: string; name: string; current: number; d31: number; d61: number; d90: number; total: number
  }>>(Prisma.sql`
    SELECT
      s.id AS "supplierId", s.name,
      SUM(CASE WHEN x.age_days <= 30 THEN x.due ELSE 0 END)::double precision AS current,
      SUM(CASE WHEN x.age_days > 30 AND x.age_days <= 60 THEN x.due ELSE 0 END)::double precision AS d31,
      SUM(CASE WHEN x.age_days > 60 AND x.age_days <= 90 THEN x.due ELSE 0 END)::double precision AS d61,
      SUM(CASE WHEN x.age_days > 90 THEN x.due ELSE 0 END)::double precision AS d90,
      SUM(x.due)::double precision AS total
    FROM (
      SELECT p."supplierId",
        (p."grandTotal" - p."paidAmount")::double precision AS due,
        EXTRACT(DAY FROM (${input.asOf}::timestamptz - p."invoiceDate"))::int AS age_days
      FROM purchases p
      WHERE p."businessId" = ${input.businessId} AND p.status = 'CONFIRMED'
        AND (p."grandTotal" - p."paidAmount") > 0.005 AND p."invoiceDate" <= ${input.asOf}
    ) x
    JOIN suppliers s ON s.id = x."supplierId"
    GROUP BY s.id, s.name
    HAVING SUM(x.due) > 0
    ORDER BY total DESC
  `)
  const suppliers = rows.map((r) => ({
    supplierId: r.supplierId,
    name: r.name,
    current: round2(r.current),
    days31to60: round2(r.d31),
    days61to90: round2(r.d61),
    days90plus: round2(r.d90),
    total: round2(r.total),
  }))
  const totals = suppliers.reduce(
    (acc, s) => ({
      current: round2(acc.current + s.current),
      days31to60: round2(acc.days31to60 + s.days31to60),
      days61to90: round2(acc.days61to90 + s.days61to90),
      days90plus: round2(acc.days90plus + s.days90plus),
      total: round2(acc.total + s.total),
    }),
    { current: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 },
  )
  return { suppliers, totals }
}

// ─────────────────────────────────────────────────────────────────────────────
// GST returns — GSTR-1 (outward supplies) and GSTR-3B (net tax summary)
// ─────────────────────────────────────────────────────────────────────────────

export async function getGstr1(input: PeriodInput) {
  const { businessId, start, end } = input

  const overallRows = await prisma.$queryRaw<Array<{
    taxable: number; cgst: number; sgst: number; igst: number; gst: number; invoiceCount: number
  }>>(Prisma.sql`
    SELECT
      COALESCE(SUM(COALESCE(o."taxableAmount", o."totalAmount")), 0)::double precision AS taxable,
      COALESCE(SUM(COALESCE(o."cgstTotal", 0)), 0)::double precision AS cgst,
      COALESCE(SUM(COALESCE(o."sgstTotal", 0)), 0)::double precision AS sgst,
      COALESCE(SUM(COALESCE(o."igstTotal", 0)), 0)::double precision AS igst,
      COALESCE(SUM(COALESCE(o."gstTotal", 0)), 0)::double precision AS gst,
      COUNT(*)::int AS "invoiceCount"
    FROM orders o
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
  `)
  const overall = overallRows[0] ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, invoiceCount: 0 }

  const byRate = await prisma.$queryRaw<Array<{
    rate: number; taxable: number; cgst: number; sgst: number; igst: number
  }>>(Prisma.sql`
    SELECT
      COALESCE(oi."gstRate", 0)::double precision AS rate,
      COALESCE(SUM(COALESCE(oi."taxableAmount", oi."lineTotal")), 0)::double precision AS taxable,
      COALESCE(SUM(COALESCE(oi."cgstAmount", 0)), 0)::double precision AS cgst,
      COALESCE(SUM(COALESCE(oi."sgstAmount", 0)), 0)::double precision AS sgst,
      COALESCE(SUM(COALESCE(oi."igstAmount", 0)), 0)::double precision AS igst
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
    GROUP BY COALESCE(oi."gstRate", 0)
    ORDER BY rate
  `)

  const hsn = await prisma.$queryRaw<Array<{
    hsnCode: string; taxable: number; gst: number; qty: number
  }>>(Prisma.sql`
    SELECT
      COALESCE(NULLIF(oi."hsnCode", ''), 'UNSPECIFIED') AS "hsnCode",
      COALESCE(SUM(COALESCE(oi."taxableAmount", oi."lineTotal")), 0)::double precision AS taxable,
      COALESCE(SUM(COALESCE(oi."gstAmount", 0)), 0)::double precision AS gst,
      COALESCE(SUM(oi.quantity), 0)::double precision AS qty
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
    GROUP BY COALESCE(NULLIF(oi."hsnCode", ''), 'UNSPECIFIED')
    ORDER BY taxable DESC
  `)

  const splitRows = await prisma.$queryRaw<Array<{
    b2b: boolean; invoiceCount: number; taxable: number; gst: number
  }>>(Prisma.sql`
    SELECT
      (c.gstin IS NOT NULL AND c.gstin <> '') AS b2b,
      COUNT(*)::int AS "invoiceCount",
      COALESCE(SUM(COALESCE(o."taxableAmount", o."totalAmount")), 0)::double precision AS taxable,
      COALESCE(SUM(COALESCE(o."gstTotal", 0)), 0)::double precision AS gst
    FROM orders o
    INNER JOIN customers c ON c.id = o."customerId"
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
    GROUP BY (c.gstin IS NOT NULL AND c.gstin <> '')
  `)
  const b2b = splitRows.find((r) => r.b2b) ?? { invoiceCount: 0, taxable: 0, gst: 0 }
  const b2c = splitRows.find((r) => !r.b2b) ?? { invoiceCount: 0, taxable: 0, gst: 0 }

  return {
    overall: {
      taxable: round2(overall.taxable),
      cgst: round2(overall.cgst),
      sgst: round2(overall.sgst),
      igst: round2(overall.igst),
      gst: round2(overall.gst),
      invoiceCount: overall.invoiceCount,
    },
    byRate: byRate.map((r) => ({
      rate: r.rate,
      taxable: round2(r.taxable),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      igst: round2(r.igst),
    })),
    hsn: hsn.map((h) => ({ hsnCode: h.hsnCode, taxable: round2(h.taxable), gst: round2(h.gst), qty: round2(h.qty) })),
    b2b: { invoiceCount: b2b.invoiceCount, taxable: round2(b2b.taxable), gst: round2(b2b.gst) },
    b2c: { invoiceCount: b2c.invoiceCount, taxable: round2(b2c.taxable), gst: round2(b2c.gst) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// One-time backfill — import historical sales & customer receipts into the
// double-entry journal so the Day Book / Trial Balance reflect past activity.
// Idempotent: skips anything already posted (by orderId / ledger entry id).
// ─────────────────────────────────────────────────────────────────────────────

export async function backfillSalesAndReceipts(input: { businessId: string; createdById: string; limit?: number }) {
  const { businessId, createdById } = input
  const cap = input.limit ?? 5000

  const orders = await prisma.$queryRaw<Array<{
    id: string; orderNumber: string; customerId: string; customerName: string; orderDate: Date;
    taxable: number; cgst: number; sgst: number; igst: number; otherCharges: number; invoiceDiscount: number; grandTotal: number
  }>>(Prisma.sql`
    SELECT o.id, o."orderNumber", o."customerId", c.name AS "customerName", o."orderDate",
      COALESCE(o."taxableAmount", o."totalAmount")::double precision AS taxable,
      COALESCE(o."cgstTotal", 0)::double precision AS cgst,
      COALESCE(o."sgstTotal", 0)::double precision AS sgst,
      COALESCE(o."igstTotal", 0)::double precision AS igst,
      (COALESCE(o."transportCharges", 0) + COALESCE(o."loadingCharges", 0))::double precision AS "otherCharges",
      COALESCE(o."invoiceDiscount", 0)::double precision AS "invoiceDiscount",
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS "grandTotal"
    FROM orders o
    INNER JOIN customers c ON c.id = o."customerId"
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je."orderId" = o.id AND je."voucherType" = 'SALE')
    ORDER BY o."createdAt" ASC
    LIMIT ${cap}
  `)

  let salesPosted = 0
  for (const o of orders) {
    await prisma.$transaction((tx) =>
      postSaleVoucher(tx, {
        businessId, createdById,
        customerId: o.customerId, customerName: o.customerName,
        orderId: o.id, orderNumber: o.orderNumber, date: new Date(o.orderDate),
        taxableAmount: o.taxable, cgstTotal: o.cgst, sgstTotal: o.sgst, igstTotal: o.igst,
        otherCharges: o.otherCharges, invoiceDiscount: o.invoiceDiscount, grandTotal: o.grandTotal,
      }),
    TX_OPTIONS)
    salesPosted++
  }

  const credits = await prisma.$queryRaw<Array<{
    id: string; customerId: string; customerName: string; amount: number;
    paymentMode: string | null; reference: string | null; orderId: string | null; createdAt: Date; notes: string | null
  }>>(Prisma.sql`
    SELECT le.id, le."customerId", c.name AS "customerName", le.amount::double precision AS amount,
      le."paymentMode"::text AS "paymentMode", le.reference, le."orderId", le."createdAt", le.notes
    FROM ledger_entries le
    INNER JOIN customers c ON c.id = le."customerId"
    WHERE le."businessId" = ${businessId} AND le.type = 'CREDIT'
      AND (le."paymentMode" IS NULL OR le."paymentMode" <> 'CREDIT')
      AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference = le.id::text AND je."voucherType" = 'RECEIPT')
    ORDER BY le."createdAt" ASC
    LIMIT ${cap}
  `)

  let receiptsPosted = 0
  for (const le of credits) {
    await prisma.$transaction((tx) =>
      postCustomerReceiptVoucher(tx, {
        businessId, createdById,
        customerId: le.customerId, customerName: le.customerName,
        amount: le.amount,
        paymentMode: (le.paymentMode as CustomerReceiptInput['paymentMode']) ?? 'CASH',
        date: new Date(le.createdAt), reference: le.reference, orderId: le.orderId,
        ledgerEntryId: le.id, narration: le.notes,
      }),
    TX_OPTIONS)
    receiptsPosted++
  }

  return { salesPosted, receiptsPosted }
}

export async function getGstr3b(input: PeriodInput) {
  const { businessId, start, end } = input

  const outRows = await prisma.$queryRaw<Array<{ cgst: number; sgst: number; igst: number; taxable: number }>>(Prisma.sql`
    SELECT
      COALESCE(SUM(COALESCE(o."cgstTotal", 0)), 0)::double precision AS cgst,
      COALESCE(SUM(COALESCE(o."sgstTotal", 0)), 0)::double precision AS sgst,
      COALESCE(SUM(COALESCE(o."igstTotal", 0)), 0)::double precision AS igst,
      COALESCE(SUM(COALESCE(o."taxableAmount", o."totalAmount")), 0)::double precision AS taxable
    FROM orders o
    WHERE o."businessId" = ${businessId} AND o."isDeleted" = false AND o.status <> 'CANCELLED'
      AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
  `)
  const output = outRows[0] ?? { cgst: 0, sgst: 0, igst: 0, taxable: 0 }

  const inRows = await prisma.$queryRaw<Array<{ cgst: number; sgst: number; igst: number; taxable: number }>>(Prisma.sql`
    SELECT
      COALESCE(SUM(p."cgstTotal"), 0)::double precision AS cgst,
      COALESCE(SUM(p."sgstTotal"), 0)::double precision AS sgst,
      COALESCE(SUM(p."igstTotal"), 0)::double precision AS igst,
      COALESCE(SUM(p."taxableAmount"), 0)::double precision AS taxable
    FROM purchases p
    WHERE p."businessId" = ${businessId} AND p.status = 'CONFIRMED'
      AND p."invoiceDate" >= ${start} AND p."invoiceDate" <= ${end}
  `)
  const itc = inRows[0] ?? { cgst: 0, sgst: 0, igst: 0, taxable: 0 }

  const net = {
    cgst: round2(output.cgst - itc.cgst),
    sgst: round2(output.sgst - itc.sgst),
    igst: round2(output.igst - itc.igst),
  }
  return {
    output: {
      cgst: round2(output.cgst), sgst: round2(output.sgst), igst: round2(output.igst),
      taxable: round2(output.taxable), total: round2(output.cgst + output.sgst + output.igst),
    },
    itc: {
      cgst: round2(itc.cgst), sgst: round2(itc.sgst), igst: round2(itc.igst),
      taxable: round2(itc.taxable), total: round2(itc.cgst + itc.sgst + itc.igst),
    },
    net: {
      ...net,
      // Negative = input credit carried forward, positive = tax payable.
      payable: round2(Math.max(0, net.cgst) + Math.max(0, net.sgst) + Math.max(0, net.igst)),
      total: round2(net.cgst + net.sgst + net.igst),
    },
  }
}

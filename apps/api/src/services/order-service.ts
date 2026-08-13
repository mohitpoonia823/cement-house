/**
 * Order use-cases. Routes stay transport-only (parse request, shape reply);
 * everything the business means by "create an order" or "add a line to an
 * order" lives here: plan gating, master-data tax resolution, billing
 * computation, guardrails, and persistence via the repositories.
 */
import { z } from 'zod'
import { inventoryRepository, ordersRepository, referralPartnersRepository, type Prisma } from '@cement-house/db'
import { marginPct } from '@cement-house/utils'
import { calculateInvoice, validateInvoiceInput } from './billing-engine'
import { ensureUsageAllowed } from './subscription-access'

export const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  referralPartnerId: z.string().uuid().optional(),
  sourceLocationId: z.string().uuid().optional(),
  deliveryDate: z.string().min(1).optional(),
  gstEnabled: z.boolean().optional(),
  isInterState: z.boolean().optional(),
  invoiceDiscount: z.number().min(0).optional(),
  roundOff: z.number().optional(),
  transportCharges: z.number().min(0).optional(),
  loadingCharges: z.number().min(0).optional(),
  allowAdvancePayment: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  paymentMode: z.enum(['CASH', 'UPI', 'CHEQUE', 'CREDIT', 'PARTIAL']),
  amountPaid: z.number().min(0),
  // The grand total the client showed the user. If it disagrees with the server's
  // recompute, we reject rather than silently save a different amount.
  expectedTotal: z.number().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    materialId: z.string().uuid(),
    variantId: z.string().min(1).optional(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    purchasePrice: z.number().min(0),
    billingBasis: z.enum(['QUANTITY', 'WEIGHT']).optional(),
    discount: z.number().min(0).optional(),
    hsnCode: z.string().trim().max(30).optional(),
    gstRate: z.number().min(0).max(100).optional(),
    barcode: z.string().optional(),
    batchNumber: z.string().optional(),
    expiryDate: z.string().optional(),
    serialNumber: z.string().optional(),
    imeiNumber: z.string().optional(),
    grossWeight: z.number().min(0).optional(),
    tareWeight: z.number().min(0).optional(),
    netWeight: z.number().min(0).optional(),
  })).min(1),
})

export const AddOrderItemSchema = z.object({
  materialId: z.string().uuid(),
  variantId: z.string().min(1).optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  purchasePrice: z.number().min(0),
  hsnCode: z.string().trim().max(30).optional(),
  discount: z.number().min(0).optional(),
  gstRate: z.number().min(0).max(100).optional(),
  netWeight: z.number().min(0).optional(),
  grossWeight: z.number().min(0).optional(),
  tareWeight: z.number().min(0).optional(),
})

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>
export type AddOrderItemInput = z.infer<typeof AddOrderItemSchema>

export interface OrderActor {
  id: string
  featureFlags?: Record<string, boolean> | null
  defaultSettings?: Record<string, unknown> | null
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string }

function fail(status: number, error: string, code?: string): { ok: false; status: number; error: string; code?: string } {
  return { ok: false, status, error, code }
}

/**
 * True for anything raised by Prisma or the Postgres driver, as opposed to a
 * message this codebase wrote. Prisma tags its own errors with a `P####` code
 * and prefixes raw-query failures with the invocation it was running.
 */
function isDatabaseError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null
  const code = String(candidate?.code ?? '')
  const message = String(candidate?.message ?? '')
  return (
    /^P\d{4}$/.test(code) ||
    message.includes('Invalid `prisma.') ||
    message.includes('Raw query failed')
  )
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

// Resolve GST rate and HSN from the material master — the server, not the
// client, decides tax rates. Client values are used only for materials that
// have no rate configured (back-compat for unconfigured catalogs).
async function resolveItemTaxes<T extends { materialId: string; hsnCode?: string; gstRate?: number }>(
  businessId: string,
  items: T[]
): Promise<T[]> {
  const taxInfoRows = await inventoryRepository.getMaterialTaxInfo(
    businessId,
    [...new Set(items.map((item) => item.materialId))]
  )
  const byMaterial = new Map(taxInfoRows.map((row) => [row.id, row]))
  return items.map((item) => {
    const master = byMaterial.get(item.materialId)
    if (!master) return item
    return {
      ...item,
      hsnCode: master.hsnCode ?? item.hsnCode,
      gstRate: master.isExempted ? 0 : (master.gstRate ?? item.gstRate),
    }
  })
}

// With expiry tracking on, stock past its expiry date must not be billable —
// a pharmacy/grocery compliance rule, checked against the material master so
// a stale client cannot bypass it.
async function findExpiredStockError(
  businessId: string,
  actor: OrderActor,
  materialIds: string[],
): Promise<string | null> {
  if (actor.featureFlags?.expiryTracking !== true) return null
  const expired = await inventoryRepository.getExpiredMaterials(businessId, [...new Set(materialIds)])
  if (expired.length === 0) return null
  const first = expired[0]
  const batch = first.batchNumber ? ` (batch ${first.batchNumber})` : ''
  const date = new Date(first.expiryDate).toISOString().slice(0, 10)
  return `${first.name}${batch} expired on ${date} — expired stock cannot be sold. Update its batch/expiry in Inventory first.`
}

// A serialised unit can only be sold once. Checked against the billing
// snapshots of live (non-cancelled) invoices for serial/IMEI-tracking businesses.
async function findDuplicateSerialError(
  businessId: string,
  actor: OrderActor,
  items: Array<{ serialNumber?: string; imeiNumber?: string }>,
): Promise<string | null> {
  const tracking = actor.featureFlags?.serialTracking === true || actor.featureFlags?.imeiTracking === true
  if (!tracking) return null
  const identifiers = items
    .flatMap((item) => [item.serialNumber, item.imeiNumber])
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
  if (identifiers.length === 0) return null
  const conflicts = await ordersRepository.findSoldSerialConflicts(businessId, identifiers)
  if (conflicts.length === 0) return null
  return `Serial/IMEI ${conflicts[0].identifier} was already sold on invoice ${conflicts[0].orderNumber}`
}

export async function createOrderForBusiness(
  businessId: string,
  actor: OrderActor,
  input: CreateOrderInput
): Promise<ServiceResult<{ id: string; orderNumber: string; recovered?: boolean }>> {
  try {
    await ensureUsageAllowed(businessId, 'ordersPerMonth')
    await ensureUsageAllowed(businessId, 'invoicesPerMonth')
  } catch (error: any) {
    if (error.message === 'PLAN_EXPIRED') {
      return fail(402, 'Plan expired. Please renew your subscription.', 'PLAN_EXPIRED')
    }
    if (error.message === 'LIMIT_EXCEEDED') {
      return fail(403, 'Monthly order/invoice limit reached for your plan.', 'LIMIT_EXCEEDED')
    }
    throw error
  }

  if (input.deliveryDate) {
    const parsedDeliveryDate = new Date(`${input.deliveryDate}T00:00:00`)
    if (Number.isNaN(parsedDeliveryDate.getTime())) {
      return fail(400, 'Invalid delivery date')
    }
    if (startOfDay(parsedDeliveryDate) < startOfDay(new Date())) {
      return fail(400, 'Delivery date cannot be earlier than order creation date')
    }
  }

  const resolvedItems = await resolveItemTaxes(businessId, input.items)

  const expiredError = await findExpiredStockError(businessId, actor, input.items.map((item) => item.materialId))
  if (expiredError) return fail(400, expiredError)

  const duplicateSerialError = await findDuplicateSerialError(businessId, actor, input.items)
  if (duplicateSerialError) return fail(400, duplicateSerialError)

  const billingInput = {
    items: resolvedItems,
    paymentMode: input.paymentMode,
    paidAmount: input.amountPaid,
    invoiceDiscount: input.invoiceDiscount,
    roundOff: input.roundOff,
    transportCharges: input.transportCharges,
    loadingCharges: input.loadingCharges,
    gstEnabled: input.gstEnabled,
    isInterState: input.isInterState,
    allowAdvancePayment: input.allowAdvancePayment,
    featureFlags: actor.featureFlags ?? {},
  }
  const billingValidationError = validateInvoiceInput(billingInput)
  if (billingValidationError) return fail(400, billingValidationError)

  const computed = calculateInvoice(billingInput)

  // Guardrail: the amount the client showed the user must match what the server
  // recomputes. Catches any client/server billing divergence before it becomes a
  // wrong invoice (e.g. quantity-vs-weight basis mismatches).
  if (input.expectedTotal != null && Math.abs(input.expectedTotal - computed.grandTotal) > 1) {
    return fail(
      409,
      `Invoice total changed (shown ₹${input.expectedTotal.toLocaleString('en-IN')}, recalculated ₹${computed.grandTotal.toLocaleString('en-IN')}). Please review the order and try again.`,
      'TOTAL_MISMATCH'
    )
  }

  const totalAmount = computed.grandTotal
  let referralRewardAmount: number | undefined
  let referralRewardRate: number | undefined
  if (input.referralPartnerId) {
    const partner = await referralPartnersRepository.getReferralPartnerById(input.referralPartnerId, businessId)
    if (!partner || !partner.isActive) {
      return fail(400, 'Referral partner not found or inactive')
    }
    referralRewardRate = Number(partner.rewardValue)
    referralRewardAmount = partner.rewardType === 'FLAT'
      ? Number(partner.rewardValue)
      : Number(((totalAmount * referralRewardRate) / 100).toFixed(2))
  }

  const avgMargin =
    input.items.reduce((sum, item) => sum + marginPct(item.unitPrice, item.purchasePrice), 0) / input.items.length

  let order
  try {
    // The invoice number is allocated atomically inside the create transaction
    // (per-business, per-year sequence) — never precomputed here, where two
    // concurrent requests could pick the same number.
    order = await ordersRepository.createOrder({
      customerId: input.customerId,
      referralPartnerId: input.referralPartnerId,
      referralRewardAmount,
      referralRewardRate,
      createdById: actor.id,
      paymentMode: input.paymentMode,
      amountPaid: computed.paidAmount,
      paidAmount: computed.paidAmount,
      dueAmount: computed.dueAmount,
      subtotal: computed.subtotal,
      itemDiscountTotal: computed.itemDiscountTotal,
      invoiceDiscount: computed.invoiceDiscount,
      taxableAmount: computed.taxableTotal,
      gstTotal: computed.gstTotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      transportCharges: computed.transportCharges,
      loadingCharges: computed.loadingCharges,
      roundOff: computed.roundOff,
      grandTotal: computed.grandTotal,
      billingSnapshot: JSON.parse(
        JSON.stringify({
          lines: computed.lines,
          gstEnabled: input.gstEnabled ?? Boolean(actor.featureFlags?.gstBilling),
          isInterState: input.isInterState ?? false,
        })
      ) as Prisma.JsonValue,
      totalAmount,
      marginPct: avgMargin,
      notes: input.notes,
      businessId,
      sourceLocationId: input.sourceLocationId,
      deliveryDate: input.deliveryDate,
      allowNegativeStock: input.allowNegativeStock === true || actor.defaultSettings?.allowNegativeStock === true,
      items: computed.lines.map((line, i) => ({
        materialId: line.materialId,
        variantId: resolvedItems[i].variantId,
        quantity: resolvedItems[i].quantity,
        unitPrice: resolvedItems[i].unitPrice,
        purchasePrice: resolvedItems[i].purchasePrice,
        lineTotal: line.lineTotal,
        hsnCode: resolvedItems[i].hsnCode,
        gstRate: line.gstRate,
        taxableAmount: line.taxableAmount,
        gstAmount: line.gstAmount,
        cgstAmount: line.cgstAmount,
        sgstAmount: line.sgstAmount,
        igstAmount: line.igstAmount,
        discountAmount: line.itemDiscount,
        deductionQty: line.deductionQty,
      })),
    })
  } catch (error: any) {
    const message = String(error?.message ?? '')
    // The repository already recovers committed-but-disconnected transactions
    // by order id; reaching here with this error means the order truly did
    // not land.
    if (message.includes('Transaction API error: Transaction not found')) {
      return fail(503, 'Order creation timed out internally. Please retry once.', 'ORDER_TX_RETRY')
    }
    // Messages thrown by the repository ("Insufficient stock in selected
    // location") are written for the shopkeeper and pass through. Anything
    // raised by Prisma or Postgres is not — it carries SQL, constraint names
    // and row values, which the UI renders verbatim. Log those and show a
    // generic line instead.
    if (isDatabaseError(error)) {
      console.error('[orders] create failed:', error)
      return fail(500, 'Could not save the order. Please try again.')
    }
    return fail(400, message || 'Failed to create order')
  }

  if (!order) return fail(500, 'Failed to create order')
  return { ok: true, data: order }
}

export async function appendItemToOrderForBusiness(
  businessId: string,
  actor: OrderActor,
  orderId: string,
  input: AddOrderItemInput
): Promise<ServiceResult<{ appended: true }>> {
  const order = await ordersRepository.getOrderDetail(orderId, businessId)
  if (!order) return fail(404, 'Order not found')

  // Tax the appended line the same way the original invoice was billed
  // (GST on/off, intra vs inter-state), with the rate/HSN resolved from the
  // material master rather than trusted from the client.
  const billingFlags = await ordersRepository.getOrderBillingFlags(orderId, businessId)
  const [resolvedItem] = await resolveItemTaxes(businessId, [input])

  const expiredError = await findExpiredStockError(businessId, actor, [input.materialId])
  if (expiredError) return fail(400, expiredError)

  const billingInput = {
    items: [resolvedItem],
    paymentMode: order.paymentMode,
    paidAmount: 0,
    gstEnabled: billingFlags?.gstEnabled,
    isInterState: billingFlags?.isInterState,
    featureFlags: actor.featureFlags ?? {},
    allowAdvancePayment: true,
  }
  const lineValidationError = validateInvoiceInput(billingInput)
  if (lineValidationError) return fail(400, lineValidationError)

  const lineComputed = calculateInvoice(billingInput).lines[0]

  await ordersRepository.appendItemToOrder({
    orderId,
    businessId,
    materialId: input.materialId,
    variantId: input.variantId,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    purchasePrice: input.purchasePrice,
    lineTotal: lineComputed?.lineTotal ?? input.quantity * input.unitPrice,
    itemSubtotal: lineComputed?.itemSubtotal,
    hsnCode: resolvedItem.hsnCode,
    gstRate: lineComputed?.gstRate ?? resolvedItem.gstRate ?? 0,
    taxableAmount: lineComputed?.taxableAmount ?? input.quantity * input.unitPrice,
    gstAmount: lineComputed?.gstAmount ?? 0,
    cgstAmount: lineComputed?.cgstAmount ?? 0,
    sgstAmount: lineComputed?.sgstAmount ?? 0,
    igstAmount: lineComputed?.igstAmount ?? 0,
    discountAmount: lineComputed?.itemDiscount ?? (input.discount ?? 0),
    deductionQty: lineComputed?.deductionQty ?? input.quantity,
    allowNegativeStock: actor.defaultSettings?.allowNegativeStock === true,
    userId: actor.id,
    orderNumber: order.orderNumber,
    paymentMode: order.paymentMode,
    customerId: order.customerId,
  })

  return { ok: true, data: { appended: true } }
}

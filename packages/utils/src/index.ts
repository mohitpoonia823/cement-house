// ── Shared pure utilities ─────────────────────────────────────────────────────

/** Format number as Indian Rupees: 1234567 → "₹12,34,567" */
export function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount)
}

/** Generate order number: ORD-2026-0841 */
export function generateOrderNumber(seq?: number): string {
  const year = new Date().getFullYear()
  if (typeof seq === 'number') {
    return `ORD-${year}-${String(seq).padStart(4, '0')}`
  }
  const nonce = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
  return `ORD-${year}-${nonce}`
}

/** Generate challan number: CH-2026-0839 */
export function generateChallanNumber(seq?: number): string {
  const year = new Date().getFullYear()
  if (typeof seq === 'number') {
    return `CH-${year}-${String(seq).padStart(4, '0')}`
  }
  const nonce = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
  return `CH-${year}-${nonce}`
}

/** Calculate margin percentage */
export function marginPct(salePrice: number, purchasePrice: number): number {
  if (purchasePrice === 0) return 0
  return Math.round(((salePrice - purchasePrice) / purchasePrice) * 1000) / 10
}

/** Days since a date */
export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

/** WhatsApp message templates */
export const WA_TEMPLATES = {
  paymentReminder: (name: string, amount: number, days: number, dateStr: string) =>
    `🔔 *Payment reminder*\n\nHello ${name}, your payment of ₹${amount} for invoice/order ${days} is still pending. Kindly make the payment by ${dateStr}. If you have already paid, please ignore this message.\n\nTerms and conditions apply. (Call phone number)`,
  orderConfirmation: (name: string, orderNo: string, amount: number) =>
    `Namaskar *${name}* ji,\n\nAapka order *${orderNo}* confirm ho gaya hai.\nTotal: *${formatRupees(amount)}*\n\nDhanyawaad! 🙏`,
  deliveryConfirmation: (name: string, challanNo: string, businessName = 'Cement House') =>
    `Namaskar *${name}* ji,\n\nAapka maal (*${challanNo}*) pahunch gaya hai.\nPlease OTP confirm karen.\n\n— ${businessName}`,
}

export {
  BUSINESS_TYPES,
  BUSINESS_TYPE_VALUES,
  BUSINESS_TYPE_CONFIG,
  MODULE_KEYS,
  FEATURE_KEYS,
  CUSTOM_ONBOARDING_MODULES,
  CUSTOM_ONBOARDING_FEATURES,
  normalizeBusinessType,
  getBusinessTypeConfig,
  getEnabledModulesForBusinessType,
  getFeatureFlagsForBusinessType,
  hasModule,
  hasFeature,
  listBusinessTypeOptions,
  normalizeCustomModules,
  normalizeCustomFeatureFlags,
  validateCustomBusinessSelection,
} from './business-config'
export type { BusinessType, ModuleKey, FeatureKey, BusinessTypeConfig } from './business-config'

export { computeOrderPreview } from './compute-order-preview'
export type { OrderLineInput, OrderLineResult, OrderSummary } from './compute-order-preview'


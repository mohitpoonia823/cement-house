export const BUSINESS_TYPES = [
  'GENERAL_STORE',
  'CEMENT',
  'HARDWARE_SANITARY',
  'KIRYANA_GROCERY',
  'PHARMACY_MEDICAL',
  'ELECTRONICS',
  'MOBILE_ACCESSORIES',
  'FASHION_APPAREL',
  'FOOTWEAR',
  'JEWELLERY',
  'BOOKS_STATIONERY',
  'SPORTS_FITNESS',
  'HOME_KITCHEN',
  'FURNITURE',
  'AUTOMOTIVE_PARTS',
  'ELECTRICALS',
  'PAINTS',
  'AGRI_INPUTS',
  'TOYS_GIFTS',
  'BAKERY',
  'SWEETS_SNACKS',
  'RESTAURANT_CAFE',
  'LIQUOR_STORE',
  'CUSTOM',
] as const

export type BusinessType = (typeof BUSINESS_TYPES)[number]
export const BUSINESS_TYPE_VALUES = BUSINESS_TYPES

export const MODULE_KEYS = [
  'inventory',
  'orders',
  'customers',
  'payments',
  'reports',
  'suppliers',
  'purchases',
  'expenses',
  'importedBills',
  'deliveries',
  'logistics',
  'quotation',
  'prescriptions',
  'warranty',
  'production',
  'menu',
  'kitchen',
] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

export const FEATURE_KEYS = [
  'gstBilling',
  'barcode',
  'barcodeSupport',
  'variants',
  'batchTracking',
  'expiryTracking',
  'serialTracking',
  'imeiTracking',
  'weightBilling',
  'weightBasedBilling',
  'transport',
  'transportManagement',
  'deliveryChallan',
  'restaurantPOS',
  'kitchenOrders',
  'tableManagement',
  'kot',
  'purityTracking',
  'makingCharges',
  'rackLocation',
  'quotation',
  'quotations',
  'multiLocation',
  'customModuleConfig',
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

type Labels = {
  inventory: string
  material: string
  customer: string
  supplier: string
}

export interface BusinessTypeConfig {
  type: BusinessType
  label: string
  enabledModules: ModuleKey[]
  featureFlags: Record<FeatureKey, boolean>
  defaultSettings: Record<string, unknown>
  defaultLabels: Labels
}

const BASE_LABELS: Labels = {
  inventory: 'Inventory',
  material: 'Item',
  customer: 'Customer',
  supplier: 'Supplier',
}

const BASE_FLAGS: Record<FeatureKey, boolean> = {
  gstBilling: true,
  barcode: false,
  barcodeSupport: false,
  variants: false,
  batchTracking: false,
  expiryTracking: false,
  serialTracking: false,
  imeiTracking: false,
  weightBilling: false,
  weightBasedBilling: false,
  transport: false,
  transportManagement: false,
  deliveryChallan: false,
  restaurantPOS: false,
  kitchenOrders: false,
  tableManagement: false,
  kot: false,
  purityTracking: false,
  makingCharges: false,
  rackLocation: false,
  quotation: false,
  quotations: false,
  multiLocation: false,
  customModuleConfig: false,
}

function cfg(
  type: BusinessType,
  label: string,
  options: {
    enabledModules: ModuleKey[]
    featureFlags?: Partial<Record<FeatureKey, boolean>>
    defaultSettings?: Record<string, unknown>
    defaultLabels?: Partial<Labels>
  }
): BusinessTypeConfig {
  const mergedFlags: Record<FeatureKey, boolean> = { ...BASE_FLAGS }
  if (options.featureFlags) {
    for (const [key, value] of Object.entries(options.featureFlags)) {
      if (typeof value === 'boolean' && (FEATURE_KEYS as readonly string[]).includes(key)) {
        mergedFlags[key as FeatureKey] = value
      }
    }
  }

  return {
    type,
    label,
    enabledModules: options.enabledModules,
    featureFlags: mergedFlags,
    defaultSettings: options.defaultSettings ?? {},
    defaultLabels: { ...BASE_LABELS, ...(options.defaultLabels ?? {}) },
  }
}

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, BusinessTypeConfig> = {
  GENERAL_STORE: cfg('GENERAL_STORE', 'General store', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
  }),
  CEMENT: cfg('CEMENT', 'Cement', {
    enabledModules: ['inventory', 'orders', 'deliveries', 'customers', 'payments', 'reports', 'logistics'],
    featureFlags: { weightBilling: true, transport: true, deliveryChallan: true },
    defaultSettings: { stockMode: 'godown-yard', billingMode: 'bulk' },
    defaultLabels: { material: 'Material' },
  }),
  HARDWARE_SANITARY: cfg('HARDWARE_SANITARY', 'Hardware & sanitary', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'quotation'],
    featureFlags: { variants: true, barcode: true, quotation: true, gstBilling: true },
  }),
  KIRYANA_GROCERY: cfg('KIRYANA_GROCERY', 'Kiryana / grocery', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { barcode: true },
    defaultLabels: { material: 'Product', inventory: 'Stock' },
  }),
  PHARMACY_MEDICAL: cfg('PHARMACY_MEDICAL', 'Pharmacy / medical', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'prescriptions'],
    featureFlags: { batchTracking: true, expiryTracking: true, rackLocation: true },
    defaultSettings: { requiresPrescriptionFlow: true },
  }),
  ELECTRONICS: cfg('ELECTRONICS', 'Electronics', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'warranty'],
    featureFlags: { serialTracking: true },
  }),
  MOBILE_ACCESSORIES: cfg('MOBILE_ACCESSORIES', 'Mobile accessories', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'warranty'],
    featureFlags: { serialTracking: true, imeiTracking: true },
  }),
  FASHION_APPAREL: cfg('FASHION_APPAREL', 'Fashion / apparel', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { variants: true, barcode: true },
  }),
  FOOTWEAR: cfg('FOOTWEAR', 'Footwear', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { variants: true, barcode: true },
  }),
  JEWELLERY: cfg('JEWELLERY', 'Jewellery', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { weightBilling: true, purityTracking: true, makingCharges: true },
  }),
  BOOKS_STATIONERY: cfg('BOOKS_STATIONERY', 'Books & stationery', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { barcode: true },
  }),
  SPORTS_FITNESS: cfg('SPORTS_FITNESS', 'Sports & fitness', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { variants: true, barcode: true },
  }),
  HOME_KITCHEN: cfg('HOME_KITCHEN', 'Home & kitchen', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { variants: true, barcode: true },
  }),
  FURNITURE: cfg('FURNITURE', 'Furniture', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'quotation'],
    featureFlags: { quotation: true },
  }),
  AUTOMOTIVE_PARTS: cfg('AUTOMOTIVE_PARTS', 'Automotive parts', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { variants: true, barcode: true },
  }),
  ELECTRICALS: cfg('ELECTRICALS', 'Electricals', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { variants: true, barcode: true },
  }),
  PAINTS: cfg('PAINTS', 'Paints', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { variants: true, barcode: true },
  }),
  AGRI_INPUTS: cfg('AGRI_INPUTS', 'Agri inputs', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { batchTracking: true },
  }),
  TOYS_GIFTS: cfg('TOYS_GIFTS', 'Toys & gifts', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { barcode: true },
  }),
  BAKERY: cfg('BAKERY', 'Bakery', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'production'],
    featureFlags: { expiryTracking: true, batchTracking: true },
    defaultSettings: { productionEnabled: true, recipeEnabled: true },
  }),
  SWEETS_SNACKS: cfg('SWEETS_SNACKS', 'Sweets & snacks', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'production'],
    featureFlags: { expiryTracking: true, batchTracking: true },
    defaultSettings: { productionEnabled: true, recipeEnabled: true },
  }),
  RESTAURANT_CAFE: cfg('RESTAURANT_CAFE', 'Restaurant / cafe', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports', 'menu', 'kitchen'],
    featureFlags: { tableManagement: true, kot: true, kitchenOrders: true },
    defaultSettings: { serviceModes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] },
  }),
  LIQUOR_STORE: cfg('LIQUOR_STORE', 'Liquor store', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { barcode: true, batchTracking: true },
  }),
  CUSTOM: cfg('CUSTOM', 'Custom', {
    enabledModules: ['inventory', 'orders', 'customers', 'payments', 'reports'],
    featureFlags: { customModuleConfig: true },
    defaultSettings: { userConfigurableModules: true },
  }),
}

const LEGACY_BUSINESS_TYPE_ALIAS: Record<string, BusinessType> = {
  GENERAL: 'GENERAL_STORE',
  KIRYANA: 'KIRYANA_GROCERY',
}

export function normalizeBusinessType(value?: string | null): BusinessType {
  if (!value) return 'GENERAL_STORE'
  if ((BUSINESS_TYPES as readonly string[]).includes(value)) return value as BusinessType
  if (LEGACY_BUSINESS_TYPE_ALIAS[value]) return LEGACY_BUSINESS_TYPE_ALIAS[value]
  return 'CUSTOM'
}

export function getBusinessTypeConfig(value?: string | null): BusinessTypeConfig {
  const normalized = normalizeBusinessType(value)
  return BUSINESS_TYPE_CONFIG[normalized]
}

export function getEnabledModulesForBusinessType(value?: string | null): ModuleKey[] {
  return [...getBusinessTypeConfig(value).enabledModules]
}

export function getFeatureFlagsForBusinessType(value?: string | null): Record<FeatureKey, boolean> {
  return { ...getBusinessTypeConfig(value).featureFlags }
}

export function hasModule(
  enabledModules: readonly string[] | null | undefined,
  moduleKey: ModuleKey,
): boolean {
  if (!Array.isArray(enabledModules)) return false
  return enabledModules.includes(moduleKey)
}

export function hasFeature(
  featureFlags: Record<string, boolean> | null | undefined,
  featureKey: FeatureKey,
): boolean {
  if (!featureFlags || typeof featureFlags !== 'object') return false
  return Boolean(featureFlags[featureKey])
}

export function listBusinessTypeOptions() {
  return BUSINESS_TYPES.map((type) => ({
    type,
    label: BUSINESS_TYPE_CONFIG[type].label,
  }))
}

export const CUSTOM_ONBOARDING_MODULES = [
  { key: 'orders', label: 'Billing / orders', defaultEnabled: true },
  { key: 'inventory', label: 'Inventory', defaultEnabled: true },
  { key: 'customers', label: 'Customers', defaultEnabled: true },
  { key: 'suppliers', label: 'Suppliers', defaultEnabled: false },
  { key: 'purchases', label: 'Purchases', defaultEnabled: false },
  { key: 'reports', label: 'Reports', defaultEnabled: true },
  { key: 'expenses', label: 'Expenses', defaultEnabled: false },
  { key: 'deliveries', label: 'Delivery / transport', defaultEnabled: false },
  { key: 'logistics', label: 'Logistics', defaultEnabled: false },
  { key: 'importedBills', label: 'Imported bills', defaultEnabled: false },
  { key: 'payments', label: 'Khata / ledger', defaultEnabled: true },
  { key: 'menu', label: 'Restaurant tables / menu', defaultEnabled: false },
  { key: 'kitchen', label: 'Kitchen / KOT', defaultEnabled: false },
] as const

export const CUSTOM_ONBOARDING_FEATURES = [
  { key: 'barcodeSupport', label: 'Barcode support', defaultEnabled: false },
  { key: 'gstBilling', label: 'GST billing', defaultEnabled: true },
  { key: 'batchTracking', label: 'Batch tracking', defaultEnabled: false },
  { key: 'expiryTracking', label: 'Expiry tracking', defaultEnabled: false },
  { key: 'weightBasedBilling', label: 'Weight-based billing', defaultEnabled: false },
  { key: 'transportManagement', label: 'Transport management', defaultEnabled: false },
  { key: 'restaurantPOS', label: 'Restaurant POS', defaultEnabled: false },
  { key: 'serialTracking', label: 'Serial tracking', defaultEnabled: false },
  { key: 'variants', label: 'Variants', defaultEnabled: false },
  { key: 'quotations', label: 'Quotations', defaultEnabled: false },
  { key: 'multiLocation', label: 'Multi-location', defaultEnabled: false },
] as const

export function normalizeCustomModules(input: unknown): string[] {
  const rows = Array.isArray(input) ? input : []
  const allowed = new Set(MODULE_KEYS as readonly string[])
  return rows
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && allowed.has(entry))
}

export function normalizeCustomFeatureFlags(input: unknown): Record<FeatureKey, boolean> {
  const map: Record<FeatureKey, boolean> = { ...BASE_FLAGS }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return map
  for (const key of FEATURE_KEYS) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === 'boolean') map[key] = value
  }
  // keep old + new aliases in sync
  if (map.barcodeSupport) map.barcode = true
  if (map.weightBasedBilling) map.weightBilling = true
  if (map.transportManagement) {
    map.transport = true
    map.deliveryChallan = true
  }
  if (map.restaurantPOS) {
    map.tableManagement = true
    map.kot = true
    map.kitchenOrders = true
  }
  if (map.quotations) map.quotation = true
  return map
}

export function validateCustomBusinessSelection(input: {
  enabledModules: readonly string[]
  featureFlags: Record<string, boolean>
}) {
  const errors: string[] = []
  const modules = new Set(input.enabledModules)
  const feature = (key: string) => input.featureFlags[key] === true
  if (modules.size === 0) errors.push('Select at least one core module')
  if (modules.has('orders') && !modules.has('customers')) {
    errors.push('Customers module is required when billing/orders is enabled')
  }
  if (feature('transportManagement') && !(modules.has('deliveries') || modules.has('logistics'))) {
    errors.push('Enable delivery/transport module for transport management')
  }
  if (feature('restaurantPOS') && (!modules.has('orders') || !modules.has('inventory'))) {
    errors.push('Restaurant POS requires orders and inventory modules')
  }
  if (feature('gstBilling') && !modules.has('orders')) {
    errors.push('GST billing requires billing/orders module')
  }
  return errors
}

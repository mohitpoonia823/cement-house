export type BusinessType = 'GENERAL' | 'CEMENT' | 'HARDWARE_SANITARY' | 'KIRYANA' | 'CUSTOM'

type LabelOverrides = {
  inventory?: string
  material?: string
  customer?: string
  supplier?: string
} | null | undefined

export function businessTerms(businessType?: BusinessType | null, customLabels?: LabelOverrides) {
  const type = businessType ?? 'GENERAL'
  const defaults =
    type === 'HARDWARE_SANITARY'
      ? { inventory: 'Stock', material: 'Item', customer: 'Customer', supplier: 'Supplier' }
      : type === 'KIRYANA'
        ? { inventory: 'Stock', material: 'Product', customer: 'Customer', supplier: 'Supplier' }
        : type === 'CEMENT'
          ? { inventory: 'Inventory', material: 'Material', customer: 'Customer', supplier: 'Supplier' }
          : { inventory: 'Inventory', material: 'Item', customer: 'Customer', supplier: 'Supplier' }

  return {
    inventory: customLabels?.inventory?.trim() || defaults.inventory,
    material: customLabels?.material?.trim() || defaults.material,
    customer: customLabels?.customer?.trim() || defaults.customer,
    supplier: customLabels?.supplier?.trim() || defaults.supplier,
  }
}

const ALL_UNITS = [
  'pieces',
  'packet',
  'box',
  'strip',
  'tablet',
  'capsule',
  'bottle',
  'ml',
  'litres',
  'kg',
  'g',
  'quintal',
  'bags',
  'MT',
  'ton',
  'tons',
  'tonne',
  'tonnes',
  'feet',
  'cft',
  'm3',
  'dozen',
]

export function businessUnitOptions(businessType?: BusinessType | null) {
  const type = businessType ?? 'GENERAL'
  const preferred =
    type === 'CEMENT'
      ? ['bags', 'MT', 'ton', 'quintal', 'kg']
      : type === 'HARDWARE_SANITARY'
        ? ['pieces', 'box', 'packet', 'feet', 'kg', 'litres', 'm3']
        : type === 'KIRYANA'
          ? ['kg', 'g', 'litres', 'ml', 'pieces', 'packet', 'dozen']
          : ['pieces', 'kg', 'litres', 'box', 'packet']

  const seen = new Set<string>()
  const normalized = [...preferred, ...ALL_UNITS].filter((unit) => {
    const key = unit.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    preferred,
    all: normalized,
    defaultUnit: preferred[0] ?? 'pieces',
  }
}

export function splitPreferredUnits(allUnits: string[], preferredUnits: string[]) {
  const preferred = preferredUnits.filter((u) => allUnits.some((x) => x.toLowerCase() === u.toLowerCase()))
  const others = allUnits.filter((u) => !preferred.some((p) => p.toLowerCase() === u.toLowerCase()))
  return { preferred, others }
}

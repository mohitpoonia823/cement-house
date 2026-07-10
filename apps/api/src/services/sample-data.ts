import { normalizeBusinessType } from '@cement-house/utils'

/**
 * Starter inventory offered by the post-signup setup wizard so a new trial
 * never begins on an empty dashboard. Rows mirror CreateMaterialInput minus
 * businessId; quantities/prices are deliberately ordinary so owners recognise
 * them as examples to edit, not real stock.
 */
export interface SampleMaterial {
  name: string
  category?: string
  unit: string
  stockQty: number
  minThreshold: number
  purchasePrice: number
  salePrice: number
  barcode?: string
  batchNumber?: string
  expiryDate?: string
  manufacturer?: string
}

function isoDaysFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getSampleMaterialsForBusinessType(businessType?: string | null): SampleMaterial[] {
  const type = normalizeBusinessType(businessType)
  switch (type) {
    case 'CEMENT':
      return [
        { name: 'OPC 53 Grade Cement', category: 'Cement', unit: 'bags', stockQty: 100, minThreshold: 20, purchasePrice: 340, salePrice: 365 },
        { name: 'PPC Cement', category: 'Cement', unit: 'bags', stockQty: 80, minThreshold: 20, purchasePrice: 320, salePrice: 345 },
        { name: 'TMT Saria 12mm', category: 'Steel', unit: 'quintal', stockQty: 25, minThreshold: 5, purchasePrice: 5200, salePrice: 5500 },
      ]
    case 'PHARMACY_MEDICAL':
      return [
        { name: 'Paracetamol 500mg (strip of 10)', category: 'Tablets', unit: 'strip', stockQty: 50, minThreshold: 10, purchasePrice: 8, salePrice: 12, batchNumber: 'BATCH-1001', expiryDate: isoDaysFromNow(540), manufacturer: 'Sample Pharma' },
        { name: 'Cough Syrup 100ml', category: 'Syrups', unit: 'bottle', stockQty: 24, minThreshold: 6, purchasePrice: 55, salePrice: 78, batchNumber: 'BATCH-2002', expiryDate: isoDaysFromNow(365), manufacturer: 'Sample Pharma' },
        { name: 'ORS Sachet 21g', category: 'General', unit: 'sachet', stockQty: 100, minThreshold: 20, purchasePrice: 4, salePrice: 6, batchNumber: 'BATCH-3003', expiryDate: isoDaysFromNow(720) },
      ]
    case 'KIRYANA_GROCERY':
      return [
        { name: 'Basmati Rice 5kg', category: 'Grains', unit: 'pack', stockQty: 30, minThreshold: 5, purchasePrice: 380, salePrice: 430, barcode: '8901000000011' },
        { name: 'Wheat Atta 10kg', category: 'Grains', unit: 'pack', stockQty: 25, minThreshold: 5, purchasePrice: 330, salePrice: 375, barcode: '8901000000028' },
        { name: 'Sunflower Oil 1L', category: 'Oils', unit: 'bottle', stockQty: 40, minThreshold: 8, purchasePrice: 125, salePrice: 145, barcode: '8901000000035', expiryDate: isoDaysFromNow(270) },
      ]
    case 'HARDWARE_SANITARY':
      return [
        { name: 'PVC Pipe 1 inch (10ft)', category: 'Plumbing', unit: 'pcs', stockQty: 60, minThreshold: 10, purchasePrice: 165, salePrice: 210 },
        { name: 'Wall Putty 5kg', category: 'Finishing', unit: 'pack', stockQty: 30, minThreshold: 6, purchasePrice: 240, salePrice: 290 },
        { name: 'Door Hinge 4 inch (SS)', category: 'Fittings', unit: 'pcs', stockQty: 100, minThreshold: 20, purchasePrice: 35, salePrice: 55 },
      ]
    case 'ELECTRONICS':
    case 'MOBILE_ACCESSORIES':
      return [
        { name: 'LED Bulb 9W', category: 'Lighting', unit: 'pcs', stockQty: 60, minThreshold: 12, purchasePrice: 55, salePrice: 90, barcode: '8901000000103' },
        { name: 'USB-C Charging Cable 1m', category: 'Accessories', unit: 'pcs', stockQty: 40, minThreshold: 10, purchasePrice: 60, salePrice: 120, barcode: '8901000000110' },
        { name: 'Extension Board 4-socket', category: 'Electrical', unit: 'pcs', stockQty: 20, minThreshold: 5, purchasePrice: 210, salePrice: 300, barcode: '8901000000127' },
      ]
    case 'FASHION_APPAREL':
    case 'FOOTWEAR':
      return [
        { name: 'Cotton T-Shirt (M)', category: 'Apparel', unit: 'pcs', stockQty: 30, minThreshold: 6, purchasePrice: 180, salePrice: 320, barcode: '8901000000201' },
        { name: 'Denim Jeans (32)', category: 'Apparel', unit: 'pcs', stockQty: 20, minThreshold: 4, purchasePrice: 520, salePrice: 899, barcode: '8901000000218' },
        { name: 'Sports Socks (pair)', category: 'Accessories', unit: 'pair', stockQty: 50, minThreshold: 10, purchasePrice: 45, salePrice: 90, barcode: '8901000000225' },
      ]
    default:
      return [
        { name: 'Sample Product A', category: 'General', unit: 'pcs', stockQty: 50, minThreshold: 10, purchasePrice: 80, salePrice: 110 },
        { name: 'Sample Product B', category: 'General', unit: 'pcs', stockQty: 30, minThreshold: 6, purchasePrice: 150, salePrice: 200 },
        { name: 'Sample Product C', category: 'General', unit: 'box', stockQty: 20, minThreshold: 4, purchasePrice: 320, salePrice: 400 },
      ]
  }
}

export const SAMPLE_CUSTOMER = {
  name: 'Walk-in Customer',
  phone: '9999999999',
  creditLimit: 0,
  notes: 'Sample customer added during setup — edit or delete anytime.',
}

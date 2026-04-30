import { z } from 'zod'

const GeminiBillItemSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPrice: z.number().nullable(),
  lineTotal: z.number().nullable(),
  confidence: z.number().min(0).max(1),
})

const GeminiBillScanSchema = z.object({
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  currency: z.string(),
  subtotal: z.number().nullable(),
  taxAmount: z.number().nullable(),
  totalAmount: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable(),
  items: z.array(GeminiBillItemSchema),
})

export type ScannedPurchaseBill = z.infer<typeof GeminiBillScanSchema>

export class PurchaseBillScannerConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PurchaseBillScannerConfigError'
  }
}

const purchaseBillJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'supplierName',
    'invoiceNumber',
    'invoiceDate',
    'currency',
    'subtotal',
    'taxAmount',
    'totalAmount',
    'confidence',
    'notes',
    'items',
  ],
  properties: {
    supplierName: { type: ['string', 'null'] },
    invoiceNumber: { type: ['string', 'null'] },
    invoiceDate: {
      type: ['string', 'null'],
      description: 'Invoice date in YYYY-MM-DD format when readable, otherwise null.',
    },
    currency: { type: 'string', description: 'Currency code or symbol, usually INR.' },
    subtotal: { type: ['number', 'null'] },
    taxAmount: { type: ['number', 'null'] },
    totalAmount: { type: ['number', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    notes: {
      type: ['string', 'null'],
      description: 'Short note for unclear bill areas, handwritten corrections, or missing totals.',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unit', 'unitPrice', 'lineTotal', 'confidence'],
        properties: {
          description: {
            type: 'string',
            description: 'Material or product name exactly as read from the bill line.',
          },
          quantity: { type: ['number', 'null'] },
          unit: {
            type: ['string', 'null'],
            description: 'Unit written on bill, such as bags, MT, feet, pieces, kg, or litres.',
          },
          unitPrice: {
            type: ['number', 'null'],
            description: 'Buying price per unit. If only line total and quantity are readable, calculate it.',
          },
          lineTotal: { type: ['number', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const

function extractGeminiText(response: any) {
  return response?.candidates?.[0]?.content?.parts?.find((part: any) => typeof part?.text === 'string')?.text ?? null
}

function parseImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/i)
  if (!match) throw new Error('Bill scanner received an invalid image payload')
  return {
    mediaType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    base64: match[2].replace(/\s/g, ''),
  }
}

function normalizeNullableString(value: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeDate(value: string | null) {
  const trimmed = normalizeNullableString(value)
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export async function scanPurchaseBillImage(input: {
  dataUrl: string
  fileName?: string | null
}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new PurchaseBillScannerConfigError('GEMINI_API_KEY is not configured for bill scanning')
  }

  const model = process.env.GEMINI_BILL_SCAN_MODEL ?? 'gemini-2.0-flash'
  const image = parseImageDataUrl(input.dataUrl)
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: image.mediaType,
                data: image.base64,
              }
            },
            {
              text: [
                'You extract purchase bill data for a business inventory system.',
                'Read the attached seller invoice/bill image and return ONLY a JSON object.',
                'Extract only actual material/product line items. Ignore freight, loading, round-off, discounts, tax rows, totals, and payment notes as items.',
                'For every item, preserve the bill description, quantity, unit, per-unit buying price, line total, and a confidence score.',
                'If unit price is missing but quantity and line total are readable, calculate unitPrice = lineTotal / quantity.',
                'If a value is not readable, use null. Do not invent items or numbers.',
                'Prefer YYYY-MM-DD for invoiceDate. The business is in India, so amounts are usually INR.',
                'Output must exactly match this schema and key names:',
                JSON.stringify(purchaseBillJsonSchema),
                input.fileName ? `Uploaded filename: ${input.fileName}` : '',
              ].filter(Boolean).join('\n'),
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
      },
    }),
  })

  const body: any = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.error?.message ?? 'Bill scanner request failed'
    throw new Error(message)
  }

  const outputText = extractGeminiText(body)
  if (!outputText) throw new Error('Bill scanner returned an empty response')

  const parsed = GeminiBillScanSchema.parse(JSON.parse(outputText))
  return {
    provider: 'gemini',
    model,
    rawText: outputText,
    scan: {
      ...parsed,
      supplierName: normalizeNullableString(parsed.supplierName),
      invoiceNumber: normalizeNullableString(parsed.invoiceNumber),
      invoiceDate: normalizeDate(parsed.invoiceDate),
      currency: parsed.currency || 'INR',
      notes: normalizeNullableString(parsed.notes),
      items: parsed.items.map((item) => ({
        ...item,
        description: item.description.trim(),
        unit: normalizeNullableString(item.unit),
        quantity: item.quantity !== null && Number.isFinite(item.quantity) ? item.quantity : null,
        unitPrice: item.unitPrice !== null && Number.isFinite(item.unitPrice) ? item.unitPrice : null,
        lineTotal: item.lineTotal !== null && Number.isFinite(item.lineTotal) ? item.lineTotal : null,
      })),
    } satisfies ScannedPurchaseBill,
  }
}

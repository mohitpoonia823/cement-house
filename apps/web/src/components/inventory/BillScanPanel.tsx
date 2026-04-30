'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useCommitPurchaseBillScan, useScanPurchaseBill } from '@/hooks/useInventory'
import { useI18n } from '@/lib/i18n'
import { fmt } from '@/lib/utils'
import { splitPreferredUnits } from '@/lib/business-terms'

type Material = {
  id: string
  name: string
  unit: string
  purchasePrice: number
  salePrice: number
}

type CandidateMatch = {
  materialId: string
  name: string
  unit: string
  score: number
  source: 'name' | 'alias'
  alias?: string
}

type BillLine = {
  id: string
  scannedName: string
  status: 'MATCHED' | 'NEEDS_REVIEW' | 'APPLIED' | 'SKIPPED'
  materialId: string | null
  unit: string | null
  quantity: number | null
  purchasePrice: number | null
  lineTotal: number | null
  confidence: number
  matchConfidence: number
  candidateMatches?: CandidateMatch[]
}

type BillScan = {
  id: string
  supplierName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  confidence: number
  subtotal: number | null
  taxAmount: number | null
  totalAmount: number | null
  notes: string | null
  lines: BillLine[]
}

type LineEdit = {
  action: 'APPLY' | 'SKIP'
  createNew: boolean
  materialId: string
  materialName: string
  unit: string
  quantity: string
  purchasePrice: string
  lineTotal: string
  salePrice: string
}

const fallbackUnits = ['bags', 'MT', 'ton', 'tons', 'tonne', 'tonnes', 'feet', 'cft', 'm3', 'pieces', 'kg', 'quintal', 'litres']

function asInputNumber(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? '' : String(value)
}

function scoreLabel(value: number) {
  return `${Math.round(value * 100)}%`
}

function confidenceVariant(value: number) {
  if (value >= 0.82) return 'success'
  if (value >= 0.58) return 'warning'
  return 'danger'
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = objectUrl
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function compressBillImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Upload an image bill')
  const img = await loadImage(file)
  const maxSide = 1800
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image compression is not available')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.84)
}

function initialEdits(scan: BillScan, materialsById: Map<string, Material>, defaultUnit: string) {
  const edits: Record<string, LineEdit> = {}
  for (const line of scan.lines) {
    const matched = line.materialId ? materialsById.get(line.materialId) : undefined
    const topCandidate = line.candidateMatches?.[0]
    const materialId = line.materialId ?? topCandidate?.materialId ?? ''
    const material = materialId ? materialsById.get(materialId) : undefined
    const unit = line.unit ?? matched?.unit ?? material?.unit ?? topCandidate?.unit ?? defaultUnit
    const purchasePrice = line.purchasePrice ?? material?.purchasePrice ?? 0
    edits[line.id] = {
      action: line.quantity && line.quantity > 0 ? 'APPLY' : 'SKIP',
      createNew: !materialId,
      materialId,
      materialName: line.scannedName,
      unit,
      quantity: asInputNumber(line.quantity),
      purchasePrice: asInputNumber(purchasePrice),
      lineTotal: asInputNumber(line.lineTotal),
      salePrice: asInputNumber(material?.salePrice ?? purchasePrice),
    }
  }
  return edits
}

export function BillScanPanel({
  materials,
  units,
  preferredUnits,
  materialLabel = 'Material',
  inventoryLabel = 'Inventory',
  onClose,
  onImported,
}: {
  materials: Material[]
  units?: string[]
  preferredUnits?: string[]
  materialLabel?: string
  inventoryLabel?: string
  onClose: () => void
  onImported?: (message: string) => void
}) {
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) => (language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en)
  const scanBill = useScanPurchaseBill()
  const commitBill = useCommitPurchaseBillScan()
  const [preview, setPreview] = useState('')
  const [scan, setScan] = useState<BillScan | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, LineEdit>>({})
  const [error, setError] = useState('')

  const materialsById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials])
  const allUnits = useMemo(() => (units?.length ? units : fallbackUnits), [units])
  const { preferred, others: otherUnits } = useMemo(
    () => splitPreferredUnits(allUnits, preferredUnits ?? []),
    [allUnits, preferredUnits]
  )
  const defaultUnit = preferred[0] ?? allUnits[0] ?? 'pieces'
  const hasLines = (scan?.lines.length ?? 0) > 0
  const invalidLineCount = useMemo(() => {
    if (!scan) return 0
    return scan.lines.filter((line) => {
      const edit = edits[line.id]
      if (!edit || edit.action === 'SKIP') return false
      const quantity = Number(edit.quantity)
      const purchasePrice = Number(edit.purchasePrice)
      const salePrice = Number(edit.salePrice)
      if (!Number.isFinite(quantity) || quantity <= 0) return true
      if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return true
      if (!edit.unit.trim()) return true
      if (edit.createNew) return !edit.materialName.trim() || !Number.isFinite(salePrice) || salePrice < 0
      return !edit.materialId
    }).length
  }, [edits, scan])
  const applyCount = scan?.lines.filter((line) => edits[line.id]?.action === 'APPLY').length ?? 0

  function updateLine(id: string, patch: Partial<LineEdit>) {
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setWarnings([])
    try {
      const dataUrl = await compressBillImage(file)
      setPreview(dataUrl)
      const result = await scanBill.mutateAsync({ fileName: file.name, dataUrl })
      setScan(result.scan)
      setWarnings(result.warnings ?? [])
      setEdits(initialEdits(result.scan, materialsById, defaultUnit))
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? t('Bill scan failed', 'बिल स्कैन विफल हुआ'))
    }
  }

  async function handleCommit() {
    if (!scan) return
    setError('')
    try {
      const result = await commitBill.mutateAsync({
        scanId: scan.id,
        lines: scan.lines.map((line) => {
          const edit = edits[line.id]
          const quantity = Number(edit.quantity || line.quantity || 1)
          const purchasePrice = Number(edit.purchasePrice || line.purchasePrice || 0)
          return {
            lineId: line.id,
            action: edit.action,
            materialId: edit.action === 'APPLY' && !edit.createNew ? edit.materialId : undefined,
            createMaterial: edit.action === 'APPLY' && edit.createNew
              ? {
                  name: edit.materialName.trim(),
                  unit: edit.unit,
                  salePrice: Number(edit.salePrice || edit.purchasePrice || 0),
                }
              : undefined,
            unit: edit.unit,
            quantity,
            purchasePrice,
            lineTotal: edit.lineTotal ? Number(edit.lineTotal) : null,
          }
        }),
      })
      onImported?.(
        language === 'hi'
          ? `${result.materialCount} मटेरियल में ${result.importedLineCount} बिल लाइन आयात हुईं।`
          : `${result.importedLineCount} bill line(s) imported across ${result.materialCount} ${materialLabel.toLowerCase()}(s).`,
      )
      setScan(null)
      setPreview('')
      setWarnings([])
      setEdits({})
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('Failed to import bill', 'बिल आयात नहीं हो सका'))
    }
  }

  return (
    <Card className="mb-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{t('Purchase bill import', 'खरीद बिल आयात')}</div>
          <div className="mt-1 text-sm text-stone-600 dark:text-slate-300">
            {t('Upload the seller bill, review scanned items, then commit stock in one batch.', 'विक्रेता का बिल अपलोड करें, स्कैन आइटम जांचें, फिर एक साथ स्टॉक में जोड़ें।')}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="self-start rounded-lg border border-stone-200 px-3 py-1.5 text-xs hover:bg-stone-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {t('Close', 'बंद करें')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              className="sr-only"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <span className="text-sm font-medium text-slate-900 dark:text-white">{t('Upload bill image', 'बिल इमेज अपलोड करें')}</span>
            <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">JPG, PNG, or WEBP</span>
          </label>
          {preview && (
            <img
              src={preview}
              alt={t('Uploaded bill preview', 'अपलोड बिल प्रीव्यू')}
              className="max-h-72 w-full rounded-xl border border-stone-200 object-contain dark:border-slate-700"
            />
          )}
          {scanBill.isPending && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              {t(`Scanning bill and matching ${materialLabel.toLowerCase()}s...`, 'बिल स्कैन हो रहा है और मटेरियल मिलाए जा रहे हैं...')}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {scanBill.isPending && <PageLoader />}

          {!scanBill.isPending && !scan && (
            <div className="rounded-xl border border-stone-200 bg-white/70 p-6 text-center text-sm text-stone-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              {t('Choose a clear bill photo to start.', 'शुरू करने के लिए बिल की साफ फोटो चुनें।')}
            </div>
          )}

          {scan && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('Supplier', 'आपूर्तिकर्ता')}</div>
                  <div className="truncate text-sm font-medium">{scan.supplierName ?? t('Unknown', 'अज्ञात')}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('Invoice', 'इनवॉइस')}</div>
                  <div className="truncate text-sm font-medium">{scan.invoiceNumber ?? t('Not read', 'पढ़ा नहीं गया')}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('Total', 'कुल')}</div>
                  <div className="text-sm font-medium">{scan.totalAmount === null ? t('Not read', 'पढ़ा नहीं गया') : fmt(scan.totalAmount)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('Scan confidence', 'स्कैन भरोसा')}</div>
                  <Badge variant={confidenceVariant(scan.confidence)}>{scoreLabel(scan.confidence)}</Badge>
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  {warnings.map((warning) => <div key={warning}>{warning}</div>)}
                </div>
              )}

              {scan.notes && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {scan.notes}
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-slate-700">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="bg-stone-50 text-left text-stone-500 dark:bg-slate-950 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('Line', 'लाइन')}</th>
                      <th className="px-3 py-2 font-medium">{t(`${inventoryLabel} match`, 'इन्वेंट्री मैच')}</th>
                      <th className="px-3 py-2 font-medium">{t('Qty', 'मात्रा')}</th>
                      <th className="px-3 py-2 font-medium">{t('Unit', 'यूनिट')}</th>
                      <th className="px-3 py-2 font-medium">{t('Buy price', 'खरीद मूल्य')}</th>
                      <th className="px-3 py-2 font-medium">{t('Action', 'कार्य')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scan.lines.map((line) => {
                      const edit = edits[line.id]
                      if (!edit) return null
                      const topCandidate = line.candidateMatches?.[0]
                      return (
                        <tr key={line.id} className="border-t border-stone-100 align-top dark:border-slate-800">
                          <td className="px-3 py-3">
                            <div className="max-w-52 font-medium text-stone-900 dark:text-white">{line.scannedName}</div>
                            <div className="mt-1 flex gap-1">
                              <Badge variant={confidenceVariant(line.confidence)}>OCR {scoreLabel(line.confidence)}</Badge>
                              <Badge variant={confidenceVariant(line.matchConfidence)}>Match {scoreLabel(line.matchConfidence)}</Badge>
                            </div>
                            {topCandidate && (
                              <div className="mt-1 text-[10px] text-stone-400">
                                Best: {topCandidate.name}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="mb-2 flex items-center gap-2">
                              <label className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                                <input
                                  type="checkbox"
                                  checked={edit.createNew}
                                  disabled={edit.action === 'SKIP'}
                                  onChange={(event) => updateLine(line.id, { createNew: event.target.checked })}
                                />
                                {t('New', 'नया')}
                              </label>
                            </div>
                            {edit.createNew ? (
                              <div className="space-y-2">
                                <input
                                  value={edit.materialName}
                                  disabled={edit.action === 'SKIP'}
                                  onChange={(event) => updateLine(line.id, { materialName: event.target.value })}
                                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                                />
                                <input
                                  type="number"
                                  value={edit.salePrice}
                                  disabled={edit.action === 'SKIP'}
                                  placeholder={t('Sale price', 'बिक्री मूल्य')}
                                  min={0}
                                  step={0.01}
                                  onChange={(event) => updateLine(line.id, { salePrice: event.target.value })}
                                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                                />
                              </div>
                            ) : (
                              <select
                                value={edit.materialId}
                                disabled={edit.action === 'SKIP'}
                                onChange={(event) => {
                                  const material = materialsById.get(event.target.value)
                                  updateLine(line.id, {
                                    materialId: event.target.value,
                                    unit: material?.unit ?? edit.unit,
                                    salePrice: asInputNumber(material?.salePrice ?? Number(edit.salePrice)),
                                  })
                                }}
                                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                              >
                                <option value="">{t(`Select ${materialLabel.toLowerCase()}`, 'मटेरियल चुनें')}</option>
                                {materials.map((material) => (
                                  <option key={material.id} value={material.id}>{material.name}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={edit.quantity}
                              disabled={edit.action === 'SKIP'}
                              min={0.01}
                              step={0.01}
                              onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                              className="w-24 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <select
                              value={edit.unit}
                              disabled={edit.action === 'SKIP'}
                              onChange={(event) => updateLine(line.id, { unit: event.target.value })}
                              className="w-24 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                            >
                              {preferred.map((unit) => <option key={`pref-${unit}`} value={unit}>{unit}</option>)}
                              {preferred.length > 0 && otherUnits.length > 0 ? <option disabled>--------</option> : null}
                              {otherUnits.map((unit) => <option key={`other-${unit}`} value={unit}>{unit}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={edit.purchasePrice}
                              disabled={edit.action === 'SKIP'}
                              min={0}
                              step={0.01}
                              onChange={(event) => updateLine(line.id, { purchasePrice: event.target.value })}
                              className="w-28 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                            />
                            {line.lineTotal !== null && (
                              <div className="mt-1 text-[10px] text-stone-400">Line: {fmt(line.lineTotal)}</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <select
                              value={edit.action}
                              onChange={(event) => updateLine(line.id, { action: event.target.value as 'APPLY' | 'SKIP' })}
                              className="w-24 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                            >
                              <option value="APPLY">{t('Apply', 'लागू करें')}</option>
                              <option value="SKIP">{t('Skip', 'छोड़ें')}</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {error && <div className="text-xs text-red-600">{error}</div>}
              {invalidLineCount > 0 && (
                <div className="text-xs text-red-600">
                  {language === 'hi'
                    ? `${invalidLineCount} लागू लाइन के लिए सही मटेरियल, मात्रा, यूनिट और मूल्य जरूरी है।`
                    : `${invalidLineCount} applied line(s) need a valid ${materialLabel.toLowerCase()}, quantity, unit, and price.`}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!hasLines || applyCount === 0 || invalidLineCount > 0 || commitBill.isPending}
                  onClick={handleCommit}
                  className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950"
                >
                  {commitBill.isPending
                    ? t('Importing...', 'आयात हो रहा है...')
                    : language === 'hi'
                      ? `${applyCount} लाइन आयात करें`
                      : `Import ${applyCount} line(s)`}
                </button>
                <button
                  type="button"
                  disabled={commitBill.isPending}
                  onClick={() => {
                    setScan(null)
                    setPreview('')
                    setWarnings([])
                    setEdits({})
                    setError('')
                  }}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-xs hover:bg-stone-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {t('Scan another', 'दूसरा बिल स्कैन करें')}
                </button>
              </div>
            </div>
          )}

          {error && !scan && <div className="mt-3 text-xs text-red-600">{error}</div>}
        </div>
      </div>
    </Card>
  )
}

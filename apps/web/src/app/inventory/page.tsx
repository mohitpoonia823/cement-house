'use client'
import { AppShell }    from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader }  from '@/components/ui/Spinner'
import { useInventory, useStockIn, useCreateMaterial, useDeleteMaterial, useBulkDeleteMaterials } from '@/hooks/useInventory'
import { fmt }         from '@/lib/utils'
import { useState }    from 'react'
import { useQuery }    from '@tanstack/react-query'
import { api }         from '@/lib/api'
import { useI18n } from '@/lib/i18n'

function useMovements(materialId: string) {
  return useQuery({
    queryKey: ['movements', materialId],
    queryFn:  () => api.get(`/api/inventory/${materialId}/movements`).then(r => r.data.data),
    enabled:  !!materialId,
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

const UNITS = ['bags', 'MT', 'feet', 'pieces', 'kg', 'litres']

export default function InventoryPage() {
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) => (language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en)
  const { data: materials, isLoading } = useInventory()
  const stockIn        = useStockIn()
  const createMaterial = useCreateMaterial()
  const deleteMaterial = useDeleteMaterial()
  const bulkDelete     = useBulkDeleteMaterials()

  const [selectedId,  setSelectedId]  = useState('')
  const [showStockIn, setShowStockIn] = useState(false)
  const [showAddNew,  setShowAddNew]  = useState(false)
  const [siQty,   setSiQty]   = useState('')
  const [siPrice, setSiPrice] = useState('')
  const [siNote,  setSiNote]  = useState('')
  const [siError, setSiError] = useState('')

  // New material form
  const [newForm, setNewForm] = useState({
    name: '', unit: 'bags', stockQty: '', minThreshold: '', maxThreshold: '', purchasePrice: '', salePrice: ''
  })
  const [newError, setNewError] = useState('')

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const list = materials ?? []
  const allSelected = list.length > 0 && selected.size === list.length

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(list.map((m: any) => m.id)))
  }

  const { data: movements } = useMovements(selectedId)

  async function handleStockIn(e: React.FormEvent) {
    e.preventDefault(); setSiError('')
    try {
      await stockIn.mutateAsync({ materialId: selectedId, quantity: Number(siQty), purchasePrice: Number(siPrice), reason: siNote || 'Purchase' })
      setShowStockIn(false); setSiQty(''); setSiPrice(''); setSiNote('')
    } catch (err: any) { setSiError(err.response?.data?.error ?? 'Failed') }
  }

  async function handleCreateMaterial(e: React.FormEvent) {
    e.preventDefault(); setNewError('')
    try {
      await createMaterial.mutateAsync({
        ...newForm,
        stockQty: Number(newForm.stockQty || 0),
        minThreshold: Number(newForm.minThreshold || 0),
        maxThreshold: newForm.maxThreshold === '' ? undefined : Number(newForm.maxThreshold),
        purchasePrice: Number(newForm.purchasePrice || 0),
        salePrice: Number(newForm.salePrice || 0),
      })
      setShowAddNew(false)
      setNewForm({ name: '', unit: 'bags', stockQty: '', minThreshold: '', maxThreshold: '', purchasePrice: '', salePrice: '' })
    } catch (err: any) { setNewError(err.response?.data?.error ?? 'Failed to create material') }
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}" from inventory? It will be deactivated.`)) return
    deleteMaterial.mutate(id, { onSuccess: () => {
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
      if (selectedId === id) setSelectedId('')
    }})
  }

  function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} selected material(s) from inventory?`)) return
    bulkDelete.mutate([...selected], { onSuccess: () => {
      setSelected(new Set())
      if (selected.has(selectedId)) setSelectedId('')
    }})
  }

  const selectedMat = list.find((m: any) => m.id === selectedId)

  return (
    <AppShell>
      <SectionHeader
        eyebrow={language === 'hi' ? 'इन्वेंट्री एनालिटिक्स' : language === 'hinglish' ? 'Inventory analytics' : 'Inventory analytics'}
        title={language === 'hi' ? 'इन्वेंट्री नियंत्रण' : language === 'hinglish' ? 'Inventory control' : 'Inventory control'}
        description={language === 'hi' ? 'स्टॉक, रीप्लेनिशमेंट और प्राइसिंग को एक जगह से मैनेज करें।' : language === 'hinglish' ? 'Stock, replenishment aur pricing ek jagah manage karo.' : 'Balance stock health, replenishment activity, and pricing signals without losing the operational workflows.'}
        action={
          <button onClick={() => setShowAddNew(true)}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950">
            {language === 'hi' ? '+ मटेरियल जोड़ें' : language === 'hinglish' ? '+ Material add karo' : '+ Add material'}
          </button>
        }
      />

      <MetricGrid className="mb-6">
        <MetricCard label={t('Active materials', 'सक्रिय मटेरियल')} value={String(list.length)} hint={t('Live catalog count', 'लाइव कैटलॉग संख्या')} />
        <MetricCard label={t('Low / out of stock', 'लो / आउट ऑफ स्टॉक')} value={String(list.filter((m: any) => m.stockStatus !== 'OK').length)} hint={t('Items needing replenishment', 'जिन आइटम को रीप्लेनिशमेंट चाहिए')} tone="danger" />
        <MetricCard label={t('Inventory value', 'इन्वेंट्री वैल्यू')} value={fmt(list.reduce((sum: number, m: any) => sum + Number(m.stockQty) * Number(m.purchasePrice), 0))} hint={t('Estimated purchase-side stock value', 'अनुमानित खरीद-आधारित स्टॉक मूल्य')} tone="brand" />
        <MetricCard label={t('Selected material', 'चयनित मटेरियल')} value={selectedMat?.name ?? t('None', 'कोई नहीं')} hint={selectedMat ? `${Number(selectedMat.stockQty).toFixed(1)} ${selectedMat.unit} ${t('available', 'उपलब्ध')}` : t('Open a card for movement details', 'मूवमेंट विवरण के लिए कार्ड चुनें')} tone="default" />
      </MetricGrid>

      {/* Add new material form */}
      {showAddNew && (
        <Card className="mb-4">
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">{t('New material', 'नया मटेरियल')}</div>
          <form onSubmit={handleCreateMaterial} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">{t('Name *', 'नाम *')}</label>
                <input type="text" value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. PPC Cement" required
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Unit *', 'यूनिट *')}</label>
                <select value={newForm.unit} onChange={e => setNewForm(p => ({ ...p, unit: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Initial stock', 'प्रारंभिक स्टॉक')}</label>
                <input type="number" value={newForm.stockQty} placeholder="0" onChange={e => setNewForm(p => ({ ...p, stockQty: e.target.value }))}
                  min={0} step={0.01}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Min threshold', 'न्यूनतम सीमा')}</label>
                <input type="number" value={newForm.minThreshold} placeholder="0" onChange={e => setNewForm(p => ({ ...p, minThreshold: e.target.value }))}
                  min={0} step={0.01}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Max threshold', 'अधिकतम सीमा')}</label>
                <input type="number" value={newForm.maxThreshold} placeholder="0" onChange={e => setNewForm(p => ({ ...p, maxThreshold: e.target.value }))}
                  min={0} step={0.01}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Purchase price (₹) *', 'खरीद मूल्य (₹) *')}</label>
                <input type="number" value={newForm.purchasePrice} placeholder="0" onChange={e => setNewForm(p => ({ ...p, purchasePrice: e.target.value }))}
                  min={0} step={0.01} required
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Sale price (₹) *', 'बिक्री मूल्य (₹) *')}</label>
                <input type="number" value={newForm.salePrice} placeholder="0" onChange={e => setNewForm(p => ({ ...p, salePrice: e.target.value }))}
                  min={0} step={0.01} required
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={createMaterial.isPending}
                className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createMaterial.isPending ? (language === 'hi' ? 'सेव हो रहा है...' : language === 'hinglish' ? 'Save ho raha hai...' : 'Saving...') : (language === 'hi' ? 'मटेरियल सेव करें' : language === 'hinglish' ? 'Material save karo' : 'Save material')}
              </button>
              <button type="button" onClick={() => setShowAddNew(false)}
                className="text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800">{language === 'hi' ? 'रद्द करें' : 'Cancel'}</button>
            </div>
            {newError && <div className="text-xs text-red-600">{newError}</div>}
          </form>
        </Card>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-950">
          <span className="text-xs font-medium text-red-800 dark:text-red-200">
            {selected.size} material{selected.size > 1 ? 's' : ''} selected
          </span>
          <button onClick={handleBulkDelete} disabled={bulkDelete.isPending}
            className="text-xs px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 font-medium transition-colors">
            {bulkDelete.isPending ? (language === 'hi' ? 'हटाया जा रहा है...' : language === 'hinglish' ? 'Delete ho raha hai...' : 'Deleting...') : (language === 'hi' ? 'चयनित हटाएं' : language === 'hinglish' ? 'Selected delete karo' : 'Delete selected')}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="ml-0 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 md:ml-auto">
            {language === 'hi' ? 'चयन हटाएं' : language === 'hinglish' ? 'Selection clear karo' : 'Clear selection'}
          </button>
        </div>
      )}

      {/* Select all toggle */}
      {list.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={allSelected} onChange={toggleAll}
            className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
          <span className="text-xs text-stone-500">{t('Select all', 'सभी चुनें')}</span>
        </div>
      )}

      {/* Material cards grid */}
      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? <div className="md:col-span-2 xl:col-span-3"><PageLoader /></div> :
          list.map((m: any) => {
            const isSelected = selected.has(m.id)
            return (
              <div key={m.id} className={`relative rounded-xl border transition-all ${
                selectedId === m.id
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950'
                  : isSelected
                    ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-stone-300 dark:hover:border-slate-500'
              } ${m.stockStatus === 'LOW' && selectedId !== m.id ? 'border-amber-300' : ''} ${m.stockStatus === 'OUT_OF_STOCK' && selectedId !== m.id ? 'border-red-400' : ''}`}>
                {/* Checkbox overlay */}
                <div className="absolute top-3 left-3 z-10">
                  <input type="checkbox" checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); toggleOne(m.id) }}
                    className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                </div>
                <button onClick={() => setSelectedId(m.id === selectedId ? '' : m.id)}
                  className="w-full text-left p-4 pl-9">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200">{m.name}</div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={statusBadge(m.stockStatus)}>{m.stockStatus}</Badge>
                    </div>
                  </div>
                  <div className="text-xl font-medium text-stone-900 dark:text-stone-100">
                    {Number(m.stockQty).toFixed(m.unit === 'bags' ? 0 : 1)} <span className="text-sm font-normal text-stone-500 dark:text-slate-300">{m.unit}</span>
                  </div>
                  {/* Stock bar */}
                  <div className="mt-2 h-1 bg-stone-100 dark:bg-stone-800 rounded">
                    <div className="h-1 rounded transition-all"
                      style={{
                        width: `${Math.min(100, (Number(m.stockQty) / (Number(m.maxThreshold) || Number(m.stockQty) + 1)) * 100)}%`,
                        background: m.stockStatus === 'OK' ? '#639922' : m.stockStatus === 'LOW' ? '#EF9F27' : '#E24B4A',
                      }} />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-stone-400 dark:text-slate-400">
                    <span>Min: {Number(m.minThreshold)} {m.unit}</span>
                    <span>Buy: {fmt(Number(m.purchasePrice))} · Sell: {fmt(Number(m.salePrice))}</span>
                  </div>
                </button>
                {/* Delete button */}
                <button onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name) }}
                  className="absolute top-3 right-3 text-stone-300 hover:text-red-500 transition-colors text-xs z-10"
                  title="Delete material">✕</button>
              </div>
            )
          })
        }
      </div>

      {selectedId && (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Stock in form */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Stock in — {selectedMat?.name}
              </div>
              <button onClick={() => setShowStockIn(s => !s)}
                className="text-xs text-blue-600 hover:underline">
                {showStockIn ? (language === 'hi' ? 'रद्द करें' : 'Cancel') : (language === 'hi' ? '+ स्टॉक जोड़ें' : language === 'hinglish' ? '+ Stock add karo' : '+ Add stock')}
              </button>
            </div>
            {showStockIn && (
              <form onSubmit={handleStockIn} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Quantity ({selectedMat?.unit}) *</label>
                    <input type="number" value={siQty} onChange={e => setSiQty(e.target.value)}
                      placeholder="0" min={0.01} step={0.01} required
                      className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">{t('Purchase price', 'खरीद मूल्य')} (₹/{selectedMat?.unit}) *</label>
                    <input type="number" value={siPrice} onChange={e => setSiPrice(e.target.value)}
                      placeholder={String(selectedMat?.purchasePrice ?? 0)} min={0} required
                      className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Note / supplier</label>
                  <input type="text" value={siNote} onChange={e => setSiNote(e.target.value)}
                    placeholder="e.g. ACC Cement purchase"
                    className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {siError && <div className="text-xs text-red-600">{siError}</div>}
                <button type="submit" disabled={stockIn.isPending}
                  className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {stockIn.isPending ? (language === 'hi' ? 'सेव हो रहा है...' : language === 'hinglish' ? 'Save ho raha hai...' : 'Saving...') : (language === 'hi' ? 'स्टॉक में जोड़ें' : language === 'hinglish' ? 'Stock me add karo' : 'Add to stock')}
                </button>
              </form>
            )}
            {!showStockIn && (
              <div className="text-xs text-stone-400 py-4 text-center">
                Click &quot;+ Add stock&quot; to record a purchase from supplier
              </div>
            )}
          </Card>

          {/* Movement log */}
          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">{t('Recent movements', 'हाल की गतिविधियां')}</div>
            {!movements ? <PageLoader /> : movements.length === 0 ? (
              <div className="text-xs text-stone-400 py-4 text-center">{t('No movements yet', 'अभी कोई मूवमेंट नहीं')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead>
                  <tr className="border-b border-stone-100 dark:border-stone-800">
                    {[t('Date', 'तारीख'), t('Type', 'प्रकार'), t('Qty', 'मात्रा'), t('Stock after', 'स्टॉक बाद में'), t('Reason', 'कारण')].map(h => (
                      <th key={h} className="text-left py-2 pr-2 font-normal text-stone-400 dark:text-slate-300">{h}</th>
                    ))}
                  </tr>
                  </thead>
                  <tbody>
                  {movements.slice(0,10).map((mv: any) => (
                    <tr key={mv.id} className="border-b border-stone-50 dark:border-stone-800 last:border-0">
                      <td className="py-2 pr-2 text-stone-500 dark:text-slate-300">{new Date(mv.createdAt).toLocaleDateString('en-IN')}</td>
                      <td className="py-2 pr-2">
                        <Badge variant={mv.type === 'IN' ? 'success' : mv.type === 'OUT' ? 'danger' : 'default'}>
                          {mv.type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2 font-medium">{Number(mv.quantity).toFixed(1)}</td>
                      <td className="py-2 pr-2 text-stone-600 dark:text-slate-300">{Number(mv.stockAfter).toFixed(1)}</td>
                      <td className="py-2 text-stone-500 dark:text-slate-300 truncate max-w-24">{mv.reason ?? mv.order?.orderNumber ?? '—'}</td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  )
}

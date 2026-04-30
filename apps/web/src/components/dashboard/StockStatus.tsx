import Link from 'next/link'

interface Material {
  name: string
  qty: number
  unit: string
  maxCapacity: number
}

const materials: Material[] = [
  { name: 'PPC cement', qty: 5188, unit: 'bags',    maxCapacity: 6300 },
  { name: 'OPC cement', qty: 320,  unit: 'bags',    maxCapacity: 1000 },
  { name: 'TMT bars',   qty: 142,  unit: 'bundles', maxCapacity: 200 },
]

function getBarColor(pct: number) {
  if (pct > 50) return 'bg-green-400'
  if (pct >= 20) return 'bg-amber-400'
  return 'bg-red-400'
}

function getStatus(pct: number) {
  if (pct > 50) return { label: 'OK', cls: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
  if (pct >= 20) return { label: 'Low', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
  return { label: 'Critical', cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
}

export function StockStatus() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Stock status</span>
        <Link href="/inventory" className="text-xs text-blue-500 cursor-pointer hover:text-blue-600">Manage {'->'}</Link>
      </div>

      {/* Material rows */}
      {materials.map((m, i) => {
        const pct = (m.qty / m.maxCapacity) * 100
        const status = getStatus(pct)
        return (
          <div
            key={m.name}
            className={`flex items-center justify-between py-2 ${
              i < materials.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{m.name}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{m.qty.toLocaleString('en-IN')} {m.unit}</div>
            </div>
            <div className="flex-1 mx-2.5 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getBarColor(pct)}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className={`rounded-full text-[10px] font-medium px-2 py-0.5 whitespace-nowrap ${status.cls}`}>
              {status.label}
            </span>
          </div>
        )
      })}

      {/* Footer */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-1 flex justify-between items-center">
        <span className="text-[11px] text-gray-400">{materials.length} items tracked</span>
        <Link href="/inventory" className="border border-gray-200 dark:border-gray-600 text-[11px] px-2.5 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          + Add purchase
        </Link>
      </div>
    </div>
  )
}

import { fmt } from '@/lib/utils'

const weekData = [
  { day: 'Mon', value: 3800 },
  { day: 'Tue', value: 5100 },
  { day: 'Wed', value: 3200 },
  { day: 'Thu', value: 6800 },
  { day: 'Fri', value: 4500 },
  { day: 'Sat', value: 2800 },
  { day: 'Today', value: 4200 },
]

const maxValue = Math.max(...weekData.map(d => d.value))
const weekTotal = weekData.reduce((s, d) => s + d.value, 0)

function fmtShort(n: number) {
  return n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`
}

export function WeeklyRevenue() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Weekly revenue trend</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{fmt(weekTotal)} This week</span>
          <span className="text-green-600 dark:text-green-400 text-xs font-medium">↑18% vs last week</span>
        </div>
      </div>

      {/* Spark bars */}
      <div className="flex gap-1.5 mt-3">
        {weekData.map((d, i) => {
          const isToday = i === weekData.length - 1
          const heightPct = (d.value / maxValue) * 100
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-10 flex items-end">
                <div
                  className={`w-full rounded-t ${isToday ? 'bg-blue-500' : 'bg-blue-200 dark:bg-blue-800'}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className={`text-[9px] ${isToday ? 'text-blue-500 font-medium' : 'text-gray-400'}`}>
                {d.day}
              </span>
              <span className={`text-[9px] ${isToday ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {fmtShort(d.value)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Divider + mini stats */}
      <div className="border-t border-gray-100 dark:border-gray-700 mt-3 pt-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { value: '1', label: 'Orders today' },
            { value: fmt(4200), label: 'Avg order value' },
            { value: '12', label: 'Active customers' },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.value}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

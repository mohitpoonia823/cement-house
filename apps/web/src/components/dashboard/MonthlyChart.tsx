'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const labels = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4 (now)']
const values = [68000, 54000, 82000, 28600]
const monthTotal = values.reduce((s, v) => s + v, 0)

function fmtLakh(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(0)}k`
  return `₹${n}`
}

const data = {
  labels,
  datasets: [
    {
      data: values,
      backgroundColor: values.map((_, i) =>
        i === values.length - 1 ? '#3B82F6' : '#BFDBFE'
      ),
      borderRadius: 4,
      barPercentage: 0.6,
      categoryPercentage: 0.7,
    },
  ],
}

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => fmtLakh(ctx.raw),
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: {
        font: { size: 10 },
        color: '#9CA3AF',
      },
    },
    y: {
      grid: {
        color: '#F3F4F6',
      },
      border: { display: false },
      ticks: {
        font: { size: 10 },
        color: '#9CA3AF',
        callback: (value: any) => fmtLakh(value),
      },
    },
  },
} as const

export function MonthlyChart() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Monthly overview</span>
        <span className="text-xs text-gray-400">April 2026</span>
      </div>

      {/* Chart */}
      <div className="relative h-40 mt-3">
        <Bar data={data} options={options as any} />
      </div>

      {/* Footer stats */}
      <div className="grid grid-cols-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-center">
        <div>
          <div className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{fmtLakh(monthTotal)}</div>
          <div className="text-[10px] text-gray-400">Month total</div>
        </div>
        <div>
          <div className="text-[13px] font-medium text-green-600 dark:text-green-400">↑22%</div>
          <div className="text-[10px] text-gray-400">vs Mar</div>
        </div>
        <div>
          <div className="text-[13px] font-medium text-gray-900 dark:text-gray-100">44</div>
          <div className="text-[10px] text-gray-400">Total orders</div>
        </div>
      </div>
    </div>
  )
}

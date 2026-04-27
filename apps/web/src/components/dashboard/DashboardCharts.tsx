'use client'

import { fmt } from '@/lib/utils'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const palette = ['#0f766e', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6']

function compactCurrency(amount: number) {
  if (amount === 0) return 'Rs 0'
  return `Rs ${new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: amount >= 100000 ? 1 : 0,
  }).format(amount)}`
}

type RevenuePoint = {
  date: string
  tooltipLabel?: string
  sales: number
  collected: number
  orders?: number
}

interface RevenueRhythmChartProps {
  data: RevenuePoint[]
  selectedLabel: string
}

export function RevenueRhythmChart({ data, selectedLabel }: RevenueRhythmChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="collectionFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
          tick={{ fill: '#64748b', fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={84}
          tick={{ fill: '#64748b', fontSize: 12 }}
          tickFormatter={(value: number) => compactCurrency(value)}
        />
        <Tooltip
          labelFormatter={(_, payload) => (Array.isArray(payload) ? payload[0]?.payload?.tooltipLabel ?? selectedLabel : selectedLabel)}
          formatter={(value: number, name: string, item: { payload?: { orders?: number } }) => {
            if (name === 'orders') return [item?.payload?.orders ?? 0, 'Orders']
            return [fmt(value), name === 'sales' ? 'Sales' : 'Collections']
          }}
        />
        <Area type="monotone" dataKey="sales" name="sales" stroke="#0ea5e9" strokeWidth={3} fill="url(#salesFill)" />
        <Area type="monotone" dataKey="collected" name="collected" stroke="#10b981" strokeWidth={3} fill="url(#collectionFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface DonutBreakdownProps {
  title: string
  data: Array<{ name: string; value: number }>
}

export function DonutBreakdown({ title, data }: DonutBreakdownProps) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-slate-950 dark:text-white">{title}</div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={42} outerRadius={66} paddingAngle={3}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 space-y-2">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
              {entry.name}
            </div>
            <span className="font-semibold text-slate-950 dark:text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

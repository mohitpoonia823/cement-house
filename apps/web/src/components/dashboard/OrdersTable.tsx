'use client'

import { useState } from 'react'
import { fmt } from '@/lib/utils'
import Link from 'next/link'

type OrderStatus = 'confirmed' | 'pending' | 'delivered'

interface Order {
  id: string
  customer: string
  items: number
  amount: number
  status: OrderStatus
}

const orders: Order[] = [
  { id: '#1042', customer: 'Rajesh Builders',   items: 3, amount: 4200, status: 'confirmed' },
]

const tabs = ['All', 'Confirmed', 'Pending', 'Delivered'] as const

const statusClasses: Record<OrderStatus, string> = {
  confirmed: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending:   'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  delivered: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

export function OrdersTable() {
  const [activeTab, setActiveTab] = useState<string>('All')

  const filtered = activeTab === 'All'
    ? orders
    : orders.filter(o => o.status.toLowerCase() === activeTab.toLowerCase())

  // Count per status
  const counts = {
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    pending:   orders.filter(o => o.status === 'pending').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  }
  const total = orders.length || 1

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Today&apos;s orders</span>
        <Link href="/orders" className="text-xs text-blue-500 cursor-pointer hover:text-blue-600">View all →</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-100 dark:border-gray-700 mb-3">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-[11px] pb-2 mr-4 cursor-pointer transition-colors ${
              activeTab === tab
                ? 'text-blue-500 font-medium border-b-2 border-blue-500 -mb-px'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead>
          <tr>
            {['Order', 'Customer', 'Items', 'Amount', 'Status'].map(h => (
              <th key={h} className="text-[10px] uppercase tracking-wider text-gray-400 font-medium text-left pb-2 border-b border-gray-100 dark:border-gray-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-400 text-xs">No orders</td>
            </tr>
          )}
          {filtered.map((o, i) => (
            <tr key={o.id}>
              <td className={`py-2 text-gray-500 dark:text-gray-400 ${i < filtered.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
                {o.id}
              </td>
              <td className={`py-2 text-gray-900 dark:text-gray-100 font-medium ${i < filtered.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
                {o.customer}
              </td>
              <td className={`py-2 text-gray-500 dark:text-gray-400 ${i < filtered.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
                {o.items} item{o.items !== 1 ? 's' : ''}
              </td>
              <td className={`py-2 text-gray-900 dark:text-gray-100 font-medium ${i < filtered.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
                {fmt(o.amount)}
              </td>
              <td className={`py-2 ${i < filtered.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
                <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClasses[o.status]}`}>
                  {o.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {/* Status breakdown bar */}
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="text-[11px] text-gray-400 mb-1.5">Order status breakdown</div>
        <div className="h-1.5 rounded-full flex overflow-hidden bg-gray-100 dark:bg-gray-700">
          {counts.confirmed > 0 && (
            <div className="bg-green-400" style={{ flex: counts.confirmed / total }} />
          )}
          {counts.pending > 0 && (
            <div className="bg-amber-400" style={{ flex: counts.pending / total }} />
          )}
          {counts.delivered > 0 && (
            <div className="bg-blue-400" style={{ flex: counts.delivered / total }} />
          )}
        </div>
        <div className="flex gap-3 mt-1.5">
          {[
            { label: 'Confirmed', color: 'bg-green-400', count: counts.confirmed },
            { label: 'Pending',   color: 'bg-amber-400', count: counts.pending },
            { label: 'Delivered', color: 'bg-blue-400',  count: counts.delivered },
          ].map(s => (
            <div key={s.label} className="text-[10px] flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <span className={`w-2 h-2 rounded-sm ${s.color} inline-block`} />
              {s.label} ({s.count})
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

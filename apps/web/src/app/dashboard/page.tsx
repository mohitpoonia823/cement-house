'use client'
import { AppShell }    from '@/components/layout/AppShell'
import { KpiCard, Card } from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader }  from '@/components/ui/Spinner'
import { useAuthStore } from '@/store/auth'
import { useDashboard } from '@/hooks/useDashboard'
import { useOrders }   from '@/hooks/useOrders'
import { useQuery }    from '@tanstack/react-query'
import { api }         from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'
import Link            from 'next/link'

function useTodayOrders() {
  return useOrders({ page: 1 } as any)
}

function useLedgerSummary() {
  return useQuery({
    queryKey: ['ledger', 'summary'],
    queryFn: () => api.get('/api/ledger/summary/all').then(r => r.data.data),
  })
}

function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/api/inventory').then(r => r.data.data),
  })
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: kpis,      isLoading: kLoading } = useDashboard()
  const { data: orders,    isLoading: oLoading } = useTodayOrders()
  const { data: ledger,    isLoading: lLoading } = useLedgerSummary()
  const { data: inventory, isLoading: iLoading } = useInventory()

  if (kLoading) return <AppShell><PageLoader /></AppShell>

  const topDues   = (ledger ?? []).sort((a: any, b: any) => b.balance - a.balance).slice(0, 5)
  const lowStock  = (inventory ?? []).filter((m: any) => m.stockStatus !== 'OK').slice(0, 4)
  const todayList = (orders?.items ?? []).slice(0, 6)

  return (
    <AppShell>
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard label="Today's sales"     value={fmt(kpis?.todaySales ?? 0)}
          sub={`${kpis?.todayOrderCount ?? 0} orders`} />
        <KpiCard label="Cash collected"    value={fmt(kpis?.cashCollected ?? 0)} />
        <KpiCard label="Total outstanding" value={fmt(kpis?.totalOutstanding ?? 0)}
          sub="across all parties" subColor="text-red-500" />
        <KpiCard label="Low stock alerts"  value={String(kpis?.lowStockCount ?? 0)}
          sub="materials below threshold" subColor={kpis?.lowStockCount ? 'text-amber-500' : 'text-stone-400'} />
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Left: today's orders */}
        <div className="col-span-3 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Today's orders</div>
              <Link href="/orders" className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>
            {oLoading ? <PageLoader /> : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-stone-800">
                    {['#','Customer','Items','Amount','Status'].map(h => (
                      <th key={h} className="text-left py-2 font-normal text-stone-400 pb-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todayList.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-stone-400">No orders today</td></tr>
                  )}
                  {todayList.map((o: any) => (
                    <tr key={o.id} className="border-b border-stone-50 dark:border-stone-800 last:border-0">
                      <td className="py-2 text-stone-400">{o.orderNumber?.slice(-4)}</td>
                      <td className="py-2 font-medium text-stone-800 dark:text-stone-200">{o.customer?.name}</td>
                      <td className="py-2 text-stone-500">{o.items?.length} item{o.items?.length !== 1 ? 's' : ''}</td>
                      <td className="py-2 font-medium">{fmt(Number(o.totalAmount))}</td>
                      <td className="py-2"><Badge variant={statusBadge(o.status)}>{o.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Stock alerts */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Stock status</div>
              <Link href="/inventory" className="text-xs text-blue-600 hover:underline">Manage</Link>
            </div>
            {iLoading ? <PageLoader /> : (
              <div className="space-y-2">
                {(inventory ?? []).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-stone-700 dark:text-stone-300">{m.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-stone-500 text-xs">{Number(m.stockQty).toFixed(1)} {m.unit}</span>
                      <Badge variant={statusBadge(m.stockStatus)}>{m.stockStatus}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: top dues */}
        <div className="col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Top outstanding</div>
              <Link href="/khata" className="text-xs text-blue-600 hover:underline">Khata</Link>
            </div>
            {lLoading ? <PageLoader /> : (
              <div className="space-y-1">
                {topDues.length === 0 && <div className="text-xs text-stone-400 py-4 text-center">All clear!</div>}
                {topDues.map((c: any) => (
                  <Link key={c.customerId} href={`/khata?customer=${c.customerId}`}
                    className="flex items-center justify-between py-2 border-b border-stone-50 dark:border-stone-800 last:border-0 hover:bg-stone-50 dark:hover:bg-stone-800 rounded px-1 transition-colors">
                    <div>
                      <div className="text-xs font-medium text-stone-800 dark:text-stone-200">{c.customerName}</div>
                      <div className="text-[10px] text-stone-400">{c.riskTag}</div>
                    </div>
                    <div className={`text-xs font-medium ${c.balance > 50000 ? 'text-red-600' : 'text-amber-600'}`}>
                      {fmt(c.balance)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Quick actions</div>
            <div className="space-y-2">
              {[
                { label: 'Create new order',    href: '/orders/new', perm: 'orders' },
                { label: 'Record a payment',    href: '/khata',      perm: 'ledger' },
                { label: 'Add stock purchase',  href: '/inventory',  perm: 'inventory' },
                { label: 'Create delivery',     href: '/delivery',   perm: 'delivery' },
                { label: 'Send bulk reminders', href: '/customers',  perm: 'customers' },
              ].filter(a => user?.role === 'OWNER' || user?.permissions?.includes(a.perm)).map(a => (
                <Link key={a.href} href={a.href}
                  className="block text-xs text-blue-600 hover:text-blue-800 hover:underline py-1">
                  {a.label} →
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

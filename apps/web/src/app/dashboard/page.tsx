'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useDashboard } from '@/hooks/useDashboard'
import { useCustomers, useSendReminders } from '@/hooks/useCustomers'
import { fmt, fmtDate } from '@/lib/utils'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
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

export default function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const { data: customers } = useCustomers()
  const sendReminders = useSendReminders()
  const { user } = useAuthStore()

  const overdueCustomers = (customers ?? []).filter((customer: any) => Number(customer.balance) > 0)

  async function handleSendReminders() {
    if (!overdueCustomers.length) {
      window.alert('No customers with outstanding balance found.')
      return
    }

    const confirmed = window.confirm(`Send WhatsApp reminders to ${overdueCustomers.length} customer(s) with outstanding balance?`)
    if (!confirmed) return

    try {
      const result = await sendReminders.mutateAsync(overdueCustomers.map((customer: any) => customer.id))
      window.alert(`Sent ${result.data.sent} reminder(s).`)
    } catch (error: any) {
      window.alert(error?.response?.data?.error ?? 'Failed to send reminders.')
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <PageLoader />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Business pulse"
        title="Analytics-first command center"
        description="A single operational view for revenue, collections, stock risk, customer concentration, and live delivery status."
      />

      <MetricGrid className="mb-6">
        <MetricCard label="Today's sales" value={fmt(data?.todaySales ?? 0)} hint={`${data?.todayOrderCount ?? 0} orders booked today`} tone="brand" />
        <MetricCard label="Cash collected" value={fmt(data?.cashCollected ?? 0)} hint={`${data?.collectionRate ?? 0}% lifetime collection efficiency`} tone="success" />
        <MetricCard label="Outstanding" value={fmt(data?.totalOutstanding ?? 0)} hint={`${data?.totalCustomers ?? 0} active customers in the ledger`} tone={(data?.totalOutstanding ?? 0) > 0 ? 'warning' : 'default'} />
        <MetricCard label="Inventory pressure" value={String(data?.lowStockCount ?? 0)} hint={`${data?.activeMaterials ?? 0} active SKUs being tracked`} tone={(data?.lowStockCount ?? 0) > 0 ? 'danger' : 'default'} />
      </MetricGrid>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Revenue rhythm</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Sales vs collections in the last 7 days</div>
            </div>
            <Badge variant="info">Auto refresh</Badge>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.revenueSeries ?? []}>
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
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => fmt(value)} />
                <Area type="monotone" dataKey="sales" stroke="#0ea5e9" strokeWidth={3} fill="url(#salesFill)" />
                <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={3} fill="url(#collectionFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Fulfilment</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Delivery workload</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusTile label="Total" value={data?.deliverySnapshot?.total ?? 0} tone="default" />
            <StatusTile label="Scheduled" value={data?.deliverySnapshot?.SCHEDULED ?? 0} tone="info" />
            <StatusTile label="In transit" value={data?.deliverySnapshot?.IN_TRANSIT ?? 0} tone="warning" />
            <StatusTile label="Delivered" value={data?.deliverySnapshot?.DELIVERED ?? 0} tone="success" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <MiniPie title="Order mix" data={data?.orderStatus ?? []} />
            <MiniPie title="Customer risk mix" data={data?.riskSegments ?? []} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.85fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Recent flow</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Orders moving through the system</div>
            </div>
            <Badge>{`${data?.recentOrders?.length ?? 0} tracked`}</Badge>
          </div>
          <div className="space-y-3">
            {(data?.recentOrders ?? []).map((order: any) => (
              <div key={order.id} className="rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">{order.orderNumber}</div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{order.customerName}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.itemSummary || 'Mixed material order'}</div>
                  </div>
                  <Badge variant={statusBadge(order.status)}>{order.status}</Badge>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-950 dark:text-white">{fmt(order.totalAmount)}</span>
                  <span className="text-slate-500 dark:text-slate-400">{fmtDate(order.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Customer concentration</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Top revenue accounts</div>
          </div>
          <div className="space-y-3">
            {(data?.topCustomers ?? []).map((customer: any, index: number) => (
              <div key={customer.customerId} className="rounded-[22px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">
                      {index + 1}. {customer.customerName}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Outstanding {fmt(customer.outstanding)} • {customer.riskTag}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-950 dark:text-white">{fmt(customer.totalSales)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Inventory watch</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Items needing attention</div>
          </div>
          <div className="space-y-3">
            {(data?.stockAlerts ?? []).length > 0 ? (data?.stockAlerts ?? []).map((material: any) => (
              <div key={material.id} className="rounded-[22px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">{material.name}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Threshold {material.minThreshold} {material.unit}
                    </div>
                  </div>
                  <Badge variant={statusBadge(material.status)}>{material.status}</Badge>
                </div>
                <div className="mt-4 text-sm font-semibold text-slate-950 dark:text-white">
                  {material.stockQty} {material.unit}
                </div>
              </div>
            )) : (
              <div className="rounded-[22px] border border-dashed border-slate-200/80 px-4 py-8 text-center dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-950 dark:text-white">All tracked items are healthy</div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">No low-stock or out-of-stock materials need action right now.</div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Quick actions</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Move faster</div>
          </div>
          <div className="space-y-3">
            <ActionLink title="New order" sub="Create and dispatch a sales order" href="/orders/new" />
            <ActionLink title="Record payment" sub="Update khata and clear balances" href="/khata" />
            <ActionLink title="Stock purchase" sub="Add inventory or replenish fast movers" href="/inventory" />
            <ActionLink title="Create delivery" sub="Manage challan and delivery status" href="/delivery" />
            {user?.role === 'OWNER' ? (
              <button
                onClick={handleSendReminders}
                disabled={sendReminders.isPending}
                className="w-full rounded-[22px] border border-slate-200/70 bg-white/70 px-4 py-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">
                      {sendReminders.isPending ? 'Sending reminders...' : 'Send reminders'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Trigger WhatsApp reminders for {overdueCustomers.length} customer{overdueCustomers.length === 1 ? '' : 's'} with dues
                    </div>
                  </div>
                  <Badge variant="warning">Live</Badge>
                </div>
              </button>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200/80 px-4 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Reminder sending is available for owner accounts.
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

function ActionLink({ title, sub, href }: { title: string; sub: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[22px] border border-slate-200/70 bg-white/70 px-4 py-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950 dark:text-white">{title}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
        </div>
        <span className="text-lg text-slate-300 dark:text-slate-600">+</span>
      </div>
    </Link>
  )
}

function StatusTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'default' | 'success' | 'warning' | 'info'
}) {
  const map = {
    default: 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-white',
    success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
    warning: 'bg-amber-500/12 text-amber-700 dark:text-amber-200',
    info: 'bg-sky-500/12 text-sky-700 dark:text-sky-200',
  } as const

  return (
    <div className={`rounded-[22px] p-4 ${map[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function MiniPie({ title, data }: { title: string; data: Array<{ name: string; value: number }> }) {
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

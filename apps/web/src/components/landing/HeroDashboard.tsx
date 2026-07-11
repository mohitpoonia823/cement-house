/**
 * Pure CSS/JSX mockup of the NexaHub product UI, used as the hero visual.
 * No external image — renders crisply at any DPI and adapts to dark mode.
 */
export function HeroDashboard() {
  const bars = [42, 58, 47, 66, 54, 72, 63, 81, 74, 88, 79, 96]

  return (
    <div className="relative">
      {/* soft glow behind the frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-[radial-gradient(60%_60%_at_70%_20%,rgba(99,102,241,0.18),transparent_70%)] blur-2xl"
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_70px_-20px_rgba(15,23,42,0.30)] ring-1 ring-black/[0.03] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        {/* browser chrome */}
        <div className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[10px] text-slate-400 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-800">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            app.nexahub.in
          </div>
        </div>

        <div className="flex">
          {/* sidebar */}
          <aside className="hidden w-40 shrink-0 border-r border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:block">
            <div className="flex items-center gap-2 px-1">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">N</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">NexaHub</span>
            </div>
            <nav className="mt-4 space-y-1">
              {[
                { label: 'Dashboard', active: true },
                { label: 'Orders' },
                { label: 'Inventory' },
                { label: 'Customers' },
                { label: 'Khata' },
                { label: 'Reports' },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                    item.active
                      ? 'bg-indigo-600/10 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${item.active ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  {item.label}
                </div>
              ))}
            </nav>
          </aside>

          {/* main */}
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Dashboard</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500">Tuesday, 10 July</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:inline">This month</span>
                <span className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500" />
              </div>
            </div>

            {/* KPI row */}
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                { label: 'Revenue', value: '₹84.2K', delta: '+12%', up: true },
                { label: 'Orders', value: '1,284', delta: '+8.2%', up: true },
                { label: 'Low stock', value: '23', delta: 'Reorder', up: false },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{kpi.label}</div>
                  <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{kpi.value}</div>
                  <div className={`mt-0.5 text-[9px] font-medium ${kpi.up ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {kpi.up ? '▲ ' : ''}{kpi.delta}
                  </div>
                </div>
              ))}
            </div>

            {/* chart */}
            <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Revenue trend</div>
                <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">▲ 14.2%</div>
              </div>
              <div className="mt-3 flex h-16 items-end gap-1">
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-indigo-500/40 to-indigo-500 dark:from-indigo-500/30 dark:to-indigo-400"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* recent orders */}
            <div className="mt-2.5 hidden rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60 sm:block">
              <div className="mb-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">Recent orders</div>
              <div className="space-y-2">
                {[
                  { id: '#521', name: 'Sharma Traders', status: 'Shipped', tone: 'emerald' },
                  { id: '#520', name: 'Patel Buildmart', status: 'Packing', tone: 'indigo' },
                  { id: '#519', name: 'Khan Infra', status: 'Due ₹12,400', tone: 'amber' },
                ].map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{o.id}</span>
                      {o.name}
                    </span>
                    <span
                      className={
                        o.tone === 'emerald'
                          ? 'rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : o.tone === 'indigo'
                            ? 'rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                            : 'rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                      }
                    >
                      {o.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating live chip */}
      <div className="absolute -bottom-4 -left-3 hidden items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Order #521 shipped · just now</span>
      </div>
    </div>
  )
}

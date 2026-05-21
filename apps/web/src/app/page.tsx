import Link from 'next/link'
import { InstallAppButton } from '@/components/landing/InstallAppButton'
import { ReviewsCarousel } from '@/components/landing/ReviewsCarousel'
import { VisualShowcase } from '@/components/VisualShowcase'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-4">
          <div className="flex items-center gap-3">
            <img src="/icons/nexahub-logo.jpeg" alt="NexaHub" className="h-9 w-9 rounded-xl object-cover sm:h-10 sm:w-10" />
            <span className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl">NexaHub</span>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-3">
            <InstallAppButton />
            <Link href="/auth/login" className="inline-flex items-center justify-center rounded-full px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 sm:px-4 sm:text-sm">Sign in</Link>
            <Link href="/auth/register" className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 sm:px-5 sm:py-2.5 sm:text-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto w-full max-w-[1440px] overflow-hidden rounded-[8px] px-4 pb-20 pt-10 text-center sm:px-8 lg:px-10 lg:pb-24 lg:pt-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_30%,rgba(147,197,253,0.18),transparent_36%),radial-gradient(circle_at_84%_22%,rgba(165,180,252,0.16),transparent_34%),linear-gradient(180deg,rgba(248,250,252,0.55),rgba(241,245,249,0.28))]" />
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.10)_1px,transparent_1px)] [background-size:54px_54px]" />

        <div className="pointer-events-none absolute left-10 top-20 hidden w-[190px] space-y-4 xl:block">
          <div className="rounded-xl border border-slate-200/90 bg-white/85 p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="h-0.5 w-full rounded-full bg-indigo-500" />
            <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-slate-500">Orders today</div>
            <div className="mt-1 text-[34px] font-semibold leading-none text-slate-900">1,284</div>
            <div className="mt-1 text-[10px] text-indigo-500">▲ 8.2%</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white/85 p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="h-0.5 w-full rounded-full bg-amber-500" />
            <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-slate-500">Low stock items</div>
            <div className="mt-1 text-[34px] font-semibold leading-none text-slate-900">23</div>
            <div className="mt-1 text-[10px] text-amber-500">Needs reorder</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white/85 p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="h-0.5 w-full rounded-full bg-rose-500" />
            <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-slate-500">Reports generated</div>
            <div className="mt-1 flex items-end gap-2">
              <div className="flex h-8 items-end gap-1">
                {[12, 21, 28, 24, 30].map((h, i) => (
                  <span key={i} className="w-2 rounded-sm bg-rose-300" style={{ height: `${h}px` }} />
                ))}
              </div>
              <div className="text-[24px] font-semibold leading-none text-slate-900">142</div>
            </div>
            <div className="mt-1 text-[10px] text-rose-500">this week</div>
          </div>
        </div>

        <div className="pointer-events-none absolute right-10 top-20 hidden w-[190px] space-y-4 xl:block">
          <div className="rounded-xl border border-slate-200/90 bg-white/85 p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="h-0.5 w-full rounded-full bg-emerald-500" />
            <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-slate-500">Revenue MTD</div>
            <div className="mt-1 text-[34px] font-semibold leading-none text-slate-900">₹84.2K</div>
            <div className="mt-1 text-[10px] text-emerald-500">▲ 12%</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white/85 p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="h-0.5 w-full rounded-full bg-violet-500" />
            <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-slate-500">New customers</div>
            <div className="mt-1 flex items-center justify-between">
              <div className="text-[34px] font-semibold leading-none text-slate-900">+347</div>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-4 border-violet-300 text-[10px] font-semibold text-violet-600">63%</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white/90 p-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.10)] backdrop-blur">
            <div className="h-0.5 w-full rounded-full bg-sky-500" />
            <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-slate-500">Live operational insights</div>
            <div className="mt-1 text-[10px] text-slate-600">Order #521 shipped · 2m ago</div>
            <div className="mt-1 text-[10px] text-slate-600">Inventory restocked · 18m ago</div>
            <div className="mt-1 text-[10px] text-slate-600">New customer · 42m ago</div>
          </div>
        </div>        <div className="pointer-events-none absolute left-[104px] top-[123px] hidden h-[390px] w-px border-l border-dashed border-indigo-300/70 xl:block" />
        <div className="pointer-events-none absolute right-[104px] top-[123px] hidden h-[390px] w-px border-l border-dashed border-indigo-300/70 xl:block" />

        <div className="relative">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-indigo-100/80 px-3 py-1 text-[11px] font-medium text-indigo-700 sm:px-5 sm:py-2 sm:text-sm">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Now available: Live operational insights
        </div>
        <h1 className="mx-auto mt-6 max-w-[16ch] text-[48px] font-semibold leading-[1.03] tracking-tight text-slate-950 sm:mt-8 sm:text-6xl lg:text-[64px]">
          Run your entire business from <span className="text-indigo-600 dark:text-indigo-400">one workspace</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[58ch] text-[16px] leading-[1.6] text-slate-600 sm:text-lg">
          Manage orders, inventory, customers, and reports all in one unified platform. Get real-time visibility into your operations and make faster decisions.
        </p>
        <div className="mx-auto mt-8 flex w-full max-w-md flex-col justify-center gap-2.5 sm:mt-9 sm:max-w-none sm:flex-row sm:flex-wrap sm:gap-3">
          <a href="#features" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-[15px] font-semibold text-white hover:bg-indigo-500 sm:px-8 sm:py-3 sm:text-lg">
            Explore features
          </a>
          <Link href="/auth/register" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50 sm:px-8 sm:py-3 sm:text-lg">
            Get started
          </Link>
          <Link href="/auth/login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50 sm:px-8 sm:py-3 sm:text-lg">
            Sign in
          </Link>
        </div>
        <div className="mx-auto mt-3 hidden w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white/75 px-4 py-2 text-[11px] text-slate-500 shadow-[0_6px_16px_rgba(15,23,42,0.07)] backdrop-blur sm:inline-flex">
          <span className="flex -space-x-1.5">
            {['A', 'M', 'S', 'K'].map((label, index) => (
              <span
                key={label}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white text-[9px] font-semibold text-slate-700"
                style={{
                  backgroundColor: ['#C4B5FD', '#FDE68A', '#86EFAC', '#FCA5A5'][index],
                }}
              >
                {label}
              </span>
            ))}
          </span>
          <span>9,000+ businesses run on NexaHub</span>
        </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-7xl px-4 pb-14 pt-2 text-center sm:pb-16 sm:pt-4 lg:pb-20">
        <h2 className="text-[30px] font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">Everything you need to succeed</h2>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300 sm:mt-4 sm:text-lg lg:text-xl">A complete suite of tools designed for growing businesses</p>

        <div className="mt-8 grid gap-5 sm:mt-10 sm:gap-6 md:mt-12 md:gap-7 md:grid-cols-2">
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 p-5 text-left shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-500 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.13)] sm:p-6 motion-reduce:transform-none motion-reduce:transition-none">
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -inset-y-10 -left-1/3 w-1/2 -rotate-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[220%]" />
            </div>
            <div className="mb-4 h-1 w-full rounded-full bg-indigo-500/90" />
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 motion-reduce:transform-none">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h7V4H4zM13 20h7v-5h-7zM13 11h7V4h-7zM4 20h7v-5H4z"/></svg>
            </div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">Core modules</div>
            <div className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-tight text-slate-950">All core modules in one app</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Orders, inventory, customers, khata, delivery, and reports all connected for faster decisions.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Orders', 'Inventory', 'Customers', 'Khata', 'Delivery', 'Reports'].map((tag) => (
                <span key={tag} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">{tag}</span>
              ))}
            </div>
            <div className="mt-4 text-xs font-semibold text-indigo-600">Explore modules →</div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 p-5 text-left shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-500 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.13)] sm:p-6 motion-reduce:transform-none motion-reduce:transition-none">
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -inset-y-10 -left-1/3 w-1/2 -rotate-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[220%]" />
            </div>
            <div className="mb-4 h-1 w-full rounded-full bg-emerald-500/90" />
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 motion-reduce:transform-none">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-6 10-6 10 6 10 6" /><path d="M2 12s3.5 6 10 6 10-6 10-6" /><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Live visibility</div>
            <div className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-tight text-slate-950">Live operational visibility</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Track what's selling, what is due, and what needs restocking without jumping between tools.</p>
            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />SKU-182 running low</span><span>3 units left</span></div>
              <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-indigo-500" />Order #440 dispatched</span><span>12s ago</span></div>
            </div>
            <div className="mt-4 text-xs font-semibold text-emerald-600">View live dashboard →</div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 p-5 text-left shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-500 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.13)] sm:p-6 motion-reduce:transform-none motion-reduce:transition-none">
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -inset-y-10 -left-1/3 w-1/2 -rotate-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[220%]" />
            </div>
            <div className="mb-4 h-1 w-full rounded-full bg-violet-500/90" />
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 motion-reduce:transform-none">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V9M10 20V4M16 20v-6M22 20H2"/></svg>
            </div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">Analytics</div>
            <div className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-tight text-slate-950">Smart business insights</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Real-time reports and analytics to understand your business performance at a glance.</p>
            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
              <div className="flex items-end gap-2">
                {[18, 34, 28, 40, 44, 31, 47].map((h, i) => (
                  <span key={i} className="w-5 rounded-sm bg-violet-400/90" style={{ height: `${h}px` }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>Weekly revenue</span><span className="font-semibold text-violet-600">▲ 14.2%</span></div>
            </div>
            <div className="mt-4 text-xs font-semibold text-violet-600">View full reports →</div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 p-5 text-left shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-500 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.13)] sm:p-6 motion-reduce:transform-none motion-reduce:transition-none">
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <div className="absolute -inset-y-10 -left-1/3 w-1/2 -rotate-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[220%]" />
            </div>
            <div className="mb-4 h-1 w-full rounded-full bg-amber-600/90" />
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 motion-reduce:transform-none">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 4 14h7l-1 8 10-13h-7z"/></svg>
            </div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Performance</div>
            <div className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-tight text-slate-950">Fast and reliable</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Built for speed and performance. Works seamlessly on desktop, tablet, and mobile.</p>
            <div className="mt-4 space-y-2">
              <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-2">
                <div className="flex items-center justify-between text-[11px]"><span className="text-slate-500">Uptime</span><span className="font-semibold text-amber-700">99.98%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-amber-200"><div className="h-1.5 w-[96%] rounded-full bg-amber-500" /></div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-2">
                <div className="flex items-center justify-between text-[11px]"><span className="text-slate-500">Avg response time</span><span className="font-semibold text-emerald-700">82ms</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-emerald-200"><div className="h-1.5 w-[88%] rounded-full bg-emerald-500" /></div>
              </div>
            </div>
            <div className="mt-4 text-xs font-semibold text-amber-700">Check status →</div>
          </div>
        </div>
      </section>

      <VisualShowcase />
      <ReviewsCarousel />

      <section className="bg-[#0b1389] px-4 py-14 text-center text-white sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">Ready to transform your business?</div>
          <div className="mt-3 text-base text-indigo-100 sm:mt-4 sm:text-xl lg:text-2xl">Join thousands of businesses using NexaHub to manage their operations efficiently.</div>
          <Link href="/auth/register" className="mt-8 inline-flex rounded-2xl bg-white px-6 py-2.5 text-base font-semibold text-[#0b1389] sm:mt-10 sm:px-8 sm:py-3 sm:text-xl lg:text-2xl">
            Get started
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white/70 px-4 py-8 text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 sm:py-12 lg:py-14">
        <div className="mx-auto w-full max-w-7xl rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/70 sm:p-8">
          <div className="grid gap-8 md:grid-cols-[1.15fr_2fr] md:gap-10">
            <div>
              <div className="flex items-center gap-3">
                <img src="/icons/nexahub-logo.jpeg" alt="NexaHub" className="h-10 w-10 rounded-xl object-cover" />
                <span className="text-xl font-semibold sm:text-2xl">NexaHub</span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
                Business management platform for growing companies.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 sm:text-xs">
                  Product
                </div>
                <div className="mt-3 space-y-2 text-sm sm:text-base">
                  <Link href="/features" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Features</Link>
                  <Link href="/pricing" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Pricing</Link>
                  <Link href="/security" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Security</Link>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 sm:text-xs">
                  Company
                </div>
                <div className="mt-3 space-y-2 text-sm sm:text-base">
                  <Link href="/about" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">About</Link>
                  <Link href="/blog" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Blog</Link>
                  <Link href="/careers" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Careers</Link>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 sm:text-xs">
                  Legal
                </div>
                <div className="mt-3 space-y-2 text-sm sm:text-base">
                  <Link href="/privacy" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Privacy</Link>
                  <Link href="/terms" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Terms</Link>
                  <Link href="/contact" className="block text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">Contact</Link>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-200/80 pt-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:mt-10">
            © {new Date().getFullYear()} NexaHub. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

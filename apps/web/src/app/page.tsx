import Link from 'next/link'
import { InstallAppButton } from '@/components/landing/InstallAppButton'
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

      <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-10 text-center sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-indigo-100/70 px-3 py-1 text-[11px] font-medium text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200 sm:px-5 sm:py-2 sm:text-sm">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Now available: Live operational insights
        </div>
        <h1 className="mx-auto mt-5 max-w-[18ch] text-[40px] font-semibold leading-[1.08] tracking-tight text-slate-950 dark:text-white sm:mt-8 sm:max-w-5xl sm:text-5xl lg:text-6xl">
          Run your entire business from one workspace
        </h1>
        <p className="mx-auto mt-4 max-w-[32ch] text-[17px] leading-[1.55] text-slate-600 dark:text-slate-300 sm:mt-6 sm:max-w-4xl sm:text-xl lg:text-2xl">
          Manage orders, inventory, customers, and reports all in one unified platform. Get real-time visibility into your operations and make faster decisions.
        </p>
        <div className="mx-auto mt-8 flex w-full max-w-md flex-col justify-center gap-2.5 sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap sm:gap-4">
          <a href="#features" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-[15px] font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 sm:px-8 sm:py-3 sm:text-xl lg:text-2xl">
            Explore features
          </a>
          <Link href="/auth/register" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-[15px] font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:px-8 sm:py-3 sm:text-xl lg:text-2xl">
            Get started
          </Link>
          <Link href="/auth/login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-[15px] font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:px-8 sm:py-3 sm:text-xl lg:text-2xl">
            Sign in
          </Link>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-7xl px-4 pb-14 pt-2 text-center sm:pb-16 sm:pt-4 lg:pb-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">Everything you need to succeed</h2>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300 sm:mt-4 sm:text-xl lg:text-2xl">A complete suite of tools designed for growing businesses</p>

        <div className="mt-8 grid gap-5 sm:mt-10 sm:gap-6 md:mt-12 md:gap-7 md:grid-cols-2">
          {[
            {
              title: 'All core modules in one app',
              text: 'Orders, inventory, customers, khata, delivery, and reports all connected for faster decisions.',
              icon: 'grid',
              iconWrap: 'bg-sky-100/90 text-sky-700',
            },
            {
              title: 'Live operational visibility',
              text: "Track what's selling, what is due, and what needs restocking without jumping between tools.",
              icon: 'eye',
              iconWrap: 'bg-emerald-100/90 text-emerald-700',
            },
            {
              title: 'Smart business insights',
              text: 'Real-time reports and analytics to understand your business performance at a glance.',
              icon: 'chart',
              iconWrap: 'bg-violet-100/90 text-violet-700',
            },
            {
              title: 'Fast and reliable',
              text: 'Built for speed and performance. Works seamlessly on desktop, tablet, and mobile.',
              icon: 'bolt',
              iconWrap: 'bg-amber-100/90 text-amber-700',
            },
          ].map((item, index) => (
            <div
              key={item.title}
              className={`group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-5 text-left shadow-[0_16px_36px_rgba(15,23,42,0.07)] transition-all duration-500 ease-out will-change-transform hover:-translate-y-1.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.13)] dark:border-slate-700 dark:bg-slate-900/70 sm:p-6 lg:p-8 motion-reduce:transform-none motion-reduce:transition-none ${
                item.icon === 'eye' ? 'eye-blink-trigger' : ''
              }`}
              style={{ transitionDelay: `${index * 70}ms` }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                <div className="absolute -inset-y-10 -left-1/3 w-1/2 -rotate-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[220%] dark:via-slate-300/10" />
              </div>
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 sm:mb-5 sm:h-14 sm:w-14 motion-reduce:transform-none ${item.iconWrap}`}
              >
                {item.icon === 'grid' ? <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h7V4H4zM13 20h7v-5h-7zM13 11h7V4h-7zM4 20h7v-5H4z"/></svg> : null}
                {item.icon === 'eye' ? (
                  <svg viewBox="0 0 24 24" className="eye-icon h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="2">
                    <path className="eye-lid-top" d="M2 12s3.5-6 10-6 10 6 10 6" />
                    <path className="eye-lid-bottom" d="M2 12s3.5 6 10 6 10-6 10-6" />
                    <circle className="eye-pupil" cx="12" cy="12" r="3" />
                  </svg>
                ) : null}
                {item.icon === 'chart' ? <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V9M10 20V4M16 20v-6M22 20H2"/></svg> : null}
                {item.icon === 'bolt' ? <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 4 14h7l-1 8 10-13h-7z"/></svg> : null}
              </div>
              <div className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100 sm:text-2xl lg:text-3xl">{item.title}</div>
              <div className="mt-2 text-base text-slate-600 dark:text-slate-300 sm:mt-3 sm:text-lg lg:text-2xl">{item.text}</div>
            </div>
          ))}
        </div>
      </section>

      <VisualShowcase />

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
        </div>
      </footer>
    </div>
  )
}

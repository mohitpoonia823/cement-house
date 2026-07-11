import Link from 'next/link'
import { InstallAppButton } from '@/components/landing/InstallAppButton'
import { ReviewsCarousel } from '@/components/landing/ReviewsCarousel'
import { HeroDashboard } from '@/components/landing/HeroDashboard'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Product', href: '#product' },
  { label: 'Customers', href: '#customers' },
  { label: 'Pricing', href: '/pricing' },
]

const features = [
  {
    title: 'All modules in one place',
    body: 'Orders, inventory, customers, khata, delivery, and reports connected in a single workspace — no more juggling registers and spreadsheets.',
    tags: ['Orders', 'Inventory', 'Customers', 'Khata', 'Delivery'],
    icon: (
      <path d="M4 12h7V4H4zM13 20h7v-5h-7zM13 11h7V4h-7zM4 20h7v-5H4z" />
    ),
  },
  {
    title: 'Live operational visibility',
    body: 'See what is selling, what is due, and what needs restocking in real time — without jumping between tools.',
    icon: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6" />
        <path d="M2 12s3.5 6 10 6 10-6 10-6" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: 'Reports in minutes, not days',
    body: 'Real-time analytics and one-tap reports so your team makes faster, sharper decisions every day.',
    icon: <path d="M4 20V9M10 20V4M16 20v-6M22 20H2" />,
  },
  {
    title: 'Fast and reliable everywhere',
    body: 'Built for speed on desktop, tablet, and mobile. 99.98% uptime with sub-100ms response times.',
    icon: <path d="M13 2 4 14h7l-1 8 10-13h-7z" />,
  },
]

const metrics = [
  { value: '9,000+', label: 'Businesses running on NexaHub' },
  { value: '120+', label: 'Cities across India' },
  { value: '99.98%', label: 'Platform uptime' },
  { value: '4.8/5', label: 'Average customer rating' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/icons/nexahub-logo.jpeg" alt="NexaHub" className="h-9 w-9 rounded-xl object-cover" />
            <span className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">NexaHub</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <InstallAppButton />
            <Link href="/auth/login" className="hidden rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-slate-950 dark:text-slate-200 dark:hover:text-white sm:inline-flex">
              Sign in
            </Link>
            <Link href="/auth/register" className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="text-center lg:text-left">
            <a href="#product" className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              New: Live operational insights
              <span aria-hidden>→</span>
            </a>

            <h1 className="mx-auto mt-6 max-w-[16ch] text-4xl font-semibold leading-[1.05] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:mx-0 lg:text-6xl">
              Run your entire business from{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent dark:from-indigo-400 dark:to-violet-400">
                one workspace
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg lg:mx-0">
              Orders, inventory, customers, and reports — unified in a single platform. Get real-time visibility into your operations and make faster decisions.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/auth/register"
                className="inline-flex w-full items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-600/30 sm:w-auto"
              >
                Start free — no card needed
              </Link>
              <a
                href="#product"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/70 px-6 py-3 text-base font-medium text-slate-700 backdrop-blur transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
              >
                See it in action
              </a>
            </div>

            <div className="mt-8 flex items-center justify-center gap-3 lg:justify-start">
              <span className="flex -space-x-2">
                {[
                  { label: 'A', bg: '#C4B5FD' },
                  { label: 'M', bg: '#FDE68A' },
                  { label: 'S', bg: '#86EFAC' },
                  { label: 'K', bg: '#FCA5A5' },
                ].map((a) => (
                  <span
                    key={a.label}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-slate-800 dark:border-slate-950"
                    style={{ backgroundColor: a.bg }}
                  >
                    {a.label}
                  </span>
                ))}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">9,000+</span> businesses run on NexaHub
              </span>
            </div>
          </div>

          <div className="lg:pl-4">
            <HeroDashboard />
          </div>
        </div>
      </section>

      {/* ---------- Trust strip ---------- */}
      <section className="border-y border-slate-200/60 bg-white/40 py-8 dark:border-slate-800/60 dark:bg-slate-950/30">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Trusted by distributors and traders across India
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-base font-semibold text-slate-400 dark:text-slate-600">
            {['Sharma Traders', 'Patel Buildmart', 'Khan Infra', 'Reddy Constructions', 'Nair Hardware', 'Verma Enterprises'].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Everything you need</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">
            One platform for the whole operation
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            A complete suite of tools designed for growing businesses — no add-ons, no silos.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-slate-200/70 bg-white/70 p-7 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_20px_50px_-20px_rgba(15,23,42,0.25)] dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 motion-reduce:hover:translate-y-0"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600 transition-transform duration-300 group-hover:scale-105 dark:bg-indigo-500/15 dark:text-indigo-400 motion-reduce:group-hover:scale-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.body}</p>
              {f.tags && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {f.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Product showcase ---------- */}
      <section id="product" className="relative overflow-hidden py-20 lg:py-28">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div className="order-2 lg:order-1">
            <HeroDashboard />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Live dashboard</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Your whole business, at a glance
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
              Revenue, orders, low-stock alerts, and pending payments update in real time. Spot what needs attention before it becomes a problem.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Real-time KPIs across every module',
                'Low-stock and payment-due alerts',
                'One-tap reports for any date range',
                'Works offline as an installable app',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Open your dashboard <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Metrics band ---------- */}
      <section className="border-y border-slate-200/60 bg-white/40 py-16 dark:border-slate-800/60 dark:bg-slate-950/30">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white lg:text-5xl">{m.value}</div>
              <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Reviews ---------- */}
      <div id="customers">
        <ReviewsCarousel />
      </div>

      {/* ---------- Final CTA ---------- */}
      <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-16 text-center shadow-[0_30px_80px_-30px_rgba(79,70,229,0.6)] sm:px-12 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.2),transparent_35%)]" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Ready to transform your business?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-indigo-100">
              Join thousands of businesses using NexaHub to run their operations. Get started in minutes.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/auth/register" className="inline-flex w-full items-center justify-center rounded-full bg-white px-7 py-3 text-base font-semibold text-indigo-700 transition-transform hover:scale-[1.02] sm:w-auto motion-reduce:hover:scale-100">
                Start free
              </Link>
              <Link href="/auth/login" className="inline-flex w-full items-center justify-center rounded-full border border-white/40 px-7 py-3 text-base font-medium text-white transition-colors hover:bg-white/10 sm:w-auto">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-slate-200/70 bg-white/50 px-4 py-14 text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-10 md:grid-cols-[1.4fr_2fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src="/icons/nexahub-logo.jpeg" alt="NexaHub" className="h-10 w-10 rounded-xl object-cover" />
              <span className="text-xl font-semibold">NexaHub</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
              Business management platform for growing companies. Run orders, inventory, khata, and reports from one workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {[
              { title: 'Product', links: [['Features', '/features'], ['Pricing', '/pricing'], ['Security', '/security']] },
              { title: 'Company', links: [['About', '/about'], ['Blog', '/blog'], ['Careers', '/careers']] },
              { title: 'Legal', links: [['Privacy', '/privacy'], ['Terms', '/terms'], ['Contact', '/contact']] },
            ].map((col) => (
              <div key={col.title} className={col.title === 'Legal' ? 'col-span-2 sm:col-span-1' : ''}>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{col.title}</div>
                <div className="mt-4 space-y-2.5 text-sm">
                  {col.links.map(([label, href]) => (
                    <Link key={label} href={href} className="block text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400">
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-12 w-full max-w-7xl border-t border-slate-200/70 pt-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          © {new Date().getFullYear()} NexaHub. All rights reserved.
        </div>
      </footer>
    </div>
  )
}

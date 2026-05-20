import Link from 'next/link'

export default function ContactPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute -right-16 bottom-12 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:42px_42px] dark:opacity-20" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10 dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
        <h1 className="text-3xl font-semibold text-slate-950 dark:text-slate-100 sm:text-4xl">Contact</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">Reach out for support, billing, legal, or partnership requests.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Email</div>
            <a href="mailto:mohitpoonia823@gmail.com" className="mt-2 inline-block text-base font-medium text-sky-700 hover:underline dark:text-sky-300">
              mohitpoonia823@gmail.com
            </a>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Phone</div>
            <a href="tel:+919467493834" className="mt-2 inline-block text-base font-medium text-sky-700 hover:underline dark:text-sky-300">
              +91 94674 93834
            </a>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Address</div>
            <p className="mt-2 text-base text-slate-800 dark:text-slate-100">Hisar, Haryana, India</p>
          </div>
        </div>

        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
          Support requests are typically answered within 1-2 business days.
        </p>

        <Link href="/" className="mt-8 inline-flex rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Back to Home
        </Link>
      </div>
    </main>
  )
}

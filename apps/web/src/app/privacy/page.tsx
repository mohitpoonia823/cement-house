import Link from 'next/link'

export default function PrivacyPage() {
  const effectiveDate = 'May 19, 2026'
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute -right-16 bottom-12 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:42px_42px] dark:opacity-20" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10 dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
        <h1 className="text-3xl font-semibold text-slate-950 dark:text-slate-100 sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">NexaHub • Effective Date: {effectiveDate}</p>

        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-200">
          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">1. What this policy covers</h2>
            <p>This policy explains what data we collect, why we collect it, how we use and protect it, and your choices when using NexaHub.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">2. Data we collect</h2>
            <p>We collect account and business profile data (such as name, phone number, email, business details), operational data you enter (customers, orders, inventory, ledger entries, reminders, reports), support ticket content, and billing/subscription details.</p>
            <p>When features are used, we may also process uploaded documents or images (for example purchase bills for scanning/import). Passwords are stored as secure hashes, not plain text.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">3. Payments and billing data</h2>
            <p>Payments are processed by third-party payment providers. We do not store full card data on our own servers. We keep subscription status, payment references, invoices, and transaction metadata needed for billing, compliance, and support.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">4. How we use data</h2>
            <p>We use your data to provide the service, secure accounts, process subscriptions, generate business workflows/reports, respond to support requests, prevent misuse, and comply with legal obligations.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">5. Cookies and local storage</h2>
            <p>We use essential browser storage/cookies for authentication, language/theme preferences, and app functionality. We may also use limited telemetry/logging for reliability and performance.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">6. Sharing and processors</h2>
            <p>We share data only with service providers required to run NexaHub (hosting, database, payment processors, email/SMS, infrastructure/monitoring). We do not sell personal data.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">7. Retention</h2>
            <p>We retain account and business records while your account is active and for a reasonable period afterward for legal, tax, fraud-prevention, and dispute handling obligations. Security logs may be retained for shorter operational windows.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">8. Security</h2>
            <p>We apply standard safeguards including encrypted transport (HTTPS/TLS), access controls, and production security practices. No internet system is fully risk-free, but we continuously work to reduce risk.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">9. Your rights</h2>
            <p>Subject to applicable law, you may request access, correction, deletion, or export of your personal data. To make a request, contact us using the details below.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">10. Children</h2>
            <p>NexaHub is intended for business users and not directed to children under 18.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">11. Updates</h2>
            <p>We may update this policy periodically. Material changes may be communicated in-app or through account communication channels.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">12. Contact</h2>
            <p>Email: mohitpoonia823@gmail.com</p>
            <p>Phone: 9467493834</p>
            <p>Address: Hisar, Haryana, India</p>
          </section>
        </div>

        <Link href="/" className="mt-8 inline-flex rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Back to Home
        </Link>
      </div>
    </main>
  )
}

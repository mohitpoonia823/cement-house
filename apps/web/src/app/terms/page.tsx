import Link from 'next/link'

export default function TermsPage() {
  const effectiveDate = 'May 19, 2026'
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute -right-16 bottom-12 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:42px_42px] dark:opacity-20" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10 dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
        <h1 className="text-3xl font-semibold text-slate-950 dark:text-slate-100 sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">NexaHub • Effective Date: {effectiveDate}</p>

        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-200">
          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">1. Acceptance</h2>
            <p>By accessing or using NexaHub, you agree to these Terms. If you use NexaHub for an organization, you confirm you have authority to bind that organization.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">2. Accounts</h2>
            <p>You must provide accurate information, keep credentials secure, and are responsible for activity under your account. We may suspend accounts involved in abuse, fraud, or legal violations.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">3. Subscriptions and billing</h2>
            <p>NexaHub provides paid plans and may provide trials. Paid plans renew per selected billing cycle unless cancelled. Prices, plan limits, and features may change with reasonable notice.</p>
            <p>Payments are handled by third-party processors. Taxes, GST, and statutory levies may apply as required by law.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">4. Acceptable use</h2>
            <p>You must not misuse the service, attempt unauthorized access, upload malicious content, violate others’ rights, scrape protected data, or use NexaHub for unlawful activities.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">5. Data and intellectual property</h2>
            <p>You retain ownership of data you input into NexaHub. You grant us a limited right to host/process that data solely to operate and improve the service for your account.</p>
            <p>The NexaHub software, branding, and platform IP remain owned by NexaHub and licensors.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">6. Availability and changes</h2>
            <p>We aim for reliable service but do not guarantee uninterrupted or error-free operation at all times. Features may evolve, be improved, or discontinued based on product/security/legal requirements.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">7. Termination</h2>
            <p>You may stop using NexaHub at any time. We may suspend or terminate access for material breach, fraud risk, non-payment, or legal compliance reasons.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">8. Liability</h2>
            <p>To the extent permitted by law, NexaHub is provided on an “as is” basis. We are not liable for indirect, incidental, or consequential losses resulting from your use of the service.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">9. Governing law</h2>
            <p>These Terms are governed by the laws of India. Courts with jurisdiction in Haryana, India shall have jurisdiction over disputes, subject to applicable consumer protection law.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">10. Contact</h2>
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

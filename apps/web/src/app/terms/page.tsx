import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/85 p-6 sm:p-10">
        <h1 className="text-3xl font-semibold text-slate-950 sm:text-4xl">Terms</h1>
        <p className="mt-3 text-slate-600">Understand the terms and conditions for using NexaHub services.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">
          Back to Home
        </Link>
      </div>
    </main>
  )
}
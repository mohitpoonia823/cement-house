import Link from 'next/link'
import Image from 'next/image'

const featureShowcase = [
  {
    id: 1,
    image: '/images/dashboard-analytics.png',
    title: 'Analytics Dashboard',
    text: 'Real-time visibility into your business. Monitor revenue, orders, customer metrics, and growth at a glance.',
  },
  {
    id: 2,
    image: '/images/inventory-table.png',
    title: 'Inventory Management',
    text: 'Track inventory levels across all products. Get automatic alerts for low stock and reorder recommendations.',
  },
  {
    id: 3,
    image: '/images/customer-crm.png',
    title: 'Customers & Khata',
    text: 'Maintain customer records, ledgers, dues, payment history, and credit follow-ups from one place.',
  },
  {
    id: 4,
    image: '/images/order-timeline.png',
    title: 'Order Management',
    text: 'Create, track, dispatch, and deliver orders with clear status progression and operational control.',
  },
  {
    id: 5,
    image: '/images/billing-invoice.png',
    title: 'Billing & Invoices',
    text: 'Operational billing workflows with payment tracking, due management, and cleaner financial visibility.',
  },
  {
    id: 6,
    image: '/images/reports-analytics.png',
    title: 'Reports & Insights',
    text: 'Understand trends and performance with decision-ready reports for day-to-day and strategic planning.',
  },
]

export default function FeaturesPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute -right-16 bottom-12 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:42px_42px] dark:opacity-20" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10 dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
        <h1 className="text-3xl font-semibold text-slate-950 dark:text-slate-100 sm:text-4xl">Features</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">NexaHub combines core operations in one connected workspace.</p>

        <div className="mt-8 space-y-8">
          {featureShowcase.map((item, index) => (
            <article
              key={item.id}
              className={`grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-10 ${
                index % 2 === 1 ? 'lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1' : ''
              }`}
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950/60">
                <Image
                  src={item.image}
                  alt={item.title}
                  width={560}
                  height={360}
                  className="h-auto w-full"
                />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{item.title}</h2>
                <p className="mt-2 text-base leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
              </div>
            </article>
          ))}
        </div>

        <Link href="/" className="mt-8 inline-flex rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Back to Home
        </Link>
      </div>
    </main>
  )
}

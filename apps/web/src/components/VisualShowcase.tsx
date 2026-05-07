import Image from 'next/image'

type ShowcaseItem = {
  id: number
  image: string
  title: string
  description: string
}

const showcaseItems: ShowcaseItem[] = [
  {
    id: 1,
    image: '/images/dashboard-analytics.png',
    title: 'Analytics Dashboard',
    description:
      'Real-time visibility into your business. Monitor revenue, orders, customer metrics, and growth at a glance.',
  },
  {
    id: 2,
    image: '/images/inventory-table.png',
    title: 'Inventory Management',
    description:
      'Track inventory levels across all products. Get automatic alerts for low stock and reorder recommendations.',
  },
  {
    id: 3,
    image: '/images/customer-crm.png',
    title: 'Customer Relationship Management',
    description:
      'Complete customer profiles with purchase history, khata (credit) tracking, and payment management.',
  },
  {
    id: 4,
    image: '/images/order-timeline.png',
    title: 'Order Management',
    description:
      'Streamlined order management from creation to delivery. Track every step with real-time status updates.',
  },
  {
    id: 5,
    image: '/images/billing-invoice.png',
    title: 'Billing & Invoicing',
    description:
      'Professional invoicing with automatic calculations, payment tracking, and due date management.',
  },
  {
    id: 6,
    image: '/images/delivery-map.png',
    title: 'Delivery Management',
    description:
      'Optimize delivery routes and track drivers in real-time. Manage multiple routes and personnel efficiently.',
  },
  {
    id: 7,
    image: '/images/reports-analytics.png',
    title: 'Business Reports',
    description:
      'Data-driven insights with customizable reports. Understand sales trends, inventory turnover, and business metrics.',
  },
]

export function VisualShowcase() {
  return (
    <section
      aria-labelledby="visual-showcase-title"
      className="bg-transparent px-4 py-8 md:px-6 md:py-12 lg:px-8 lg:py-16"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-10 text-center">
          <h2
            id="visual-showcase-title"
            className="text-2xl font-bold text-[#1a1a1a] md:text-3xl"
          >
            See NexaHub in action
          </h2>
          <p className="mt-2 text-base text-[#666]">Powerful features in one platform</p>
        </div>

        <div className="space-y-6 md:space-y-8">
          {showcaseItems.map((item, index) => (
            <article
              key={item.id}
              className={`grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[minmax(0,600px)_1fr] lg:items-center lg:gap-12 ${
                index % 2 === 1 ? 'lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1' : ''
              }`}
            >
              <div className="overflow-hidden rounded-xl border border-[#d6dbe3] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
                <Image
                  src={item.image}
                  alt={`${item.title} screen in NexaHub platform`}
                  width={600}
                  height={400}
                  quality={100}
                  loading="lazy"
                  sizes="(max-width: 767px) 100vw, (max-width: 1023px) 92vw, 600px"
                  className="h-auto w-full"
                />
              </div>

              <div>
                <h3 className="text-xl font-bold text-[#1a1a1a] md:text-[22px]">{item.title}</h3>
                <p className="mt-3 text-sm leading-[1.6] text-[#666] md:text-base">{item.description}</p>
              </div>
            </article>
          ))}
        </div>

      </div>
    </section>
  )
}

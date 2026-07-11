const reviews = [
  {
    name: 'Rakesh Sharma',
    role: 'Cement Dealer',
    business: 'Sharma Traders',
    city: 'Jaipur',
    quote:
      'Pehle stock aur order alag-alag register me tha. NexaHub ke baad sab ek jagah dikh raha hai aur team ka time bach raha hai.',
  },
  {
    name: 'Priya Patel',
    role: 'Operations Manager',
    business: 'Patel Buildmart',
    city: 'Ahmedabad',
    quote:
      'Delivery tracking aur pending payments ka view bahut clear hai. Daily follow-up calls kam hue aur cash flow improve hua.',
  },
  {
    name: 'Imran Khan',
    role: 'Owner',
    business: 'Khan Infra Supplies',
    city: 'Lucknow',
    quote:
      'Inventory alerts ki wajah se out-of-stock issues almost khatam ho gaye. Counter pe customer wait time bhi kam hua.',
  },
  {
    name: 'Sneha Reddy',
    role: 'Finance Lead',
    business: 'Reddy Constructions',
    city: 'Hyderabad',
    quote:
      'Monthly reports pehle 2 din lete the, ab kuch minutes me ho jata hai. Team decision-making kaafi fast ho gayi hai.',
  },
  {
    name: 'Arvind Nair',
    role: 'Warehouse Head',
    business: 'Nair Hardware Hub',
    city: 'Kochi',
    quote:
      'Multi-location stock transfer feature hamare liye game changer raha. Dispatch planning ab kaafi predictable hai.',
  },
  {
    name: 'Megha Verma',
    role: 'Founder',
    business: 'Verma Enterprises',
    city: 'Indore',
    quote:
      'Simple UI aur fast loading ki wajah se staff ko training dena easy tha. Adoption first week se strong raha.',
  },
]

export function ReviewsCarousel() {
  const scrollingReviews = [...reviews, ...reviews]

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-12 pt-4 sm:pb-14 sm:pt-6 lg:pb-16">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.10)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.4)] sm:px-6 sm:py-10 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.14),transparent_72%)]" />

        <div className="text-center">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
            Customer Reviews
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl lg:text-4xl">
            Businesses across India trust NexaHub
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400 sm:text-base">
            Real-style feedback from teams using NexaHub daily for orders, inventory, delivery, and reporting.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300 sm:gap-3 sm:text-sm">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-800/60">4.8/5 average rating</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-800/60">9,000+ active businesses</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-800/60">Trusted in 120+ cities</span>
          </div>
        </div>

        <div className="review-mask mt-7 overflow-hidden sm:mt-8">
          <div className="reviews-track flex w-max gap-4 [animation:reviewsMarquee_32s_linear_infinite] sm:gap-5">
            {scrollingReviews.map((review, index) => (
              <article
                key={`${review.name}-${index}`}
                className="group w-[290px] shrink-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.07)] transition-transform duration-300 hover:-translate-y-1 dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-[0_14px_28px_rgba(0,0,0,0.35)] sm:w-[360px] sm:p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                    &#10077;
                  </span>
                  <span className="text-[12px] tracking-[0.12em] text-amber-500">★★★★★</span>
                </div>
                <div className="min-h-[120px] text-sm leading-7 text-slate-700 dark:text-slate-300">&ldquo;{review.quote}&rdquo;</div>
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="text-base font-semibold text-slate-900 dark:text-white">{review.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {review.role} · {review.business}
                  </div>
                  <div className="mt-1 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {review.city}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

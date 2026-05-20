import Image from 'next/image'
import Link from 'next/link'

export function VisualShowcase() {
  return (
    <section
      aria-labelledby="visual-showcase-title"
      className="bg-transparent px-4 py-6 md:px-6 md:py-8 lg:px-8 lg:py-10"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <h2 id="visual-showcase-title" className="sr-only">
          See NexaHub in action
        </h2>

        <div className="relative overflow-hidden rounded-[24px] border border-[#d7deea] bg-[#eef3fb] shadow-[0_24px_60px_rgba(18,36,76,0.10)]">
          <Image
            src="/images/nexahub-in-action-redesign.svg"
            alt="NexaHub in action redesign preview"
            width={1440}
            height={900}
            unoptimized
            priority={false}
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 94vw, 1200px"
            className="h-auto w-full"
          />
          <Link
            href="/register"
            aria-label="Start your free trial"
            className="group absolute bottom-[0.65%] left-1/2 z-10 flex h-10 w-[58%] -translate-x-1/2 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4f46e5] to-[#6366f1] text-sm font-semibold text-white shadow-[0_10px_28px_rgba(79,70,229,0.32)] transition duration-200 hover:-translate-x-1/2 hover:scale-[1.01] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#eef3fb] active:scale-[0.99] sm:h-11 sm:w-[46%] md:h-12 md:w-[38%] md:text-base lg:w-[34%] xl:w-[400px]"
          >
            <span>Start your free trial</span>
            <span
              aria-hidden="true"
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              &rarr;
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}

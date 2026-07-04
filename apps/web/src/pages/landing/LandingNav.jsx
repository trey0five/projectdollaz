// LandingNav — fixed marketing nav. Transparent over the navy hero; past 24px
// of scroll it gains a navy-deep/85 blur + hairline so it stays readable over
// the light acts. Brand block mirrors AppShell's (gold square + serif name).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { LineChart } from 'lucide-react'
import { NAV } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default function LandingNav() {
  const reduce = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled
          ? 'border-b border-white/10 bg-navy-deep/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-navy-deep focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white ${FOCUS_RING}`}
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        {/* Brand block (AppShell language; links to the landing root). */}
        <Link
          to="/"
          aria-label="Project Dollaz — home"
          className={`flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 transition-opacity hover:opacity-90 ${FOCUS_RING}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-navy-deep shadow-glow">
            <LineChart size={18} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-serif text-[17px] font-semibold leading-tight tracking-[0.01em] text-gold-light">
              Project Dollaz
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
              Digital COO
            </span>
          </span>
        </Link>

        {/* Section anchors are md+ only; Sign in + Get started stay visible on
            phones (compact sizing) so the mobile header always has actions. */}
        <nav aria-label="Landing" className="flex shrink-0 items-center gap-3.5 md:gap-6">
          <div className="hidden items-center gap-6 md:flex">
            {NAV.anchors.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className={`rounded-md text-[13px] font-semibold text-white/70 transition-colors hover:text-gold-light ${FOCUS_RING}`}
              >
                {a.label}
              </a>
            ))}
          </div>
          <Link
            to={NAV.signIn.to}
            className={`rounded-md text-[13px] font-semibold text-white/85 transition-colors hover:text-gold-light ${FOCUS_RING}`}
          >
            {NAV.signIn.label}
          </Link>
          <Link
            to={NAV.getStarted.to}
            className={`whitespace-nowrap rounded-xl bg-gold-gradient px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-navy-deep shadow-glow transition-shadow hover:shadow-glow-lg md:px-5 md:py-2.5 md:text-[13px] ${FOCUS_RING}`}
          >
            {NAV.getStarted.label}
          </Link>
        </nav>
      </div>
    </motion.header>
  )
}

// LandingNav — fixed marketing nav. Transparent over the navy hero; past 24px
// of scroll it gains a navy-deep/85 blur + hairline so it stays readable over
// the light acts. Brand block mirrors AppShell's (gold square + serif name).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { NAV } from './landingContent.js'
import { useAuth } from '../../context/AuthContext.jsx'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

// `show` gates the nav's entrance: on the landing it stays hidden over the hero's
// dark pre-"power-on" field and reveals once the hero's TV-bloom opens.
export default function LandingNav({ show = true }) {
  const reduce = useReducedMotion()
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : -10 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        show ? '' : 'pointer-events-none'
      } ${
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
          aria-label="KYRO — home"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 transition-opacity hover:opacity-90 ${FOCUS_RING}`}
        >
          <img src="/kyro-lockup.png" alt="KYRO" className="h-14 w-auto shrink-0 object-contain" />
        </Link>

        {/* Section anchors are md+ only; Sign in + Get started stay visible on
            phones (compact sizing) so the mobile header always has actions. */}
        <nav aria-label="Landing" className="flex shrink-0 items-center gap-3.5 md:gap-6">
          <div className="hidden items-center gap-6 md:flex">
            {NAV.anchors.map((a) => (
              <a
                key={a.href}
                href={a.href}
                // "Home" scrolls smoothly to the top rather than jumping to an anchor.
                onClick={
                  a.top
                    ? (e) => {
                        e.preventDefault()
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }
                    : undefined
                }
                className={`rounded-md text-[13px] font-semibold text-white/70 transition-colors hover:text-gold-light ${FOCUS_RING}`}
              >
                {a.label}
              </a>
            ))}
          </div>
          {isAuthenticated ? (
            // Signed-in visitors (they can reach the homepage via the app logo) get
            // a single clear way back into the product instead of Sign in / Get started.
            <Link
              to="/app"
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-gold-gradient px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-navy-deep shadow-glow transition-shadow hover:shadow-glow-lg md:px-5 md:py-2.5 md:text-[13px] ${FOCUS_RING}`}
            >
              Return to dashboard <ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <>
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
            </>
          )}
        </nav>
      </div>
    </motion.header>
  )
}

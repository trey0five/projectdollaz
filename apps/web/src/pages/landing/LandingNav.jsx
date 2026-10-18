// LandingNav — fixed marketing nav. Transparent over the hero video; past 24px
// of scroll it gains a navy-deep/85 blur + hairline so it stays readable over
// the light sections below. Brand block = the stacked KYRO lockup (white
// lettering, at home on the navy bar). The "GET STARTED" pill is the glowing
// 3D blue CTA (landing-restore-top.css, scoped to the landing).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { NAV } from './landingContent.js'
import { useAuth } from '../../context/AuthContext.jsx'
import '../../styles/landing-restore-top.css'

const FOCUS_RING = 'outline-none lr-focus'

// `show` gates the nav's entrance: it stays hidden for the hero video's first
// beat and reveals once the video has settled.
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
      className={`lr-nav fixed inset-x-0 top-0 z-40 ${show ? '' : 'pointer-events-none'} ${scrolled ? 'is-scrolled' : ''}`}
    >
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-[#0a1229] focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white ${FOCUS_RING}`}
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        {/* Brand block (links to the landing root). */}
        <Link
          to="/"
          aria-label="KYRO — home"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`flex min-w-0 items-center gap-3 rounded-[8px] px-1 py-1 transition-opacity hover:opacity-90 ${FOCUS_RING}`}
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
                // Smooth-scroll every anchor ("Home" to the top, the rest to
                // their section); the href stays for no-JS and middle-click.
                onClick={(e) => {
                  e.preventDefault()
                  const behavior = reduce ? 'auto' : 'smooth'
                  if (a.top) {
                    window.scrollTo({ top: 0, behavior })
                    return
                  }
                  document.getElementById(a.href.slice(1))?.scrollIntoView({ behavior })
                }}
                className={`lr-nav-link ${FOCUS_RING}`}
              >
                {a.label}
              </a>
            ))}
          </div>
          {isAuthenticated ? (
            // Signed-in visitors (they can reach the homepage via the app logo) get
            // a single clear way back into the product instead of Sign in / Get started.
            <Link to="/app" className={`lr-cta lr-cta-nav ${FOCUS_RING}`}>
              Return to dashboard <ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <>
              <Link to={NAV.signIn.to} className={`lr-nav-link is-strong ${FOCUS_RING}`}>
                {NAV.signIn.label}
              </Link>
              <Link to={NAV.getStarted.to} className={`lr-cta lr-cta-nav ${FOCUS_RING}`}>
                {NAV.getStarted.label}
              </Link>
            </>
          )}
        </nav>
      </div>
    </motion.header>
  )
}

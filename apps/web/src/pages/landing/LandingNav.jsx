// LandingNav — fixed marketing nav. Transparent over the hero video (white
// ink); past 24px of scroll it becomes the page's ONE glass surface: ground at
// 85% + blur + a hairline, ink type — the same top strip the app uses. Brand
// block = the KYRO mark + a set wordmark (the lockup's white lettering vanishes
// on the light ground). Actions are the surface Button.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Button } from '../../components/ui/surface/index.js'
import { NAV } from './landingContent.js'
import { useAuth } from '../../context/AuthContext.jsx'
import '../../styles/pending/p5-landing.css'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 focus-visible:ring-offset-2'

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

  const link = scrolled ? 'text-ink2 hover:text-ink' : 'text-white/80 hover:text-white'

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : -10 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${show ? '' : 'pointer-events-none'} ${
        scrolled ? 'border-b border-hair bg-ground/85 backdrop-blur-md' : 'border-b border-transparent bg-transparent'
      }`}
    >
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white ${FOCUS_RING}`}
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link
          to="/"
          aria-label="KYRO — home"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`flex min-w-0 items-center gap-2 rounded-md py-1 ${FOCUS_RING}`}
        >
          <img src="/kyro-mark.png" alt="" width="44" height="44" className="h-11 w-11 shrink-0 scale-[1.35] object-contain" />
          <span
            className={`text-[15px] font-semibold tracking-[0.32em] transition-colors duration-300 ${scrolled ? 'text-ink' : 'text-white'}`}
          >
            KYRO
          </span>
        </Link>

        {/* Section anchors are md+ only; Sign in + Get started stay visible on
            phones so the mobile header always has actions. */}
        <nav aria-label="Landing" className="flex shrink-0 items-center gap-3 md:gap-6">
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
                className={`rounded-sm text-[13px] font-semibold transition-colors ${link} ${FOCUS_RING}`}
              >
                {a.label}
              </a>
            ))}
          </div>
          {isAuthenticated ? (
            // Signed-in visitors (they can reach the homepage via the app logo) get
            // a single clear way back into the product instead of Sign in / Get started.
            <Button to="/app" variant="primary">
              Return to dashboard <ArrowRight size={14} aria-hidden />
            </Button>
          ) : (
            <>
              <Link to={NAV.signIn.to} className={`rounded-sm text-[13px] font-semibold transition-colors ${link} ${FOCUS_RING}`}>
                {NAV.signIn.label}
              </Link>
              <Button to={NAV.getStarted.to} variant="primary">
                {NAV.getStarted.label}
              </Button>
            </>
          )}
        </nav>
      </div>
    </motion.header>
  )
}

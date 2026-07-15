// ─────────────────────────────────────────────────────────────────────────────
// VideoHero — the landing page's opening frame: the product video, full-bleed,
// with a cinematic entrance on page load (slow scale-settle + fade through a
// vignette, then a gold hairline draws across the base). Autoplays muted/looped
// (browser policy), inline on mobile, no audio track (stripped in the encode).
// The old headline hero now sits BELOW this section. Reduced-motion: a plain
// fade, no scale/hairline sweep. Fail-soft: if the video can't play within a
// beat we reveal anyway (no black hole), and `onShown` still fires so the fixed
// nav appears.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

export default function VideoHero({ onShown }) {
  const reduce = useReducedMotion()
  const [ready, setReady] = useState(false)

  // Reveal fallback + nav hand-off: even if canplay never fires (slow network,
  // codec issue), the section fades in and the nav shows.
  useEffect(() => {
    const reveal = window.setTimeout(() => setReady(true), 2200)
    const nav = window.setTimeout(() => onShown?.(), 1500)
    return () => {
      window.clearTimeout(reveal)
      window.clearTimeout(nav)
    }
  }, [onShown])

  return (
    <section aria-label="Product overview video" className="relative isolate overflow-hidden bg-[#0a1526]">
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.07 }}
        animate={ready ? { opacity: 1, scale: 1 } : undefined}
        transition={reduce ? { duration: 0.5 } : { duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <video
          src="/homepage-hero.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={() => setReady(true)}
          className="h-[72svh] min-h-[420px] w-full object-cover"
        />
        {/* Cinematic vignette + a bottom fade into the navy hero below. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(10,21,38,0.55) 100%), linear-gradient(to bottom, rgba(10,21,38,0.35), transparent 18%, transparent 70%, #0a1526 100%)',
          }}
        />
        {/* Gold hairline draws across the base once the video is up. */}
        {!reduce && (
          <motion.span
            aria-hidden="true"
            initial={{ scaleX: 0 }}
            animate={ready ? { scaleX: 1 } : undefined}
            transition={{ duration: 1.1, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0 h-px origin-left"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(214,178,92,0.75), transparent)' }}
          />
        )}
        {/* Scroll cue — invites the reader down into the story. */}
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={ready ? { opacity: 1 } : undefined}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70"
        >
          <motion.span
            className="block"
            animate={reduce ? undefined : { y: [0, 7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown size={26} />
          </motion.span>
        </motion.span>
      </motion.div>
    </section>
  )
}

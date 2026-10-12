// ─────────────────────────────────────────────────────────────────────────────
// VideoHero — the landing page's opening frame: the product video, full-bleed
// and VISIBLE IMMEDIATELY on load. A poster of the first frame paints before a
// single video byte arrives (no black hole, no reveal delay); the entrance is a
// quick unobtrusive settle that starts at once rather than waiting for canplay.
// Autoplays muted/looped (browser policy), inline on mobile, audio stripped in
// the encode. The bottom stays mostly clear of overlays — the frosted headline
// card from the section below straddles up onto it. Reduced-motion: static.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export default function VideoHero({ onShown }) {
  const reduce = useReducedMotion()

  // Fixed-nav hand-off shortly after mount (the headline block also calls this;
  // whichever fires first wins — the callback is memoized upstream).
  useEffect(() => {
    const nav = window.setTimeout(() => onShown?.(), 900)
    return () => window.clearTimeout(nav)
  }, [onShown])

  return (
    <section aria-label="Product overview video" className="relative isolate overflow-hidden bg-[#0a1526]">
      <motion.div
        initial={reduce ? false : { opacity: 0.55, scale: 1.035 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        {/* Web-optimized hero (SEO/CWV): a lightweight WebP poster (the clip's own
            first frame, so poster→video is seamless) is the LCP element and
            preload="metadata" keeps the clip from competing with the critical
            render. Each browser plays the smallest format it supports: AV1 1.5MB →
            VP9 1.9MB → H.264 3.3MB (a lossless remux of the master). Native 720p,
            source colour tags preserved, audio stripped (the hero is muted).
            Versioned file names because public/ ships with a one-year immutable
            cache — never overwrite a hero file in place. */}
        <video
          poster="/homepage-hero-poster-v3.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="h-[72svh] min-h-[420px] w-full object-cover object-bottom"
        >
          <source src="/homepage-hero-v3-av1.webm" type='video/webm; codecs="av01.0.05M.08"' />
          <source src="/homepage-hero-v3.webm" type='video/webm; codecs="vp9"' />
          <source src="/homepage-hero-v3.mp4" type="video/mp4" />
        </video>
        {/* Cinematic vignette; the base stays clear for the straddling card. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% 40%, transparent 60%, rgba(10,21,38,0.4) 100%), linear-gradient(to bottom, rgba(10,21,38,0.35), transparent 18%, transparent 90%, rgba(10,21,38,0.55) 100%)',
          }}
        />
        {/* Gold hairline draws across the base as the settle finishes. */}
        {!reduce && (
          <motion.span
            aria-hidden="true"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0 h-px origin-left"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(214,178,92,0.75), transparent)' }}
          />
        )}
      </motion.div>
    </section>
  )
}

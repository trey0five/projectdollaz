// ─────────────────────────────────────────────────────────────────────────────
// UnlockCelebration — the "module unlocked" moment fired from the Membership
// Modules manager. Pure framer-motion (NO new deps): a one-shot confetti burst
// in the module's hue + the primary blues, the module art on a white square
// framed by a 2px hue rule that draws once, then a serif thank-you and an
// "Open <module>" CTA. No gold — gold is KYRO's alone.
// Page-less modules (hr/planning — route:null) get "See it in Analytics"
// instead, since their value surfaces inside Analytics and the briefing.
// Reduced motion: no particles, no draw — a calm static thank-you card IS the
// fallback.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { TILE_BY_KEY, tileLabel } from '../home/tileRegistry.jsx'

// Module-scope particle factory — called ONLY inside a useState initializer
// (never in a render body) so the burst is generated once per scene mount.
function makeParticles(hue, n = 32) {
  const colors = [hue, '#2563EB', '#93C5FD', '#ffffff', '#1f3d72']
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    x: (Math.random() - 0.5) * 480,
    y: -60 - Math.random() * 160, // rise…
    fall: 240 + Math.random() * 200, // …then gravity
    rotate: (Math.random() < 0.5 ? -1 : 1) * 720,
    scale: 0.6 + Math.random() * 0.9,
    delay: Math.random() * 0.25,
    shape: i % 3, // 0 rect, 1 circle, 2 diamond
  }))
}

function particleStyle(p) {
  return {
    position: 'absolute',
    left: '50%',
    top: '38%',
    width: p.shape === 0 ? 10 : 8,
    height: p.shape === 0 ? 6 : 8,
    background: p.color,
    borderRadius: p.shape === 1 ? '9999px' : '1px',
  }
}

function CelebrationScene({ tile, onClose }) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const ctaRef = useRef(null)
  const { key, hue, route, Art } = tile
  const label = tileLabel(key)
  const pageLess = route == null

  // One burst per scene mount (keyed by moduleKey upstream) — initializer only.
  const [particles] = useState(() => (reduce ? [] : makeParticles(hue)))

  const dialogRef = useRef(null)

  // Esc closes + a minimal Tab focus trap (aria-modal alone doesn't stop the tab
  // order escaping into the blurred settings page behind the celebration).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    ctaRef.current?.focus()
  }, [])

  const open = () => {
    navigate(route ?? tile.surface?.to ?? '/analytics')
    onClose()
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A1628]/40 p-4 "
      onClick={onClose}
    >
      {/* Confetti layer — skipped entirely under reduced motion. */}
      {particles.length > 0 && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          {particles.map((p) => (
            <motion.span
              key={p.id}
              style={particleStyle(p)}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
              animate={{
                x: p.x,
                y: [0, p.y, p.y + p.fall],
                rotate: p.rotate,
                scale: p.scale,
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 1.5, delay: p.delay, ease: 'easeOut', times: [0, 0.45, 1] }}
            />
          ))}
        </div>
      )}

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-celebration-title"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-sm rounded-[8px] bg-white p-8 text-center shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The module art on a white square: a 2px hue frame, a hue icon stroke,
            and a 2px hue rule underneath that draws once (no gold, no fill). */}
        <div className="relative mx-auto flex w-28 flex-col items-center gap-3">
          <motion.span
            aria-hidden="true"
            className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[8px] border-2 bg-white"
            style={{ borderColor: hue, color: hue }}
            initial={reduce ? { opacity: 0 } : { scale: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
          >
            <Art width={44} height={44} />
          </motion.span>
          <motion.span
            aria-hidden="true"
            className="block h-[2px] w-full"
            style={{ background: hue, transformOrigin: 'left center' }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.48, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <h2
          id="unlock-celebration-title"
          className="mt-5 font-serif text-[24px] font-semibold leading-snug text-ink"
        >
          {label} is unlocked
        </h2>
        <p className="mt-1 text-[15px] text-ink2">— thank you for growing with us.</p>
        {pageLess && (
          <p className="mt-2 text-[13.5px] leading-snug text-ink2">
            It&apos;s live inside Analytics and your briefing.
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-2">
          <button ref={ctaRef} type="button" onClick={open} className="btn btn-primary w-full">
            {pageLess ? 'See it in Analytics' : `Open ${label}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] px-4 py-2 text-[14px] font-semibold text-ink2 transition-colors hover:bg-ink/[0.05] hover:text-ink"
          >
            Back to membership
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

export default function UnlockCelebration({ moduleKey, onClose }) {
  if (!moduleKey) return null
  const tile = TILE_BY_KEY[moduleKey]
  if (!tile) return null
  // key={moduleKey} remounts the scene per unlock so the particle burst resets.
  return <CelebrationScene key={moduleKey} tile={tile} onClose={onClose} />
}

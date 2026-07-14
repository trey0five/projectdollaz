// ─────────────────────────────────────────────────────────────────────────────
// UnlockCelebration — the "module unlocked" moment fired from the Membership
// Modules manager. Pure framer-motion (NO new deps): a confetti burst built
// from motion particles in the module's hue + the premium gold accents, a
// one-shot conic gold shimmer behind the module art, then a serif thank-you
// and an "Open <module>" CTA. Gold stays Penny-only chrome elsewhere — this
// is the one sanctioned gold-gradient MOMENT (a moment, not chrome).
// Page-less modules (hr/planning — route:null) get "See it in Analytics"
// instead, since their value surfaces inside Analytics and the briefing.
// Reduced motion: no particles, no shimmer — a calm static thank-you card
// with a static gold tint IS the fallback.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { TILE_BY_KEY, tileLabel } from '../home/tileRegistry.jsx'

const GOLD = '#C9A227'
const GOLD_LIGHT = '#F6D67C'

// Module-scope particle factory — called ONLY inside a useState initializer
// (never in a render body) so the burst is generated once per scene mount.
function makeParticles(hue, n = 32) {
  const colors = [hue, GOLD, GOLD_LIGHT, '#ffffff', '#1f3d72']
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/60 p-4 backdrop-blur-sm"
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
        className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The gold MOMENT: static radial halo + (motion only) a one-shot conic shimmer. */}
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute inset-[-18px]"
            style={{
              background: 'radial-gradient(circle, rgba(201,162,39,.28), transparent 70%)',
              borderRadius: '9999px',
            }}
          />
          {!reduce && (
            <motion.div
              aria-hidden="true"
              className="absolute inset-[-10px] rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent, ${GOLD_LIGHT}, transparent 30%, ${GOLD}, transparent 65%)`,
              }}
              initial={{ rotate: 0, opacity: 0.35 }}
              animate={{ rotate: 360, opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
          )}
          <motion.span
            aria-hidden="true"
            className="relative flex h-[72px] w-[72px] items-center justify-center rounded-2xl"
            style={{ background: `color-mix(in srgb, ${hue} 14%, white)`, color: hue }}
            initial={reduce ? { opacity: 0 } : { scale: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
          >
            <Art width={44} height={44} />
          </motion.span>
        </div>

        <h2
          id="unlock-celebration-title"
          className="mt-5 font-serif text-[24px] font-semibold leading-snug text-navy"
        >
          {label} is unlocked
        </h2>
        <p className="mt-1 text-[15px] text-muted">— thank you for growing with us.</p>
        {pageLess && (
          <p className="mt-2 text-[13.5px] leading-snug text-muted">
            It&apos;s live inside Analytics and your briefing.
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-2">
          <button ref={ctaRef} type="button" onClick={open} className="btn-primary w-full">
            {pageLess ? 'See it in Analytics' : `Open ${label}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[14px] font-semibold text-muted transition-colors hover:bg-navy/[0.05] hover:text-navy"
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

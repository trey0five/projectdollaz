// ─────────────────────────────────────────────────────────────────────────────
// LightUpReveal — the moment a school's books come alive.
//
// A head of school just handed us the most sensitive spreadsheet they own. This
// is the screen that tells them it was worth it: a shockwave, a burst, the real
// numbers we read counting up, and a door into every place those numbers now
// live. Loud on purpose — but every WORD comes from lightUps.js, which refuses
// to claim anything the data doesn't support.
//
// Pure framer-motion, no new dependencies. Reduced motion is a first-class path,
// not a degraded one: no particles, no shockwave, no count-up — the same content,
// still, immediately.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  FileBarChart2,
  FileStack,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { resolveLightUps, revealSubtitle } from './lightUps.js'

const GOLD = '#C9A227'
const GOLD_LIGHT = '#F6D67C'
const FINANCE_HUE = '#2f6fed'

const ICONS = {
  statements: FileStack,
  analytics: BarChart3,
  comparatives: TrendingUp,
  budget: Wallet,
  reports: FileBarChart2,
  readiness: ShieldCheck,
}

// One burst per mount — generated inside a useState initializer, never in a
// render body (the React-compiler discipline the rest of this app follows).
function makeSparks(n = 64) {
  const colors = [GOLD, GOLD_LIGHT, FINANCE_HUE, '#ffffff', '#7ea6f5']
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.3
    const dist = 220 + Math.random() * 420
    return {
      id: i,
      color: colors[i % colors.length],
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.75,
      rotate: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540),
      scale: 0.5 + Math.random() * 1.1,
      delay: 0.08 + Math.random() * 0.3,
      shape: i % 3,
    }
  })
}

function sparkStyle(p) {
  return {
    position: 'absolute',
    left: '50%',
    top: '34%',
    width: p.shape === 0 ? 11 : 7,
    height: p.shape === 0 ? 5 : 7,
    background: p.color,
    borderRadius: p.shape === 1 ? '9999px' : '1px',
  }
}

// 0 → value, once. Reduced motion lands on the value with no animation.
function CountUp({ value, reduce }) {
  const [n, setN] = useState(reduce ? value : 0)
  useEffect(() => {
    if (reduce) {
      setN(value)
      return undefined
    }
    const controls = animate(0, value, {
      duration: 1.1,
      delay: 0.35,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setN(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduce])
  return <>{n}</>
}

function StatPip({ value, label, reduce }) {
  return (
    <div className="flex min-w-0 flex-col items-center px-3">
      <span className="font-serif text-[30px] font-semibold leading-none text-white tabular-nums sm:text-[36px]">
        <CountUp value={value} reduce={reduce} />
      </span>
      <span className="mt-1.5 break-words text-center text-[11.5px] font-semibold uppercase tracking-[0.11em] text-white/60">
        {label}
      </span>
    </div>
  )
}

export default function LightUpReveal({
  open,
  onClose,
  schoolName = null,
  period = null,
  priorPeriodLabel = null,
  hasBudget = false,
  accreditationLicensed = false,
  vitals = [],
  accounts = 0,
}) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const dialogRef = useRef(null)
  const ctaRef = useRef(null)
  const [sparks] = useState(() => (reduce ? [] : makeSparks()))

  const scored = useMemo(() => vitals.filter((v) => v.available), [vitals])
  const tiles = useMemo(
    () =>
      resolveLightUps({
        period,
        priorPeriodLabel,
        hasBudget,
        accreditationLicensed,
        vitalsScored: scored.length,
      }),
    [period, priorPeriodLabel, hasBudget, accreditationLicensed, scored.length],
  )
  // Four statements only when the audited file is in — same rule as lightUps.js.
  const statementCount = period?.roles?.audit ? 4 : 3

  // Esc closes; Tab is trapped inside the dialog (aria-modal alone does not stop
  // the tab order walking out into the page behind the scrim).
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        )
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
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
  }, [open, onClose])

  useEffect(() => {
    if (open) ctaRef.current?.focus()
  }, [open])

  if (!open || !period) return null

  const go = (to) => {
    navigate(to)
    onClose()
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[70] overflow-y-auto bg-navy/80 backdrop-blur-md"
      onClick={onClose}
    >
      {/* ── Ambient aurora. Decorative; static under reduced motion. ── */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-[18%] top-[-12%] h-[62vh] w-[62vh] rounded-full"
          style={{
            background: `radial-gradient(circle, ${FINANCE_HUE}55, transparent 68%)`,
            filter: 'blur(14px)',
          }}
          animate={reduce ? undefined : { x: [0, 60, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-[14%] bottom-[-16%] h-[58vh] w-[58vh] rounded-full"
          style={{
            background: `radial-gradient(circle, ${GOLD}44, transparent 68%)`,
            filter: 'blur(14px)',
          }}
          animate={reduce ? undefined : { x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex min-h-full items-start justify-center px-4 py-10 sm:items-center sm:py-14">
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightup-title"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-[26px] border border-white/10 shadow-2xl"
          style={{
            background:
              'linear-gradient(165deg, #17305c 0%, #1f3d72 46%, #16294d 100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* One-shot light sweep — the card reads as switching ON rather than
              simply appearing. Motion only; decorative. */}
          {!reduce && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[2]"
              style={{
                background:
                  'linear-gradient(105deg, transparent 38%, rgba(255,255,255,.16) 50%, transparent 62%)',
              }}
              initial={{ x: '-120%' }}
              animate={{ x: '120%' }}
              transition={{ duration: 1.5, delay: 0.35, ease: 'easeInOut' }}
            />
          )}

          {/* ── HERO ── */}
          <div className="relative px-6 pb-7 pt-9 text-center sm:px-10 sm:pt-11">
            <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
              {/* Shockwave rings — motion only. */}
              {!reduce &&
                [0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    aria-hidden="true"
                    className="absolute rounded-full border-2"
                    style={{ borderColor: i % 2 ? GOLD_LIGHT : FINANCE_HUE, inset: 0 }}
                    initial={{ scale: 0.5, opacity: 0.75 }}
                    animate={{ scale: 3.4, opacity: 0 }}
                    transition={{ duration: 1.5, delay: 0.1 + i * 0.22, ease: 'easeOut' }}
                  />
                ))}
              <div
                aria-hidden="true"
                className="absolute inset-[-22px] rounded-full"
                style={{
                  background: `radial-gradient(circle, ${GOLD}44, transparent 70%)`,
                }}
              />
              {!reduce && (
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-[-8px] rounded-full"
                  style={{
                    background: `conic-gradient(from 0deg, transparent, ${GOLD_LIGHT}, transparent 30%, ${FINANCE_HUE}, transparent 66%)`,
                  }}
                  initial={{ rotate: 0, opacity: 0.5 }}
                  animate={{ rotate: 360, opacity: 0 }}
                  transition={{ duration: 1.8, ease: 'easeOut' }}
                />
              )}
              <motion.span
                aria-hidden="true"
                className="relative flex h-[78px] w-[78px] items-center justify-center rounded-3xl bg-gold-gradient text-navy shadow-glow"
                initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -25 }}
                animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.12 }}
              >
                <CircleDollarSign size={38} />
              </motion.span>
            </div>

            <motion.h2
              id="lightup-title"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, type: 'spring', stiffness: 240, damping: 24 }}
              className="mt-6 text-balance font-serif text-[27px] font-semibold leading-tight text-white sm:text-[34px]"
            >
              Your books are live.
            </motion.h2>
            <motion.p
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36 }}
              className="mx-auto mt-2 max-w-lg break-words text-[15px] leading-relaxed text-white/70"
            >
              {revealSubtitle({ schoolName, period, accounts })}
            </motion.p>

            {/* Real numbers, counted up. */}
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.44 }}
              className="mx-auto mt-6 flex max-w-md flex-wrap items-start justify-center gap-y-4 divide-x divide-white/15"
            >
              {accounts > 0 && (
                <StatPip value={accounts} label="Accounts read" reduce={reduce} />
              )}
              <StatPip value={statementCount} label="Statements" reduce={reduce} />
              {/* Omitted rather than shown as a zero: "0 vitals scored" is a
                  failure report, and an empty list here means we simply weren't
                  handed this period's metrics — not that nothing scored. */}
              {scored.length > 0 && (
                <StatPip value={scored.length} label="Vitals scored" reduce={reduce} />
              )}
            </motion.div>
          </div>

          {/* ── DESTINATIONS ── */}
          <div className="border-t border-white/10 bg-white/[0.04] px-5 py-6 sm:px-8 sm:py-7">
            <p className="mb-3.5 text-[11.5px] font-bold uppercase tracking-[0.13em] text-white/50">
              Where it lives now
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tiles.map((tile, i) => {
                const Icon = ICONS[tile.iconKey] ?? FileStack
                return (
                  <motion.button
                    key={tile.key}
                    type="button"
                    onClick={() => go(tile.to)}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.5 + i * 0.07,
                      type: 'spring',
                      stiffness: 280,
                      damping: 26,
                    }}
                    whileHover={reduce ? undefined : { y: -3 }}
                    className="group flex min-w-0 items-start gap-3 rounded-2xl border border-white/12 bg-white/[0.07] p-4 text-left outline-none transition-colors hover:border-gold/50 hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-gold/60"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-[#F6D67C]">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 break-words text-[14.5px] font-semibold text-white">
                          {tile.title}
                        </span>
                        <ArrowRight
                          size={13}
                          className="shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-gold"
                        />
                      </span>
                      <span className="mt-1 block break-words text-[13px] leading-snug text-white/65">
                        {tile.fact}
                      </span>
                    </span>
                  </motion.button>
                )
              })}
            </div>

            {/* The vitals themselves — real values, real status. Only what scored. */}
            {scored.length > 0 && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + tiles.length * 0.07 }}
                className="mt-4 flex flex-wrap gap-2"
              >
                {scored.slice(0, 3).map((v) => (
                  <span
                    key={v.key}
                    className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/12 bg-white/[0.07] py-1.5 pl-2.5 pr-3.5"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background:
                          v.status === 'good'
                            ? '#37b26b'
                            : v.status === 'risk'
                              ? '#e0524b'
                              : GOLD,
                      }}
                    />
                    <span className="min-w-0 break-words text-[12.5px] text-white/75">
                      {v.label}
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold text-white tabular-nums">
                      {v.display}
                    </span>
                  </span>
                ))}
              </motion.div>
            )}
          </div>

          {/* ── FOOTER ── */}
          <div className="flex flex-col gap-2.5 border-t border-white/10 px-5 py-5 sm:flex-row-reverse sm:items-center sm:px-8">
            <button
              ref={ctaRef}
              type="button"
              onClick={() => go('/finance')}
              className="btn-cta inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-6 text-[12.5px] font-semibold uppercase tracking-[0.1em] outline-none focus-visible:ring-2 focus-visible:ring-gold/60 sm:w-auto"
            >
              Open my Finance overview
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl px-5 text-[14px] font-semibold text-white/65 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 sm:w-auto"
            >
              Keep adding files
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Spark burst. LAST child and z-elevated on purpose: it fires from the
          viewport centre, which is where the card is, so in DOM order before the
          card every spark painted behind it and the burst was invisible. ── */}
      {sparks.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
        >
          {sparks.map((p) => (
            <motion.span
              key={p.id}
              style={sparkStyle(p)}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
              animate={{ x: p.x, y: p.y, rotate: p.rotate, scale: p.scale, opacity: [1, 1, 0] }}
              transition={{ duration: 1.9, delay: p.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.35, 1] }}
            />
          ))}
        </div>
      )}
    </motion.div>,
    document.body,
  )
}

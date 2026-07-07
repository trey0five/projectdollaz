// ─────────────────────────────────────────────────────────────────────────────
// StrategyHorizon — the beforeBody HERO of the Strategic Planning command center.
// A wide navy-glass panel with a 240° progress ARC (a horizon you travel toward,
// not a bar or donut): a faint navy track, a gold progress stroke that SWEEPS in
// via motion.path pathLength (spring) under a soft gold glow, the overall progress
// as a giant gold serif CountUp in the dome, and PILLAR NODES set along the arc at
// cumulative angles, coloured gold/amber/red by pace, that stagger-pop in after the
// sweep with a hover tooltip. Reduced motion → arc at final length instantly, nodes
// fade with no scale. On-theme navy #1f3d72 / gold #b89650 throughout.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CountUp } from '../ui/briefingFx.jsx'
import { paceMeta } from './PaceChip.jsx'

// Arc geometry — a symmetric 240° dome (120° gap at the bottom), centered.
const VB_W = 520
const VB_H = 330
const CX = 260
const CY = 210
const R = 180
const START = 210 // degrees (lower-left base)
const SWEEP = 240 // clockwise to -30° (lower-right base)

// Fraction f∈[0,1] → [x,y] on the arc (math angle, y flipped for screen space).
function polar(f) {
  const a = ((START - SWEEP * f) * Math.PI) / 180
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)]
}

// The full arc as a sampled polyline (direction matches polar() exactly, so the
// pathLength sweep + node angles always agree — no SVG arc-flag ambiguity).
function arcPath(samples = 180) {
  let d = ''
  for (let i = 0; i <= samples; i++) {
    const [x, y] = polar(i / samples)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
  }
  return d.trim()
}

const ARC_D = arcPath()

function StatusLine({ goalCounts, paceStatus }) {
  const total = goalCounts?.total ?? 0
  const hit = (goalCounts?.onTrack ?? 0) + (goalCounts?.achieved ?? 0)
  const tone =
    paceStatus === 'behind'
      ? 'text-danger'
      : paceStatus === 'at_risk'
        ? 'text-gold-light'
        : 'text-emerald-300'
  if (!total) {
    return <p className="text-[13.5px] font-medium text-white/60">No goals bound yet</p>
  }
  return (
    <p className="text-[13.5px] font-semibold">
      <span className={tone}>On pace to hit {hit}</span>
      <span className="text-white/60"> of {total} goals</span>
    </p>
  )
}

export default function StrategyHorizon({ plan, pillars = [], summary }) {
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState(null)

  const progress = Math.min(Math.max(plan?.overallProgressPct ?? 0, 0), 1)
  const pct = Math.round(progress * 100)
  const n = pillars.length

  // Sweep timing — nodes pop AFTER the arc reaches them.
  const nodeBaseDelay = reduce ? 0 : 0.75

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-gold/20 bg-navy-gradient shadow-navy-glow">
      {/* soft gold aura wash so the panel reads as deep glass, not flat navy */}
      <div className="pointer-events-none absolute inset-0 bg-navy-radial" aria-hidden />

      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:gap-8">
        {/* ── The arc ──────────────────────────────────────────────────────── */}
        <div className="relative mx-auto w-full max-w-[440px] shrink-0 lg:mx-0">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" role="img" aria-label={`Overall plan progress ${pct}%`}>
            <defs>
              <linearGradient id="horizon-gold" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#e8d4a8" />
                <stop offset="50%" stopColor="#d4b47a" />
                <stop offset="100%" stopColor="#b89650" />
              </linearGradient>
              <filter id="horizon-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* faint navy track (the remaining horizon) */}
            <path
              d={ARC_D}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.12}
              strokeWidth={14}
              strokeLinecap="round"
            />
            {/* glow underlay — same sweep, blurred, so the leading edge glows gold */}
            <motion.path
              d={ARC_D}
              fill="none"
              stroke="url(#horizon-gold)"
              strokeOpacity={0.55}
              strokeWidth={14}
              strokeLinecap="round"
              filter="url(#horizon-glow)"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: progress }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 18 }}
            />
            {/* the crisp gold progress stroke */}
            <motion.path
              d={ARC_D}
              fill="none"
              stroke="url(#horizon-gold)"
              strokeWidth={12}
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: progress }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 18 }}
            />

            {/* ── Pillar nodes at cumulative (equal-weight) angles ──────────── */}
            <motion.g
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { delayChildren: nodeBaseDelay, staggerChildren: reduce ? 0 : 0.08 } },
              }}
            >
              {pillars.map((p, i) => {
                const f = n > 0 ? (i + 0.5) / n : 0.5
                const [nx, ny] = polar(f)
                const meta = paceMeta(p.paceStatus)
                const reached = progress >= f
                return (
                  <motion.g
                    key={p.id}
                    style={{ cursor: 'pointer', transformBox: 'fill-box', transformOrigin: 'center' }}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                    variants={{
                      hidden: reduce ? { opacity: 0 } : { opacity: 0, scale: 0 },
                      show: reduce
                        ? { opacity: 1 }
                        : { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 18 } },
                    }}
                  >
                    {/* halo */}
                    <circle cx={nx} cy={ny} r={15} fill={meta.hex} opacity={reached ? 0.28 : 0.14} />
                    {/* node */}
                    <circle cx={nx} cy={ny} r={9} fill={meta.hex} stroke="#fff" strokeWidth={2.5} />
                    <title>
                      {p.name} · {Math.round((p.progressPct ?? 0) * 100)}%
                    </title>
                  </motion.g>
                )
              })}
            </motion.g>

            {/* ── Hover tooltip (SVG-native so it scales with the viewBox) ───── */}
            {hovered != null && pillars[hovered] ? (
              (() => {
                const p = pillars[hovered]
                const f = n > 0 ? (hovered + 0.5) / n : 0.5
                const [nx, ny] = polar(f)
                const label = `${p.name} · ${Math.round((p.progressPct ?? 0) * 100)}%`
                const w = Math.min(Math.max(label.length * 7.2 + 20, 90), 240)
                const tx = Math.min(Math.max(nx - w / 2, 6), VB_W - w - 6)
                const ty = ny - 46
                return (
                  <g pointerEvents="none">
                    <rect x={tx} y={ty} width={w} height={28} rx={8} fill="#0b1b36" stroke="#b89650" strokeOpacity={0.5} />
                    <text x={tx + w / 2} y={ty + 18} textAnchor="middle" fontSize={13} fill="#fff" fontWeight="600">
                      {label}
                    </text>
                  </g>
                )
              })()
            ) : null}
          </svg>

          {/* centered HTML overlay — the giant % + status line, sitting in the dome */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
            <div className="flex items-start font-serif font-semibold leading-none text-gold-light drop-shadow-[0_0_18px_rgba(212,180,122,0.45)]">
              <CountUp value={pct} duration={1200} className="text-[64px] sm:text-[76px]" />
              <span className="mt-2 text-[28px] sm:text-[34px]">%</span>
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
              Overall progress
            </p>
          </div>
        </div>

        {/* ── Narrative rail ───────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-light/80">
            {plan?.status === 'adopted' ? 'Adopted plan' : plan?.status === 'draft' ? 'Draft plan' : 'Strategic plan'}
            {plan?.fyStartYear ? ` · FY${String(plan.fyStartYear).slice(-2)}–${String(plan.fyEndYear ?? plan.fyStartYear).slice(-2)}` : ''}
          </p>
          <h2 className="mt-1 font-serif text-[26px] font-semibold leading-tight text-white sm:text-[30px]">
            {plan?.name ?? 'Strategic plan'}
          </h2>
          {plan?.mission ? (
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/70">{plan.mission}</p>
          ) : null}

          <div className="mt-4">
            <StatusLine goalCounts={plan?.goalCounts} paceStatus={plan?.overallPaceStatus} />
          </div>

          {/* pillar legend — the nodes made readable (name · pct · pace dot) */}
          {pillars.length ? (
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {pillars.map((p, i) => {
                const meta = paceMeta(p.paceStatus)
                return (
                  <motion.li
                    key={p.id}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : nodeBaseDelay + i * 0.08 }}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition ${
                      hovered === i ? 'border-gold/60 bg-white/10' : 'border-white/12 bg-white/5'
                    }`}
                  >
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meta.hex }} />
                    <span className="max-w-[160px] truncate text-white/85">{p.name}</span>
                    <span className="text-white/50">{Math.round((p.progressPct ?? 0) * 100)}%</span>
                  </motion.li>
                )
              })}
            </ul>
          ) : null}

          {summary?.reviewDueThisMonth ? (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[12.5px] font-semibold text-gold-light">
              Plan review is due this month
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

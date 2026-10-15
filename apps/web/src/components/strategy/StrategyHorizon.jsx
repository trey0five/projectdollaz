// ─────────────────────────────────────────────────────────────────────────────
// StrategyHorizon — the beforeBody HERO of the Strategic Planning command center.
// Premium UI P4: a Section on the ground (no navy glass, no gold). A monochrome
// 240° progress ARC (a horizon you travel toward, not a bar or donut): a hairline
// ink track, a module-hue progress stroke that SWEEPS in once via motion.path
// pathLength, the overall progress as a Garamond CountUp in the dome, and PILLAR
// NODES set along the arc, marked good / watch / risk by pace, that pop in after
// the sweep with a hover tooltip. Beside it, the plan's read: name, mission, the
// on-pace line and a ruled pillar legend. Reduced motion → arc at final length
// instantly, nodes fade with no scale.
//
// AURORA (2026-10-15): the arc + the read sit in ONE white AuroraCard under an
// AuroraSection medallion strip ("The plan", the plan's status/years as the
// count pill) — the same section grammar as every other module page.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CountUp } from '../ui/briefingFx.jsx'
import { Pill } from '../ui/surface/index.js'
import { AuroraSection, AuroraCard } from '../ui/aurora/index.js'
import { Compass } from 'lucide-react'
import { paceMeta } from './PaceChip.jsx'
import '../../styles/pending/b1-domain.css'

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
  const tone = paceStatus === 'behind' ? 'risk' : paceStatus === 'at_risk' ? 'watch' : 'good'
  if (!total) return <p className="text-[13.5px] font-medium text-ink2">No goals linked yet</p>
  return (
    <p className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink">
      <i className={`mark tone-${tone}`} aria-hidden="true" />
      On pace to hit {hit}
      <span className="font-medium text-ink2">of {total} goals</span>
    </p>
  )
}

const HUE = 'rgb(var(--c-module, 16 28 61))'
const INK = 'rgb(16 28 61)'

export default function StrategyHorizon({ plan, pillars = [], summary }) {
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState(null)

  const progress = Math.min(Math.max(plan?.overallProgressPct ?? 0, 0), 1)
  const pct = Math.round(progress * 100)
  const n = pillars.length

  // Sweep timing — nodes pop AFTER the arc reaches them.
  const nodeBaseDelay = reduce ? 0 : 0.75

  const eyebrow = `${plan?.status === 'adopted' ? 'Adopted plan' : plan?.status === 'draft' ? 'Draft plan' : 'Strategic plan'}${
    plan?.fyStartYear ? ` · FY${String(plan.fyStartYear).slice(-2)}–${String(plan.fyEndYear ?? plan.fyStartYear).slice(-2)}` : ''
  }`

  return (
    <AuroraSection icon={Compass} title="The plan" subtitle="Progress across every pillar" count={eyebrow}>
      <AuroraCard>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
          {/* ── The arc ──────────────────────────────────────────────────────── */}
          <div className="relative mx-auto w-full max-w-[400px] shrink-0 lg:mx-0">
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" role="img" aria-label={`Overall plan progress ${pct}%`}>
              {/* hairline track (the remaining horizon) */}
              <path d={ARC_D} fill="none" stroke={INK} strokeOpacity={0.1} strokeWidth={6} strokeLinecap="round" />
              {/* the module-hue progress stroke */}
              <motion.path
                d={ARC_D}
                fill="none"
                stroke={HUE}
                strokeWidth={6}
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: progress }}
                transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
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
                          : { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 22 } },
                      }}
                    >
                      {/* a generous invisible hit target */}
                      <circle cx={nx} cy={ny} r={16} fill="transparent" />
                      <circle cx={nx} cy={ny} r={8} fill={meta.hex} stroke="#fff" strokeWidth={3} />
                      <title>
                        {p.name} · {Math.round((p.progressPct ?? 0) * 100)}%
                      </title>
                    </motion.g>
                  )
                })}
              </motion.g>

              {/* ── Hover tooltip (SVG-native so it scales with the viewBox) ───── */}
              {hovered != null && pillars[hovered]
                ? (() => {
                    const p = pillars[hovered]
                    const f = n > 0 ? (hovered + 0.5) / n : 0.5
                    const [nx, ny] = polar(f)
                    const label = `${p.name} · ${Math.round((p.progressPct ?? 0) * 100)}%`
                    const w = Math.min(Math.max(label.length * 7.2 + 20, 90), 240)
                    const tx = Math.min(Math.max(nx - w / 2, 6), VB_W - w - 6)
                    const ty = ny - 44
                    return (
                      <g pointerEvents="none">
                        <rect x={tx} y={ty} width={w} height={28} rx={4} fill="#fff" stroke={INK} strokeOpacity={0.16} />
                        <text x={tx + w / 2} y={ty + 18} textAnchor="middle" fontSize={13} fill={INK} fontWeight="600">
                          {label}
                        </text>
                      </g>
                    )
                  })()
                : null}
            </svg>

            {/* centered overlay — the Garamond % + caption, sitting in the dome */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
              <div className="flex items-start font-serif font-medium leading-none text-ink">
                <CountUp value={pct} duration={1200} className="text-[60px] tabular-nums sm:text-[68px]" />
                <span className="mt-2 text-[26px] text-ink2 sm:text-[30px]">%</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">Overall progress</p>
            </div>
          </div>

          {/* ── The read ─────────────────────────────────────────────────────── */}
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[26px] font-medium leading-tight text-ink">{plan?.name ?? 'Strategic plan'}</h2>
            {plan?.mission ? <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink2">{plan.mission}</p> : null}

            <div className="mt-4">
              <StatusLine goalCounts={plan?.goalCounts} paceStatus={plan?.overallPaceStatus} />
            </div>

            {/* pillar legend — the nodes made readable (mark · name · pct), ruled */}
            {pillars.length ? (
              <ul className="b1-list mt-4">
                {pillars.map((p, i) => {
                  const meta = paceMeta(p.paceStatus)
                  return (
                    <li
                      key={p.id}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                      className={`b1-row justify-between ${hovered === i ? 'bg-ink/[.03]' : ''}`}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2 font-semibold">
                        <i className={`mark tone-${meta.tone}`} aria-hidden="true" />
                        <span className="[overflow-wrap:anywhere]">{p.name}</span>
                      </span>
                      <span className="font-semibold tabular-nums text-ink2">{Math.round((p.progressPct ?? 0) * 100)}%</span>
                    </li>
                  )
                })}
              </ul>
            ) : null}

            {summary?.reviewDueThisMonth ? (
              <div className="mt-4">
                <Pill variant="status" tone="watch">
                  Plan review is due this month
                </Pill>
              </div>
            ) : null}
          </div>
        </div>
      </AuroraCard>
    </AuroraSection>
  )
}

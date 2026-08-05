// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentHero — the hero of the Enrollment command center.
//
// THE ENROLLMENT RING: a 240° dome arc whose segments ARE the grades — each
// segment's length is that grade's share of enrollment and its colour is the
// grade's own golden-angle hue from lib/demographicColor.js, the same hue its
// pill wears in the register and its bar wears in the charts. One grade, one
// colour, everywhere. Segments sweep in staggered; the dome holds a giant
// CountUp headcount with the as-of date and a SOURCE chip ("Live from your
// roster" / the SIS name — fetched since Phase 2 and rendered nowhere until
// now). Hovering a legend pill lifts its segment; clicking deep-links to the
// register filtered to that grade.
//
// The hero ABSORBS the old KPI row: Waitlist / New this year / Support flags /
// Withdrawn ride as stat pips under the ring (Withdrawn from `counts.status`,
// which the API returned and nothing rendered). Their honesty rules are kept
// verbatim: no roster ⇒ an em-dash and "needs the student roster", never a zero
// we didn't count. Headline numbers here are the same unmasked byGrade totals
// ByGradeChart showed — the frozen-spec masking exemption; `<5` masking governs
// the demographic BarLists below, not headline totals.
//
// vs plan: a band-tinted delta chip (healthStatus over the SAME bands the
// analytics cards use), or the honest "No plan set → set one" link. NEVER a
// fabricated fraction: the ring shows composition, which is true with or
// without a plan.
//
// Reduced motion: static ring at full length, static glows, values immediate.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { GraduationCap, Hourglass, LifeBuoy, Sparkles, Target, UserRoundMinus } from 'lucide-react'
import { bandsFor, healthStatus } from '@finrep/analytics'
import { CountUp } from '../ui/briefingFx.jsx'
import { GRADE_KEYS } from '../../lib/demographicVocab.js'
import { demographicColor } from '../../lib/demographicColor.js'
import { moduleHue } from '../module/moduleAnatomy.js'

const ENROLL_HUE = moduleHue('enrollment')

// Arc geometry — StrategyHorizon's proven dome, sampled as a polyline so
// pathLength and segment boundaries can never disagree (no SVG arc-flag
// ambiguity). 240° sweep, 120° gap at the bottom.
const VB_W = 520
const VB_H = 330
const CX = 260
const CY = 210
const R = 180
const START = 210
const SWEEP = 240
/** Degrees of breathing room between grade segments. */
const PAD_DEG = 1.6

function polar(f, r = R) {
  const a = ((START - SWEEP * f) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

/** Sampled polyline between fractions f0..f1 of the dome. */
function segPath(f0, f1, samples = 48) {
  let d = ''
  for (let i = 0; i <= samples; i++) {
    const [x, y] = polar(f0 + ((f1 - f0) * i) / samples)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
  }
  return d.trim()
}

const GRADE_SHORT = Object.fromEntries(
  GRADE_KEYS.map((g) => [g, /^\d+$/.test(g) ? `Grade ${g}` : g]),
)

function fmtDay(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const PROVIDER_LABELS = {
  roster: 'Live from your roster',
  blackbaud: 'Synced from Blackbaud',
  facts: 'Synced from FACTS',
  veracross: 'Synced from Veracross',
  oneroster_api: 'Synced from your SIS',
  oneroster_csv: 'From your roster file',
  manual: 'Entered by hand',
}

/** One stat pip. `value` null ⇒ the honest em-dash + why. */
function StatPip({ Icon, label, value, needsRoster, reduce }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-3 py-1 sm:px-4">
      <span className="flex items-center gap-1.5 text-white/55">
        <Icon size={13} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">{label}</span>
      </span>
      {value == null ? (
        <>
          <span className="font-serif text-[24px] font-semibold leading-tight text-white/40">—</span>
          {needsRoster ? (
            <span className="text-[10px] text-white/40">needs the student roster</span>
          ) : null}
        </>
      ) : (
        <span className="font-serif text-[24px] font-semibold leading-tight text-white tabular-nums sm:text-[27px]">
          <CountUp value={value} duration={reduce ? 0 : 800} />
        </span>
      )}
    </div>
  )
}

export default function EnrollmentHero({
  total = null,
  byGrade = null,
  asOf = null,
  source = null,
  provider = null,
  vsPlan = null,
  kpis = null, // { waitlist, newThisYear, flagged } | null (no roster)
  withdrawn = null, // number | null
  onGradeClick = null,
}) {
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState(null)

  // The grade segments, in canonical order, zero-count grades dropped. Pad is
  // taken from each segment's own span so the arc total stays exact.
  const segments = useMemo(() => {
    const entries = GRADE_KEYS.map((g) => [g, Number(byGrade?.[g]) || 0]).filter(([, n]) => n > 0)
    const sum = entries.reduce((a, [, n]) => a + n, 0)
    if (sum === 0) return []
    const pad = PAD_DEG / SWEEP
    let acc = 0
    return entries.map(([g, n]) => {
      const span = n / sum
      const f0 = acc
      acc += span
      return {
        grade: g,
        count: n,
        share: span,
        f0: f0 + (entries.length > 1 ? pad / 2 : 0),
        f1: acc - (entries.length > 1 ? pad / 2 : 0),
        color: demographicColor('grade', g) ?? ENROLL_HUE,
      }
    })
  }, [byGrade])

  const sourceLabel = PROVIDER_LABELS[source === 'roster' ? 'roster' : provider] ?? null
  const asOfLabel = fmtDay(asOf)

  // vs plan — the SAME bands the analytics cards judge this metric with.
  const plan = useMemo(() => {
    if (!vsPlan || vsPlan.planTotal == null) return null
    const status = healthStatus(vsPlan.gapPct, bandsFor('enrollment_vs_plan'), true)
    return { ...vsPlan, status }
  }, [vsPlan])

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-3xl bg-navy-gradient shadow-navy-glow"
      aria-label="Enrollment at a glance"
    >
      {/* ── Living backdrop: sky hairline + drifting orbs + light sweep ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${ENROLL_HUE}, transparent)` }}
        />
        {reduce ? (
          <>
            <div className="absolute -left-16 top-6 h-56 w-56 rounded-full bg-sky/10 blur-3xl" />
            <div className="absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-sky/[0.07] blur-3xl" />
          </>
        ) : (
          <>
            <motion.span
              className="absolute -left-16 top-6 h-56 w-56 rounded-full bg-sky/10 blur-3xl"
              animate={{ x: [0, 46, 0], y: [0, 24, 0] }}
              transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.span
              className="absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-sky/[0.07] blur-3xl"
              animate={{ x: [0, -38, 0], y: [0, -20, 0] }}
              transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
      </div>

      <div className="relative flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:gap-8">
        {/* ── The ring ── */}
        <div className="relative mx-auto w-full max-w-[430px] shrink-0 lg:mx-0 lg:w-[46%]">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block w-full" aria-hidden="true">
            <defs>
              <filter id="enroll-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="7" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                </feMerge>
              </filter>
            </defs>
            {/* faint full track */}
            <path
              d={segPath(0, 1, 180)}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {segments.map((seg, i) => {
              const dim = hovered != null && hovered !== seg.grade
              const d = segPath(seg.f0, seg.f1)
              return (
                <g key={seg.grade} opacity={dim ? 0.28 : 1} style={{ transition: 'opacity 200ms' }}>
                  {/* soft under-glow in the segment's own hue */}
                  <motion.path
                    d={d}
                    fill="none"
                    stroke={seg.color}
                    strokeOpacity="0.5"
                    strokeWidth="14"
                    filter="url(#enroll-glow)"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ type: 'spring', stiffness: 55, damping: 18, delay: 0.15 + i * 0.12 }}
                  />
                  <motion.path
                    d={d}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="12"
                    strokeLinecap="butt"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ type: 'spring', stiffness: 55, damping: 18, delay: 0.15 + i * 0.12 }}
                  />
                </g>
              )
            })}
          </svg>

          {/* ── Dome: the headcount ── */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8 text-center">
            {total != null ? (
              <>
                <span className="font-serif text-[58px] font-semibold leading-none text-white drop-shadow-[0_0_18px_rgba(56,189,248,0.35)] tabular-nums sm:text-[70px]">
                  <CountUp value={total} duration={reduce ? 0 : 1200} />
                </span>
                <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
                  students enrolled
                </span>
                {asOfLabel ? (
                  <span className="mt-0.5 text-[11.5px] text-white/45">as of {asOfLabel}</span>
                ) : null}
              </>
            ) : (
              <>
                <span className="font-serif text-[44px] font-semibold leading-none text-white/35">—</span>
                <span className="mt-1 max-w-[220px] text-[12px] leading-snug text-white/50">
                  No enrollment recorded yet — add a roster or a headcount from Add data.
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Narrative rail ── */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow" style={{ backgroundColor: ENROLL_HUE }}>
              <GraduationCap size={18} />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
              Enrollment · at a glance
            </p>
            {sourceLabel ? (
              <span className="ml-auto rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-white/65">
                {sourceLabel}
              </span>
            ) : null}
          </div>

          {/* vs plan — band-tinted, or the honest no-plan door */}
          <div className="mt-3">
            {plan ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] text-white/75">
                <Target size={14} className="translate-y-[1.5px] text-white/50" />
                <span className="font-semibold text-white tabular-nums">
                  {plan.gap >= 0 ? '+' : '−'}
                  {Math.abs(plan.gap).toLocaleString('en-US')}
                </span>
                <span>vs a plan of {plan.planTotal.toLocaleString('en-US')}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                    plan.status === 'good'
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : plan.status === 'risk'
                        ? 'bg-red-400/15 text-red-300'
                        : 'bg-amber-300/15 text-amber-200'
                  }`}
                >
                  {plan.status === 'good' ? 'on plan' : plan.status === 'risk' ? 'behind plan' : 'watch'}
                </span>
              </p>
            ) : (
              <p className="text-[13.5px] text-white/55">
                No plan set —{' '}
                <Link to="/planning" className="font-semibold text-sky underline decoration-sky/40 underline-offset-2 hover:decoration-sky">
                  set one in Planning
                </Link>{' '}
                and this becomes a live vs-plan read.
              </p>
            )}
          </div>

          {/* Grade legend — hover lifts the segment, click filters the register */}
          {segments.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {segments.map((seg) => (
                <button
                  key={seg.grade}
                  type="button"
                  onMouseEnter={() => setHovered(seg.grade)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(seg.grade)}
                  onBlur={() => setHovered(null)}
                  onClick={onGradeClick ? () => onGradeClick(seg.grade) : undefined}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] py-1 pl-2 pr-2.5 text-[12px] font-semibold text-white/75 outline-none transition-colors hover:border-white/30 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky/60"
                  title={onGradeClick ? `See ${GRADE_SHORT[seg.grade]} in the register` : undefined}
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                  {GRADE_SHORT[seg.grade]}
                  <span className="text-white/50 tabular-nums">{seg.count.toLocaleString('en-US')}</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* ── The absorbed KPI row ── */}
          <div className="mt-4 flex flex-wrap items-start divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] py-2">
            <StatPip Icon={Hourglass} label="Waitlist" value={kpis?.waitlist ?? null} needsRoster={!kpis} reduce={reduce} />
            <StatPip Icon={Sparkles} label="New this year" value={kpis?.newThisYear ?? null} needsRoster={!kpis} reduce={reduce} />
            <StatPip Icon={LifeBuoy} label="Support flags" value={kpis?.flagged ?? null} needsRoster={!kpis} reduce={reduce} />
            <StatPip Icon={UserRoundMinus} label="Withdrawn" value={withdrawn} needsRoster={!kpis} reduce={reduce} />
          </div>
        </div>
      </div>
    </motion.section>
  )
}

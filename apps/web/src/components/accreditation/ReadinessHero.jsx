// ─────────────────────────────────────────────────────────────────────────────
// ReadinessHero — the beforeKPI HERO of the Accreditation command center once a
// framework is adopted. A wide navy-glass panel with a 240° AMBER gauge (reuses
// the /strategy Horizon-arc math): a faint track over the framework's index scale
// (Cognia 100–400), band tick-marks at every status boundary, the projected index
// as a giant amber serif CountUp with its status-band chip, plus a readiness bar
// (rubric×evidence blend), clickable TARGET pills built from the framework's
// statusBands (choice persisted per school upstream), the "fastest path" gap list
// (each row deep-scrolls to its standard), and the assurances checklist strip.
// Frameworks with no index scale (MSA/NSBECS) hide the dial/bands and lead with
// the readiness bar. No framework adopted → the amber adopt prompt instead.
// Single-hue amber marks on navy; identity/status always carried by text+icon,
// never color alone. Reduced motion → no sweep, instant values.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { Award, BadgeCheck, Check, ChevronRight, Compass, ShieldAlert, Sparkles } from 'lucide-react'
import { CountUp } from '../ui/briefingFx.jsx'

const AMBER = '#F59E0B'

// Arc geometry — the same symmetric 240° dome as StrategyHorizon (120° bottom gap).
const VB_W = 520
const VB_H = 320
const CX = 260
const CY = 205
const R = 172
const START = 210 // degrees (lower-left base)
const SWEEP = 240 // clockwise to -30° (lower-right base)

function polar(f, r = R) {
  const a = ((START - SWEEP * f) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

// Sampled polyline so pathLength sweep + tick angles always agree (no arc-flag ambiguity).
function arcPath(samples = 180) {
  let d = ''
  for (let i = 0; i <= samples; i++) {
    const [x, y] = polar(i / samples)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
  }
  return d.trim()
}
const ARC_D = arcPath()

const fmtLift = (v) => (v == null ? null : `+${Math.round(v * 10) / 10} pts`)

// ── The adopt prompt (no framework yet) ──────────────────────────────────────
function AdoptPrompt({ canEdit, onAdopt }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-[#F59E0B]/30 bg-navy-gradient shadow-navy-glow">
      <div className="pointer-events-none absolute inset-0 bg-navy-radial" aria-hidden />
      <div className="relative flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-navy shadow-glow"
          style={{ background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)' }}
        >
          <Compass size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#fbbf24]">
            Accreditation readiness
          </p>
          <h2 className="mt-1 font-serif text-[24px] font-semibold leading-tight text-white sm:text-[27px]">
            Adopt your accreditor&apos;s framework
          </h2>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-white/70">
            Pull in the full Cognia, MSA-CESS, or NSBECS standards catalog — then self-score each
            standard on the official rubric and watch your projected accreditation status build
            live, with the fastest path to your target mapped for you.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onAdopt}
            className="inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-navy shadow-glow transition hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)' }}
          >
            <Sparkles size={16} /> Adopt a framework
          </button>
        ) : (
          <p className="shrink-0 text-[13px] text-white/50">Ask an owner to adopt a framework.</p>
        )}
      </div>
    </div>
  )
}

// ── The readiness bar (rubric×evidence blend, 0–100) ─────────────────────────
function ReadinessBar({ pct, scoredCount, coveredCount, leafCount, reduce }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          Readiness
        </p>
        <p className="text-[13px] font-semibold text-white/80">
          <span className="text-[#fbbf24]">{pct}%</span>
          <span className="text-white/45">
            {' '}
            · {scoredCount}/{leafCount} scored · {coveredCount} evidenced
          </span>
        </p>
      </div>
      <div
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Readiness ${pct}%`}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)' }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 18 }}
        />
      </div>
    </div>
  )
}

export default function ReadinessHero({
  readiness,
  adopted = false,
  canEdit = false,
  onAdopt,
  onSelectTarget,
  onGapClick,
  reduce = false,
}) {
  if (!adopted) return <AdoptPrompt canEdit={canEdit} onAdopt={onAdopt} />
  if (!readiness) {
    return (
      <div className="rounded-3xl border-2 border-[#F59E0B]/20 bg-navy-gradient p-8 shadow-navy-glow">
        <p className="text-[13.5px] text-white/55">Computing your accreditation readiness…</p>
      </div>
    )
  }

  const fw = readiness.framework ?? null
  const bands = fw?.statusBands ?? []
  const hasIndex =
    fw?.indexMin != null && fw?.indexMax != null && readiness.projectedIndex != null
  const span = hasIndex ? fw.indexMax - fw.indexMin : 1
  const frac = hasIndex
    ? Math.min(Math.max((readiness.projectedIndex - fw.indexMin) / span, 0), 1)
    : 0
  // Target pills — the ambition ladder. Skip the lowest band (it's the floor, not
  // a target); Cognia → Accredited 280 / Merit 320 / Distinction 360.
  const pills = hasIndex ? (bands.length > 1 ? bands.slice(1) : bands) : []
  const activeTargetIndex = readiness.target?.index ?? fw?.defaultTarget ?? null
  const gaps = (readiness.gaps ?? []).slice(0, 5)
  const assurances = readiness.assurances ?? []
  const pointGap = readiness.target?.pointGap ?? null

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-[#F59E0B]/25 bg-navy-gradient shadow-navy-glow">
      <div className="pointer-events-none absolute inset-0 bg-navy-radial" aria-hidden />

      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:gap-8">
        {/* ── LEFT: the amber index gauge (index frameworks only) ───────────── */}
        {hasIndex ? (
          <div className="relative mx-auto w-full max-w-[420px] shrink-0 lg:mx-0">
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              className="w-full"
              role="img"
              aria-label={`Projected index ${readiness.projectedIndex} of ${fw.indexMax} — ${readiness.band ?? 'below accreditation threshold'}`}
            >
              <defs>
                <linearGradient id="readiness-amber" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="50%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <filter id="readiness-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* faint track — the full index scale */}
              <path
                d={ARC_D}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.12}
                strokeWidth={14}
                strokeLinecap="round"
              />
              {/* glow underlay */}
              <motion.path
                d={ARC_D}
                fill="none"
                stroke="url(#readiness-amber)"
                strokeOpacity={0.5}
                strokeWidth={14}
                strokeLinecap="round"
                filter="url(#readiness-glow)"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: frac }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 18 }}
              />
              {/* crisp amber progress stroke */}
              <motion.path
                d={ARC_D}
                fill="none"
                stroke="url(#readiness-amber)"
                strokeWidth={12}
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: frac }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 18 }}
              />

              {/* band boundary ticks + threshold labels */}
              {bands.map((b) => {
                const f = Math.min(Math.max((b.min - fw.indexMin) / span, 0), 1)
                const [x1, y1] = polar(f, R - 13)
                const [x2, y2] = polar(f, R + 13)
                const [lx, ly] = polar(f, R + 30)
                const reached = frac >= f
                return (
                  <g key={b.min}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={reached ? AMBER : '#ffffff'}
                      strokeOpacity={reached ? 0.9 : 0.35}
                      strokeWidth={2.5}
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={12.5}
                      fontWeight={600}
                      fill="#ffffff"
                      fillOpacity={reached ? 0.85 : 0.45}
                    >
                      {b.min}
                    </text>
                    <title>
                      {b.label} · {b.min}+
                    </title>
                  </g>
                )
              })}

              {/* scale endpoints */}
              {(() => {
                const [sx, sy] = polar(0, R + 30)
                const [ex, ey] = polar(1, R + 30)
                return (
                  <g fontSize={12} fontWeight={600} fill="#ffffff" fillOpacity={0.4}>
                    <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle">
                      {fw.indexMin}
                    </text>
                    <text x={ex} y={ey} textAnchor="middle" dominantBaseline="middle">
                      {fw.indexMax}
                    </text>
                  </g>
                )
              })()}
            </svg>

            {/* centered overlay — projected index + band chip in the dome */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
              <div className="font-serif font-semibold leading-none text-[#fbbf24] drop-shadow-[0_0_18px_rgba(245,158,11,0.45)]">
                <CountUp
                  value={readiness.projectedIndex}
                  duration={1200}
                  className="text-[62px] sm:text-[72px]"
                />
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                Projected index
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-3 py-1 text-[12.5px] font-semibold text-[#fde68a]">
                <Award size={13} aria-hidden />
                {readiness.band ?? 'Below accreditation threshold'}
              </p>
            </div>
          </div>
        ) : null}

        {/* ── RIGHT: narrative rail — framework, readiness, targets, fastest path ─ */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#fbbf24]/90">
            {fw ? `${fw.name}` : 'Accreditation readiness'}
          </p>
          <h2 className="mt-1 font-serif text-[24px] font-semibold leading-tight text-white sm:text-[27px]">
            {hasIndex
              ? pointGap != null && pointGap > 0
                ? `${pointGap} points from ${readiness.target?.bandLabel ?? 'your target'}`
                : readiness.target
                  ? `Target reached — ${readiness.target.bandLabel}`
                  : 'Your readiness picture'
              : 'Your readiness picture'}
          </h2>

          <div className="mt-4">
            <ReadinessBar
              pct={readiness.readinessPct ?? 0}
              scoredCount={readiness.scoredCount ?? 0}
              coveredCount={readiness.coveredCount ?? 0}
              leafCount={readiness.leafCount ?? 0}
              reduce={reduce}
            />
          </div>

          {/* Target pills */}
          {pills.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Target
              </span>
              {pills.map((b) => {
                const active = activeTargetIndex === b.min
                return (
                  <button
                    key={b.min}
                    type="button"
                    onClick={() => onSelectTarget?.(b.min)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition ${
                      active
                        ? 'border-[#F59E0B] bg-[#F59E0B]/20 text-[#fde68a]'
                        : 'border-white/15 bg-white/5 text-white/65 hover:border-[#F59E0B]/50 hover:text-white'
                    }`}
                  >
                    {b.label} · {b.min}
                  </button>
                )
              })}
              {readiness.target?.stepsToTarget != null && readiness.target.stepsToTarget > 0 ? (
                <span className="text-[12px] text-white/50">
                  ≈ {readiness.target.stepsToTarget} rubric step
                  {readiness.target.stepsToTarget === 1 ? '' : 's'} to go
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Fastest path — the gap list */}
          {gaps.length ? (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Fastest path
              </p>
              <ul className="mt-2 space-y-1.5">
                {gaps.map((g) => (
                  <li key={g.standardId}>
                    <button
                      type="button"
                      onClick={() => onGapClick?.(g.standardId)}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-navy/40 px-3 py-2 text-left transition hover:border-[#F59E0B]/50 hover:bg-navy/60"
                    >
                      <span className="shrink-0 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11.5px] font-semibold text-white/70">
                        {g.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">
                        {g.title}
                      </span>
                      {g.evidenceGap ? (
                        <span className="shrink-0 rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#fde68a]">
                          no evidence
                        </span>
                      ) : null}
                      {fmtLift(g.fullLift) ? (
                        <span
                          className="shrink-0 text-[12px] font-bold text-[#fbbf24]"
                          title={
                            g.nextStepLift != null
                              ? `${fmtLift(g.nextStepLift)} per rubric step · ${fmtLift(g.fullLift)} at full marks`
                              : undefined
                          }
                        >
                          {fmtLift(g.fullLift)}
                        </span>
                      ) : null}
                      <ChevronRight
                        size={14}
                        className="shrink-0 text-white/30 transition group-hover:text-[#fbbf24]"
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Assurances strip (Cognia binary gates) ─────────────────────────── */}
      {assurances.length ? (
        <div className="relative border-t border-white/10 px-5 py-3.5 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              <BadgeCheck size={13} aria-hidden /> Assurances
            </span>
            {assurances.map((a) => (
              <button
                key={a.standardId}
                type="button"
                onClick={() => onGapClick?.(a.standardId)}
                title={a.title}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition ${
                  a.satisfied
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/70'
                    : 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#fde68a] hover:border-[#F59E0B]/70'
                }`}
              >
                {a.satisfied ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <ShieldAlert size={12} aria-hidden />
                )}
                {a.code}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

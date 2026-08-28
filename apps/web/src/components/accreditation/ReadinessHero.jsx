// ─────────────────────────────────────────────────────────────────────────────
// ReadinessHero — the beforeKPI HERO of the Accreditation command center once a
// framework is adopted. A wide navy-glass panel with a 240° AMBER gauge (reuses
// the /strategy Horizon-arc math): a faint track over the framework's index scale
// (Cognia 100–400), band tick-marks at every status boundary, the projected index
// as a giant amber serif CountUp with its status-band chip, plus the Documented /
// Defensible PAIR (Phase A — readiness is never one blended number) over the
// recorded-readiness strip, clickable TARGET pills built from the framework's
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
// ── Phase A (Accreditation Intelligence): readiness is a PAIR, and it has a past ─
import ProvenancePair from './ProvenancePair.jsx'
import ReadinessTrendStrip from './ReadinessTrendStrip.jsx'
// ── Phase B: and it publishes the size of its own hole ───────────────────────
import { ConfidenceChip } from './ConfidenceChip.jsx'

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

// 'yyyy-mm-dd' → 'Aug 12, 2026'. Local to this file: the hero shows no other
// date, and an ISO string in a sentence is not how this product speaks.
const fmtDate = (iso) => {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

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
            Pull in a full standards catalog — Cognia, MSA-CESS, NSBECS, FCIS, ACSI, ACS WASC or
            SAIS — then self-score each standard on the rubric and watch your readiness build live,
            with the fastest path to your target mapped for you. Hold more than one accreditation?
            Adopt them both and switch between them here.
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

export default function ReadinessHero({
  readiness,
  adopted = false,
  canEdit = false,
  onAdopt,
  onSelectTarget,
  onGapClick,
  reduce = false,
  // Phase A: the readiness HISTORY (useReadinessTrend's value) — optional, so the
  // hero still renders exactly as before if it is not wired.
  history = null,
  // F1: the CYCLE payload (useAccreditationCycle's value.cycle) — optional. The
  // countdown strip renders ONLY when a cycle is configured; a school that never
  // set its anchor sees the hero exactly as before.
  cycle = null,
  onOpenJourney = null,
  // F4: the register filtered to scored-but-unevidenced rows — the risk chip's
  // destination.
  onUnbackedClick = null,
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
  // ── AIC Phase G: the ghosted in-flight PROJECTION ──────────────────────────
  // `inFlight` is ADVISORY and structurally separate from the headline: the
  // server computes it from a SECOND schoolReadiness() pass over lifted leaves and
  // assigns it to nothing but this key. Nothing below may leak it into
  // projectedIndex, band or the arc's own `frac` — the arc keeps sweeping to the
  // real index, and the projection is a dashed ghost beyond it with the literal
  // word PROJECTION on it. A projection that quietly becomes the headline number
  // is the single worst thing this phase could ship, so it is drawn thinner,
  // dashed, half-opaque, and never inside the centre overlay.
  const inFlight = readiness.inFlight ?? null
  const expectedIndex = inFlight?.expectedIndexIfDelivered ?? null
  const hasProjection = hasIndex && expectedIndex != null
  const projFrac = hasProjection
    ? Math.min(Math.max((expectedIndex - fw.indexMin) / span, 0), 1)
    : null
  const excluded = inFlight?.excluded ?? null

  // Target pills — the ambition ladder. Skip the lowest band (it's the floor, not
  // a target); Cognia → Accredited 280 / Merit 320 / Distinction 360.
  const pills = hasIndex ? (bands.length > 1 ? bands.slice(1) : bands) : []
  const activeTargetIndex = readiness.target?.index ?? fw?.defaultTarget ?? null
  const gaps = (readiness.gaps ?? []).slice(0, 5)
  const assurances = readiness.assurances ?? []
  const pointGap = readiness.target?.pointGap ?? null

  // ── F4: the next-band two-sided sentence + the unbacked-points risk ────────
  // Both are SERVER-COMPUTED additions to the readiness payload (top-level —
  // the real payload has no `summary` object, B7). Absent → the hero keeps its
  // existing phrasing; nothing here is derived client-side.
  const nextBand = readiness.nextBand ?? null
  const unbackedPoints = readiness.unbackedIndexPoints ?? null
  // B1 — below the lowest band the server's `band` is the SENTINEL STRING
  // "Below accreditation threshold" (never null), so a truthy-band check alone
  // would print "You'd land Below accreditation threshold today". The payload's
  // belowThreshold boolean is the gate; the two-sided phrasing only renders for
  // a real landing.
  const belowThreshold = readiness.belowThreshold === true
  const landsInBand = Boolean(readiness.band) && !belowThreshold

  // ── WS1: the seal line, composed server-side, rendered verbatim ────────────
  const sealLine = readiness.framework?.division?.sealLine ?? null

  // ── The accreditor-published reference point (display-only, never in math) ──
  const indexRef = fw?.indexReference ?? null
  const indexRefFrac =
    hasIndex && indexRef && typeof indexRef.value === 'number'
      ? Math.min(Math.max((indexRef.value - fw.indexMin) / span, 0), 1)
      : null

  // ── F1: the countdown strip — one line, only when a cycle is configured ────
  const countdown = cycle?.configured ? (cycle.countdown ?? null) : null
  const cyclePhase = cycle?.configured ? (cycle.phase ?? null) : null
  const cycleTermYears = cycle?.configured ? (cycle.anchor?.termYears ?? null) : null

  // ── Phase A: the pair + the recorded past ──────────────────────────────────
  // Documented / Defensible come from the LIVE readiness payload — the same
  // instant, the same leaf set and the same engine as scoredCount / coveredCount
  // / leafCount in the caption beside them. They are deliberately NOT read off
  // the newest snapshot: a snapshot is last night, the counts are now, and
  // pairing the two produces sentences that contradict themselves ("Defensible
  // 55% … 31 evidenced") the moment anyone attaches evidence during the day.
  // The recorded series is for the strip below, which is where a past tense is
  // truthful. Both figures are computed server-side by the pure
  // selfScoredPct/verifiedPct functions — nothing here is estimated.

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

              {/* ── The ghosted in-flight projection (AIC Phase G) ──────────
                  Dashed, thin and half-opaque so it can never be mistaken for
                  the solid amber index stroke, and drawn BEFORE the ticks so it
                  sits visually behind the real scale. */}
              {hasProjection ? (
                <g data-testid="projection-marker">
                  <title>
                    PROJECTION — {expectedIndex} if the in-flight work is delivered. Not your
                    current index.
                  </title>
                  <motion.path
                    d={ARC_D}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity={0.45}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray="5 7"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: projFrac }}
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 40, damping: 20 }}
                  />
                  {(() => {
                    const [mx1, my1] = polar(projFrac, R - 18)
                    const [mx2, my2] = polar(projFrac, R + 18)
                    return (
                      <line
                        x1={mx1}
                        y1={my1}
                        x2={mx2}
                        y2={my2}
                        stroke="#ffffff"
                        strokeOpacity={0.75}
                        strokeWidth={2}
                        strokeDasharray="3 3"
                      />
                    )
                  })()}
                </g>
              ) : null}

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

              {/* the accreditor-published reference point (e.g. Cognia's 296
                  network-average IEQ) — a FAINT labelled tick, display-only,
                  never entering the sweep or any readiness math */}
              {indexRefFrac != null ? (
                <g data-testid="index-reference-tick">
                  {(() => {
                    const [x1, y1] = polar(indexRefFrac, R - 22)
                    const [x2, y2] = polar(indexRefFrac, R + 8)
                    const [lx, ly] = polar(indexRefFrac, R - 34)
                    return (
                      <>
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="#ffffff"
                          strokeOpacity={0.35}
                          strokeWidth={1.5}
                          strokeDasharray="2 3"
                        />
                        <text
                          x={lx}
                          y={ly}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={10.5}
                          fontWeight={600}
                          fill="#ffffff"
                          fillOpacity={0.4}
                        >
                          {indexRef.value}
                        </text>
                      </>
                    )
                  })()}
                  <title>{indexRef.label ?? `Reference · ${indexRef.value}`}</title>
                </g>
              ) : null}

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
              {/* THE HEADLINE. It renders `projectedIndex` and nothing else —
                  never inFlight.expectedIndexIfDelivered, which is advisory and
                  lives in its own dashed panel. Pinned by a spec. */}
              <div
                data-testid="projected-index"
                className="font-serif font-semibold leading-none text-[#fbbf24] drop-shadow-[0_0_18px_rgba(245,158,11,0.45)]"
              >
                <CountUp
                  value={readiness.projectedIndex}
                  duration={1200}
                  className="text-[62px] sm:text-[72px]"
                />
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                Projected index
              </p>
              <p
                data-testid="band-label"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-3 py-1 text-[12.5px] font-semibold text-[#fde68a]"
              >
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
          {/* WS1 — the seal line, server-composed, verbatim ("Accredited by NCA
              CASI, an accreditation division of Cognia"). Absent → nothing. */}
          {sealLine ? (
            <p data-testid="seal-line" className="mt-0.5 text-[12px] font-medium text-white/55">
              {sealLine}
            </p>
          ) : null}
          {/* F4 — BAND-AWARE AND TWO-SIDED. When the projected index lands in a
              band (belowThreshold false), the headline says where you'd land
              TODAY and the sub-line names the distance to the NEXT tier (both
              server-computed). Below the bottom band — belowThreshold true, and
              `band` carrying the floor sentinel, not a landing — the original
              target phrasing stands. */}
          <h2 className="mt-1 font-serif text-[24px] font-semibold leading-tight text-white sm:text-[27px]">
            {hasIndex && landsInBand
              ? `You'd land ${readiness.band} today`
              : hasIndex
                ? pointGap != null && pointGap > 0
                  ? `${pointGap} points from ${readiness.target?.bandLabel ?? 'your target'}`
                  : readiness.target
                    ? `Target reached — ${readiness.target.bandLabel}`
                    : 'Your readiness picture'
                : 'Your readiness picture'}
          </h2>
          {hasIndex && landsInBand && nextBand ? (
            <p data-testid="next-band-line" className="mt-1 text-[14px] font-medium text-white/70">
              {nextBand.pointGap} point{nextBand.pointGap === 1 ? '' : 's'} from {nextBand.label}
            </p>
          ) : null}

          <div className="mt-4">
            <ProvenancePair
              documentedPct={
                typeof readiness.selfScoredPct === 'number' ? readiness.selfScoredPct : null
              }
              defensiblePct={
                typeof readiness.verifiedPct === 'number' ? readiness.verifiedPct : null
              }
              scoredCount={readiness.scoredCount ?? 0}
              coveredCount={readiness.coveredCount ?? 0}
              leafCount={readiness.leafCount ?? 0}
              reduce={reduce}
            />
          </div>

          {/* Phase B — how much of the ten-domain grid these figures rest on. It
              sits directly under the pair because the pair is the first thing
              read, and "5 of 10 domains" belongs beside it, not a scroll away. */}
          {readiness.confidence ? (
            <div className="mt-3">
              <ConfidenceChip confidence={readiness.confidence} reduce={reduce} />
            </div>
          ) : null}

          {/* F4 — THE REVIEW-DAY RISK, named. Server-computed: index points
              contributed by scores with no evidence behind them. Zero or absent
              → no chip (suppressed is not zero). Clicks to the register
              filtered to exactly those rows. */}
          {typeof unbackedPoints === 'number' && unbackedPoints > 0 ? (
            <button
              type="button"
              data-testid="unbacked-risk-chip"
              onClick={onUnbackedClick ?? undefined}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#fde68a] transition hover:bg-[#F59E0B]/20"
            >
              <ShieldAlert size={13} aria-hidden />
              {unbackedPoints} of your projected points rest on scores with no evidence
            </button>
          ) : null}

          {/* ── In-flight work: the ADVISORY projection, and what it left out ──
              Rendered whenever there is either a projection to state or work that
              had to be excluded from one. The exclusion counts are not a footnote:
              a school whose initiatives carry no target score would otherwise see
              "no projection" and have no idea why. */}
          {inFlight && (hasProjection || (excluded?.noTargetScore ?? 0) > 0 || (excluded?.noDueDate ?? 0) > 0) ? (
            <div
              className="mt-4 rounded-xl border border-dashed border-white/25 bg-white/[0.04] px-3 py-2.5"
              data-testid="inflight-panel"
            >
              {hasProjection ? (
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[10.5px] font-bold tracking-[0.12em] text-white/85">
                    PROJECTION
                  </span>
                  <p className="text-[13px] text-white/80" data-testid="inflight-sentence">
                    → {expectedIndex}
                    {inFlight.expectedBandIfDelivered ? ` · ${inFlight.expectedBandIfDelivered}` : ''}
                    {inFlight.expectedByDate
                      ? ` if delivered by ${fmtDate(inFlight.expectedByDate) ?? inFlight.expectedByDate}`
                      : ' if delivered'}
                  </p>
                </div>
              ) : null}
              {inFlight.basis ? (
                <p className="mt-1 text-[12px] leading-relaxed text-white/50">{inFlight.basis}</p>
              ) : null}
              {(excluded?.noTargetScore ?? 0) > 0 || (excluded?.noDueDate ?? 0) > 0 ? (
                <p className="mt-1 text-[12px] leading-relaxed text-white/50" data-testid="inflight-excluded">
                  {[
                    (excluded?.noTargetScore ?? 0) > 0
                      ? `${excluded.noTargetScore} left out — no target rubric score`
                      : null,
                    (excluded?.noDueDate ?? 0) > 0
                      ? `${excluded.noDueDate} left out — no due date`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
          ) : null}

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

          {/* F1 — THE COUNTDOWN STRIP: one line, rendered only when a cycle is
              configured (unconfigured schools see the hero exactly as before).
              Every figure is the cycle payload's own; the click lands on the
              Journey tab, where the whole road lives. */}
          {countdown ? (
            <button
              type="button"
              data-testid="cycle-countdown-strip"
              onClick={onOpenJourney ?? undefined}
              className="mt-4 flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-left text-[13px] text-white/75 transition hover:border-[#F59E0B]/50 hover:text-white"
            >
              {cyclePhase?.yearOfCycle != null && cycleTermYears != null ? (
                <span className="font-semibold text-[#fde68a]">
                  Year {cyclePhase.yearOfCycle} of {cycleTermYears}
                </span>
              ) : null}
              {cyclePhase?.yearOfCycle != null && cycleTermYears != null ? (
                <span className="text-white/30">·</span>
              ) : null}
              <span>
                {countdown.label}
                {countdown.dueDate ? ` due ${fmtDate(countdown.dueDate) ?? countdown.dueDate}` : ''}
              </span>
              {typeof countdown.daysRemaining === 'number' ? (
                <>
                  <span className="text-white/30">·</span>
                  <span className="font-semibold text-[#fbbf24]">
                    {countdown.daysRemaining} day{countdown.daysRemaining === 1 ? '' : 's'}
                  </span>
                </>
              ) : null}
              <ChevronRight size={14} className="ml-auto shrink-0 text-white/35" aria-hidden />
            </button>
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
                      /* items-START, not items-center: the title is allowed two
                         lines now, and centre-aligning would float the code chip
                         and the pills against its middle. */
                      className="group flex w-full items-start gap-2.5 rounded-lg border border-white/10 bg-navy/40 px-3 py-2 text-left transition hover:border-[#F59E0B]/50 hover:bg-navy/60"
                    >
                      <span className="mt-px shrink-0 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11.5px] font-semibold text-white/70">
                        {g.code}
                      </span>
                      {/* WAS `truncate`, which showed ~169px of a 100-character
                          standard name at 1280 — roughly a quarter of it, ending
                          mid-word, on the one list whose whole job is telling a
                          head of school WHICH standard to work next. A code plus
                          a fragment is not an answer. Two lines, clamped, so a
                          long name is readable without the row growing without
                          bound; `break-words` is the last-resort guard for an
                          unbreakable token. */}
                      <span className="line-clamp-2 min-w-0 flex-1 break-words text-[13px] leading-snug text-white/80">
                        {g.title}
                      </span>
                      {g.evidenceGap ? (
                        <span className="shrink-0 rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#fde68a]">
                          no evidence
                        </span>
                      ) : null}
                      {/* Phase G: work already pointed at this gap. A COUNT, not a
                          projection — the gap's own numbers are untouched by it. */}
                      {(g.work?.initiativeCount ?? 0) > 0 ? (
                        <span
                          className="shrink-0 rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/75"
                          title={
                            g.work.nearestDueDate
                              ? `Next due ${fmtDate(g.work.nearestDueDate) ?? g.work.nearestDueDate}`
                              : 'No due date set'
                          }
                        >
                          {g.work.initiativeCount} in flight
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

      {/* ── Recorded readiness (Phase A) — beneath the gauge, full width so it ──
          survives frameworks with no index scale (where the gauge is hidden). */}
      {history ? (
        <div className="relative px-5 pb-5 sm:px-7 sm:pb-7">
          <ReadinessTrendStrip
            series={history.series}
            seriesKey={history.seriesKey}
            onSeriesKeyChange={history.setSeriesKey}
            trend={history.trend}
            loading={history.loading}
            error={history.error}
            notLicensed={history.notLicensed}
            reduce={reduce}
          />
        </div>
      ) : null}

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

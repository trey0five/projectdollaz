// ─────────────────────────────────────────────────────────────────────────────
// ReadinessHero — the head of the Accreditation command center once a framework
// is adopted.
//
// PREMIUM UI P4 (plan sketch 6): the navy stage is gone. The hero is a light
// `Section` on the ground — the framework as its label, the ConfidenceChip as
// its aside — holding a prose "read" column (the band-aware headline, the
// Documented / Defensible PAIR, the review-day risk, the in-flight projection,
// the target ladder, the cycle countdown, and the "fastest path" as ruled rows)
// with the 240° index arc right-aligned beside it. The arc is MONOCHROME: the
// module hue over an ink track; band ticks and labels in ink; the in-flight
// projection a dashed ink ghost beyond the solid stroke. Frameworks with no
// index scale (MSA/NSBECS) hide the arc and the prose column runs full width.
// No framework adopted → the adopt prompt is a `Panel` (it carries the action).
// Status is always carried by text + a 2px mark, never colour alone. Reduced
// motion → no sweep, instant values.
//
// AURORA (owner-approved 2026-10-15): the hero is now three Aurora sections
// under the module band — "Quickest wins" (the gap list as tiles), "Must-pass
// checks" (the assurance gates as tiles) and "Your score" (the read, the
// Documented / Defensible pair, the target ladder and the recorded trend in
// white cards). On the page the index arc moves ONTO the band as
// ReadinessDial (dial={false} here); standalone it still renders in the card.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { Check, ChevronRight, Compass, Gauge, ShieldAlert, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { CountUp } from '../ui/briefingFx.jsx'
import { Pill } from '../ui/surface/index.js'
import {
  AuroraCard,
  AuroraEmpty,
  AuroraLightButton,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  VerdictPill,
} from '../ui/aurora/index.js'
// ── Phase A (Accreditation Intelligence): readiness is a PAIR, and it has a past ─
import ProvenancePair from './ProvenancePair.jsx'
import ReadinessTrendStrip from './ReadinessTrendStrip.jsx'
// ── Phase B: and it publishes the size of its own hole ───────────────────────
import { ConfidenceChip } from './ConfidenceChip.jsx'

/** The module hue — the arc's one colour (ink is the track). */
const HUE = '#F59E0B'
const INK = '#101C3D'

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

const fmtLift = (v) => (v == null ? null : `+${Math.round(v * 10) / 10} points`)

// 'yyyy-mm-dd' → 'Aug 12, 2026'. Local to this file: the hero shows no other
// date, and an ISO string in a sentence is not how this product speaks.
const fmtDate = (iso) => {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// ── The adopt prompt (no framework yet) — the designed empty state: one line
//    and the one action. ──────────────────────────────────────────────────────
function AdoptPrompt({ canEdit, onAdopt, first }) {
  return (
    <AuroraSection first={first} icon={Compass} title="Your score" subtitle="Adopt a framework to start">
      <AuroraEmpty
        icon={Compass}
        text="Adopt your accreditor's framework"
        sub="Cognia, MSA-CESS, NSBECS, FCIS, ACSI, ACS WASC or SAIS — then score each standard."
        action={
          canEdit ? (
            <AuroraLightButton onClick={onAdopt} icon={<Sparkles size={15} aria-hidden="true" />}>
              Adopt a framework
            </AuroraLightButton>
          ) : (
            <p className="text-small text-ink2">Ask an owner to adopt a framework.</p>
          )
        }
      />
    </AuroraSection>
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
  // AURORA: the page draws the index as a dial ON THE BAND (ReadinessDial), so
  // it passes dial={false} and the light arc is not drawn twice. Standalone
  // (and in the specs) the arc renders in the "Your score" card as before.
  dial = true,
  // AURORA: the page shows the cycle in its own "Where you are in the cycle"
  // section; it passes showCountdown={false} so the one-line strip is not a
  // second copy of the same countdown.
  showCountdown = true,
  // AURORA: "Work on it" on a quick-win tile (and a click on an unmet must-pass
  // tile) opens the standard's own improve drawer — the rubric step and the
  // attach controls. Optional: without it the tile's click (onGapClick) is the
  // only action.
  onImproveStandard = null,
  // AURORA: the first section directly under the band.
  first = false,
}) {
  if (!adopted) return <AdoptPrompt canEdit={canEdit} onAdopt={onAdopt} first={first} />
  if (!readiness) {
    return (
      <AuroraSection first={first} icon={Gauge} title="Your score" subtitle="Working it out">
        <AuroraEmpty icon={Gauge} text="Computing your accreditation readiness…" aria-busy="true" />
      </AuroraSection>
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

  const headline =
    hasIndex && landsInBand
      ? `You'd land ${readiness.band} today`
      : hasIndex
        ? pointGap != null && pointGap > 0
          ? `${pointGap} points from ${readiness.target?.bandLabel ?? 'your target'}`
          : readiness.target
            ? `Target reached — ${readiness.target.bandLabel}`
            : 'Your readiness picture'
        : 'Your readiness picture'

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

  // ── The light arc (standalone only — on the page the band carries the dial) ─
  const arcNode =
    dial && hasIndex ? (
      <div className="relative mx-auto w-full max-w-[360px]">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full"
          role="img"
          aria-label={`Projected index ${readiness.projectedIndex} of ${fw.indexMax} — ${readiness.band ?? 'below accreditation threshold'}`}
        >
          {/* the track — the full index scale, ink at 10% */}
          <path d={ARC_D} fill="none" stroke={INK} strokeOpacity={0.1} strokeWidth={14} strokeLinecap="round" />
          {/* the index — the module hue, drawn once */}
          <motion.path
            d={ARC_D}
            fill="none"
            stroke={HUE}
            strokeWidth={12}
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: frac }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 18 }}
          />

          {/* ── The ghosted in-flight projection (AIC Phase G) ──────────
              Dashed, thin and half-opaque so it can never be mistaken for
              the solid index stroke, and drawn BEFORE the ticks so it
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
                stroke={INK}
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
                  <line x1={mx1} y1={my1} x2={mx2} y2={my2} stroke={INK} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="3 3" />
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
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeOpacity={reached ? 0.8 : 0.3} strokeWidth={2} />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12.5}
                  fontWeight={600}
                  fill={INK}
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
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="2 3" />
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={10.5} fontWeight={600} fill={INK} fillOpacity={0.4}>
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
              <g fontSize={12} fontWeight={600} fill={INK} fillOpacity={0.4}>
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

        {/* centered overlay — projected index + band in the dome */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
          {/* THE HEADLINE. It renders `projectedIndex` and nothing else —
              never inFlight.expectedIndexIfDelivered, which is advisory and
              lives in its own dashed block. Pinned by a spec. */}
          <div data-testid="projected-index" className="font-serif font-medium leading-none text-ink tabular-nums">
            <CountUp value={readiness.projectedIndex} duration={1200} className="text-[48px] sm:text-[56px]" />
          </div>
          <p className="mt-1 text-micro font-semibold uppercase text-ink2">Projected score</p>
        </div>
      </div>
    ) : null

  // The band the index lands in — the REAL band, never expectedBandIfDelivered.
  // Rendered as the card's pill (word + icon + colour); below every band it is
  // the floor sentence, shown as "At risk" — the SAME verdict the band's
  // "Projected score" card and the dial's rose dot give (one judgement).
  const bandPill = hasIndex ? (
    <span data-testid="band-label" className="contents">
      <VerdictPill verdict={belowThreshold ? 'risk' : 'good'} label={readiness.band ?? 'Below accreditation threshold'} />
    </span>
  ) : null

  const liftTotal = gaps.reduce((sum, g) => sum + (typeof g.fullLift === 'number' ? g.fullLift : 0), 0)
  const metCount = assurances.filter((a) => a.satisfied).length

  return (
    <div className="acc-readiness">
      {/* ── 1. Quickest wins — the gap list as tiles, biggest lift first (the
          server's own order). Each tile opens its standard; "Work on it"
          opens the standard's improve drawer. ─────────────────────────── */}
      {gaps.length ? (
        <AuroraSection
          first={first}
          icon={Zap}
          title="Quickest wins"
          subtitle="Scoring these moves your number most"
          count={liftTotal > 0 ? `${fmtLift(liftTotal)} for all ${gaps.length}` : null}
        >
          <AuroraTileGrid cols={Math.min(5, Math.max(2, gaps.length))}>
            {gaps.map((g) => (
              <AuroraTile
                key={g.standardId}
                className="acc-win"
                title={g.code}
                figure={fmtLift(g.fullLift) ? fmtLift(g.fullLift).replace(/ points$/, '') : null}
                unit={fmtLift(g.fullLift) ? ' points' : null}
                desc={
                  /* Two lines, clamped, so a long standard name is readable
                     without the tile growing without bound; `break-words` is
                     the last-resort guard for an unbreakable token. */
                  <span className="line-clamp-2 min-w-0 flex-1 break-words">{g.title}</span>
                }
                tip={
                  g.nextStepLift != null
                    ? `${g.title} — ${fmtLift(g.nextStepLift)} per rubric step · ${fmtLift(g.fullLift)} at full marks`
                    : g.title
                }
                verdict={g.evidenceGap ? 'risk' : null}
                verdictLabel={g.evidenceGap ? 'No proof yet' : null}
                onClick={() => onGapClick?.(g.standardId)}
                ariaLabel={`${g.code}: ${g.title}`}
                arrow={false}
                foot={
                  <>
                    {/* Phase G: work already pointed at this gap. A COUNT, not a
                        projection — the gap's own numbers are untouched by it. */}
                    {(g.work?.initiativeCount ?? 0) > 0 ? (
                      <span
                        className="au-pill au-pill-neutral au-pill-sm"
                        title={
                          g.work.nearestDueDate
                            ? `Next due ${fmtDate(g.work.nearestDueDate) ?? g.work.nearestDueDate}`
                            : 'No due date set'
                        }
                      >
                        {g.work.initiativeCount} in flight
                      </span>
                    ) : null}
                    {onImproveStandard ? (
                      <AuroraLightButton size="sm" onClick={() => onImproveStandard(g.standardId)}>
                        Work on it
                      </AuroraLightButton>
                    ) : null}
                  </>
                }
              />
            ))}
          </AuroraTileGrid>
        </AuroraSection>
      ) : null}

      {/* ── 2. Must-pass checks — the binary assurance gates. ─────────────── */}
      {assurances.length ? (
        <AuroraSection
          first={first && !gaps.length}
          icon={ShieldCheck}
          tone={metCount === assurances.length ? 'good' : 'risk'}
          title="Must-pass checks"
          subtitle="Each one blocks accreditation until met"
          count={`${metCount} of ${assurances.length} met`}
        >
          <AuroraTileGrid cols={Math.min(6, Math.max(2, assurances.length))} className="acc-checks">
            {assurances.map((a) => (
              <AuroraTile
                key={a.standardId}
                className="acc-check"
                icon={a.satisfied ? Check : ShieldAlert}
                tone={a.satisfied ? 'good' : 'risk'}
                title={a.code}
                desc={a.title}
                verdict={a.satisfied ? 'good' : 'risk'}
                verdictLabel={a.satisfied ? 'Met' : 'Not met'}
                onClick={() => (onImproveStandard && !a.satisfied ? onImproveStandard(a.standardId) : onGapClick?.(a.standardId))}
                ariaLabel={`${a.code}: ${a.title} — ${a.satisfied ? 'met' : 'not met'}`}
                art={false}
                arrow={false}
              />
            ))}
          </AuroraTileGrid>
        </AuroraSection>
      ) : null}

      {/* ── 3. Your score — the read, the pair, the target and the past. ───── */}
      <AuroraSection
        first={first && !gaps.length && !assurances.length}
        icon={Gauge}
        title="Your score"
        subtitle={fw ? fw.name : 'Accreditation readiness'}
      >
        <div className={history ? 'au-cols2' : undefined}>
          <AuroraCard title={headline} verdict={null} aside={bandPill} className="acc-score">
            {/* F4 — BAND-AWARE AND TWO-SIDED. When the projected index lands in a
                band (belowThreshold false), the headline says where you'd land
                TODAY and the sub-line names the distance to the NEXT tier (both
                server-computed). Below the bottom band — belowThreshold true, and
                `band` carrying the floor sentinel, not a landing — the original
                target phrasing stands. */}
            {hasIndex && landsInBand && nextBand ? (
              <p data-testid="next-band-line" className="-mt-2 text-body text-ink2">
                {nextBand.pointGap} point{nextBand.pointGap === 1 ? '' : 's'} from {nextBand.label}
              </p>
            ) : null}
            {/* Phase B — the published size of the hole, first thing under the read. */}
            {readiness.confidence ? (
              <div className="mt-2">
                <ConfidenceChip confidence={readiness.confidence} reduce={reduce} />
              </div>
            ) : null}
            {/* WS1 — the seal line, server-composed, verbatim. Absent → nothing. */}
            {sealLine ? (
              <p data-testid="seal-line" className="mt-1 text-small text-ink2">
                {sealLine}
              </p>
            ) : null}

            {arcNode}

            <div className="mt-3">
              <ProvenancePair
                documentedPct={typeof readiness.selfScoredPct === 'number' ? readiness.selfScoredPct : null}
                defensiblePct={typeof readiness.verifiedPct === 'number' ? readiness.verifiedPct : null}
                scoredCount={readiness.scoredCount ?? 0}
                coveredCount={readiness.coveredCount ?? 0}
                leafCount={readiness.leafCount ?? 0}
                reduce={reduce}
              />
            </div>

            {/* F4 — THE REVIEW-DAY RISK, named. Server-computed: index points
                contributed by scores with no evidence behind them. Zero or absent
                → no chip (suppressed is not zero). Clicks to the register
                filtered to exactly those rows. */}
            {typeof unbackedPoints === 'number' && unbackedPoints > 0 ? (
              <button
                type="button"
                data-testid="unbacked-risk-chip"
                onClick={onUnbackedClick ?? undefined}
                className="acc-row-btn"
              >
                <ShieldAlert size={15} className="shrink-0 text-[color:var(--au-watch-h)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 font-semibold">
                  {unbackedPoints} of your projected points rest on scores with no evidence
                </span>
                <ChevronRight size={15} className="shrink-0 text-ink2" aria-hidden="true" />
              </button>
            ) : null}

            {/* ── In-flight work: the ADVISORY projection, and what it left out ──
                The exclusion counts are not a footnote: a school whose initiatives
                carry no target score would otherwise see "no projection" and have
                no idea why. */}
            {inFlight && (hasProjection || (excluded?.noTargetScore ?? 0) > 0 || (excluded?.noDueDate ?? 0) > 0) ? (
              <div className="mt-4 border-l-2 border-dashed border-hair/30 pl-3" data-testid="inflight-panel">
                {hasProjection ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Pill>PROJECTION</Pill>
                    <p className="text-small text-ink" data-testid="inflight-sentence">
                      → {expectedIndex}
                      {inFlight.expectedBandIfDelivered ? ` · ${inFlight.expectedBandIfDelivered}` : ''}
                      {inFlight.expectedByDate
                        ? ` if delivered by ${fmtDate(inFlight.expectedByDate) ?? inFlight.expectedByDate}`
                        : ' if delivered'}
                    </p>
                  </div>
                ) : null}
                {inFlight.basis ? <p className="mt-1 text-[12px] leading-relaxed text-ink2">{inFlight.basis}</p> : null}
                {(excluded?.noTargetScore ?? 0) > 0 || (excluded?.noDueDate ?? 0) > 0 ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-ink2" data-testid="inflight-excluded">
                    {[
                      (excluded?.noTargetScore ?? 0) > 0 ? `${excluded.noTargetScore} left out — no target rubric score` : null,
                      (excluded?.noDueDate ?? 0) > 0 ? `${excluded.noDueDate} left out — no due date` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Target ladder — a segmented control */}
            {pills.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="toolbar-label">Aim for</span>
                <div className="seg" role="group" aria-label="Readiness target">
                  {pills.map((b) => (
                    <button
                      key={b.min}
                      type="button"
                      onClick={() => onSelectTarget?.(b.min)}
                      aria-pressed={activeTargetIndex === b.min}
                      className="seg-btn"
                    >
                      {b.label} · {b.min}
                    </button>
                  ))}
                </div>
                {readiness.target?.stepsToTarget != null && readiness.target.stepsToTarget > 0 ? (
                  <span className="text-small text-ink2">
                    ≈ {readiness.target.stepsToTarget} rubric step
                    {readiness.target.stepsToTarget === 1 ? '' : 's'} to go
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* F1 — THE COUNTDOWN STRIP: one line, rendered only when a cycle is
                configured. Every figure is the cycle payload's own; the click
                lands on the Journey tab, where the whole road lives. */}
            {countdown && showCountdown ? (
              <button
                type="button"
                data-testid="cycle-countdown-strip"
                onClick={onOpenJourney ?? undefined}
                className="acc-row-btn"
              >
                {cyclePhase?.yearOfCycle != null && cycleTermYears != null ? (
                  <span className="font-semibold">
                    Year {cyclePhase.yearOfCycle} of {cycleTermYears}
                  </span>
                ) : null}
                {cyclePhase?.yearOfCycle != null && cycleTermYears != null ? <span className="text-ink2">·</span> : null}
                <span className="text-ink2">
                  {countdown.label}
                  {countdown.dueDate ? ` due ${fmtDate(countdown.dueDate) ?? countdown.dueDate}` : ''}
                </span>
                {typeof countdown.daysRemaining === 'number' ? (
                  <>
                    <span className="text-ink2">·</span>
                    <span className="font-semibold tabular-nums">
                      {countdown.daysRemaining} day{countdown.daysRemaining === 1 ? '' : 's'}
                    </span>
                  </>
                ) : null}
                <ChevronRight size={15} className="ml-auto shrink-0 text-ink2" aria-hidden="true" />
              </button>
            ) : null}
          </AuroraCard>

          {/* ── Recorded readiness (Phase A) — its own card beside the read, so
              it survives frameworks with no index scale. */}
          {history ? (
            <AuroraCard title="Score over time" subtitle="Recorded readings" className="acc-trend">
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
            </AuroraCard>
          ) : null}
        </div>
      </AuroraSection>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DomainGrid — Phase B: "strengths and vulnerabilities by domain, not one score".
//
// Ten cards, always all ten, always in the server's frozen order. A stable grid is
// how a head of school learns the SHAPE of their framework, so nothing here sorts,
// filters or hides a card — an MSA school sees seven domains its accreditor simply
// does not reach, and that is the answer, not a gap in the UI.
//
// EVERY CARD CARRIES TWO INDICATORS, BOTH LABELLED, ALWAYS BOTH:
//
//   A · Rubric coverage      — what your accreditor's standards say about this
//                              domain, from your own rubric scoring and evidence.
//   B · Operational signals  — what KYRO's operating numbers say about it, live,
//                              with an as-of period.
//
// They are different questions and they are never blended. A domain can be fully
// scored with zero operating signals (NSBECS mission) or carry seven live finance
// signals with too few standards to score (Cognia finance) — both are real, both
// are common, and a single merged bar would erase the distinction the client
// actually asked for.
//
// THE HONESTY RULE, ENFORCED HERE:
//   · `measured === false` renders NO NUMBER ANYWHERE on the card. Not a 0, not
//     an em-dash percentage, not a zero-length bar, not a greyed "0%". The card is
//     visually muted, carries a state pill, and prints the server's `reason`
//     verbatim.
//   · `signalCount === 0` never renders an empty meter either — and never renders
//     a sentence that its own card disproves. The zero is branched on WHY:
//     uncovered → the terminal "not applicable" line (an uncovered domain can
//     never light, so "lights up with…" under "Not in your framework" was the
//     card contradicting itself); below-floor bindings → "reported under the
//     domain that carries most of it" (MSA-4's HR quarter-share, whose metrics
//     are visible on the Finance card at that very moment); otherwise the plain
//     statement of what KYRO does and does not hold.
//   · When the signals payload is missing, failed or still loading, a card that
//     has bindings says "N signals bound · values unavailable right now" — never a
//     stale value and never a zero.
//
// STRENGTHS AND VULNERABILITIES, NOT TEN SCORES. Ten identically-styled numerals
// in a frozen 3-column order is "ten scores instead of one score" — the reader
// still has to scan and compare by hand to find the weak domain. So the grid
// names its own extremes: a header line stating strongest and weakest, and a chip
// on those two cards. Both are statements about THIS SCHOOL'S OWN grid, and are
// labelled as such — there is no external band for a domain percentage and
// inventing one would break the honesty rule this file exists to enforce.
//
// The confidence caveat under the grid is deliberately NOT `no-print`: a printed
// domain grid without its coverage line is the exact misreading this phase exists
// to prevent.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Radio } from 'lucide-react'
import StatusDot from '../analytics/StatusDot.jsx'
import { ConfidenceCaveat } from './ConfidenceChip.jsx'
import {
  DOMAIN_ICON_FALLBACK,
  DOMAIN_NOT_IN_FRAMEWORK,
  domainIcon,
  domainPartialSignalNote,
  domainSignalHint,
} from './domainMeta.js'
import { formatMetricValue, metricFormat } from '../../lib/metricMeta.js'

const AMBER = '#F59E0B'
const AMBER_INK = '#B45309' // accessible amber for large light-surface numerals

// SIGNAL MEMBERSHIP IS THE SERVER'S, FULL STOP. `byDomain[key].keys` is computed
// from the same catalog rows, the same ≥0.5 attribution floor AND the same graded
// population (dominant framework, non-assurance leaves) that produced
// `domains[].signalCount`. A second client-side copy of the rule used to derive
// the chips, and it could disagree — a catalog row carrying an unknown domain key
// normalizes differently on each side, which renders a card claiming seven live
// signals with no chips underneath. There is now one authority and no derivation
// here at all.

// ── Small parts ──────────────────────────────────────────────────────────────

function StatePill({ children }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-rule/70 bg-section px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
      {children}
    </span>
  )
}

/** The domain glyph. (Icon is read off `props` — the house workaround for the
 *  lint rule that flags a component resolved during render, same as IconAction
 *  on the register page and Half in ProvenancePair.) */
function DomainGlyph(props) {
  const Icon = props.icon ?? DOMAIN_ICON_FALLBACK
  return <Icon size={15} className={props.className} />
}

function IndicatorLabel({ children }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</p>
  )
}

/** One live/bound operating metric, as a compact light chip. */
function SignalChip({ signal }) {
  const fmt = metricFormat(signal.key, signal.unit)
  const live = signal.available === true && signal.value != null
  const title = [
    signal.formula ? `Formula: ${signal.formula}` : null,
    live && signal.asOf ? `As of ${signal.asOf}` : null,
    !live && signal.unavailable?.message ? signal.unavailable.message : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // `items-start` + a wrapping label: these chips sit in a narrow card column and
  // used to clip the metric name to "Student-Te…" / "% of Stude…", which names
  // nothing. The chip grows a line instead (card contract §5.3).
  return (
    <span
      title={title || undefined}
      className={`inline-flex max-w-full items-start gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] ${
        live
          ? 'border-[#F59E0B]/35 bg-[#F59E0B]/[0.07] text-navy'
          : 'border-rule/60 bg-section text-muted'
      }`}
    >
      {live ? (
        <span className="mt-[3px] shrink-0">
          <StatusDot status={signal.status} size={7} />
        </span>
      ) : null}
      <span className="min-w-0 break-words font-semibold">{signal.label}</span>
      {live ? (
        <span className="shrink-0 font-bold" style={{ color: AMBER_INK }}>
          {formatMetricValue(signal.value, fmt)}
        </span>
      ) : (
        <span className="shrink-0 italic">no value</span>
      )}
    </span>
  )
}

// ── Indicator B — operational-signal coverage ────────────────────────────────
function SignalIndicator({ domain, counts, rows, loading, unavailable }) {
  const bound = counts?.bound ?? domain.signalCount ?? 0

  // Nothing is attributed here. NOT an empty state — a statement about what KYRO
  // does and does not measure, and the whole reason the second indicator exists.
  // But WHICH statement depends on why the count is zero, and getting that wrong
  // makes the card disprove itself on screen.
  if (!domain.signalCount) {
    let sentence
    if (domain.covered === false) {
      // Your accreditor asks nothing here, so nothing can ever be bound here.
      // The "Not in your framework" pill plus this line is the whole answer.
      sentence = DOMAIN_NOT_IN_FRAMEWORK
    } else if (domain.partialSignalCount > 0) {
      // Bound, but below the attribution floor — those numbers are on screen
      // right now under the domain that carries most of each standard.
      sentence = domainPartialSignalNote(domain.partialSignalCount)
    } else {
      sentence =
        domainSignalHint(domain.domainKey) ??
        'No operating signal is bound to these standards yet.'
    }
    return (
      <div>
        <IndicatorLabel>Operational signals</IndicatorLabel>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{sentence}</p>
      </div>
    )
  }

  // Bound, but we cannot value them right now. Say the binding exists and say the
  // values are missing — never a stale figure, never a zero.
  if (!counts || unavailable) {
    return (
      <div>
        <IndicatorLabel>Operational signals</IndicatorLabel>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-navy">
          <span>
            {domain.signalCount} signal{domain.signalCount === 1 ? '' : 's'} bound
          </span>
          <span className="text-[12px] font-normal italic text-muted">
            {loading ? 'loading values…' : 'values unavailable right now'}
          </span>
        </p>
      </div>
    )
  }

  const shown = rows.slice(0, 3)
  const more = Math.max(bound - shown.length, 0)

  return (
    <div>
      <IndicatorLabel>Operational signals</IndicatorLabel>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-navy">
        <Radio size={13} className="shrink-0" style={{ color: AMBER }} aria-hidden />
        {counts.live} of {bound} live
      </p>
      {shown.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {shown.map((s) => (
            <SignalChip key={s.key} signal={s} />
          ))}
          {more > 0 ? (
            <span className="inline-flex items-center rounded-lg border border-rule/60 bg-section px-2 py-1 text-[11.5px] font-semibold text-muted">
              +{more} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The RELATIVE standing chip — "of the domains YOUR framework can score, this is
 * the strongest / weakest". Deliberately not a band: a domain readiness
 * percentage has no accreditor threshold, and inventing one would be exactly the
 * fabrication this grid exists to avoid. This says only what the grid itself
 * says, in one word, so the vulnerability is findable without arithmetic.
 */
function StandingChip({ kind }) {
  const weakest = kind === 'weakest'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
        weakest
          ? 'border-[#B45309]/45 bg-[#F59E0B]/12 text-[#B45309]'
          : 'border-rule/70 bg-section text-muted'
      }`}
      title={
        weakest
          ? 'Lowest rubric coverage of the domains your framework can score'
          : 'Highest rubric coverage of the domains your framework can score'
      }
    >
      {weakest ? 'Weakest measured' : 'Strongest measured'}
    </span>
  )
}

// ── One domain card ──────────────────────────────────────────────────────────
function DomainCard({
  domain,
  counts,
  rows,
  signalsLoading,
  signalsUnavailable,
  index,
  standing = null,
  onOpenStandards,
  reduce,
}) {
  const measured = domain.measured === true
  const pct = measured && typeof domain.readinessPct === 'number' ? domain.readinessPct : null

  // The muted treatment is the *point* for an unmeasured domain: no glow, no
  // amber fill, no lift — a card that is visibly not carrying a reading. The
  // weakest measured domain gets a ring so the eye lands on it first; that is
  // emphasis, not a status colour.
  const shell = measured
    ? `kpi-3d${standing === 'weakest' ? ' ring-1 ring-[#F59E0B]/45' : ''}`
    : 'border border-rule/60 bg-white/70 opacity-[.72]'

  const showEffective =
    typeof domain.effectiveLeafWeight === 'number' &&
    domain.effectiveLeafWeight !== domain.contributingLeafCount

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { delay: Math.min(index, 9) * 0.03, type: 'spring', stiffness: 260, damping: 24 }
      }
      className={`relative flex flex-col overflow-hidden rounded-2xl ${shell}`}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* ── header ───────────────────────────────────────────────────────
            The row WRAPS (flex-wrap) and the title WRAPS: with a "Not scored"
            pill on a 5-up grid the title was truncated to nothing at 1280 —
            cards read icon + "!" + NOT SCORED with no domain name at all. The
            pill now drops below the title instead of eating it. Card contract
            §5.3: a card's own title is never `truncate`d. ── */}
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
          {/* basis-[9rem] IS THE THING THAT MAKES flex-wrap WORK. With only
              `flex-1 min-w-0`, a flex child SHRINKS before the row wraps — so
              the pill kept its width and the title collapsed to ~4px, rendering
              "Mission & Catholic Identity" as one letter per line down the card.
              A basis tells flex "below 9rem, wrap instead of shrink", which is
              what puts the pill on its own line and gives the title real room. */}
          <div className="flex min-w-0 flex-1 basis-[9rem] items-start gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: measured ? 'rgba(245,158,11,0.12)' : 'rgba(107,100,87,0.08)',
                color: measured ? AMBER_INK : 'currentColor',
              }}
              aria-hidden
            >
              <DomainGlyph
                icon={domainIcon(domain.domainKey)}
                className={measured ? '' : 'text-muted'}
              />
            </span>
            <h3 className="min-w-0 break-words font-serif text-[15px] font-semibold leading-snug text-navy">
              {domain.label}
            </h3>
          </div>
          {measured ? (
            standing ? <StandingChip kind={standing} /> : null
          ) : (
            <StatePill>{domain.covered ? 'Not scored' : 'Not in your framework'}</StatePill>
          )}
        </div>

        {/* ── Indicator A — rubric coverage ───────────────────────────────── */}
        <div>
          <IndicatorLabel>Rubric coverage</IndicatorLabel>
          {measured ? (
            <>
              <p className="mt-1 font-serif leading-none" style={{ color: AMBER_INK }}>
                <span className="text-[32px] font-semibold">{pct}</span>
                <span className="ml-0.5 text-[15px] font-semibold opacity-70">%</span>
              </p>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-section"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${domain.label} rubric coverage ${pct}%`}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
                  }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 18 }
                  }
                />
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {domain.contributingLeafCount} standards
                {showEffective ? ` (${domain.effectiveLeafWeight} effective)` : ''} · Documented{' '}
                <span className="font-semibold text-navy">{domain.selfScoredPct}%</span> ·
                Defensible <span className="font-semibold text-navy">{domain.verifiedPct}%</span>
              </p>
            </>
          ) : (
            // NO NUMBER. The server's sentence, verbatim.
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {domain.reason ?? 'Not enough standards in this domain to score it.'}
            </p>
          )}
        </div>

        <div className="border-t border-rule/50" aria-hidden />

        {/* ── Indicator B — operational-signal coverage ───────────────────── */}
        <SignalIndicator
          domain={domain}
          counts={counts}
          rows={rows}
          loading={signalsLoading}
          unavailable={signalsUnavailable}
        />

        <button
          type="button"
          onClick={onOpenStandards}
          className="mt-auto inline-flex items-center gap-1 self-start pt-1 text-[12.5px] font-semibold text-navy transition hover:text-[#B45309]"
        >
          View standards <ArrowRight size={13} aria-hidden />
        </button>
      </div>
    </motion.div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-rule/60 bg-white/70 p-4">
      <div className="h-4 w-32 rounded bg-section motion-safe:animate-pulse" />
      <div className="mt-4 h-8 w-20 rounded bg-section motion-safe:animate-pulse" />
      <div className="mt-3 h-1.5 w-full rounded bg-section motion-safe:animate-pulse" />
      <div className="mt-4 h-3 w-40 rounded bg-section motion-safe:animate-pulse" />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════

export default function DomainGrid({
  readiness = null,
  signals = [],
  byDomain = null,
  signalsLoading = false,
  signalsUnavailable = false,
  onOpenStandards = null,
  reduce = false,
}) {
  const domains = Array.isArray(readiness?.domains) ? readiness.domains : null
  const confidence = readiness?.confidence ?? null

  // domainKey → the valued signals for its chips, selected by the SERVER'S key
  // list (byDomain[k].keys) — no client attribution, so a chip row can never
  // disagree with the count printed above it.
  // LIVE FIRST: with only three chip slots, a card that has real numbers should
  // show them. The "N of M live" line above always states the true split, so this
  // ordering can never overstate coverage.
  const rowsByDomain = useMemo(() => {
    const out = {}
    for (const [domainKey, counts] of Object.entries(byDomain ?? {})) {
      const set = new Set(counts?.keys ?? [])
      if (set.size === 0) continue
      const rows = signals.filter((s) => set.has(s.key))
      out[domainKey] = [
        ...rows.filter((s) => s.available === true),
        ...rows.filter((s) => s.available !== true),
      ]
    }
    return out
  }, [byDomain, signals])

  // The school's OWN extremes among the domains it can score. Only meaningful
  // with two or more measured domains that actually differ — one card, or a set
  // that all read the same, has no strongest and no weakest.
  const standing = useMemo(() => {
    const scored = (domains ?? []).filter(
      (d) => d.measured === true && typeof d.readinessPct === 'number',
    )
    if (scored.length < 2) return null
    const sorted = [...scored].sort((a, b) => a.readinessPct - b.readinessPct)
    const low = sorted[0]
    const high = sorted[sorted.length - 1]
    if (low.readinessPct === high.readinessPct) return null
    return { weakest: low, strongest: high, count: scored.length }
  }, [domains])

  // Still loading the readiness payload.
  if (!readiness) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  // The readiness payload arrived without a domain grid (an API older than this
  // build). Say so rather than render ten empty cards that would read as "your
  // framework covers nothing".
  if (!domains) {
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
        <p className="text-[14px] text-muted">
          The domain grid isn&apos;t available for this register yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* The answer to "where am I strong and where am I exposed?", readable
          without comparing ten numerals by hand. Only rendered when the grid
          genuinely HAS extremes to report. */}
      {standing ? (
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
          <span className="font-semibold text-navy">
            {standing.count} of 10 domains scored
          </span>{' '}
          · strongest{' '}
          <span className="font-semibold text-navy">
            {standing.strongest.label} {standing.strongest.readinessPct}%
          </span>{' '}
          · weakest{' '}
          <span className="font-semibold" style={{ color: AMBER_INK }}>
            {standing.weakest.label} {standing.weakest.readinessPct}%
          </span>
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {domains.map((d, i) => (
          <DomainCard
            key={d.domainKey}
            domain={d}
            counts={byDomain?.[d.domainKey] ?? null}
            rows={rowsByDomain[d.domainKey] ?? []}
            signalsLoading={signalsLoading}
            signalsUnavailable={signalsUnavailable}
            index={i}
            standing={
              standing?.weakest.domainKey === d.domainKey
                ? 'weakest'
                : standing?.strongest.domainKey === d.domainKey
                  ? 'strongest'
                  : null
            }
            onOpenStandards={onOpenStandards ?? undefined}
            reduce={reduce}
          />
        ))}
      </div>

      {/* The published size of the hole — prints with the grid, by design. */}
      <div className="mt-4 border-t border-rule/50 pt-3">
        <ConfidenceCaveat confidence={confidence} />
      </div>
    </div>
  )
}

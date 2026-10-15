// ─────────────────────────────────────────────────────────────────────────────
// DomainGrid — Phase B: "strengths and vulnerabilities by domain, not one score".
//
// PREMIUM UI P4 (plan sketch 6): the ten cards are now ONE `DataTable` —
// Domain · Coverage · Documented · Defensible · Signals · Status — directly on
// the ground under a `Section` label. Always all ten rows, always in the
// server's frozen order (nothing here sorts, filters or hides a row): a stable
// table is how a head of school learns the SHAPE of their framework — an MSA
// school sees seven domains its accreditor simply does not reach, and that is
// the answer, not a gap in the UI.
//
// EVERY ROW CARRIES TWO INDICATORS, BOTH LABELLED, ALWAYS BOTH:
//
//   A · Rubric coverage      — what your accreditor's standards say about this
//                              domain, from your own rubric scoring and evidence
//                              (the Coverage / Documented / Defensible columns).
//   B · Operational signals  — what KYRO's operating numbers say about it, live,
//                              with an as-of period (the Signals column).
//
// They are different questions and they are never blended. A domain can be fully
// scored with zero operating signals (NSBECS mission) or carry seven live finance
// signals with too few standards to score (Cognia finance) — both are real, both
// are common, and a single merged figure would erase the distinction the client
// actually asked for.
//
// THE HONESTY RULE, ENFORCED HERE:
//   · `measured === false` renders NO NUMBER ANYWHERE on the row. Not a 0, not
//     an em-dash percentage, not a zero-length bar, not a greyed "0%". The row
//     is muted, its Status cell carries the state word, and the Coverage cell
//     prints the server's `reason` verbatim; Documented / Defensible stay empty.
//   · `signalCount === 0` never renders an empty figure either — and never a
//     sentence that its own row disproves. The zero is branched on WHY:
//     uncovered → the terminal "not applicable" line (an uncovered domain can
//     never light); below-floor bindings → "reported under the domain that
//     carries most of it"; otherwise the plain statement of what KYRO does and
//     does not hold.
//   · When the signals payload is missing, failed or still loading, a row that
//     has bindings says "N signals bound · values unavailable right now" — never
//     a stale value and never a zero.
//
// STRENGTHS AND VULNERABILITIES, NOT TEN SCORES. The table names its own
// extremes: a line above stating strongest and weakest, and the Status cell
// (with a 2px mark) on those two rows. Both are statements about THIS SCHOOL'S
// OWN grid, and are labelled as such — there is no external band for a domain
// percentage and inventing one would break the honesty rule this file exists to
// enforce.
//
// The confidence caveat under the table is deliberately NOT `no-print`: a
// printed domain grid without its coverage line is the exact misreading this
// phase exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { ConfidenceCaveat } from './ConfidenceChip.jsx'
import ShortReason from './ShortReason.jsx'
import {
  DOMAIN_ICON_FALLBACK,
  DOMAIN_NOT_IN_FRAMEWORK,
  domainIcon,
  domainPartialSignalNote,
  domainSignalHint,
} from './domainMeta.js'
import { formatMetricValue, metricFormat } from '../../lib/metricMeta.js'
import { DataTable, Section, Button } from '../ui/surface/index.js'

// SIGNAL MEMBERSHIP IS THE SERVER'S, FULL STOP. `byDomain[key].keys` is computed
// from the same catalog rows, the same ≥0.5 attribution floor AND the same graded
// population (dominant framework, non-assurance leaves) that produced
// `domains[].signalCount`. A second client-side copy of the rule used to derive
// the chips, and it could disagree — a catalog row carrying an unknown domain key
// normalizes differently on each side, which renders a row claiming seven live
// signals with no values underneath. There is now one authority and no derivation
// here at all.

/** The domain glyph. (Icon is read off `props` — the house workaround for the
 *  lint rule that flags a component resolved during render, same as IconAction
 *  on the register page and Half in ProvenancePair.) */
function DomainGlyph(props) {
  const Icon = props.icon ?? DOMAIN_ICON_FALLBACK
  return <Icon size={14} className={props.className} aria-hidden="true" />
}

/** "label 12.4%" for one valued signal; a title carries formula + as-of. */
function signalText(signal) {
  const fmt = metricFormat(signal.key, signal.unit)
  const live = signal.available === true && signal.value != null
  return live ? `${signal.label} ${formatMetricValue(signal.value, fmt)}` : `${signal.label} (no value)`
}

// ── Indicator B — operational-signal coverage, as one cell ───────────────────
function SignalCell({ domain, counts, rows, loading, unavailable }) {
  const bound = counts?.bound ?? domain.signalCount ?? 0

  // Nothing is attributed here. NOT an empty state — a statement about what KYRO
  // does and does not measure, and the whole reason the second indicator exists.
  // But WHICH statement depends on why the count is zero, and getting that wrong
  // makes the row disprove itself on screen.
  // The cell shows a few words; the full sentence is one tap away (ShortReason).
  if (!domain.signalCount) {
    let sentence
    let short
    if (domain.covered === false) {
      // Your accreditor asks nothing here, so nothing can ever be bound here.
      sentence = DOMAIN_NOT_IN_FRAMEWORK
      short = 'Not applicable'
    } else if (domain.partialSignalCount > 0) {
      // Bound, but below the attribution floor — those numbers are on screen
      // right now under the domain that carries most of each standard.
      sentence = domainPartialSignalNote(domain.partialSignalCount)
      short = `${domain.partialSignalCount} reported elsewhere`
    } else {
      sentence = domainSignalHint(domain.domainKey) ?? 'No operating signal is bound to these standards yet.'
      short = 'No signal'
    }
    return <ShortReason short={short} full={sentence} />
  }

  // Bound, but we cannot value them right now. Say the binding exists and say the
  // values are missing — never a stale figure, never a zero.
  if (!counts || unavailable) {
    return (
      <span className="block whitespace-normal">
        <span className="font-semibold text-ink">
          {domain.signalCount} signal{domain.signalCount === 1 ? '' : 's'} bound
        </span>
        <span className="dt-sub italic">{loading ? 'loading values…' : 'values unavailable right now'}</span>
      </span>
    )
  }

  const shown = rows.slice(0, 3)
  const more = Math.max(bound - shown.length, 0)
  const title = rows
    .map((s) => {
      const live = s.available === true && s.value != null
      return [signalText(s), s.formula ? `formula ${s.formula}` : null, live && s.asOf ? `as of ${s.asOf}` : null, !live && s.unavailable?.message ? s.unavailable.message : null]
        .filter(Boolean)
        .join(' · ')
    })
    .join('\n')

  return (
    <span className="block whitespace-normal" title={title || undefined}>
      <span className="font-semibold text-ink">
        {counts.live} of {bound} live
      </span>
      {shown.length ? (
        <span className="dt-sub max-w-[36ch]">
          {shown.map(signalText).join(' · ')}
          {more > 0 ? ` · +${more} more` : ''}
        </span>
      ) : null}
    </span>
  )
}

/** The Status word — RELATIVE standing ("of the domains YOUR framework can
 *  score, this is the strongest / weakest"), deliberately not a band: a domain
 *  readiness percentage has no accreditor threshold, and inventing one would be
 *  exactly the fabrication this table exists to avoid. */
function statusOf(domain, standing) {
  if (domain.measured !== true) return domain.covered ? 'Not scored' : 'Not in your framework'
  if (standing === 'weakest') return 'Weakest measured'
  if (standing === 'strongest') return 'Strongest measured'
  return 'Scored'
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-9 rounded bg-ink/[.04] motion-safe:animate-pulse" aria-hidden="true" />
      ))}
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
}) {
  const domains = Array.isArray(readiness?.domains) ? readiness.domains : null
  const confidence = readiness?.confidence ?? null

  // domainKey → the valued signals for its cell, selected by the SERVER'S key
  // list (byDomain[k].keys) — no client attribution, so a cell can never
  // disagree with the count printed beside it.
  // LIVE FIRST: with three slots in the sub-line, a row that has real numbers
  // should show them. The "N of M live" figure always states the true split, so
  // this ordering can never overstate coverage.
  const rowsByDomain = useMemo(() => {
    const out = {}
    for (const [domainKey, counts] of Object.entries(byDomain ?? {})) {
      const set = new Set(counts?.keys ?? [])
      if (set.size === 0) continue
      const rows = signals.filter((s) => set.has(s.key))
      out[domainKey] = [...rows.filter((s) => s.available === true), ...rows.filter((s) => s.available !== true)]
    }
    return out
  }, [byDomain, signals])

  // The school's OWN extremes among the domains it can score. Only meaningful
  // with two or more measured domains that actually differ — one row, or a set
  // that all read the same, has no strongest and no weakest.
  const standing = useMemo(() => {
    const scored = (domains ?? []).filter((d) => d.measured === true && typeof d.readinessPct === 'number')
    if (scored.length < 2) return null
    const sorted = [...scored].sort((a, b) => a.readinessPct - b.readinessPct)
    const low = sorted[0]
    const high = sorted[sorted.length - 1]
    if (low.readinessPct === high.readinessPct) return null
    return { weakest: low, strongest: high, count: scored.length }
  }, [domains])

  const standingOf = (d) =>
    standing?.weakest.domainKey === d.domainKey ? 'weakest' : standing?.strongest.domainKey === d.domainKey ? 'strongest' : null

  const columns = useMemo(
    () => [
      {
        key: 'label',
        header: 'Domain',
        // The domain name WRAPS — a table cell, never a stub (card contract §5.3).
        render: (d) => (
          <span className={`flex min-w-0 items-start gap-2 ${d.measured === true ? '' : 'text-ink2'}`}>
            <span className="mt-[2px] shrink-0 text-ink2">
              <DomainGlyph icon={domainIcon(d.domainKey)} />
            </span>
            <span className="min-w-0 whitespace-normal break-words font-semibold">{d.label}</span>
          </span>
        ),
      },
      {
        key: 'readinessPct',
        header: 'Coverage',
        num: true,
        render: (d) => {
          const measured = d.measured === true
          const pct = measured && typeof d.readinessPct === 'number' ? d.readinessPct : null
          if (!measured) {
            // NO NUMBER. A short status built from the row's own counts, with the
            // server's sentence, verbatim, one tap away.
            const n = d.contributingLeafCount ?? 0
            const short = d.covered === false ? 'No standards here' : `Too few standards (${n})`
            return (
              <ShortReason short={short} full={d.reason ?? 'Not enough standards in this domain to score it.'} />
            )
          }
          const showEffective = typeof d.effectiveLeafWeight === 'number' && d.effectiveLeafWeight !== d.contributingLeafCount
          return (
            <span className="block">
              <span className="font-semibold text-ink">{pct}%</span>
              <span className="dt-sub">
                {d.contributingLeafCount} standards{showEffective ? ` (${d.effectiveLeafWeight} effective)` : ''}
              </span>
            </span>
          )
        },
      },
      {
        key: 'selfScoredPct',
        header: 'Documented',
        num: true,
        render: (d) => (d.measured === true ? <span className="text-ink">{d.selfScoredPct}%</span> : null),
      },
      {
        key: 'verifiedPct',
        header: 'Defensible',
        num: true,
        render: (d) => (d.measured === true ? <span className="text-ink">{d.verifiedPct}%</span> : null),
      },
      {
        key: 'signals',
        header: 'Signals',
        render: (d) => (
          <SignalCell
            domain={d}
            counts={byDomain?.[d.domainKey] ?? null}
            rows={rowsByDomain[d.domainKey] ?? []}
            loading={signalsLoading}
            unavailable={signalsUnavailable}
          />
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'dt-nowrap',
        render: (d) => <span className={d.measured === true ? 'text-ink' : 'text-ink2'}>{statusOf(d, standingOf(d))}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byDomain, rowsByDomain, signalsLoading, signalsUnavailable, standing],
  )

  const aside = onOpenStandards ? (
    <Button variant="quiet" size="sm" onClick={onOpenStandards} icon={<ArrowRight size={13} />}>
      View standards
    </Button>
  ) : null

  // Still loading the readiness payload.
  if (!readiness) {
    return (
      <Section label="Rubric coverage by domain" aside={aside}>
        <SkeletonRows />
      </Section>
    )
  }

  // The readiness payload arrived without a domain grid (an API older than this
  // build). Say so rather than render ten empty rows that would read as "your
  // framework covers nothing".
  if (!domains) {
    return (
      <Section label="Rubric coverage by domain" aside={aside}>
        <p className="border-y border-hair py-8 text-center text-small text-ink2">
          The domain grid isn&apos;t available for this register yet.
        </p>
      </Section>
    )
  }

  return (
    <Section label="Rubric coverage by domain" aside={aside}>
      {/* The answer to "where am I strong and where am I exposed?", readable
          without comparing ten numerals by hand. Only rendered when the grid
          genuinely HAS extremes to report. */}
      {standing ? (
        <p className="mb-3 text-small leading-relaxed text-ink2">
          <span className="font-semibold text-ink">{standing.count} of 10 domains scored</span> · strongest{' '}
          <span className="font-semibold text-ink">
            {standing.strongest.label} {standing.strongest.readinessPct}%
          </span>{' '}
          · weakest{' '}
          <span className="font-semibold text-ink">
            {standing.weakest.label} {standing.weakest.readinessPct}%
          </span>
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={domains}
        rowKey="domainKey"
        // The 2px mark names the school's OWN extremes — emphasis, not a status
        // colour: the weakest measured domain is where the eye should land first.
        markOf={(d) => (standingOf(d) === 'weakest' ? 'watch' : standingOf(d) === 'strongest' ? 'good' : null)}
        rowClassName={(d) => (d.measured === true ? '' : 'opacity-70')}
        caption="Rubric coverage and operational signals by domain"
        // A phone scrolls the table inside its wrap (with the fade) rather than
        // shattering the reason sentences into one-word lines.
        style={{ minWidth: 720 }}
      />

      {/* The published size of the hole — prints with the table, by design. */}
      <div className="mt-4 border-t border-hair pt-3">
        <ConfidenceCaveat confidence={confidence} />
      </div>
    </Section>
  )
}

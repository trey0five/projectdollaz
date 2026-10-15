// ─────────────────────────────────────────────────────────────────────────────
// AttentionBandChip — AIC Phase I. The superintendent portfolio's band word.
//
// ONE PALETTE, NOT TWO. The band vocabulary is imported from the shipped
// RiskChip (`riskBandMeta`), not re-declared: `attentionBand` is
// `bandForRisk(attentionScore)` server-side — literally the same five-band
// function the per-standard risk chip already renders — so a second hue table
// here would let a diocese and a school speak two dialects of one word. RiskChip
// itself is NOT edited by this phase (ownership map); we import it.
//
// WHAT THIS FILE MAY AND MAY NOT DO. It renders the band WORD and the integer
// attention score the server sent. It never derives a band from a score, never
// re-scales a score, and never renders a band for a school that has none — a row
// without `attentionBand` is by construction an `insufficientData` row, and those
// are rendered by UnrankedPanel, which is forbidden a band entirely.
//
// This file is also the portfolio's small display VOCABULARY (urgency words,
// percent/percentile formatting). Every helper here maps a SERVER TOKEN to
// English or formats a SERVER NUMBER; none of them invents a value, and every one
// returns null when the server sent null, so a missing number can never surface
// as a zero.
// ─────────────────────────────────────────────────────────────────────────────
import { AlarmClock } from 'lucide-react'
import { riskBandMeta } from '../accreditation/RiskChip.jsx'
import { Pill } from '../ui/surface/index.js'

/**
 * `urgencyReason` tokens, frozen in the spec's §2.4 table. Urgency is a SORT KEY
 * on the server — it never entered the score — so it is rendered as its own
 * standing column and never blended into the band chip.
 */
export const URGENCY_REASON_LABELS = Object.freeze({
  citation_overdue: 'Prior-visit response overdue',
  // A LAPSED review is urgency 3 alongside an imminent visit, and it is its own
  // sentence: "Visit within 6 months" is not true of a date six months in the
  // PAST, and a school whose review has gone by is the one a superintendent most
  // needs named correctly.
  review_overdue: 'Review date has passed',
  visit_imminent: 'Visit within 6 months',
  visit_within_year: 'Visit within a year',
  visit_on_horizon: 'Visit within two years',
  // Urgency 0, like `no_scheduled_review`, but a different fact: a visit that IS
  // scheduled, more than two years out. Saying "no scheduled review" about it
  // would be false.
  review_beyond_horizon: 'Review more than two years out',
  no_scheduled_review: 'No scheduled review',
})

/** A server token → English, falling back to the token made readable. */
export function humanizeToken(token) {
  if (!token || typeof token !== 'string') return null
  return token.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** urgencyReason → English. Unknown tokens are humanized, never dropped. */
export function urgencyLabel(reason) {
  if (!reason) return null
  return URGENCY_REASON_LABELS[reason] ?? humanizeToken(reason)
}

/** A 0..100 server percentage → '41%'. null/NaN → null (NEVER '0%'). */
export function pctText(value) {
  if (value == null || !Number.isFinite(value)) return null
  return `${Math.round(value)}%`
}

/**
 * A peer percentile → '62nd pctile', matching the vocabulary PeersView already
 * uses so one product speaks one dialect.
 *
 * `peers.ts` returns percentile as a FRACTION in [0,1] (`computePeerStats`), and
 * §7.4 says the API passes that surface through. The `> 1` branch is a defensive
 * pass-through for an already-scaled value, not a second convention.
 *
 * Returns null for null — the <4-peer gate is the API's (`percentile: null`), and
 * the web NEVER computes a percentile of its own (spec §7.2).
 */
export function percentileText(percentile) {
  if (percentile == null || !Number.isFinite(percentile)) return null
  const p = Math.round(percentile <= 1 ? percentile * 100 : percentile)
  const suffix =
    p % 100 >= 11 && p % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][p % 10 > 3 ? 0 : p % 10]
  return `${p}${suffix} pctile`
}

/**
 * Band → status tone (2px mark + ink text). Carried HERE rather than read off
 * `riskBandMeta(band).tone`, so the portfolio's marks never depend on how the
 * accreditation RiskChip is styled (the way PaceChip carries its own tone map).
 * The band WORD still comes from the one shared vocabulary above.
 */
export const BAND_TONE = Object.freeze({
  clear: 'good',
  watch: 'watch',
  elevated: 'watch',
  high: 'risk',
  critical: 'risk',
})

/** A band → its tone, or null for no band (a not-ranked school gets no mark). */
export function bandTone(band) {
  return BAND_TONE[band] ?? null
}

/**
 * The band chip. `score` is the server's integer attention score and is rendered
 * WITHOUT a percent sign on purpose: it is an attention index, not a share of
 * anything, and the row's one true percentage (`verifiedPct`) is the column
 * beside it.
 */
export default function AttentionBandChip({ band = null, score = null }) {
  const meta = riskBandMeta(band)
  const hasScore = score != null && Number.isFinite(score)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Pill variant="status" tone={bandTone(band) ?? 'neutral'}>
        {meta.label}
      </Pill>
      {hasScore && (
        <span className="text-[12px] font-semibold tabular-nums text-ink2">
          <span className="sr-only">Attention score </span>
          {Math.round(score)}
        </span>
      )}
    </span>
  )
}

/**
 * The urgency cell. Urgency 0 is a real, stated fact ("No scheduled review") —
 * not a blank — because "we have no date for this school" is exactly the kind of
 * silence this program exists to end.
 */
export function UrgencyChip({ urgency = null, reason = null }) {
  const label = urgencyLabel(reason)
  const pressing = urgency === 3 || urgency === 2
  if (!label) return <span className="text-[12.5px] text-ink2">—</span>
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12.5px] ${pressing ? 'font-semibold text-ink' : 'text-ink2'}`}>
      {pressing && <i className="mark tone-risk" aria-hidden="true" />}
      {pressing && <AlarmClock size={13} aria-hidden className="shrink-0 text-ink2" />}
      {label}
    </span>
  )
}

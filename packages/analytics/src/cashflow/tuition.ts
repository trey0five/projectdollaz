// ─────────────────────────────────────────────────────────────────────────────
// Tuition as a CASH DRIVER, not a twelfth of a revenue line.
//
// "Tuition revenue $4.2m ÷ 12" is the wrong shape twice over. It puts $350,000
// into July when almost nothing arrives, and it treats billing as collection. The
// driver is:
//
//     enrollment × gross tuition − aid × payment-plan mix × expected collection
//
// and THEN timing, because a family on an annual plan pays in July while a family
// on a ten-month plan pays a tenth of that ten times. Two schools with identical
// revenue and different plan mixes have completely different summers.
//
// THE COLLECTION RATE IS THE ONE GENUINELY ESTIMATED INPUT, which is why it is
// isolated here rather than buried. Everything else in a school's cash is a date
// or an amount somebody already knows; this is the number that has to be assumed,
// so it is stated, defaulted conservatively, and — where receivable history
// exists — SUGGESTED from that history rather than silently applied. A forecast
// that quietly adopted a derived assumption would be making a judgement call in
// the school's name.
// ─────────────────────────────────────────────────────────────────────────────
import { addMonths, isoToDays, parseIso, toIso } from './civil.js'
import type { CashEvent } from './types.js'

/** How families pay. Each key's value is the SHARE of billed tuition on that plan. */
export interface PaymentPlanMix {
  /** Paid once, at the start of the year. */
  annual: number
  /** Two instalments, typically July and January. */
  semiannual: number
  /** Ten instalments — the common school year plan. */
  monthly10: number
  /** Twelve instalments. */
  monthly12: number
}

export const DEFAULT_PLAN_MIX: PaymentPlanMix = Object.freeze({
  annual: 0.15,
  semiannual: 0.15,
  monthly10: 0.55,
  monthly12: 0.15,
})

/**
 * A deliberately conservative default. A school that has not told us its
 * collection experience should see a forecast that errs toward the trough being
 * worse, not better — the cost of being wrong in the optimistic direction here is
 * a school that does not arrange a line of credit in time.
 */
export const DEFAULT_COLLECTION_RATE = 0.95

export interface TuitionDriverInput {
  /** Students expected to enroll. */
  enrollment: number
  /** Gross tuition per student before aid. */
  grossTuitionPerStudent: number
  /** TOTAL financial aid for the year, not per student. */
  financialAidTotal: number
  planMix: PaymentPlanMix
  /** 0..1. The share of billed tuition expected to actually arrive. */
  collectionRate: number
  /** ISO date the first billing lands — the school's own first draft date. */
  firstBillingDate: string
  /** Month index offsets for the semi-annual second instalment. Default 6. */
  semiannualSecondOffsetMonths?: number
}

/** Net tuition BILLED for the year, before collection. */
export function netTuitionBilled(input: TuitionDriverInput): number | null {
  const { enrollment, grossTuitionPerStudent, financialAidTotal } = input
  if (!Number.isFinite(enrollment) || enrollment <= 0) return null
  if (!Number.isFinite(grossTuitionPerStudent) || grossTuitionPerStudent <= 0) return null
  const aid = Number.isFinite(financialAidTotal) ? Math.max(0, financialAidTotal) : 0
  const gross = enrollment * grossTuitionPerStudent
  return Math.max(0, gross - aid)
}

/** Plan shares normalised to sum to 1. An all-zero mix yields null, never a divide-by-zero. */
function normalisedMix(mix: PaymentPlanMix): PaymentPlanMix | null {
  const keys: (keyof PaymentPlanMix)[] = ['annual', 'semiannual', 'monthly10', 'monthly12']
  let total = 0
  for (const k of keys) {
    const v = mix[k]
    if (Number.isFinite(v) && v > 0) total += v
  }
  if (total <= 0) return null
  const out = { annual: 0, semiannual: 0, monthly10: 0, monthly12: 0 }
  for (const k of keys) {
    const v = mix[k]
    out[k] = Number.isFinite(v) && v > 0 ? v / total : 0
  }
  return out
}

/**
 * The dated tuition receipts for one year.
 *
 * Every event is `confidence: 'scheduled'` — the DATE is known (it is the
 * school's own draft calendar) while the AMOUNT depends on a collection rate that
 * is an estimate. Calling these 'committed' would overstate exactly the input
 * with the most uncertainty in it.
 */
export function tuitionReceipts(input: TuitionDriverInput): CashEvent[] {
  const billed = netTuitionBilled(input)
  const mix = normalisedMix(input.planMix)
  const start = parseIso(input.firstBillingDate)
  if (billed == null || mix == null || !start) return []

  const rate =
    Number.isFinite(input.collectionRate) && input.collectionRate > 0
      ? Math.min(1, input.collectionRate)
      : DEFAULT_COLLECTION_RATE
  const collected = billed * rate
  const secondOffset = input.semiannualSecondOffsetMonths ?? 6

  const out: CashEvent[] = []
  const push = (date: string | null, amount: number, label: string) => {
    if (!date || !(amount > 0) || isoToDays(date) == null) return
    out.push({
      date,
      amount,
      direction: 'in',
      label,
      category: 'tuition',
      confidence: 'scheduled',
      sourceRef: 'driver:tuition',
    })
  }

  push(input.firstBillingDate, collected * mix.annual, 'Tuition — annual plan')

  const half = (collected * mix.semiannual) / 2
  push(input.firstBillingDate, half, 'Tuition — semi-annual plan')
  push(addMonths(input.firstBillingDate, secondOffset), half, 'Tuition — semi-annual plan')

  for (const [share, count, label] of [
    [mix.monthly10, 10, 'Tuition — 10-month plan'],
    [mix.monthly12, 12, 'Tuition — 12-month plan'],
  ] as const) {
    if (!(share > 0)) continue
    const per = (collected * share) / count
    for (let i = 0; i < count; i += 1) {
      push(addMonths(input.firstBillingDate, i), per, label)
    }
  }
  return out
}

/** Aging buckets as KYRO already persists them (`ArApAgingSnapshot.arBuckets`). */
export interface AgingBuckets {
  current?: number | null
  d1_30?: number | null
  d31_60?: number | null
  d61_90?: number | null
  d90_plus?: number | null
}

export interface CollectionRateSuggestion {
  rate: number
  /** The evidence behind it, so the screen can show its working. */
  basis: { billed: number; over90: number }
}

/**
 * SUGGEST a collection rate from receivable aging. Never applied automatically.
 *
 * The estimate is deliberately crude and its crudeness is the point: everything
 * over 90 days is treated as the portion unlikely to arrive, so the rate is
 * `1 − (over-90 ÷ total)`. A more elaborate model over bucket totals would look
 * more precise without being more true — the invoice-level detail that would
 * justify one is not persisted (only bucket sums are), and dressing four numbers
 * up as a decay curve would be false confidence.
 *
 * Returns null when there is not enough receivable history to say anything.
 */
export function deriveCollectionRate(
  buckets: AgingBuckets | null | undefined,
): CollectionRateSuggestion | null {
  if (!buckets) return null
  const n = (v: number | null | undefined) => (Number.isFinite(v as number) ? (v as number) : 0)
  const billed =
    n(buckets.current) + n(buckets.d1_30) + n(buckets.d31_60) + n(buckets.d61_90) + n(buckets.d90_plus)
  if (!(billed > 0)) return null
  const over90 = n(buckets.d90_plus)
  // Clamped to a sane band: a school with a single stale invoice should not be
  // handed a 40% collection assumption, and none should be handed 100%.
  const raw = 1 - over90 / billed
  const rate = Math.max(0.5, Math.min(0.99, raw))
  return { rate, basis: { billed, over90 } }
}

/** First billing date for a fiscal year starting in July — the common school default. */
export function defaultFirstBillingDate(fiscalYearStartYear: number): string {
  return toIso({ y: fiscalYearStartYear, m: 7, d: 1 })
}

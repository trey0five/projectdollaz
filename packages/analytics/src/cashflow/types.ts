// ─────────────────────────────────────────────────────────────────────────────
// The cash-flow projection vocabulary.
//
// THE ONE DISCIPLINE THIS WHOLE MODULE EXISTS TO PROTECT: the arithmetic is
// deterministic and auditable, and no language model produces a figure. An LLM
// that emits cash numbers directly is not reproducible, and this output goes to a
// board finance committee — two runs disagreeing would end the feature's
// credibility on the first meeting. AI belongs in the layer ABOVE this: writing
// the plain-language explanation, wording an anomaly, turning a spoken scenario
// into parameter changes and re-running THIS engine. The model does the
// arithmetic; the AI does the translation.
//
// CLASSIFY BY PREDICTABILITY, NOT BY "known vs forecast". It is tempting to say
// four fifths of a school's cash can be dated exactly — payroll dates, tuition
// draft dates, debt service. But payroll DATES are known while payroll AMOUNTS
// change; tuition billing dates are known while collections do not arrive as
// billed; scholarship schedules are published while actual timing shifts. So each
// event carries how much is genuinely known about it, and the screen above can
// show a reader which part of their forecast is a calendar and which part is an
// estimate.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How much is actually known about an event. Ordered from most to least certain;
 * the UI groups by this and the projection reports subtotals per class.
 */
export type ConfidenceClass =
  /** Amount AND date substantially known — debt service, leases, insurance, scheduled payroll. */
  | 'committed'
  /** Timing known, amount or collection uncertain — tuition drafts, scholarships, registration. */
  | 'scheduled'
  /** Derived from this school's historical behaviour — aftercare, cafeteria, donations, fundraising. */
  | 'modelled'
  /** Future activity the school entered — a capital project, a new hire, an unusual repair. */
  | 'assumption'

export const CONFIDENCE_CLASSES: readonly ConfidenceClass[] = Object.freeze([
  'committed',
  'scheduled',
  'modelled',
  'assumption',
])

/** Money in or money out. Amounts are always POSITIVE; direction carries the sign. */
export type CashDirection = 'in' | 'out'

/** How a commitment repeats. `semimonthly` carries the 15th-and-last payroll pattern. */
export type Recurrence =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'annual'

export const RECURRENCES: readonly Recurrence[] = Object.freeze([
  'once',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'annual',
])

/**
 * ONE DATED MOVEMENT OF CASH — the atom of the whole engine.
 *
 * `sourceRef` is not decoration. Every figure that reaches a screen has to be
 * answerable to "where did this come from?", and a projection assembled from
 * anonymous numbers cannot answer it. It names the commitment id, the budget
 * account, or the driver that produced this event.
 */
export interface CashEvent {
  /** ISO 'YYYY-MM-DD'. */
  date: string
  /** POSITIVE magnitude. Sign comes from `direction`. */
  amount: number
  direction: CashDirection
  /** Free label shown to a reader — 'Payroll', 'Tuition draft', 'Debt service'. */
  label: string
  /** Grouping key for subtotals — 'payroll', 'tuition', 'debt_service', … */
  category: string
  confidence: ConfidenceClass
  /** Provenance: what produced this event. */
  sourceRef: string
}

/** A commitment as the school records it, before the calendar expands it. */
export interface CashCommitmentInput {
  id: string
  label: string
  category: string
  direction: CashDirection
  amount: number
  confidence: ConfidenceClass
  recurrence: Recurrence
  /** ISO. First occurrence. */
  startDate: string
  /** ISO, inclusive. Null = runs to the end of the projection horizon. */
  endDate?: string | null
  /**
   * Semi-monthly only: which days of the month it lands on. 31 means "last day",
   * clamped per month — see addMonths' note on why the clamp matters.
   */
  dayRule?: readonly number[] | null
}

/** Bucket granularity. Both come from the SAME event set — see project.ts. */
export type Granularity = 'week' | 'month'

export interface CashBucket {
  /** ISO date of the bucket start (Monday for weeks, the 1st for months). */
  start: string
  /** ISO date of the bucket end, inclusive. */
  end: string
  /** 'YYYY-MM-DD' (week) or 'YYYY-MM' (month). */
  key: string
  openingBalance: number
  receipts: number
  disbursements: number
  netChange: number
  closingBalance: number
  /** Receipts − disbursements per confidence class, for the honesty breakdown. */
  byConfidence: Record<ConfidenceClass, number>
  /** True when this bucket's closing balance is under the reserve threshold. */
  belowReserve: boolean
}

export interface CashProjectionInput {
  /**
   * AVAILABLE OPERATING CASH — not the balance-sheet cash total.
   *
   * A school can hold $600,000 of "cash" and have $125,000 that operations may
   * actually spend; the rest is restricted, board-designated or already
   * committed. Starting a projection from the balance-sheet figure overstates
   * every week that follows it, so this is the number the school states and the
   * layer above shows the trial-balance figure beside it.
   */
  openingCash: number
  /** ISO date the opening balance is true as of. Everything rolls forward from here. */
  asOfDate: string
  /** ISO date to project to, inclusive. */
  horizonEnd: string
  events: readonly CashEvent[]
  granularity: Granularity
  /**
   * The balance the school must not drop below. Null = no threshold, and then no
   * shortfall is reported — an engine that invented a reserve floor would
   * manufacture an alarm the school never set.
   */
  reserveThreshold?: number | null
  /**
   * Annual operating expense, for months-of-cash-on-hand at the low point. Null
   * leaves that figure null rather than guessing a denominator.
   */
  annualOperatingExpense?: number | null
}

export interface CashProjectionResult {
  asOfDate: string
  horizonEnd: string
  granularity: Granularity
  openingCash: number
  buckets: CashBucket[]
  /** Lowest closing balance across the horizon, and when it occurs. */
  lowestBalance: number
  lowestDate: string | null
  /** Balance at the end of the horizon. */
  endingBalance: number
  /**
   * First date the projected balance falls BELOW the reserve threshold. Null when
   * no threshold was given or the balance never breaches it.
   */
  firstShortfallDate: string | null
  /** How far below the threshold at the worst point. Null when there is no breach. */
  shortfallAmount: number | null
  /** Days between `asOfDate` and the first breach — how much warning the school has. */
  daysOfNotice: number | null
  /** Months of cash at the LOW POINT, when an annual expense was supplied. */
  monthsCashAtLowPoint: number | null
  /** Whole-horizon net per confidence class. */
  byConfidence: Record<ConfidenceClass, number>
  /** Total receipts and disbursements across the horizon. */
  totalReceipts: number
  totalDisbursements: number
  /**
   * WHAT DUG THE HOLE — outflow by category between the start and the low point,
   * largest first.
   *
   * Computed here rather than left to the caller because the surface above has to
   * explain the trough and cannot be handed the raw event list to do it: a
   * 12-month horizon is hundreds of events, and shipping them all so a sentence
   * can name two categories is the wrong trade. The first version of that
   * sentence had no drivers at all and told a school to add commitments it had
   * already added.
   */
  driversToLowPoint: { category: string; amount: number }[]
  /**
   * The first receipt AFTER the low point — the thing the school is waiting for,
   * which is the other half of any honest explanation of a trough. Null when
   * nothing arrives inside the horizon, and that silence is itself the finding.
   */
  nextReceiptAfterLow: { category: string; date: string; amount: number } | null
  /** Total received BEFORE the low point. Zero is a materially different story. */
  receiptsBeforeLowPoint: number
}

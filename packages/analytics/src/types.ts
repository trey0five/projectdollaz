// ─────────────────────────────────────────────────────────────
// @finrep/analytics — type vocabulary.
//
// PURE TypeScript. Zero UI, zero IO. The analytics package consumes the
// engine's ReportBundle output for TYPES ONLY (import type) and never re-derives
// statement math — it reads the already-computed numbers off a snapshot.
// ─────────────────────────────────────────────────────────────

/** A metric's unit, drives UI formatting. */
export type MetricUnit = 'percent' | 'days' | 'months' | 'ratio' | 'currency' | 'share'

/**
 * Coarse business domain a metric belongs to — for catalog grouping/filtering.
 * Additive metadata (distinct from the finer-grained `category` used by the
 * dashboard layout). Today every metric is finance/operations/aid; declared so
 * the catalog (GET /metrics/meta) and the org rollup can group metrics honestly.
 */
export type MetricDomain = 'finance' | 'operations' | 'aid' | 'enrollment' | 'hr'

/**
 * How a metric rolls up from a single school to the whole organization. This is
 * the CANONICAL semantic-layer rule that makes "two people never see disagreeing
 * numbers" hold across school + org scope.
 *
 *   'recompute-from-components' (DEFAULT) — org value = the metric's OWN
 *      def.compute run on the FIELD-BY-FIELD SUM of the schools' extensive
 *      PeriodFinancials + PeriodOperational. Because every $ field is extensive
 *      and every metric is a quotient of extensive fields, this is the UNIQUE
 *      correct roll-up (e.g. org operating_margin = (Σrev−Σexp)/Σrev, NEVER the
 *      average of per-school margins). One formula per metric, by construction.
 *
 *   'weighted-by-components' — mechanically IDENTICAL to recompute (the org engine
 *      does NOT branch on it). It exists as an honest LABEL for metrics whose
 *      recompute is mathematically an enrollment-/count-weighted mean of the
 *      per-school values (cost_per_pupil = Σexp/Σenroll is the enrollment-weighted
 *      mean), so the catalog/UI can say "enrollment-weighted" instead of implying a
 *      naive average.
 *
 *   'sum' — the metric's VALUE is itself extensive (a raw total). None of the 12
 *      current metrics are pure 'sum' (mix totals fall out of recompute); retained
 *      for a future "total revenue"-style metric. Treated like recompute by the
 *      engine (def.compute on the summed components yields the summed value).
 *
 *   'not-aggregatable' — Σ of the inputs is meaningless OR there is no defensible
 *      org formula (e.g. a future metric whose only input is itself a pre-divided
 *      ratio or an order statistic like a median). The org engine SKIPS the math
 *      and resolves available:false with inputsMissing:['scope:not-aggregatable'].
 *      None of the 12 use it; it exists so a future non-extensive metric refuses to
 *      silently mis-average rather than returning a wrong number.
 */
export type ScopeAggregation =
  | 'recompute-from-components'
  | 'weighted-by-components'
  | 'sum'
  | 'not-aggregatable'

/**
 * Declarative spec for ONE extensive component a metric's compute() consumes — the
 * PeriodFinancials/PeriodOperational field it reads. Purely informational (drives
 * the catalog drawer + a meta-integrity test that the declared keys actually
 * appear in the metric's runtime inputs[]); the org engine NEVER recomputes from
 * this — it sums the real structs field-by-field.
 */
export interface MetricInputSpec {
  /** The operand key — mirrors the runtime MetricInput.key the metric reports. */
  key: string
  /** Which struct the field lives on. */
  source: 'financials' | 'operational'
  /** Human label (matches the runtime input label). */
  label: string
}

/** Logical grouping for the dashboard. */
export type MetricCategory =
  | 'profitability'
  | 'liquidity'
  | 'reserves'
  | 'composition'
  | 'revenue-mix'
  | 'expense-mix'
  | 'operational'

/**
 * Which direction is "good" for this metric. Drives the PoP delta chip color in
 * the UI ('higher' => an increase is good/green; 'lower' => a decrease is good;
 * 'neutral' => the metric is contextual, neither rise nor fall is inherently
 * good, so the chip is shown muted).
 */
export type GoodDirection = 'higher' | 'lower' | 'neutral'

/** Stable metric keys. Adding a metric = add a key + a registry entry + a test. */
export type MetricKey =
  | 'operating_margin'
  | 'days_cash_on_hand'
  | 'months_operating_reserve'
  | 'tuition_dependency'
  | 'revenue_mix'
  | 'expense_mix'
  // Tier-2 operational metrics (need period_operational_data, passed in by the API).
  | 'cost_per_pupil'
  | 'net_tuition_per_student'
  | 'financial_aid_per_student'
  | 'aid_per_aided_student'
  | 'tuition_discount_rate'
  | 'pct_students_on_aid'
  // Tier-2 enrollment domain — first non-finance banded metric (thin wedge).
  | 'enrollment_change_yoy'
  // Tier-2 hr domain — banded staffing-load metric (reuses staff-FTE data).
  | 'student_teacher_ratio'

/**
 * Operational reference data for a period — enrollment + financial aid figures
 * that don't live in the trial balance. The API loads this from
 * period_operational_data, converts Prisma Decimal -> plain number, and passes it
 * into the pure compute layer. The package NEVER reads the DB; it receives plain
 * numbers (or null when a field hasn't been entered).
 *
 * Contract: a field of `null` (or undefined) means NOT ENTERED -> drives
 * `available:false` + inputsMissing on the dependent metric. A field of `0` is a
 * LEGITIMATE value (e.g. a school with zero aid) -> available:true. Denominators
 * (enrollment, studentsOnAid) additionally require > 0 to be usable.
 */
export interface PeriodOperational {
  /** Headcount (primary enrollment number). */
  enrollment: number | null
  /** Optional full-time-equivalent enrollment. */
  enrollmentFte: number | null
  /** Count of students receiving aid. */
  studentsOnAid: number | null
  /** Total financial aid / scholarship dollars for the period. */
  financialAidTotal: number | null
  /**
   * Phase 5 — actual TEACHING FTEs (instructional staff full-time equivalents),
   * distinct from the student-side enrollmentFte. Denominator of the HR-domain
   * student_teacher_ratio; nullable (NOT ENTERED) with the same absent-as-null
   * contract, and additionally requires > 0 to be a usable denominator.
   */
  teachingFte: number | null
  /**
   * Phase 5 — TOTAL STAFF FTEs (all staff, teaching + non-teaching). Surfaced for
   * a complete struct / future admin-ratio metric; unused by v1's single HR metric.
   */
  totalStaffFte: number | null
}

/**
 * Normalized slice of a period's financials, derived ONCE from a ReportBundle by
 * the pure adapter (adapt.ts). Metric functions read this struct, never the raw
 * engine shapes — so the engine's field layout is decoupled from the metrics.
 *
 * cash / restrictedCash / naWithout / naWith are nullable: when the period's
 * snapshot has no Statement of Financial Position (sfpResults.cy === null) they
 * are null, which drives `available: false` on the SFP-dependent metrics rather
 * than fabricating a zero.
 */
export interface PeriodFinancials {
  /** Total revenue & support (SOA). */
  totalRev: number
  /** Total expenses (SOA). */
  totalExp: number
  /** Change in net assets = totalRev - totalExp (SOA). */
  netChange: number
  /** Tuition & fees (SOA). */
  tuition: number
  /** Each revenue rollup line, keyed by SOAResult field. */
  revenueLines: Record<RevenueLineKey, number>
  /** Each expense rollup line, keyed by SOAResult field. */
  expenseLines: Record<ExpenseLineKey, number>
  /** Unrestricted operating cash (SFP). null when no SFP in the snapshot. */
  cash: number | null
  /** Donor-restricted cash (SFP). null when no SFP. */
  restrictedCash: number | null
  /** Net assets without donor restrictions (SFP). null when no SFP. */
  naWithout: number | null
  /** Net assets with donor restrictions (SFP). null when no SFP. */
  naWith: number | null
  /** Whether the snapshot carried a current-year SFP. */
  hasSFP: boolean
  /**
   * Days elapsed from FY-start (Jul 1) through the data's as-of month-end,
   * inclusive. ONLY set for partial-year (monthly) computes; undefined for the
   * annual path (defaults to 365 in the denominator, byte-identical to today).
   */
  elapsedDays?: number | null
  /**
   * Months elapsed from FY-start (Jul=1 .. Jun=12) for the data's as-of
   * month-end. ONLY set for partial-year (monthly) computes; undefined for the
   * annual path (defaults to 12 in the denominator, byte-identical to today).
   */
  elapsedMonths?: number | null
}

/** Revenue rollup line keys (mirror the SOAResult revenue fields). */
export type RevenueLineKey =
  | 'tuition'
  | 'dev'
  | 'studAct'
  | 'textbook'
  | 'other'
  | 'support'
  | 'intlRev'
  | 'investments'
  | 'interest'

/** Expense rollup line keys (mirror the SOAResult expense fields). */
export type ExpenseLineKey =
  | 'instructional'
  | 'facilities'
  | 'fixedOther'
  | 'intlExp'
  | 'bus'
  | 'food'
  | 'studActExp'
  | 'athletics'
  | 'admin'
  | 'restricted'

/** One slice of a breakdown (revenue-mix / expense-mix) metric. */
export interface MixComponent {
  key: string
  label: string
  value: number
  /** value / total; 0..1. */
  share: number
}

/**
 * One named operand that fed a metric's value — the traceability breakdown the
 * drill-down drawer renders. Deterministic: each metric names the SAME values it
 * already reads off the snapshot/operational data (no new math). `value` may be
 * null when that operand was missing (so the drawer can show "missing: X").
 */
export interface MetricInput {
  key: string
  label: string
  value: number | null
  unit: MetricUnit
  /**
   * Which struct this operand came from — stamped by the compute layer by
   * key-joining the metric def's declared MetricInputSpec. Optional + additive;
   * powers the lineage breadcrumb (describeLineage). Absent when a runtime input
   * has no matching declared spec.
   */
  source?: 'financials' | 'operational'
}

/**
 * Phase 4D health status from target bands. 'neutral' = the metric has no
 * universal good/bad (contextual) OR is unavailable — show value/trend only, no
 * risk coloring.
 */
export type HealthStatus = 'good' | 'watch' | 'risk' | 'neutral'

/**
 * SENSIBLE PRIVATE-SCHOOL SECTOR DEFAULT target band for a metric. These are
 * DEFAULTS (tunable per-school later), NOT hard truths. Directional, two-boundary
 * encoding:
 *   goodDirection 'higher': value >= good => good; value < risk => risk; else watch.
 *   goodDirection 'lower':  value <= good => good; value > risk  => risk; else watch.
 * Boundaries: `good` is INCLUSIVE of good; `risk` is the watch/risk frontier and
 * is INCLUSIVE of watch (i.e. exactly == risk lands in WATCH, not risk).
 */
export interface TargetBands {
  goodDirection: 'higher' | 'lower'
  good: number
  risk: number
}

/**
 * The raw output of a metric's compute() — the value plus the availability
 * contract. The registry layer wraps this into a full MetricResult (adding the
 * static metadata + the period-over-period delta).
 */
export interface MetricComputeOutput {
  value: number | null
  available: boolean
  /**
   * Names of the source inputs that were absent/zero and prevented a real value.
   * Empty when available. NEVER returns a wrong/zero number in their place.
   */
  inputsMissing: string[]
  /** Present only on breakdown (mix) metrics. */
  components?: MixComponent[]
  /**
   * The named contributing operands actually used (traceability for the drawer).
   * Reported even when unavailable (value may be null). Optional/additive — the
   * compute layer defaults it to [] so legacy callers/tests are byte-identical.
   */
  inputs?: MetricInput[]
}

/** A metric definition: pure metadata + a pure compute function. */
export interface MetricDef {
  key: MetricKey
  label: string
  /**
   * Optional shorter alias used by the board report's key-indicator strip (e.g.
   * "Avg Net Tuition / Student" vs the canonical "Net Tuition per Student"). When
   * absent the board falls back to `label`. Additive; declaring it moves the
   * alias into the registry so the board never hardcodes a title.
   */
  boardLabel?: string
  unit: MetricUnit
  category: MetricCategory
  goodDirection: GoodDirection
  /** Human-readable basis/footnote (e.g. denominator caveats). */
  basis?: string
  /** Human formula string for the drawer, e.g. "Cash ÷ (Total expenses ÷ 365)". */
  formula: string
  /** One-line plain-language description of what the metric means. */
  description: string
  /**
   * Coarse business domain (catalog grouping). Optional + additive; absent is
   * tolerated by every consumer. All 12 current metrics declare one.
   */
  domain?: MetricDomain
  /**
   * How this metric rolls school→organization. Optional + additive; the org engine
   * treats ABSENT as 'recompute-from-components' (safe — every current input is
   * extensive). Declaring it makes the rollup self-documenting and future-proof
   * (a future non-extensive metric MUST declare 'not-aggregatable').
   */
  scopeAggregation?: ScopeAggregation
  /**
   * Formalized declaration of the extensive components this metric consumes. Static
   * spec (distinct from the runtime MetricComputeOutput.inputs); informational —
   * NOT used to recompute. Optional + additive.
   */
  inputs?: MetricInputSpec[]
  /**
   * Pure compute. `prior` is the IMMEDIATELY-PRIOR fiscal period's financials
   * (for period-over-period context, though the registry computes the PoP delta
   * itself); a metric may ignore it. `curOp`/`priorOp` are the current/prior
   * period's operational data (Tier-2 metrics only; Tier-1 metrics ignore them,
   * keeping their behavior byte-identical). MUST NOT mutate its inputs.
   */
  compute(
    cur: PeriodFinancials,
    prior?: PeriodFinancials,
    curOp?: PeriodOperational,
    priorOp?: PeriodOperational,
  ): MetricComputeOutput
}

/** The full result returned by the API for one metric in one period. */
export interface MetricResult {
  key: MetricKey
  label: string
  /** Board key-indicator alias (from def.boardLabel), copied on by the assembler. */
  boardLabel?: string
  unit: MetricUnit
  category: MetricCategory
  goodDirection: GoodDirection
  basis?: string
  /** Human formula string (from metadata). */
  formula: string
  /** One-line plain-language description (from metadata). */
  description: string
  available: boolean
  value: number | null
  inputsMissing: string[]
  /** cur.value - prior.value; null when either period's value is unavailable. */
  periodOverPeriodDelta: number | null
  /**
   * Phase 4D health status from this metric's target band (or 'neutral' when the
   * metric has no band or is unavailable). Drives the dashboard status coloring.
   */
  status: HealthStatus
  /** The metric's target band, when one exists (sector default). */
  bands?: TargetBands
  /** Named contributing operands (traceability for the drawer). Always present. */
  inputs: MetricInput[]
  /** Present only on breakdown (mix) metrics. */
  components?: MixComponent[]
}

/** One point in a metric's cross-period trend series. */
export interface TrendPoint {
  periodId: string
  label: string
  /** YYYY-MM-DD. */
  periodEndDate: string
  value: number | null
  available: boolean
}

/** A metric's trend across the school's periods (oldest -> newest). */
export interface MetricTrend {
  metric: MetricKey
  label: string
  unit: MetricUnit
  goodDirection: GoodDirection
  points: TrendPoint[]
}

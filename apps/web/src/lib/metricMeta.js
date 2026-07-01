// ─────────────────────────────────────────────────────────────────────────────
// UI metadata + formatters for the analytics dashboard. Everything visual lives
// here (icons, value/delta formatting, donut palette) so cards/charts stay dumb.
//
// IMPORTANT: these formatters do NOT use the report's fmt() (which renders a real
// 0 as an em-dash). A legitimate 0% metric must render "0.0%", not "—".
// ─────────────────────────────────────────────────────────────────────────────
import {
  Percent,
  Wallet,
  PiggyBank,
  GraduationCap,
  PieChart,
  BarChart3,
  Coins,
  Banknote,
  HandCoins,
  Users,
  TrendingUp,
} from 'lucide-react'

// Navy/gold palette tokens (kept in sync with tailwind.config.js).
export const PALETTE = {
  navy: '#1a2744',
  navyDeep: '#111c33',
  navySoft: '#253460',
  gold: '#b89650',
  goldLight: '#d4b47a',
  goldPale: '#e8d4a8',
  muted: '#6b6457',
}

// A gold -> navy ramp for donut slices (themed, deterministic order).
export const DONUT_RAMP = [
  '#b89650',
  '#d4b47a',
  '#253460',
  '#1a2744',
  '#e8d4a8',
  '#3a4d7a',
  '#9c7d3e',
  '#111c33',
  '#c8a86a',
  '#54648f',
]

// Per-metric icon + the format used by the value formatter.
export const METRIC_META = {
  operating_margin: { icon: Percent, format: 'percent' },
  days_cash_on_hand: { icon: Wallet, format: 'days' },
  months_operating_reserve: { icon: PiggyBank, format: 'months' },
  tuition_dependency: { icon: GraduationCap, format: 'percent' },
  revenue_mix: { icon: PieChart, format: 'currency' },
  expense_mix: { icon: BarChart3, format: 'currency' },
  // Tier-2 operational metrics (Phase 4B).
  cost_per_pupil: { icon: Coins, format: 'currency' },
  net_tuition_per_student: { icon: Banknote, format: 'currency' },
  financial_aid_per_student: { icon: HandCoins, format: 'currency' },
  aid_per_aided_student: { icon: PiggyBank, format: 'currency' },
  tuition_discount_rate: { icon: Percent, format: 'percent' },
  pct_students_on_aid: { icon: Users, format: 'percent' },
  // Enrollment domain (thin wedge).
  enrollment_change_yoy: { icon: TrendingUp, format: 'percent' },
}

export function metricIcon(key) {
  return METRIC_META[key]?.icon ?? BarChart3
}

// Human labels for every metric key. Used by customize mode, which lists metrics
// by key even when they aren't in the current period's results (e.g. hidden or
// unavailable). Kept in sync with the @finrep/analytics registry labels.
export const METRIC_LABELS = {
  operating_margin: 'Operating Margin',
  days_cash_on_hand: 'Days Cash on Hand',
  months_operating_reserve: 'Months of Operating Reserve',
  tuition_dependency: 'Tuition Dependency',
  revenue_mix: 'Revenue Mix',
  expense_mix: 'Expense Mix',
  cost_per_pupil: 'Cost per Pupil',
  net_tuition_per_student: 'Net Tuition per Student',
  financial_aid_per_student: 'Financial Aid per Student',
  aid_per_aided_student: 'Aid per Aided Student',
  tuition_discount_rate: 'Tuition Discount Rate',
  pct_students_on_aid: '% of Students on Aid',
  enrollment_change_yoy: 'Enrollment Change (YoY)',
}

export function metricLabel(key) {
  return METRIC_LABELS[key] ?? key
}

// Coarse business domain per metric key — mirrors the @finrep/analytics registry
// `domain` (the per-period MetricResult does not carry it), used ONLY to group the
// compact dashboard cards into domain sections. Kept in lockstep with the registry;
// domains are stable so drift risk is low. Unknown keys fall back to 'finance'.
export const METRIC_DOMAIN = {
  operating_margin: 'finance',
  days_cash_on_hand: 'finance',
  months_operating_reserve: 'finance',
  tuition_dependency: 'finance',
  revenue_mix: 'finance',
  expense_mix: 'finance',
  cost_per_pupil: 'operations',
  net_tuition_per_student: 'aid',
  financial_aid_per_student: 'aid',
  aid_per_aided_student: 'aid',
  tuition_discount_rate: 'aid',
  pct_students_on_aid: 'aid',
  enrollment_change_yoy: 'enrollment',
}

export function metricDomain(key) {
  return METRIC_DOMAIN[key] ?? 'finance'
}

// ── Phase 4D: health status visual tokens (strictly navy/gold) ───────────────
// good→gold (the brand "healthy" accent), watch→muted navy/amber (restrained, NOT
// loud yellow), risk→danger (#8b1a1a, used sparingly as a rail/dot/chip), neutral
// →muted (contextual metrics: NO risk coloring). Composed from existing tokens.
export const STATUS_LABELS = {
  good: 'On track',
  watch: 'Watch',
  risk: 'At risk',
  neutral: 'Contextual',
}

export const STATUS_META = {
  good: {
    label: 'On track',
    dot: 'bg-gold',
    rail: 'bg-gold-gradient',
    chip: 'bg-gold/10 text-[#7a5e00] border-gold/40',
    text: 'text-[#7a5e00]',
    ring: 'ring-gold/30',
  },
  watch: {
    label: 'Watch',
    dot: 'bg-navy-soft',
    rail: 'bg-navy-soft',
    chip: 'bg-navy-soft/10 text-navy-soft border-navy-soft/30',
    text: 'text-navy-soft',
    ring: 'ring-navy-soft/25',
  },
  risk: {
    label: 'At risk',
    dot: 'bg-danger',
    rail: 'bg-danger',
    chip: 'bg-danger/10 text-danger border-danger/30',
    text: 'text-danger',
    ring: 'ring-danger/25',
  },
  neutral: {
    label: 'Contextual',
    dot: 'bg-border',
    rail: 'bg-rule',
    chip: 'bg-section text-muted border-border',
    text: 'text-muted',
    ring: 'ring-border/40',
  },
}

/** Resolve a metric's status token bundle (defaults to neutral). */
export function statusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.neutral
}

/** True for a status that should carry risk-style coloring (good/watch/risk). */
export function isBandedStatus(status) {
  return status === 'good' || status === 'watch' || status === 'risk'
}

// Mix metrics render as donuts in a dedicated row, never as value cards. The
// chart variant is locked to a donut for these (a UI rule, not a stored one).
export const MIX_METRIC_KEYS = ['revenue_mix', 'expense_mix']
export function isMixMetric(key) {
  return MIX_METRIC_KEYS.includes(key)
}

// Map a metric's unit to a value format (the API also sends `unit`).
export function formatForUnit(unit) {
  switch (unit) {
    case 'percent':
      return 'percent'
    case 'days':
      return 'days'
    case 'months':
      return 'months'
    case 'currency':
      return 'currency'
    case 'ratio':
      return 'ratio'
    case 'share':
      return 'share'
    default:
      return 'ratio'
  }
}

/**
 * Resolve the format to use for a given metric, preferring the per-metric format
 * from METRIC_META over the unit-derived one. This fixes the mix-metric trap:
 * revenue_mix / expense_mix carry unit 'share' but their .value is a CURRENCY
 * TOTAL — METRIC_META declares them format:'currency', so this helper renders the
 * dollar total instead of a bogus percent. Falls back to formatForUnit for every
 * key without an explicit format (byte-identical output for those).
 */
export function metricFormat(key, unit) {
  return METRIC_META[key]?.format ?? formatForUnit(unit)
}

/** Format a raw metric value for display. Never substitutes a dash for a real 0. */
export function formatMetricValue(value, format) {
  if (value == null || Number.isNaN(value)) return '—'
  switch (format) {
    case 'percent':
    case 'share':
      return `${(value * 100).toFixed(1)}%`
    case 'days':
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    case 'months':
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    case 'currency':
      return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    case 'ratio':
    default:
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  }
}

/** Format a PoP delta (signed). Percent/share deltas render as +x.x pts. */
export function formatDelta(delta, format) {
  if (delta == null || Number.isNaN(delta)) return null
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const abs = Math.abs(delta)
  switch (format) {
    case 'percent':
    case 'share':
      return `${sign}${(abs * 100).toFixed(1)} pts`
    case 'days':
      return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    case 'months':
      return `${sign}${abs.toFixed(1)}`
    case 'currency':
      return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    case 'ratio':
    default:
      return `${sign}${abs.toFixed(2)}`
  }
}

/**
 * Resolve the delta's semantic tone from the metric's goodDirection (NOT the raw
 * sign). 'higher' => up is good; 'lower' => down is good; 'neutral' => muted.
 * Returns 'good' | 'bad' | 'neutral'.
 */
export function deltaTone(delta, goodDirection) {
  if (delta == null || delta === 0 || goodDirection === 'neutral') return 'neutral'
  const improving =
    (goodDirection === 'higher' && delta > 0) ||
    (goodDirection === 'lower' && delta < 0)
  return improving ? 'good' : 'bad'
}

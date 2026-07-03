// ─────────────────────────────────────────────────────────────────────────────
// UI metadata for the analytics dashboard. The web-only VISUAL tokens live here
// (icons, status colors, donut palette) so cards/charts stay dumb.
//
// The metric CATALOG (labels, domains, units) and the VALUE/DELTA FORMATTERS are
// no longer hand-maintained here — they are re-derived from @finrep/analytics,
// the single semantic-layer source of truth, so the dashboard, API briefing,
// board report and Penny never drift. The exported names below are unchanged, so
// no consumer import changes.
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
  UserCog,
} from 'lucide-react'
import {
  METRIC_META,
  MIX_METRIC_KEYS,
  resolveDisplayUnit,
  formatMetricValue,
  formatMetricDelta,
} from '@finrep/analytics'

// Re-export the canonical value/delta formatters + the mix-keys list under the
// SAME names the dashboard already imports (byte-identical output).
export { formatMetricValue, MIX_METRIC_KEYS }
export { formatMetricDelta as formatDelta }

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

// Per-metric icon (web-only visual token; the icon component per metric key).
const METRIC_ICONS = {
  operating_margin: Percent,
  days_cash_on_hand: Wallet,
  months_operating_reserve: PiggyBank,
  tuition_dependency: GraduationCap,
  revenue_mix: PieChart,
  expense_mix: BarChart3,
  // Tier-2 operational metrics (Phase 4B).
  cost_per_pupil: Coins,
  net_tuition_per_student: Banknote,
  financial_aid_per_student: HandCoins,
  aid_per_aided_student: PiggyBank,
  tuition_discount_rate: Percent,
  pct_students_on_aid: Users,
  // Enrollment domain (thin wedge).
  enrollment_change_yoy: TrendingUp,
  // HR domain (page-less module; value shows here + in the briefing).
  student_teacher_ratio: UserCog,
}

export function metricIcon(key) {
  return METRIC_ICONS[key] ?? BarChart3
}

// Keyed lookup over the canonical served catalog (labels/units/domains) from
// @finrep/analytics — the single source of truth. Replaces the hand-maintained
// METRIC_LABELS / METRIC_DOMAIN maps so they can never drift from the registry.
const META_BY_KEY = Object.fromEntries(METRIC_META.map((m) => [m.key, m]))

// Human label for a metric key. Used by customize mode, which lists metrics by
// key even when they aren't in the current period's results. Falls back to the
// raw key for an unknown metric.
export function metricLabel(key) {
  return META_BY_KEY[key]?.label ?? key
}

// Coarse business domain for a metric key — the registry `domain` (the per-period
// MetricResult doesn't carry it), used ONLY to group the compact dashboard cards
// into domain sections. Unknown keys fall back to 'finance'.
export function metricDomain(key) {
  return META_BY_KEY[key]?.domain ?? 'finance'
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
// MIX_METRIC_KEYS is re-exported from @finrep/analytics (canonical) above.
export function isMixMetric(key) {
  return MIX_METRIC_KEYS.includes(key)
}

// Normalize a metric's unit into the format vocab the value formatter switches
// on. Retained as a thin passthrough for the drawer's per-input formatting: the
// canonical formatMetricValue keys off the same {percent,share,days,months,
// currency,ratio} vocab, so this is now the identity (with a ratio default for
// an unknown unit — byte-identical to the prior mapping downstream).
export function formatForUnit(unit) {
  return unit ?? 'ratio'
}

/**
 * Resolve the display unit/format to use for a given metric. Delegates to the
 * canonical resolveDisplayUnit, which applies the mix→currency override:
 * revenue_mix / expense_mix carry unit 'share' but their .value is a CURRENCY
 * TOTAL, so this renders the dollar total instead of a bogus percent. Every other
 * key passes its own unit through (byte-identical to before).
 */
export function metricFormat(key, unit) {
  return resolveDisplayUnit(key, unit)
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

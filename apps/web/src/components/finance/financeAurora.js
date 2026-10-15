// ─────────────────────────────────────────────────────────────────────────────
// financeAurora — the pure WORDS behind the Aurora Finance overview: the band's
// verdict sentence, the glass-card captions, and the Warnings tiles cut from
// KYRO's insight lines. No React, no fetching — every function takes figures
// the page already holds and returns plain strings (or null).
//
// HONESTY RULES (same as the rest of the page):
//   • A figure that is missing is never a zero: callers get null and show "—".
//   • A verdict (Good / Watch / At risk) only ever comes from a metric's own
//     band (isBandedStatus). An unbanded figure gets no verdict word.
//   • "closed" is said only of a year whose end date has passed; an open year
//     "is running".
// ─────────────────────────────────────────────────────────────────────────────
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Landmark,
  Percent,
  PieChart,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  HandCoins,
} from 'lucide-react'
import { formatMetricValue, formatDelta, isBandedStatus } from '../../lib/metricMeta.js'

/** Plain short names for the band sentence ("Cash is the one to watch."). */
export const SHORT_NAME = {
  operating_margin: 'Margin',
  days_cash_on_hand: 'Cash',
  months_operating_reserve: 'Reserve',
  tuition_dependency: 'Tuition reliance',
}

/** "$430,000" — whole dollars, unicode minus for negatives. */
export function money(n) {
  if (n == null || !Number.isFinite(n)) return null
  const s = `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
  return n < 0 ? `−${s}` : s
}

/** "−$4.57M" / "$430K" — compact, for glass cards and column labels. */
export function moneyShort(n) {
  if (n == null || !Number.isFinite(n)) return null
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}K`
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`
}

/** Has this period's end date passed (as of `today`)? */
export function periodClosed(periodEndDate, today = new Date()) {
  if (!periodEndDate) return false
  const end = new Date(periodEndDate)
  return Number.isFinite(end.getTime()) && end.getTime() < today.getTime()
}

/**
 * The band's verdict, as parts the page renders with <VerdictEm>:
 *   { lead, em, emTone, tail, tailTone }
 *   "FY 2026 closed" "$430,000 ahead" "." + "Cash is the one to watch."
 * `metrics` = the banded vitals to judge (metric rows); `change` = money in −
 * money out (null when either total is missing → the lead is omitted).
 */
export function financeVerdict({ periodLabel, periodEndDate, change, metrics = [], today }) {
  const out = { lead: null, em: null, emTone: null, tail: null, tailTone: null }
  if (change != null && Number.isFinite(change)) {
    const name = periodLabel || 'This year'
    out.lead = `${name} ${periodClosed(periodEndDate, today) ? 'closed' : 'is running'}`
    out.em = change >= 0 ? `${money(change)} ahead` : `${money(Math.abs(change))} behind`
    out.emTone = change >= 0 ? null : 'risk'
  }
  const banded = metrics.filter((m) => m?.available && isBandedStatus(m.status))
  if (banded.length) {
    const risk = banded.filter((m) => m.status === 'risk')
    const watch = banded.filter((m) => m.status === 'watch')
    const names = (list) => {
      const ns = list.map((m) => SHORT_NAME[m.key] ?? m.label)
      if (ns.length <= 2) return ns.join(' and ')
      return `${ns.length} key numbers`
    }
    if (risk.length) {
      out.tail = `${names(risk)} ${risk.length === 1 ? 'is' : 'are'} at risk.`
      out.tailTone = 'risk'
    } else if (watch.length) {
      out.tail = watch.length === 1 ? `${names(watch)} is the one to watch.` : `${names(watch)} are worth watching.`
      out.tailTone = 'watch'
    } else {
      out.tail = 'Every key number looks healthy.'
      out.tailTone = 'good'
    }
  }
  return out
}

/** The metric's verdict for a pill: its own band, or null. */
export function metricVerdict(metric) {
  return metric?.available && isBandedStatus(metric.status) ? metric.status : null
}

/**
 * WHICH YEAR the figures' change is measured against. The API diffs each
 * metric with the NEAREST EARLIER period that has saved numbers
 * (AnalyticsService.nearestPriorBundle) — which is two years back when the
 * year in between was never saved. This mirrors that rule over the page's
 * saved periods so the caption can say which year it really is:
 *   null                          — no earlier saved year: there is no change
 *   { label, lastYear: true }     — the immediately prior year (≈12 months back)
 *   { label, lastYear: false }    — an older year; the caption names it
 * `periods` = saved periods ({ id, label, periodEndDate, hasSnapshot? }).
 */
export function comparisonBasis(periods, period, formatLabel = (l) => l) {
  const end = period?.periodEndDate ? Date.parse(period.periodEndDate) : NaN
  if (!Number.isFinite(end)) return null
  let best = null
  let bestEnd = -Infinity
  for (const p of periods || []) {
    if (!p || p.hasSnapshot === false || p.id === period.id) continue
    const t = Date.parse(p.periodEndDate)
    if (Number.isFinite(t) && t < end && t > bestEnd) {
      best = p
      bestEnd = t
    }
  }
  if (!best) return null
  const gapDays = (end - bestEnd) / 86_400_000
  return { label: formatLabel(best.label) || best.label, lastYear: gapDays >= 320 && gapDays <= 410 }
}

/** Caption shown when there is no earlier saved year to compare with. */
export const NO_LAST_YEAR = 'No last-year numbers yet'

/**
 * One short caption under a glass figure: the change on last year when there
 * is one ("Up 0.4 pts on last year", "Same as last year"), else the date.
 *
 * `basis` (comparisonBasis) says which year the change is against. Passed as
 * null — no earlier saved year — the caption says so instead of a change; an
 * older year is named ("Up 2 on FY 2024"), never called "last year". Left out
 * (undefined), the caption keeps the legacy "last year" wording.
 */
export function kpiCaption(metric, fmt, periodEndLabel, basis) {
  if (basis === null) return NO_LAST_YEAR
  const against = basis && !basis.lastYear ? basis.label : 'last year'
  const d = metric?.available ? metric.periodOverPeriodDelta : null
  if (d != null && Number.isFinite(d)) {
    const shown = (formatDelta(Math.abs(d), fmt) ?? '').replace(/^[+−-]/, '')
    // A change that rounds to nothing at this unit's precision IS "the same".
    if (!shown || Number(shown.replace(/[^\d.]/g, '')) === 0) {
      return `Same as ${against}`
    }
    return `${d > 0 ? 'Up' : 'Down'} ${shown} on ${against}`
  }
  return periodEndLabel ? `On ${periodEndLabel}` : null
}

/** A metric's value split into figure + unit for a glass card. */
export function kpiFigure(metric, fmt) {
  if (!metric?.available) return { value: null, unit: null }
  const v = formatMetricValue(metric.value, fmt)
  if (fmt === 'days') return { value: v, unit: 'days' }
  if (fmt === 'months') return { value: v, unit: 'months' }
  return { value: v, unit: null }
}

// ── Warnings: KYRO's insight lines → short tiles ─────────────────────────────
const SIGNAL_VERDICT = { risk: 'risk', watch: 'watch', strength: 'good' }

const ICON_RULES = [
  [/tuition|diversif/i, PieChart],
  [/enrol|retention|pipeline|students?/i, Users],
  [/cash|liquid/i, Wallet],
  [/reserve|cushion/i, Landmark],
  [/margin|surplus|deficit/i, Percent],
  [/budget|plan\b/i, Target],
  [/aid|scholarship|gift|donat|fundrais/i, HandCoins],
  [/declin|fell|drop|down/i, TrendingDown],
  [/rose|grew|up\b|increas|improv/i, TrendingUp],
]
const TONE_ICON = { risk: AlertTriangle, watch: Eye, good: CheckCircle2 }

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * Split one insight line into a short title + one short line:
 *   "Enrollment declined 11% year-over-year; monitor pipeline and retention."
 *   → { title: "Enrollment declined 11% year-over-year",
 *       desc:  "Monitor pipeline and retention." }
 *   "Tuition dependency at 87% leaves minimal revenue diversification buffer"
 *   → { title: "Tuition dependency at 87%",
 *       desc:  "Leaves minimal revenue diversification buffer." }
 * Punctuation breaks win; failing those, a linking verb (leaves / provides /
 * indicates / suggests / signals) splits the FIGURE from the reading. A line
 * with no natural break stays whole as the title.
 */
const VERB_BREAK = /^(.+?\d.*?)\s+(leaves|provides|indicates|suggests|signals|means|puts)\s+(.+)$/i
export function splitSignal(text) {
  const t = String(text ?? '').trim()
  const m = t.match(/^(.+?)(?:;\s+|\s+—\s+|:\s+)(.+)$/) ?? (() => {
    const v = t.match(VERB_BREAK)
    return v ? [v[0], v[1], `${v[2]} ${v[3]}`] : null
  })()
  if (!m) return { title: t.replace(/\.$/, ''), desc: null }
  const rest = cap(m[2].trim())
  return { title: m[1].trim().replace(/\.$/, ''), desc: /[.!?]$/.test(rest) ? rest : `${rest}.` }
}

/** Insight signals ({category, text}) → Warnings tiles, worst first. */
export function warningTiles(signals = []) {
  const order = { risk: 0, watch: 1, good: 2 }
  return signals
    .map((sg, i) => {
      const verdict = SIGNAL_VERDICT[sg.category] ?? null
      const { title, desc } = splitSignal(sg.text)
      const rule = ICON_RULES.find(([re]) => re.test(sg.text))
      return {
        id: `sig-${i}`,
        title,
        desc,
        verdict,
        icon: rule?.[1] ?? TONE_ICON[verdict] ?? Eye,
      }
    })
    .sort((a, b) => (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3))
}

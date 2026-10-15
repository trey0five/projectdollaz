// ─────────────────────────────────────────────────────────────────────────────
// The insight VALUE guard (live UX review 2026-10-15).
//
// The AI warning read "Operating margin is positive but thin at 0.26% — Watch"
// beside a card showing "Operating margin 25.8% — Good": the model was handed
// the raw fraction 0.258 and called it a percent. And on a P&L-only year it
// announced "Days cash on hand is zero — immediate liquidity crisis" about a
// metric that could not be measured at all.
//
// Same rule as Penny's narration (assistant/value-safety.ts — reused, not
// copied): the LLM contributes PHRASING ONLY. Each tagged line is checked
// against the metrics it talks about:
//   - every figure in the line must be one of those metrics' own values or
//     movements (sign- and unit-aware, any of the forms the product prints);
//   - its tag (and any blunt status word) must agree with the metric's status;
//   - it may not talk about a metric that is unavailable, nor about the
//     balance sheet (cash, reserves, liquidity, net assets) when the year has
//     none;
//   - a line naming no metric may carry no figure, and is dropped either way —
//     a line nobody can check is not a warning.
// A line that fails is REPLACED by the deterministic rule sentence for the
// metric it was about (ruleSignalFor); a line about nothing checkable is
// dropped. Pure and deterministic.
// ─────────────────────────────────────────────────────────────────────────────
import {
  formatMetricDelta,
  formatMetricValue,
  formatMetricValueLong,
  resolveDisplayUnit,
  type MetricKey,
  type MetricResult,
} from '@finrep/analytics'
import { tokensOf } from '../assistant/value-safety.js'
import { MAX_INSIGHT_SIGNALS, insightTagOf, type InsightTag } from './insight-reply.js'
import { ruleSignalFor } from './insight-rule.js'

/** Extra ways people (and models) name a metric, beyond its label / board label. */
const ALIASES: Partial<Record<MetricKey, string[]>> = {
  days_cash_on_hand: ['days cash', 'days of cash', 'cash on hand', 'cash days'],
  months_operating_reserve: ['operating reserve', 'months of reserve', 'reserve months', 'reserves'],
  operating_margin: ['operating margin', 'operating surplus', 'operating deficit'],
  forecast_operating_margin: ['forecast margin', 'forecast operating margin', 'projected margin'],
  tuition_dependency: [
    'tuition dependency',
    'tuition dependence',
    'dependent on tuition',
    'dependence on tuition',
    'reliance on tuition',
    'reliant on tuition',
    'tuition reliance',
    'tuition share',
    'share of revenue from tuition',
  ],
  tuition_discount_rate: ['discount rate', 'tuition discount', 'discounting'],
  cost_per_pupil: ['cost per pupil', 'cost per student'],
  net_tuition_per_student: ['net tuition per student', 'net tuition'],
  student_teacher_ratio: ['student-teacher ratio', 'student teacher ratio', 'students per teacher'],
  enrollment_headcount: ['enrollment headcount', 'headcount'],
  enrollment_change_yoy: ['enrollment change', 'enrollment grew', 'enrollment fell', 'enrollment declined'],
  pct_students_on_aid: ['students on aid', 'on financial aid'],
}

/** Words that put a line about the BALANCE SHEET (only checkable when there is one). */
const BALANCE_SHEET_WORDS = /\b(cash|liquidity|reserves?|net assets|balance sheet|solvency|current ratio|debt)\b/i

const NEGATIVE_WORDS = /\b(crisis|at risk|risky|concern(?:ing)?|thin|weak|deficit|shortfall|alarming|dangerous|critical)\b/i
const POSITIVE_WORDS = /\b(healthy|strong|solid|robust|comfortable|excellent)\b/i

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function aliasesOf(m: MetricResult): string[] {
  const names = [m.label, m.boardLabel ?? '', ...(ALIASES[m.key] ?? [])]
  return [...new Set(names.map(norm).filter((n) => n.length >= 4))]
}

/** Metrics a line talks about. A name inside a longer matched name ("operating
 *  margin" inside "forecast operating margin") belongs to the longer one. */
export function metricsMentioned(text: string, metrics: MetricResult[]): MetricResult[] {
  const hay = ` ${norm(text)} `
  const hits: Array<{ m: MetricResult; alias: string }> = []
  for (const m of metrics) {
    const best = aliasesOf(m)
      .filter((a) => hay.includes(` ${a} `) || hay.includes(` ${a}`))
      .sort((a, b) => b.length - a.length)[0]
    if (best) hits.push({ m, alias: best })
  }
  return hits
    .filter((h) => !hits.some((o) => o !== h && o.alias.length > h.alias.length && o.alias.includes(h.alias)))
    .map((h) => h.m)
}

/** Every canonical figure token the product could legitimately print for a metric. */
export function allowedTokensFor(m: MetricResult, text = ''): Set<string> {
  const allow = new Set<string>()
  if (!m.available || m.value === null) return allow
  const unit = resolveDisplayUnit(m.key, m.unit)
  const add = (s: string | null | undefined) => {
    if (s) for (const t of tokensOf(s)) allow.add(t)
  }
  const forms = (v: number, signed: boolean) => {
    const out: string[] = []
    const sv = signed ? v : Math.abs(v)
    switch (unit) {
      case 'percent':
      case 'share':
        out.push(`${(sv * 100).toFixed(1)}%`, `${Math.round(sv * 100)}%`, `${(sv * 100).toFixed(2)}%`)
        break
      case 'days':
      case 'count':
        out.push(String(Math.round(sv)), formatMetricValue(sv, unit))
        break
      case 'months':
        out.push(sv.toFixed(1), String(Math.round(sv)))
        break
      case 'currency': {
        out.push(`$${Math.round(sv).toLocaleString('en-US')}`)
        const a = Math.abs(sv)
        const neg = sv < 0 ? '-' : ''
        if (a >= 1000) out.push(`${neg}$${(a / 1e3).toFixed(0)}k`, `${neg}$${(a / 1e3).toFixed(1)}k`)
        if (a >= 1e6) out.push(`${neg}$${(a / 1e6).toFixed(1)}m`, `${neg}$${(a / 1e6).toFixed(2)}m`)
        break
      }
      default:
        out.push(sv.toFixed(2), sv.toFixed(1), String(Math.round(sv)))
    }
    return out
  }
  // The value, as the card / prose / rule sentence print it.
  add(formatMetricValue(m.value, unit))
  add(formatMetricValueLong(m.value, unit))
  for (const f of forms(m.value, true)) add(f)
  // A negative value said as "a deficit of 3%" — only with a word that carries the sign.
  if (m.value < 0 && /\b(deficit|negative|loss|shortfall|below zero)\b/i.test(text)) {
    for (const f of forms(m.value, false)) add(f)
  }
  // The movement (signed and as a size: "improved by 2.1 pts").
  const d = m.periodOverPeriodDelta
  if (d !== null && d !== 0) {
    add(formatMetricDelta(d, unit))
    for (const f of forms(d, false)) add(f)
    for (const f of forms(d, true)) add(f)
    if (unit === 'percent' || unit === 'share') {
      add((Math.abs(d) * 100).toFixed(1))
      add(String(Math.round(Math.abs(d) * 100)))
    }
  }
  return allow
}

/** Tags a line about this metric may carry. */
function allowedTags(m: MetricResult): Set<InsightTag> {
  const tags = new Set<InsightTag>()
  if (m.status === 'risk') tags.add('RISK')
  if (m.status === 'watch') tags.add('WATCH')
  if (m.status === 'good') tags.add('STRENGTH')
  if (m.key === 'tuition_dependency' && (m.value ?? 0) > 0.8) {
    tags.add('WATCH')
    tags.add('RISK')
  }
  const d = m.periodOverPeriodDelta
  if (m.goodDirection !== 'neutral' && d !== null && d !== 0) {
    const improving = (m.goodDirection === 'higher' && d > 0) || (m.goodDirection === 'lower' && d < 0)
    tags.add(improving ? 'STRENGTH' : 'WATCH')
  }
  return tags
}

/** Does a status word contradict the metric's status? */
function statusWordsContradict(text: string, m: MetricResult): boolean {
  if (m.status === 'good' && NEGATIVE_WORDS.test(text)) return true
  if (m.status === 'risk' && POSITIVE_WORDS.test(text)) return true
  return false
}

export interface GuardedInsight {
  /** The guarded tagged lines, or null when nothing checkable survived. */
  text: string | null
  /** Lines replaced by the rule sentence / dropped (for logging). */
  replaced: number
  dropped: number
}

/**
 * Check every `[TAG] sentence` line of a validated LLM reply against the
 * metrics. Passing lines are kept verbatim; a failing line about a metric is
 * replaced by that metric's rule sentence; anything uncheckable is dropped.
 */
export function guardInsightLines(text: string, metrics: MetricResult[]): GuardedInsight {
  const available = metrics.filter((m) => m.available && m.value !== null)
  const unavailable = metrics.filter((m) => !(m.available && m.value !== null))
  const noBalanceSheet = metrics.some((m) => m.reason === 'needs-balance-sheet' || m.reason === 'balance-sheet-unsorted')
  const out: string[] = []
  const covered = new Set<MetricKey>()
  let replaced = 0
  let dropped = 0

  for (const raw of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const tag = insightTagOf(raw)
    if (!tag) {
      dropped++
      continue
    }
    const body = raw.replace(/^\[[A-Z]+\]\s*/, '')
    // Never speak of a metric that couldn't be measured, nor of the balance
    // sheet on a year that has none.
    if (metricsMentioned(body, unavailable).length > 0 || (noBalanceSheet && BALANCE_SHEET_WORDS.test(body))) {
      dropped++
      continue
    }
    const refs = metricsMentioned(body, available)
    if (refs.length === 0) {
      dropped++
      continue
    }
    const allow = new Set<string>()
    const tags = new Set<InsightTag>()
    for (const m of refs) {
      for (const t of allowedTokensFor(m, body)) allow.add(t)
      for (const t of allowedTags(m)) tags.add(t)
    }
    const figuresOk = [...tokensOf(body)].every((t) => allow.has(t))
    const statusOk = tags.has(tag) && !statusWordsContradict(body, refs[0])
    const fresh = refs.every((m) => !covered.has(m.key))

    if (figuresOk && statusOk && fresh) {
      out.push(`[${tag}] ${body}`)
      for (const m of refs) covered.add(m.key)
    } else {
      const primary = refs.find((m) => !covered.has(m.key))
      const rule = primary ? ruleSignalFor(primary) : null
      if (rule && primary) {
        out.push(rule)
        covered.add(primary.key)
        replaced++
      } else {
        dropped++
      }
    }
    if (out.length >= MAX_INSIGHT_SIGNALS) break
  }
  return { text: out.length > 0 ? out.join('\n') : null, replaced, dropped }
}

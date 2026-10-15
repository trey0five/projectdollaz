// ─────────────────────────────────────────────────────────────────────────────
// The TAGGED rule fallback for the AI insight (review fix, 2026-10-15).
//
// The Finance page's Warnings grid turns ONLY tagged lines ([RISK] / [WATCH] /
// [STRENGTH]) into tiles — an untagged line is never a finding (A2). The old
// rule fallback (@finrep/analytics generateInsight) is untagged prose, so when
// the LLM is off, throws, or fails the reply gate, a school with a metric AT
// RISK was shown the green "Nothing flagged" empty state. This builds the same
// rule sentences as generateInsight, but one TAGGED line per signal, the tag
// taken from each metric's health status (risk → [RISK], watch → [WATCH],
// good → [STRENGTH]).
//
//   - nothing available → 'Not enough data to summarize this period yet.'
//     (UNTAGGED on purpose: it is not a finding; the page shows its empty state)
//   - only neutral (no band) metrics and no movement → '' is never returned;
//     the generateInsight prose is returned instead (untagged → empty state),
//     because nothing was actually flagged.
//
// Pure + deterministic (no Date / random / IO): same input → identical string.
// Lives in the API (not @finrep/analytics) so the analytics package's
// generateInsight — and everything that renders it — is unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import { METRIC_KEYS, generateInsight, type MetricKey, type MetricResult } from '@finrep/analytics'
import { MAX_INSIGHT_SIGNALS, type InsightTag } from './insight-reply.js'

export const NOT_ENOUGH_DATA = 'Not enough data to summarize this period yet.'

/** Same prose formatter generateInsight uses (string-only, deterministic). */
function fmtValue(value: number, unit: MetricResult['unit']): string {
  switch (unit) {
    case 'percent':
    case 'share':
      return `${Math.round(value * 100)}%`
    case 'days':
      return `${Math.round(value)} days`
    case 'months':
      return `${value.toFixed(1)} months`
    case 'currency':
      return `$${Math.round(value).toLocaleString('en-US')}`
    default:
      return value.toFixed(2)
  }
}

function priority(key: MetricKey): number {
  const i = METRIC_KEYS.indexOf(key)
  return i < 0 ? METRIC_KEYS.length : i
}

const TAG_ORDER: Record<InsightTag, number> = { RISK: 0, WATCH: 1, STRENGTH: 2 }

interface Signal {
  tag: InsightTag
  text: string
  rank: number
}

/**
 * One tagged line per signal, worst first, at most MAX_INSIGHT_SIGNALS.
 * Returns the untagged NOT_ENOUGH_DATA line with nothing available, and the
 * untagged generateInsight prose when no metric carries a risk/watch/good
 * status and nothing moved (nothing to flag → the page's empty state).
 */
export function generateInsightSignals(metrics: MetricResult[]): string {
  const available = metrics
    .filter((m) => m.available && m.value !== null)
    .sort((a, b) => priority(a.key) - priority(b.key))
  if (available.length === 0) return NOT_ENOUGH_DATA

  const signals: Signal[] = []
  const used = new Set<MetricKey>()
  const v = (m: MetricResult) => fmtValue(m.value as number, m.unit)

  // ── Status-driven signals: every risk and every watch ─────────────────────
  // Tuition dependency above 80% is always flagged (generateInsight's "remains
  // high" sentence), even when its band calls it good.
  for (const m of available) {
    const highDep = m.key === 'tuition_dependency' && (m.value as number) > 0.8
    if (m.status !== 'risk' && m.status !== 'watch' && !highDep) continue
    const tag: InsightTag = m.status === 'risk' ? 'RISK' : 'WATCH'
    const text = highDep
      ? `Tuition dependency remains high at ${v(m)} — consider diversifying revenue.`
      : tag === 'RISK'
        ? `${m.label} is a risk at ${v(m)}.`
        : `${m.label} needs a closer look at ${v(m)}.`
    signals.push({ tag, text, rank: priority(m.key) })
    used.add(m.key)
  }

  // ── Biggest movement among the rest (generateInsight's sentence 2) ─────────
  const mover = available
    .filter(
      (m) =>
        !used.has(m.key) &&
        m.goodDirection !== 'neutral' &&
        m.periodOverPeriodDelta !== null &&
        m.periodOverPeriodDelta !== 0,
    )
    .sort((a, b) => {
      const d =
        Math.abs(b.periodOverPeriodDelta as number) - Math.abs(a.periodOverPeriodDelta as number)
      return d !== 0 ? d : priority(a.key) - priority(b.key)
    })[0]
  if (mover) {
    const delta = mover.periodOverPeriodDelta as number
    const improving =
      (mover.goodDirection === 'higher' && delta > 0) ||
      (mover.goodDirection === 'lower' && delta < 0)
    signals.push({
      tag: improving ? 'STRENGTH' : 'WATCH',
      text: `${mover.label} ${improving ? 'improved' : 'slipped'} by ${fmtValue(Math.abs(delta), mover.unit)} to ${v(mover)}.`,
      rank: -1, // the movement leads its tag group, like generateInsight's 2nd sentence
    })
    used.add(mover.key)
  }

  // ── Strengths: operating margin first, then registry order ─────────────────
  const goods = available
    .filter((m) => !used.has(m.key) && m.status === 'good')
    .sort((a, b) =>
      a.key === 'operating_margin' ? -1 : b.key === 'operating_margin' ? 1 : priority(a.key) - priority(b.key),
    )
  goods.forEach((m, i) => {
    signals.push({ tag: 'STRENGTH', text: `${m.label} is healthy at ${v(m)}.`, rank: 1000 + i })
    used.add(m.key)
  })

  if (signals.length === 0) return generateInsight(metrics)

  const ordered = signals
    .sort((a, b) => TAG_ORDER[a.tag] - TAG_ORDER[b.tag] || a.rank - b.rank)
    .slice(0, MAX_INSIGHT_SIGNALS)
  // The worst risk leads, phrased as generateInsight's lead sentence.
  const lead = ordered[0]
  if (lead.tag === 'RISK' && / is a risk at [^—]*\.$/.test(lead.text)) {
    lead.text = lead.text.replace(/\.$/, ' — the top priority to address.')
  }
  return ordered.map((s) => `[${s.tag}] ${s.text}`).join('\n')
}

/**
 * The rule sentence for ONE metric, tagged — the same sentences
 * generateInsightSignals emits for it (without the lead's "top priority"
 * suffix). Used by the insight value guard (insight-guard.ts) to replace an LLM
 * line whose figures or status don't match this metric. Null when the metric
 * has nothing to say (unavailable, or neutral with no movement).
 */
export function ruleSignalFor(m: MetricResult): string | null {
  if (!m.available || m.value === null) return null
  const v = fmtValue(m.value, m.unit)
  const highDep = m.key === 'tuition_dependency' && m.value > 0.8
  if (m.status === 'risk' || m.status === 'watch' || highDep) {
    const tag: InsightTag = m.status === 'risk' ? 'RISK' : 'WATCH'
    const text = highDep
      ? `Tuition dependency remains high at ${v} — consider diversifying revenue.`
      : tag === 'RISK'
        ? `${m.label} is a risk at ${v}.`
        : `${m.label} needs a closer look at ${v}.`
    return `[${tag}] ${text}`
  }
  if (m.status === 'good') return `[STRENGTH] ${m.label} is healthy at ${v}.`
  const delta = m.periodOverPeriodDelta
  if (m.goodDirection !== 'neutral' && delta !== null && delta !== 0) {
    const improving =
      (m.goodDirection === 'higher' && delta > 0) || (m.goodDirection === 'lower' && delta < 0)
    return `[${improving ? 'STRENGTH' : 'WATCH'}] ${m.label} ${improving ? 'improved' : 'slipped'} by ${fmtValue(Math.abs(delta), m.unit)} to ${v}.`
  }
  return null
}

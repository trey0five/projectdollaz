// ─────────────────────────────────────────────────────────────
// Phase 4D — PURE, deterministic rule-based insight generator.
//
// Given the computed metrics for a period, produce 1–3 concise plain-language
// sentences. NO Date, no random, no IO — same input twice yields the identical
// string (see __tests__/insight.test.ts). This is the ALWAYS-ON baseline; the
// API may optionally upgrade it to a richer Claude narrative, but this text is
// what ships with no key configured.
// ─────────────────────────────────────────────────────────────
import type { MetricKey, MetricResult } from './types.js'
import { METRIC_KEYS } from './registry.js'

/** Pure value formatter for prose (mirrors the UI's intent, but string-only). */
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

/** Signed magnitude of a PoP delta as prose ("4 days", "3%"). Always positive. */
function fmtDeltaMagnitude(delta: number, unit: MetricResult['unit']): string {
  return fmtValue(Math.abs(delta), unit)
}

/** Lower-cased metric label for mid-sentence use. */
function lc(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** Stable priority index (registry order) for deterministic tie-breaking. */
function priority(key: MetricKey): number {
  const i = METRIC_KEYS.indexOf(key)
  return i < 0 ? METRIC_KEYS.length : i
}

/**
 * Build the deterministic insight string.
 *
 * Sentence plan (each guarded, skipped when not applicable; never throws):
 *   1. LEAD: the worst 'risk' metric (tie-break by registry order), phrased with
 *      its value. If no risk metric, lead with a 'good' headline (operating
 *      margin preferred, else the first good metric).
 *   2. MOVEMENT: the single biggest improvement OR decline by |delta| among
 *      non-neutral-direction metrics, signed by goodDirection.
 *   3. FLAG: high tuition dependency (> 0.80), if not already the lead.
 *
 * When nothing is available, returns a stable fallback.
 */
export function generateInsight(metrics: MetricResult[]): string {
  const available = metrics.filter((m) => m.available && m.value !== null)
  if (available.length === 0) {
    return 'Not enough data to summarize this period yet.'
  }

  const sentences: string[] = []
  const usedKeys = new Set<MetricKey>()

  // ── 1. Lead with the worst risk, else a good headline ──────────────────────
  const risks = available
    .filter((m) => m.status === 'risk')
    .sort((a, b) => priority(a.key) - priority(b.key))

  if (risks.length > 0) {
    const r = risks[0]
    sentences.push(
      `${r.label} is a risk at ${fmtValue(r.value as number, r.unit)} — the top priority to address.`,
    )
    usedKeys.add(r.key)
  } else {
    const margin = available.find((m) => m.key === 'operating_margin' && m.status === 'good')
    const lead = margin ?? available.find((m) => m.status === 'good') ?? available[0]
    if (lead.status === 'good') {
      sentences.push(`${lead.label} is healthy at ${fmtValue(lead.value as number, lead.unit)}.`)
    } else {
      sentences.push(`${lead.label} stands at ${fmtValue(lead.value as number, lead.unit)}.`)
    }
    usedKeys.add(lead.key)
  }

  // ── 2. Biggest movement (improvement or decline), directional ──────────────
  const movers = available
    .filter(
      (m) =>
        m.goodDirection !== 'neutral' &&
        m.periodOverPeriodDelta !== null &&
        m.periodOverPeriodDelta !== 0 &&
        !usedKeys.has(m.key),
    )
    .sort((a, b) => {
      const am = Math.abs(a.periodOverPeriodDelta as number)
      const bm = Math.abs(b.periodOverPeriodDelta as number)
      if (bm !== am) return bm - am
      return priority(a.key) - priority(b.key)
    })

  if (movers.length > 0) {
    const m = movers[0]
    const delta = m.periodOverPeriodDelta as number
    const improving =
      (m.goodDirection === 'higher' && delta > 0) ||
      (m.goodDirection === 'lower' && delta < 0)
    const verb = improving ? 'improved' : 'slipped'
    sentences.push(
      `${m.label} ${verb} by ${fmtDeltaMagnitude(delta, m.unit)} to ${fmtValue(m.value as number, m.unit)}.`,
    )
    usedKeys.add(m.key)
  }

  // ── 3. Flag high tuition dependency ────────────────────────────────────────
  const dep = available.find((m) => m.key === 'tuition_dependency')
  if (dep && !usedKeys.has(dep.key) && (dep.value as number) > 0.8) {
    sentences.push(
      `Tuition dependency remains high at ${fmtValue(dep.value as number, dep.unit)} — consider diversifying revenue.`,
    )
    usedKeys.add(dep.key)
  }

  return sentences.slice(0, 3).join(' ')
}

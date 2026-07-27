import type { MetricDef } from '../types.js'

/**
 * Plan readiness = planArtifactsPresent ÷ planArtifactsTotal (0, ⅓, ⅔ or 1).
 *
 * Phase 6 ('planning' domain) — an HONEST coverage metric, not a health metric:
 * the share of the period's planning ARTIFACTS in place (budget saved · FY-end
 * forecast saved · enrollment-plan source present). Both counts are API-threaded
 * onto PeriodOperational (never stored); the total is a constant 3 per
 * school-period. unit 'share' (renders as a percent).
 *
 * Available ONLY when both counts are non-null AND total > 0. `present` of 0 is
 * a legitimate value (nothing in place → 0% ready, banded risk).
 *
 * scopeAggregation 'weighted-by-components' — the honest LABEL for what the
 * recompute does mechanically: org = Σpresent ÷ Σ(3·n), an artifact-count-
 * weighted coverage across the contributing schools (never an average of
 * per-school shares). Zero engine change.
 */
export const planReadiness: MetricDef = {
  key: 'plan_readiness',
  label: 'Plan Readiness',
  boardLabel: 'Plan Readiness',
  unit: 'share',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'planning',
  scopeAggregation: 'weighted-by-components',
  inputs: [
    { key: 'planArtifactsPresent', source: 'operational', label: 'Planning artifacts in place' },
    { key: 'planArtifactsTotal', source: 'operational', label: 'Planning artifacts expected' },
  ],
  basis: "Share of the period's planning artifacts in place (budget · FY-end forecast · enrollment plan).",
  formula: 'Planning artifacts in place ÷ Planning artifacts expected',
  description: 'How much of the period’s planning toolkit — budget, FY-end forecast, enrollment plan — is actually in place.',
  compute(_cur, _prior, curOp) {
    const present = curOp?.planArtifactsPresent ?? null
    const total = curOp?.planArtifactsTotal ?? null
    const inputs = [
      { key: 'planArtifactsPresent', label: 'Planning artifacts in place', value: present, unit: 'ratio' as const },
      { key: 'planArtifactsTotal', label: 'Planning artifacts expected', value: total, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (present === null) missing.push('planArtifactsPresent')
    // Denominator must be present AND > 0 (a 0-artifact expectation is undefined).
    if (total === null || total <= 0) missing.push('planArtifactsTotal')
    if (missing.length > 0 || present === null || total === null || total <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return {
      value: present / total,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}

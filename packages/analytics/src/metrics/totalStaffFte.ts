import type { MetricDef } from '../types.js'

/**
 * Total Staff FTE = the period's totalStaffFte, surfaced as a metric.
 *
 * Phase 6 (HR & Staffing as a real module) — a plain extensive HEADCOUNT metric:
 * no math beyond reading the already-captured PeriodOperationalData field. It
 * exists so the /hr command center, the scorecard's People & Staffing section and
 * the org rollup all read staffing size through the ONE canonical metric layer
 * (never a side-channel read of the operational row).
 *
 * Available when totalStaffFte is non-null — `0` is a LEGITIMATE value per the
 * PeriodOperational null contract (a school with zero staff FTEs entered as 0 is
 * a real, if odd, reading; only ABSENT means "not entered"). No divide, so no
 * zero-denominator guard. NO band: staffing size has no universal good/bad
 * (goodDirection 'neutral').
 *
 * unit 'ratio': the FTE-input convention (plain count rendered with 2dp, exactly
 * how teachingFte/totalStaffFte render as metric INPUTS elsewhere) — NOT 'days'/
 * 'currency'/'percent'.
 *
 * scopeAggregation 'sum': the metric's VALUE is itself extensive (a raw total) —
 * the first genuine 'sum' metric (the label the ScopeAggregation docs reserved).
 * Mechanically identical to recompute: org value = def.compute on ΣtotalStaffFte
 * (sumOperational already folds the field absent-as-null).
 */
export const totalStaffFte: MetricDef = {
  key: 'total_staff_fte',
  label: 'Total Staff FTE',
  boardLabel: 'Total Staff FTE',
  unit: 'ratio',
  category: 'operational',
  goodDirection: 'neutral',
  domain: 'hr',
  scopeAggregation: 'sum',
  inputs: [{ key: 'totalStaffFte', source: 'operational', label: 'Total staff FTE' }],
  basis: 'All-staff full-time equivalents (teaching + non-teaching) as entered on the period’s operational data.',
  formula: 'Total staff FTE (as entered)',
  description: 'Total full-time-equivalent staff, across teaching and non-teaching roles.',
  compute(_cur, _prior, curOp) {
    const total = curOp?.totalStaffFte ?? null
    const inputs = [
      { key: 'totalStaffFte', label: 'Total staff FTE', value: total, unit: 'ratio' as const },
    ]
    if (total === null) {
      return { value: null, available: false, inputsMissing: ['totalStaffFte'], inputs }
    }
    return { value: total, available: true, inputsMissing: [], inputs }
  },
}

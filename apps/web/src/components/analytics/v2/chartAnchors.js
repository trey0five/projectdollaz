// ─────────────────────────────────────────────────────────────────────────────
// chartAnchors — the metricKey → chart anchor map that JOINS the Scorecard and the
// Charts view (the shared registry KEY is the join). A scorecard row whose metric
// is in this map shows a "chart →" affordance that switches to the Charts view and
// flashes the anchored card; conversely every ChartCard carries its anchorId + its
// metricKey(s), and its "view as table" twin jumps to the Scorecard and flashes the
// row (highlight=<metricKey>).
//
// Anchors point at cards in the CURRENT scope's Charts view. When a metric has no
// dedicated chart in the active scope (e.g. cost_per_pupil only charts under
// Compare), the flash effect simply switches to Charts and no-ops the ring — the
// contract's "target that scope's Charts" fallback. Ids are stable strings used as
// DOM ids on <ChartCard id=…>.
// ─────────────────────────────────────────────────────────────────────────────
export const CHART_ANCHORS = {
  revenue_mix: 'chart-revmix',
  expense_mix: 'chart-expmix',
  operating_margin: 'chart-margin',
  days_cash_on_hand: 'chart-cash',
  months_operating_reserve: 'chart-cash',
  tuition_dependency: 'chart-margin',
  enrollment_change_yoy: 'chart-enrollment',
  student_teacher_ratio: 'chart-staffing',
  pct_students_on_aid: 'chart-aidrate',
  tuition_discount_rate: 'chart-aidrate',
  cost_per_pupil: 'chart-ppc',
  net_tuition_per_student: 'chart-ppc',
}

/** The nav patch that jumps a scorecard row to its chart, or null if none exists. */
export function chartAnchorFor(metricKey) {
  const anchorId = CHART_ANCHORS[metricKey]
  return anchorId ? { view: 'charts', anchorId } : null
}

// Which anchor ids actually EXIST in each scope's ChartsView (the cards it renders).
// A cross-link must only offer "chart →" when its target lives in the current scope
// — e.g. cost_per_pupil → chart-ppc exists ONLY under Compare, so the School
// Scorecard must not show a dead link for it.
export const SCOPE_CHART_ANCHORS = {
  school: new Set(['chart-revmix', 'chart-expmix', 'chart-margin', 'chart-cash', 'chart-enrollment', 'chart-aidrate', 'chart-staffing']),
  compare: new Set(['chart-ppc', 'chart-fingerprint']),
  diocese: new Set(['chart-cash', 'chart-smalls', 'chart-race']),
}

/**
 * True when a metric has a dedicated chart in the given scope (drives the "chart →"
 * affordance). Scope omitted ⇒ any-scope existence (legacy behaviour).
 */
export function hasChart(metricKey, scope) {
  const anchorId = CHART_ANCHORS[metricKey]
  if (!anchorId) return false
  if (!scope) return true
  return SCOPE_CHART_ANCHORS[scope]?.has(anchorId) ?? false
}

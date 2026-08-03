// ─────────────────────────────────────────────────────────────────────────────
// basisLinks — SEAM A. AIC Phase H: WHERE A BASIS ROW CAME FROM, as a route.
//
// Acceptance 1 is that "every finding card renders ≥1 basis with an observed value
// and date, and every basis deep-links". The value and the date arrive from the
// server already rendered (`display`, `asOf`) and are printed verbatim. THE LINK
// IS THE ONLY THING THIS FILE ADDS, and it adds destinations only.
//
// THE HONESTY RULE, INHERITED VERBATIM FROM `ruleActions.js`: these functions
// compose ROUTES AND NOTHING ELSE. There is not a single interpolated value, no
// composed statement, no count, no date and no label in any return below. A basis
// row's own words are the server's; this file only answers "take me to where that
// number lives".
//
// TOTAL BY CONSTRUCTION. `basisHref` returns a non-empty string for EVERY entry
// shape — an unknown table, a null lineage, a null entry, an entry with no key.
// A basis chain with a dead link is worse than one with no link: it reads as an
// invitation to verify and then verifies nothing. The fallback is the Signals tab,
// where every signal the engine tried to read is already listed with its own
// reason. The spec asserts totality across all of those shapes, and asserts no
// returned href ever contains the string 'undefined'.
//
// KNOWN LIMIT, DELIBERATELY LEFT: the fallback carries a `#signal-<key>` fragment
// and no such anchor id exists in `SignalCoverageTable` today, so the fragment is
// inert and the query param does the navigating (the reader lands on the Signals
// tab, which is the right destination). The fragment is kept because it is the
// frozen contract and because it costs nothing; adding the anchor is a one-line
// change to a file this phase does not own.
// ─────────────────────────────────────────────────────────────────────────────

/** The Signals tab — every signal the engine tried to read, with its reason. */
const SIGNALS_TAB = '/accreditation?center=signals'

/**
 * metricKey → route, checked BEFORE the table map.
 *
 * `PeriodOperationalData` alone backs five different signals owned by three
 * different modules, so routing that table to one page would send a reader
 * looking for a staffing ratio to the finance screen. Where the metric names its
 * own home, the metric wins.
 */
const METRIC_ROUTES = Object.freeze({
  student_teacher_ratio: '/hr',
  teaching_staff_share: '/hr',
  total_staff_fte: '/hr',
  enrollment_vs_plan: '/enrollment',
  plan_readiness: '/budget',
})

/**
 * lineage.table → route. Keys are the EXACT `source.table` strings the signal
 * catalog publishes (`apps/api/src/twin/twin-signal-catalog.ts`), so a catalog
 * rename shows up here as a fallback rather than as a wrong page.
 *
 * Three catalog tables are deliberately ABSENT — `ProfessionalDevelopment`,
 * `Clearance` and `LMS`. They are the named holes: nothing in the product holds
 * them yet, so there is no page to send a reader to, and the Signals-tab fallback
 * (which explains exactly what would unlock each) is the honest destination.
 */
const TABLE_ROUTES = Object.freeze({
  StatementSnapshot: '/finance',
  PeriodOperationalData: '/finance',
  PeriodBudget: '/budget',
  ArApAgingSnapshot: '/cash',
  Meeting: '/governance?tab=records&register=meetings',
  Policy: '/governance?tab=records&register=policies',
  GovernancePerson: '/governance?tab=records&register=people',
  Committee: '/governance?tab=records&register=committees',
  StrategicPlan: '/strategy',
  MaintenanceItem: '/facilities',
  EnrollmentSnapshot: '/enrollment',
  'StudentsService.aggregate': '/enrollment',
  StaffEvaluation: '/hr',
  AccreditationCatalogRequirement: '/accreditation?center=evidence',
  AccreditationReadinessSnapshot: '/accreditation?center=domains',
  AccreditationStandard: '/accreditation?center=standards',
  PriorVisitFinding: '/accreditation?center=evidence',
})

/**
 * The route a basis row's number came from. NEVER null, NEVER empty, NEVER a
 * string containing 'undefined'.
 *
 * @param {{key?:string, lineage?:{table?:string, field?:string, metricKey?:string}|null}|null} entry
 * @returns {string} an in-app path
 */
export function basisHref(entry) {
  const lineage = entry?.lineage ?? null

  const metricKey = typeof lineage?.metricKey === 'string' ? lineage.metricKey : null
  if (metricKey && METRIC_ROUTES[metricKey]) return METRIC_ROUTES[metricKey]

  const table = typeof lineage?.table === 'string' ? lineage.table : null
  if (table && TABLE_ROUTES[table]) return TABLE_ROUTES[table]

  // Unknown table, missing lineage, or a hole with no home yet — the Signals tab.
  const key = typeof entry?.key === 'string' && entry.key.length > 0 ? entry.key : null
  return key ? `${SIGNALS_TAB}#signal-${key}` : SIGNALS_TAB
}

/**
 * True when the basis row names the page it came from, false when the link is the
 * generic Signals fallback. The card uses it to word the affordance honestly —
 * "Open the register" versus "Where we looked" — and NOTHING ELSE reads it.
 */
export function basisIsRouted(entry) {
  const lineage = entry?.lineage ?? null
  const metricKey = typeof lineage?.metricKey === 'string' ? lineage.metricKey : null
  if (metricKey && METRIC_ROUTES[metricKey]) return true
  const table = typeof lineage?.table === 'string' ? lineage.table : null
  return !!(table && TABLE_ROUTES[table])
}

export default basisHref

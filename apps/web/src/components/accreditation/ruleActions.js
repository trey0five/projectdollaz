// ─────────────────────────────────────────────────────────────────────────────
// ruleActions — Phase E: the ONE-CLICK NEXT STEP for every early-warning rule,
// composed CLIENT-SIDE.
//
// WHY THIS FILE EXISTS AT ALL. The shared server `AttentionItem` contract is NOT
// touched by this phase. `DomainCommandCenter`'s `attentionItems` prop is a WEB
// shape — `{id, tone, title, why, meta, actions:[{label,onClick,primary}]}` — and
// every domain page in this app already composes it locally from its own payload.
// Phase E does exactly the same, from two server fields and nothing else:
// the finding's `ruleId` and its `scopeKey`. No new server field, no `link`
// column, no route table shipped down the wire.
//
// THE HONESTY RULE THIS FILE OBEYS. These functions compose BUTTON LABELS AND
// DESTINATIONS ONLY. They never compose a rationale, a consequence, a count, a
// date or any other statement about the school — every one of those arrives from
// the server already rendered and is printed verbatim. Read every entry below:
// there is not a single interpolated value in any label.
//
// A rule with no entry here is not a bug and must not crash the rail — it falls
// back to DEFAULT_ACTIONS, which opens the Signals tab where its blocking signal
// and its unlock are already explained.
//
// The four VISIBLE-BUT-CANNOT-EVALUATE rules (HR-PD-LOW, SAFE-ENV-GAP,
// CURR-DOC-AGING, ACAD-GROWTH-FLAT) deliberately have NO entry: they never
// produce a finding, so they never reach the rail. They are answered on the
// Signals tab by NamedHolesPanel, with the intake that would unlock each.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The standard id behind a standard-scoped finding, or null.
 * `scopeKey` is 'school' | 'standard:<id>' | 'evidence:<tag>'; ids may themselves
 * contain a colon, so everything after the FIRST separator is the id.
 */
export function findingStandardId(finding) {
  const key = finding?.scopeKey
  if (typeof key !== 'string' || !key.startsWith('standard:')) return null
  const id = key.slice('standard:'.length)
  return id.length > 0 ? id : null
}

/** The evidence tag behind an evidence-scoped finding, or null. */
export function findingEvidenceTag(finding) {
  const key = finding?.scopeKey
  if (typeof key !== 'string' || !key.startsWith('evidence:')) return null
  const tag = key.slice('evidence:'.length)
  return tag.length > 0 ? tag : null
}

// `api` is the read-only façade the page hands in:
//   { goTab(tabKey), navigate(path), scrollToStandard(standardId) }
// Nothing here calls a mutator — the acknowledge control is composed by the page,
// which is the only place that knows whether the ledger row exists yet.

const attachEvidence = (f, api) => [
  {
    label: 'Attach evidence',
    primary: true,
    onClick: () => {
      const id = findingStandardId(f)
      // OPEN THE STANDARD, don't just travel to it. `scrollToStandard` expanded a
      // row and left the reader looking for a chevron — an action that names a
      // task and then delivers you near it is the shape this whole change is
      // correcting. `improveStandard` opens the panel that hosts the attach
      // controls; scrolling stays as the fallback for a host that has no panel.
      if (id && api.improveStandard) api.improveStandard(id)
      else if (id) api.scrollToStandard(id)
      else api.goTab('standards')
    },
  },
]

const openEvidenceIndex = (f, api) => [
  { label: 'Open evidence index', primary: true, onClick: () => api.goTab('evidence') },
]

const uploadIt = (f, api) => [
  { label: 'Upload it', primary: true, onClick: () => api.navigate('/knowledge?upload=1') },
]

const openMeetings = (f, api) => [
  { label: 'Open meetings', primary: true, onClick: () => api.navigate('/governance?tab=records&register=meetings') },
]

const openPlan = (f, api) => [
  { label: 'Open the plan', primary: true, onClick: () => api.navigate('/strategy') },
]

const openEnrollment = (f, api) => [
  { label: 'Open enrollment', primary: true, onClick: () => api.navigate('/enrollment') },
]

/** ruleId → the one-click next step. Frozen; every firing rule has an entry. */
export const RULE_ACTIONS = Object.freeze({
  // ── Governance ────────────────────────────────────────────────────────────
  'GOV-MINUTES-LAG': openMeetings,
  'GOV-MINUTES-NEVER-RECORDED': openMeetings,
  'GOV-CADENCE-GAP': openMeetings,
  'GOV-POLICY-OVERDUE': (f, api) => [
    { label: 'Open policies', primary: true, onClick: () => api.navigate('/governance?tab=records&register=policies') },
  ],
  'GOV-TERM-EXPIRY': (f, api) => [
    { label: 'Open the board roster', primary: true, onClick: () => api.navigate('/governance?tab=records&register=people') },
  ],
  'GOV-COMMITTEE-NO-CHAIR': (f, api) => [
    { label: 'Open committees', primary: true, onClick: () => api.navigate('/governance?tab=records&register=committees') },
  ],

  // ── Finance ───────────────────────────────────────────────────────────────
  'FIN-AUDIT-STALE': (f, api) => [
    { label: 'Upload the audit', primary: true, onClick: () => api.navigate('/knowledge?upload=1') },
    { label: 'Open evidence index', onClick: () => api.goTab('evidence') },
  ],
  'FIN-RESERVE-THIN': (f, api) => [
    { label: 'Open finance', primary: true, onClick: () => api.navigate('/finance') },
  ],
  'FIN-BUDGET-DETERIORATING': (f, api) => [
    { label: 'Open the budget', primary: true, onClick: () => api.navigate('/budget') },
  ],
  'FIN-AR-AGING-WORSENING': (f, api) => [
    { label: 'Open cash & collections', primary: true, onClick: () => api.navigate('/cash') },
  ],

  // ── Strategy ──────────────────────────────────────────────────────────────
  'STRAT-PLAN-EXPIRING': openPlan,
  'STRAT-PLAN-EXPIRED': openPlan,

  // ── Enrollment ────────────────────────────────────────────────────────────
  'ENR-DECLINE': openEnrollment,
  'ENR-FEEDER-EROSION': openEnrollment,

  // ── Accreditation state ───────────────────────────────────────────────────
  'ACC-UNSCORED': (f, api) => [
    { label: 'Score standards', primary: true, onClick: () => api.goTab('standards') },
  ],
  'ACC-UNSUPPORTED-SCORE': attachEvidence,
  'ACC-ASSURANCE-GAP': attachEvidence,

  // ── Evidence currency ─────────────────────────────────────────────────────
  'EVI-STALE': openEvidenceIndex,
  'EVI-MISSING-REQUIRED': uploadIt,

  // ── Facilities & HR ───────────────────────────────────────────────────────
  'FAC-BACKLOG': (f, api) => [
    { label: 'Open facilities', primary: true, onClick: () => api.navigate('/facilities') },
  ],
  'HR-RATIO-DRIFT': (f, api) => [
    { label: 'Open HR', primary: true, onClick: () => api.navigate('/hr') },
  ],

  // ── Meta ──────────────────────────────────────────────────────────────────
  'SCHOOL-NOT-REPORTING': (f, api) => [
    { label: 'Add school data', primary: true, onClick: () => api.navigate('/finance?tab=add') },
  ],
})

/** The fallback for a ruleId this build does not know — never a crash, never nothing. */
export const DEFAULT_ACTIONS = (f, api) => [
  { label: 'Open', onClick: () => api.goTab('signals') },
]

/** Resolve the actions for one finding. Always returns at least one action. */
export function actionsForFinding(finding, api) {
  const build = RULE_ACTIONS[finding?.ruleId] ?? DEFAULT_ACTIONS
  const actions = build(finding, api)
  return Array.isArray(actions) && actions.length > 0 ? actions : DEFAULT_ACTIONS(finding, api)
}

/**
 * severity → the tone vocabulary NeedsAttentionPanel already renders.
 * 'info' maps to 'neutral' rather than a colour of its own: an informational
 * finding is context, and dressing it in a warning colour is how a rail teaches
 * a reader to ignore its own colours.
 */
export const SEVERITY_TONE = Object.freeze({
  critical: 'risk',
  warn: 'watch',
  info: 'neutral',
})

/** Sort weight: critical leads, then warn, then info. */
export const SEVERITY_RANK = Object.freeze({ critical: 0, warn: 1, info: 2 })

/** Disabled-ack tooltip for a finding whose ledger row is not written yet. */
export const NOT_YET_RECORDED_TOOLTIP = 'This will be recorded tonight.'

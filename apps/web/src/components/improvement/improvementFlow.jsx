// ─────────────────────────────────────────────────────────────────────────────
// improvementFlow — the FlowDef behind "Work this gap" and "+ New initiative"
// on /improvement (AIC Phase G).
//
// NO SHARED WIZARD FILE IS EDITED. RecordFlow has no prefill/seed prop and five
// modules share it, so seeding happens the only safe way: this module BUILDS a
// FlowDef whose `defaults` already carry the clicked recommendation, and the page
// memoises it. RecordFlow.jsx / AddDataWizard.jsx / flowRuntime.js / flowSchema.js
// / recordFlows.jsx have a zero-line diff.
//
// TWO DESTINATIONS, ONE FLOW:
//   • seeded from a recommendation (`templateId` non-empty) → POST /improvement/adopt,
//     which is IDEMPOTENT on (schoolId, findingKey): adopting the same gap twice
//     returns the SAME initiative instead of minting a second plan for one hole.
//   • hand-typed (`templateId` empty)                        → POST /improvement/initiatives.
//
// The two endpoints take DIFFERENT whitelists, and the API runs a global
// forbidNonWhitelisted ValidationPipe — one stray key is a 400, not a warning. So
// the whitelists are declared here as data (ADOPT_KEYS / CREATE_KEYS), each body
// is built key-by-key (never a spread), and a spec asserts every emitted body's
// keys are a subset of the endpoint's list. Fields that only the CREATE body can
// carry are hidden on the adopt path (`showIf`), because a control that collects a
// value the request will never send is exactly the fake control this program keeps
// refusing to ship.
// ─────────────────────────────────────────────────────────────────────────────
import { TrendingUp } from 'lucide-react'
import { improvementApi, schoolsApi } from '../../lib/api.js'
import { METRIC_OPTIONS, isPercentMetric } from '../../hooks/useStrategy.js'
import { OWNER_ROLE_LABELS } from './improvementMeta.js'
import { memberLabel } from '../../lib/memberLabels.js'

// ── Enum mirrors. The DTO is the authority; each is a documented hard-copy. ───
// apps/api/src/strategy/strategy.constants.ts (INITIATIVE_STATUSES) — shared by
// CreateInitiativeDto and CreateImprovementInitiativeDto.
const INITIATIVE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]
// CreateImprovementInitiativeDto.progressSource @IsIn — NOTE there is no 'none'
// member: a row with no source stores NULL, which reads "Status only".
const PROGRESS_SOURCES = [
  { value: '', label: 'Status only — no computed progress' },
  { value: 'metric', label: 'A KPI we already track' },
  { value: 'milestone', label: 'Milestones I list' },
  { value: 'task_rollup', label: 'Tasks linked to this initiative' },
  { value: 'manual', label: 'A percentage I set by hand' },
]
// CreateImprovementInitiativeDto.riskLevel @IsIn(['low','medium','high'])
const RISK_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/** AdoptRecommendationDto — the EXACT whitelist. */
export const ADOPT_KEYS = [
  'templateId',
  'originType',
  'originRef',
  'findingKey',
  'title',
  'ownerUserId',
  'dueDate',
  'targetRubricScore',
  'metricKey',
  'progressSource',
  'targetValue',
]

/** UpdateImprovementInitiativeDto — the EXACT whitelist (the drawer's PATCH). */
export const PATCH_KEYS = [
  'title',
  'description',
  'status',
  'ownerUserId',
  'orderIndex',
  'goalId',
  'originType',
  'originRef',
  'findingKey',
  'startDate',
  'dueDate',
  'progressSource',
  'milestones',
  'manualProgressPct',
  'metricKey',
  'targetValue',
  'targetRubricScore',
  'riskLevel',
  'riskNote',
]

/** CreateImprovementInitiativeDto — the EXACT whitelist. */
export const CREATE_KEYS = [
  'title',
  'description',
  'status',
  'ownerUserId',
  'orderIndex',
  'goalId',
  'originType',
  'originRef',
  'findingKey',
  'startDate',
  'dueDate',
  'progressSource',
  'milestones',
  'manualProgressPct',
  'metricKey',
  'targetValue',
  'targetRubricScore',
  'riskLevel',
  'riskNote',
]

/**
 * Every value the flow tracks. `templateId`, `originType`, `originRef`,
 * `findingKey` and `suggestedOwnerRole` are CARRIED, not rendered — they come
 * from the recommendation and are never typed.
 */
export const BASE_DEFAULTS = {
  templateId: '',
  originType: 'manual',
  originRef: '',
  findingKey: '',
  suggestedOwnerRole: '',
  title: '',
  ownerUserId: '',
  dueDate: '',
  targetRubricScore: '',
  metricKey: '',
  targetValue: '',
  progressSource: '',
  milestoneLines: '',
  manualProgressPct: '',
  description: '',
  status: 'planned',
  startDate: '',
  riskLevel: '',
  riskNote: '',
}

/** True when the draft is an ADOPTION of a server-composed recommendation. */
export const isAdoption = (v) => !!String(v?.templateId ?? '').trim()

const trimOrNull = (s) => {
  const t = String(s ?? '').trim()
  return t === '' ? null : t
}

/** 'Fire drill log\nBoard sign-off' → [{label:'Fire drill log'},{label:'Board sign-off'}] */
export function milestonesFromLines(text) {
  return String(text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ label }))
}

// ── The two body builders. Key-by-key, never a spread. ───────────────────────

/** POST /improvement/adopt — AdoptRecommendationDto only. */
export function adoptBody(v) {
  const body = {
    templateId: v.templateId,
    originType: v.originType,
    originRef: v.originRef,
    title: String(v.title ?? '').trim(),
  }
  if (trimOrNull(v.findingKey)) body.findingKey = v.findingKey
  if (trimOrNull(v.ownerUserId)) body.ownerUserId = v.ownerUserId
  if (trimOrNull(v.dueDate)) body.dueDate = v.dueDate
  // A KPI PICKED IS A KPI BOUND. The picker used to send `metricKey` to an
  // endpoint that could not store a progress source, so the adopted row showed
  // the chosen KPI and the sentence "Bind it to a KPI" in the same panel, and
  // nothing ever measured itself. Choosing one now names the source with it.
  if (trimOrNull(v.metricKey)) {
    body.metricKey = v.metricKey
    body.progressSource = 'metric'
    const raw = String(v.targetValue ?? '').trim()
    if (raw !== '' && Number.isFinite(Number(raw))) {
      // Percent metrics are entered in their display unit (8.5 = 8.5%) and stored
      // as the 0..1 fraction — the SAME rule createBody applies.
      body.targetValue = isPercentMetric(v.metricKey) ? Number(raw) / 100 : Number(raw)
    }
  }
  const score = String(v.targetRubricScore ?? '').trim()
  if (score !== '' && Number.isFinite(Number(score))) body.targetRubricScore = Number(score)
  return body
}

/**
 * PATCH /improvement/initiatives/:id — the drawer's measurement editor.
 *
 * WHY THIS EXISTS. Until it did, an initiative could be created and deleted and
 * nothing else: an adopted recommendation was permanently "Status only", a
 * milestone list could never be ticked, and `recordProgress` had no call site at
 * all — so the projection engine and its seven refusal sentences were
 * unreachable in-product. The endpoint and the hook were both already built; the
 * control was the missing half.
 *
 * Key-by-key against PATCH_KEYS, never a spread — same rule as the two bodies
 * above, same global forbidNonWhitelisted pipe.
 */
export function measurementPatch(draft, values = {}) {
  const source = trimOrNull(draft?.progressSource)
  const body = { progressSource: source }
  if (source === 'metric') {
    body.metricKey = trimOrNull(draft.metricKey)
    const raw = String(draft.targetValue ?? '').trim()
    body.targetValue =
      raw !== '' && Number.isFinite(Number(raw))
        ? isPercentMetric(draft.metricKey)
          ? Number(raw) / 100
          : Number(raw)
        : null
  } else if (source === 'milestone') {
    // Existing `done` flags are PRESERVED by label — retyping the list must not
    // silently un-complete work somebody already finished.
    const doneByLabel = new Map(
      (values.milestones ?? []).map((m) => [String(m?.label ?? ''), m?.done === true]),
    )
    body.milestones = milestonesFromLines(draft.milestoneLines).map((m) => ({
      label: m.label,
      done: doneByLabel.get(m.label) === true,
    }))
  } else if (source === 'manual') {
    const raw = String(draft.manualProgressPct ?? '').trim()
    body.manualProgressPct =
      raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) / 100 : null
  }
  return body
}

/** Flip ONE milestone's `done`, returning the whole list the PATCH expects. */
export function milestonesWithToggle(milestones, index) {
  return (milestones ?? []).map((m, i) => ({
    id: m?.id,
    label: m?.label,
    done: i === index ? !(m?.done === true) : m?.done === true,
  }))
}

/** POST /improvement/initiatives — CreateImprovementInitiativeDto only. */
export function createBody(v) {
  const source = trimOrNull(v.progressSource)
  const body = {
    title: String(v.title ?? '').trim(),
    description: trimOrNull(v.description),
    status: v.status || 'planned',
    ownerUserId: trimOrNull(v.ownerUserId),
    originType: v.originType || 'manual',
    originRef: trimOrNull(v.originRef),
    findingKey: trimOrNull(v.findingKey),
    startDate: trimOrNull(v.startDate),
    dueDate: trimOrNull(v.dueDate),
    riskLevel: trimOrNull(v.riskLevel),
    riskNote: trimOrNull(v.riskNote),
  }

  const score = String(v.targetRubricScore ?? '').trim()
  if (score !== '' && Number.isFinite(Number(score))) body.targetRubricScore = Number(score)

  // progressSource NULL is the back-compat contract ("status only"), so an
  // unanswered picker sends null rather than inventing a measurement mode.
  body.progressSource = source
  if (source === 'metric') {
    body.metricKey = trimOrNull(v.metricKey)
    const raw = String(v.targetValue ?? '').trim()
    if (raw !== '' && Number.isFinite(Number(raw))) {
      // Percent metrics are entered in their natural display unit (8.5 = 8.5%)
      // and stored as the 0..1 fraction the API expects — the same rule the
      // strategy goal form applies.
      body.targetValue = isPercentMetric(v.metricKey) ? Number(raw) / 100 : Number(raw)
    }
  } else if (source === 'milestone') {
    body.milestones = milestonesFromLines(v.milestoneLines)
  } else if (source === 'manual') {
    const raw = String(v.manualProgressPct ?? '').trim()
    if (raw !== '' && Number.isFinite(Number(raw))) body.manualProgressPct = Number(raw) / 100
  }
  return body
}

// ── The steps. `showIf` hides every CREATE-only control on the adopt path. ────
const handTyped = (v) => !isAdoption(v)

const stepWork = (defaults) => ({
  key: 'work',
  label: 'The work',
  title: 'What are we going to do?',
  blurb: 'A title, someone accountable, and the date it is due.',
  fields: [
    {
      key: 'title',
      label: 'What is the initiative called?',
      type: 'text',
      required: true,
      requiredMsg: 'Give the work a name',
      maxLength: 200,
      span: 2,
      placeholder: 'e.g. Raise COG-2.3 from Emerging to Impacting',
    },
    {
      key: 'ownerUserId',
      label: 'Owner',
      type: 'select',
      lookupKey: 'members',
      emptyOptionLabel: 'Unassigned',
      span: 2,
      options: (data) =>
        (data?.members ?? []).map((m) => ({
          value: m.id,
          label: memberLabel(m),
        })),
      // The engine SUGGESTS a role. It becomes a PERSON only when the roster
      // carries a position that matches it (matchOwnerId) — otherwise the
      // suggestion stays a hint beside an Unassigned picker, because assigning
      // the wrong colleague to accreditation work is worse than assigning nobody.
      hint: defaults.suggestedOwnerRole
        ? `Suggested: ${OWNER_ROLE_LABELS[defaults.suggestedOwnerRole] ?? defaults.suggestedOwnerRole}`
        : undefined,
    },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    {
      key: 'startDate',
      label: 'Start date',
      type: 'date',
      showIf: handTyped,
    },
  ],
})

const STEP_MEASURE = {
  key: 'measure',
  label: 'Measure',
  title: 'How will we know it worked?',
  optional: true,
  blurb:
    'Everything here is optional. Leave it all blank and the initiative reports its status only — nothing will be estimated for you.',
  fields: [
    {
      key: 'targetRubricScore',
      label: 'Target rubric score',
      type: 'number',
      integer: true,
      min: 1,
      max: 4,
      hint: '1–4 on your framework’s rubric. Used for the “if delivered” projection.',
    },
    {
      key: 'progressSource',
      label: 'Where does progress come from?',
      type: 'select',
      span: 2,
      showIf: handTyped,
      options: PROGRESS_SOURCES,
    },
    {
      key: 'metricKey',
      label: 'KPI',
      type: 'select',
      span: 2,
      emptyOptionLabel: 'No KPI',
      options: METRIC_OPTIONS.map((m) => ({ value: m.key, label: m.label })),
      showIf: (v) => isAdoption(v) || v.progressSource === 'metric',
    },
    {
      key: 'targetValue',
      label: 'Target value',
      type: 'number',
      // Shown wherever a KPI can actually be bound — which now includes the adopt
      // path. A target is what turns a bound KPI into a measurable percentage;
      // without one the initiative reads "Not measured yet", honestly but idly.
      showIf: (v) =>
        v.progressSource === 'metric' || (isAdoption(v) && !!String(v.metricKey ?? '').trim()),
      hint: 'In the KPI’s own unit — a percentage is entered as 8.5, not 0.085.',
    },
    {
      key: 'milestoneLines',
      label: 'Milestones — one per line',
      type: 'textarea',
      rows: 4,
      span: 2,
      maxLength: 4000,
      showIf: (v) => handTyped(v) && v.progressSource === 'milestone',
      placeholder: 'Draft the policy\nBoard review\nAdopt and publish',
    },
    {
      key: 'manualProgressPct',
      label: 'Progress so far (%)',
      type: 'number',
      min: 0,
      max: 100,
      showIf: (v) => handTyped(v) && v.progressSource === 'manual',
      hint: 'A hand-set percentage never projects a completion date and never feeds an org score.',
    },
  ],
}

const STEP_DETAILS = {
  key: 'details',
  label: 'Details',
  title: 'Anything else worth recording?',
  optional: true,
  blurb: 'All optional.',
  fields: [
    { key: 'status', label: 'Status', type: 'select', options: INITIATIVE_STATUSES },
    {
      key: 'riskLevel',
      label: 'Risk (your call)',
      type: 'select',
      emptyOptionLabel: 'Not set',
      options: RISK_LEVELS,
      hint: 'Yours to set. The computed risk signal is shown beside it, never merged into it.',
    },
    {
      key: 'description',
      label: 'Description',
      type: 'textarea',
      rows: 3,
      span: 2,
      maxLength: 2000,
      fold: true,
    },
    {
      key: 'riskNote',
      label: 'Risk note',
      type: 'textarea',
      rows: 2,
      span: 2,
      maxLength: 2000,
      fold: true,
    },
  ],
}

/**
 * Build the FlowDef for one draft.
 *
 * @param {Object} seed  the `seedFromRecommendation` overlay ({} for a blank one)
 * @returns {Object} a FlowDef whose `defaults` already carry the seed
 */
export function buildImprovementFlow(seed = {}) {
  const defaults = { ...BASE_DEFAULTS, ...seed }
  const adoption = isAdoption(defaults)
  return {
    key: adoption ? 'improvement.adopt' : 'improvement.initiative',
    noun: 'initiative',
    nounPlural: 'initiatives',
    Icon: TrendingUp,
    loaders: {
      members: (ctx) =>
        schoolsApi
          .members(ctx.schoolId)
          .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.members ?? []))),
    },
    defaults,
    // The DETAILS step collects description/status/risk — none of which the adopt
    // endpoint accepts — so on the adopt path it is not shown at all rather than
    // shown and silently dropped.
    steps: adoption
      ? [stepWork(defaults), STEP_MEASURE]
      : [stepWork(defaults), STEP_MEASURE, STEP_DETAILS],
    toBody: (v) => (isAdoption(v) ? adoptBody(v) : createBody(v)),
    submit: (ctx, body, values) =>
      isAdoption(values)
        ? improvementApi.adopt(ctx.schoolId, body)
        : improvementApi.createInitiative(ctx.schoolId, body),
    itemLabel: (v) => String(v.title ?? '').trim(),
    itemSub: (v) =>
      isAdoption(v)
        ? `adopting ${v.originRef || 'a recommendation'}`
        : v.progressSource
          ? `initiative · ${v.progressSource.replace(/_/g, ' ')}`
          : 'initiative · status only',
    reviewPairs: (v) => {
      const dash = (x) => (x && String(x).trim() ? String(x).trim() : '—')
      const rows = [
        ['Title', dash(v.title)],
        ['Due', dash(v.dueDate)],
        ['Target rubric score', dash(v.targetRubricScore)],
        ['KPI', dash(v.metricKey)],
      ]
      if (isAdoption(v)) {
        rows.push(['Adopting', dash(v.originRef)])
        if (v.suggestedOwnerRole) {
          rows.push(['Suggested owner', OWNER_ROLE_LABELS[v.suggestedOwnerRole] ?? v.suggestedOwnerRole])
        }
      } else {
        rows.push(['Progress from', v.progressSource ? v.progressSource.replace(/_/g, ' ') : 'Status only'])
        rows.push(['Status', dash(v.status)])
        rows.push(['Risk (your call)', v.riskLevel ? v.riskLevel : 'Not set'])
      }
      return rows
    },
  }
}

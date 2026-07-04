// ─────────────────────────────────────────────────────────────────────────────
// demoScenarios.js — the scripted Penny hero demo as DATA. Three looping
// scenarios, each a sorted beat timeline `{ at, patch?, type?, advance? }`:
//   patch   → shallow-merged into the demo state at `at` ms
//   type    → start a bounded typewriter into `field` at `ms` per char
//             (cancelled early if a later patch writes the same field)
//   advance → fade this scenario out and start the next one
// usePennyDemoScript.js interprets the timeline; PennyDemo.jsx renders the
// state through the REAL pure chat components with fabricated props.
// ─────────────────────────────────────────────────────────────────────────────

export const INITIAL_DEMO_STATE = {
  glance: 0,
  blink: false,
  celebrate: false,
  speaking: false,
  showUser: false,
  userText: '',
  userAttachments: [],
  showTyping: false,
  assistantVisible: false,
  assistantText: '',
  assistantStreaming: false,
  proposal: null,
  clickPulse: false,
}

// ── Scenario 1 — Trial balance → statements (~14.5s) ─────────────────────────
const S1_USER = 'Turn my June trial balance into a full set of statements.'
const S1_ASSISTANT =
  'On it. I parsed 412 rows from June-TB.xlsx — debits and credits balance. Here’s the import:'
const S1_ACTION = {
  kind: 'import_trial_balance',
  summary: 'Import the June 2026 trial balance (412 rows) and generate all four statements.',
}
const S1_APPLIED = {
  applied: true,
  tool: 'import_trial_balance',
  summary: 'June 2026 imported and statements generated.',
  details: [
    { label: 'Rows parsed', value: '412' },
    { label: 'Period', value: 'June 2026' },
    { label: 'Statements', value: '4 generated' },
  ],
}

const SCENARIO_1 = {
  id: 'trial-balance',
  beats: [
    {
      at: 0,
      patch: { showUser: true, userAttachments: [{ name: 'June-TB.xlsx', kind: 'xlsx' }] },
      type: { field: 'userText', text: S1_USER, ms: 28 },
    },
    { at: 1650, patch: { userText: S1_USER, glance: 1 } },
    { at: 1950, patch: { showTyping: true } },
    {
      at: 3400,
      patch: { showTyping: false, assistantVisible: true, speaking: true, assistantStreaming: true },
      type: { field: 'assistantText', text: S1_ASSISTANT, ms: 24 },
    },
    {
      at: 5800,
      patch: {
        assistantText: S1_ASSISTANT,
        assistantStreaming: false,
        speaking: false,
        proposal: { status: 'pending', action: S1_ACTION },
      },
    },
    { at: 7400, patch: { clickPulse: true, proposal: { status: 'applying', action: S1_ACTION } } },
    { at: 7900, patch: { clickPulse: false } },
    { at: 8300, patch: { proposal: S1_APPLIED, celebrate: true, blink: true } },
    { at: 8430, patch: { blink: false } },
    { at: 8700, patch: { blink: true } },
    { at: 8830, patch: { blink: false } },
    { at: 11300, patch: { celebrate: false, glance: 0 } },
    { at: 12800, advance: true },
  ],
}

// ── Scenario 2 — Drop-anything auto-file (~14s) ──────────────────────────────
const S2_USER = 'Filing this — the signed HVAC service agreement from Comfort Systems.'
const S2_ASSISTANT =
  'Got it. This reads as a vendor service contract — here’s where I’d file it:'
const S2_ACTION = {
  kind: 'file_document',
  summary: 'File HVAC-Service-Agreement.pdf and create the maintenance record.',
  payload: {
    destination: 'facilities',
    confidence: 92,
    rationale:
      'Vendor agreement with a recurring maintenance schedule — Facilities record plus a searchable Knowledge copy.',
  },
}
const S2_APPLIED = {
  applied: true,
  tool: 'file_document',
  summary: 'Filed to Facilities; copy searchable in Knowledge.',
  details: [
    { label: 'Destination', value: 'Facilities' },
    { label: 'Confidence', value: '92%' },
    { label: 'Task created', value: 'Annual HVAC service — recurring' },
  ],
}

const SCENARIO_2 = {
  id: 'auto-file',
  beats: [
    {
      at: 0,
      patch: {
        showUser: true,
        userAttachments: [{ name: 'HVAC-Service-Agreement.pdf', kind: 'pdf' }],
      },
      type: { field: 'userText', text: S2_USER, ms: 25 },
    },
    { at: 1800, patch: { userText: S2_USER, glance: 1, showTyping: true } },
    {
      at: 3200,
      patch: { showTyping: false, assistantVisible: true, speaking: true, assistantStreaming: true },
      type: { field: 'assistantText', text: S2_ASSISTANT, ms: 24 },
    },
    {
      at: 5200,
      patch: {
        assistantText: S2_ASSISTANT,
        assistantStreaming: false,
        speaking: false,
        proposal: { status: 'pending', action: S2_ACTION },
      },
    },
    // HOLD 2400ms on the pending frame — the real detected-destination chips.
    { at: 7600, patch: { clickPulse: true, proposal: { status: 'applying', action: S2_ACTION } } },
    { at: 8050, patch: { clickPulse: false } },
    { at: 8500, patch: { proposal: S2_APPLIED, celebrate: true } },
    { at: 11000, patch: { celebrate: false, glance: 0 } },
    { at: 14000, advance: true },
  ],
}

// ── Scenario 3 — Diocese question (~12s) ─────────────────────────────────────
const S3_USER = 'Which of our schools are behind on their June close?'
const S3_ASSISTANT =
  'Two of your five schools aren’t closed yet:\n\n- **St. Anne’s** — trial balance in, statements not generated\n- **Holy Cross** — no June trial balance yet\n\nWant me to nudge both business offices and draft the diocese rollup for the three that are done?'

const SCENARIO_3 = {
  id: 'diocese',
  beats: [
    { at: 0, patch: { showUser: true }, type: { field: 'userText', text: S3_USER, ms: 28 } },
    { at: 1600, patch: { userText: S3_USER, showTyping: true } },
    {
      at: 3000,
      patch: { showTyping: false, assistantVisible: true, speaking: true, assistantStreaming: true },
      type: { field: 'assistantText', text: S3_ASSISTANT, ms: 16 },
    },
    {
      at: 7200,
      patch: {
        assistantText: S3_ASSISTANT,
        assistantStreaming: false,
        speaking: false,
        blink: true,
        glance: 0,
      },
    },
    { at: 7330, patch: { blink: false } },
    { at: 10500, advance: true },
  ],
}

export const SCENARIOS = [SCENARIO_1, SCENARIO_2, SCENARIO_3]

// The reduced-motion story: Scenario 1's FINISHED frame, rendered statically
// with zero timers (the whole conversation resolved, receipt applied).
export const STATIC_FINAL_FRAME = {
  ...INITIAL_DEMO_STATE,
  showUser: true,
  userText: S1_USER,
  userAttachments: [{ name: 'June-TB.xlsx', kind: 'xlsx' }],
  assistantVisible: true,
  assistantText: S1_ASSISTANT,
  proposal: S1_APPLIED,
}

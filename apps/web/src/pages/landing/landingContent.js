// ─────────────────────────────────────────────────────────────────────────────
// landingContent.js — ALL copy for the public marketing homepage ("The Morning
// Ledger") as data. The page components render from this module so the words
// live in exactly one place. School-leader sober register; navy/gold theme.
// ─────────────────────────────────────────────────────────────────────────────

export const NAV = {
  anchors: [
    { label: 'Home', href: '#top', top: true },
    { label: 'How it works', href: '#your-day' },
    { label: 'Platform', href: '#inside' },
    { label: 'Networks', href: '#networks' },
  ],
  signIn: { label: 'Sign in', to: '/login' },
  getStarted: { label: 'Get started', to: '/register' },
}

export const HERO = {
  kicker: 'For private & independent schools',
  h1Line1: 'A hundred moving parts.',
  h1Line2: 'One Penny.',
  subhead:
    'The AI Digital COO — finances, enrollment, board reports, and every deadline, kept in motion.',
  ctaPrimary: { label: 'Get started', to: '/register' },
  ctaGhost: { label: 'Sign in', to: '/login' },
  trustLine: 'Built for heads of school, business officers, and diocese finance teams.',
  scrollHint: 'Follow the day',
  // The top-left mascot lockup the coin flies into at the end of the intro.
  brandName: 'Penny',
  brandTag: 'Your Digital COO',
  demoSrSummary:
    'Demo: Penny imports a trial balance, generates statements, files a document, and answers a multi-school question.',
}

// The six timestamped acts of the school day. `visual` names the slot rendered
// by ActVisuals / SparkChart / DomainPlates; `flip` mirrors the two columns.
export const ACTS = [
  {
    id: 'act-1',
    anchorId: 'your-day',
    time: '7:02 AM',
    bg: 'bg-cream',
    kicker: '7:02 AM — Before your first meeting',
    h2: 'You don’t check eight systems. The briefing checks them for you.',
    body: 'One prioritized daily briefing across all eight areas of the school — finance, governance, accreditation, facilities, advancement, enrollment, tasks, and knowledge. Penny watches the metrics, surfaces what changed, and tells you what needs a decision today, most urgent first.',
    visual: 'briefing',
    flip: false,
  },
  {
    id: 'act-2',
    time: '8:40 AM',
    bg: 'bg-section',
    kicker: '8:40 AM — Someone hands you a file',
    h2: 'Trial balances, contracts, minutes — drop them and they land where they belong.',
    body: 'The Data hub takes whatever your day produces: a trial balance export, a QuickBooks sync, monthly actuals, five years of history at once. Drop a document on Penny and she reads it, tells you where it should be filed — with her confidence — and waits for your yes.',
    chips: ['Trial balance import', 'QuickBooks sync', 'Bulk multi-year upload'],
    visual: 'destinations',
    flip: true,
  },
  {
    id: 'act-3',
    time: '10:15 AM',
    bg: 'bg-cream',
    kicker: '10:15 AM — A board member emails a question',
    h2: '“How’s cash versus last year?” is a sentence, not a project.',
    body: 'Penny answers in plain language with the chart to prove it — typed, or entirely hands-free by voice. Streamed answers, inline charts, and the same confirm-then-apply discipline when an answer turns into an action.',
    visual: 'spark',
    flip: false,
  },
  {
    id: 'act-4',
    anchorId: 'inside',
    time: '1:30 PM',
    bg: 'bg-section',
    kicker: '1:30 PM — The finance committee meets Thursday',
    h2: 'A full set of statements, an NBOA-style board packet, and the narrative — drafted.',
    body: 'Statements generated straight from your trial balance. Analytics and multi-year trends. Budget versus actuals. A board-ready packet with a treasurer’s narrative written for you, and an audit-readiness workspace with corrective action plans — so the auditor’s first visit isn’t a surprise. Guided workflows run the big rituals step by step: Monthly close. Board meeting prep. New fiscal year setup. Data cleanup. Catch up after time away.',
    rows: [
      'Statements & periods',
      'Analytics & trends',
      'Budget vs. actuals',
      'Audit readiness & CAP',
    ],
    visual: 'statement',
    flip: true,
  },
  // Act V (3:00 PM, dark) renders via DomainPlates.jsx — see DOMAINS below.
  {
    id: 'act-6',
    time: '5:15 PM',
    bg: 'bg-cream',
    kicker: '5:15 PM — You’re still accountable for all of it',
    h2: 'An AI that proposes, shows its work, and can undo it.',
    body: 'Every change Penny makes is confirm-then-apply: she shows you exactly what will change, you approve it, and it lands in an action log you can reverse — one-click undo, every time. Proactive alerts watch your thresholds (“tell me if days-cash drops below 30”) and standing digests arrive on your schedule.',
    visual: 'trust',
    flip: false,
  },
]

export const DOMAIN_ACT = {
  id: 'act-5',
  time: '3:00 PM',
  kicker: '3:00 PM — Everything else a school runs on',
  h2: 'Finance is a third of the job. Here’s the rest.',
}

// Lucide icon names are resolved in DomainPlates.jsx (data stays serializable).
export const DOMAINS = [
  {
    icon: 'Landmark',
    title: 'Governance',
    body: 'Policies, committees, meetings, and minutes with an approval trail.',
  },
  {
    icon: 'BadgeCheck',
    title: 'Accreditation',
    body: 'Nested standards, self-ratings, and evidence — always visit-ready.',
  },
  {
    icon: 'Wrench',
    title: 'Facilities',
    body: 'Recurring maintenance on a schedule, with cost variance watched.',
  },
  {
    icon: 'HeartHandshake',
    title: 'Advancement',
    body: 'Campaigns with gifts and pledges rolled up in real time.',
  },
  {
    icon: 'ListChecks',
    title: 'Tasks',
    body: 'Recurring work and multi-step approvals that don’t live in email.',
  },
  {
    icon: 'Library',
    title: 'Knowledge',
    body: 'Every document filed, searchable, and cited when Penny answers.',
  },
]

export const DIOCESE = {
  kicker: 'For networks & multi-school organizations',
  h2: 'Every campus, one view.',
  body: 'Consolidate finances and operations across every campus in a network, system, or diocese. Ask Penny “which schools are behind on their June close?” — and get a board-ready rollup in return.',
  cta: { label: 'Get started', to: '/register' },
  // Illustrative rollup: generic campus nodes with a live status each — the
  // center one is flagged (ties to the "behind on their June close?" copy).
  campuses: [{ status: 'ok' }, { status: 'ok' }, { status: 'behind' }, { status: 'ok' }, { status: 'ok' }],
  legend: [
    { status: 'ok', label: 'On track' },
    { status: 'behind', label: 'Needs attention' },
  ],
}

export const LICENSING = {
  kicker: 'Licensed per module',
  h3: 'Start with finance. Add the rest when you’re ready.',
  body: 'Project Dollaz is licensed per module — every school gets the core platform, the briefing, and Penny; Finance, Governance, Accreditation, Facilities, and Advancement are added as your office grows into them.',
}

export const FINALE = {
  kicker: 'Tomorrow, 7:02 AM',
  h2: 'The briefing is already waiting.',
  ctaPrimary: { label: 'Create your account', to: '/register' },
  ctaGhost: { label: 'Sign in', to: '/login' },
}

export const FOOTER = {
  copyright: '© 2026 Project Dollaz',
  links: [
    { label: 'Sign in', to: '/login' },
    { label: 'Create account', to: '/register' },
  ],
}

// Act I visual — the briefing card mock rows.
export const BRIEFING_MOCK = {
  title: 'Tuesday briefing — St. Brigid’s School',
  rows: [
    { tone: 'gold', text: 'Cash days on hand slipped below 90 — see June actuals' },
    { tone: 'amber', text: 'Accreditation Standard 4 evidence due in 12 days' },
    { tone: 'navy', text: 'Boiler service contract renews Friday — task created' },
  ],
}

// Act II visual — the detected-destination chips mock.
export const DESTINATIONS_MOCK = {
  file: 'HVAC-Service-Agreement.pdf',
  fileCaption: 'will be analyzed',
  selected: { label: 'Facilities', confidence: '92%' },
  others: ['Accreditation', 'Governance', 'Knowledge'],
}

// Act III visual — the spark chart caption.
export const SPARK_CAPTION = 'Cash on hand — up $184k vs last October'

// Act IV visual — the cropped statement paper mock.
export const STATEMENT_MOCK = {
  header: 'Statement of Financial Position · June 2026',
  rows: [
    { label: 'Cash and cash equivalents', value: '1,284,502' },
    { label: 'Accounts receivable, net', value: '312,940' },
    { label: 'Investments', value: '2,458,113' },
    { label: 'Property and equipment, net', value: '9,731,006' },
    { label: 'Total assets', value: '13,786,561', shimmer: true },
    { label: 'Net assets without donor restrictions', value: '6,342,884', shimmer: true },
  ],
}

// Act VI visual — the trust cards (real ProposalCard + AppliedCard props).
export const TRUST_MOCK = {
  proposal: {
    status: 'applied',
    reversible: true,
    auditId: 'demo-proposal',
    action: {
      kind: 'update_budget',
      summary: 'Move $4,500 from Contingency to Facilities — gym floor repair.',
    },
  },
  applied: {
    applied: true,
    reversible: true,
    auditId: 'demo-applied',
    tool: 'create_task',
    summary: 'Created the recurring task “Annual HVAC service.”',
    details: [
      { label: 'Module', value: 'Facilities' },
      { label: 'Cadence', value: 'Annual — every July' },
      { label: 'Logged', value: 'Action log · reversible' },
    ],
  },
}

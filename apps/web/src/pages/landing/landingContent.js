// ─────────────────────────────────────────────────────────────────────────────
// landingContent.js — ALL copy for the public marketing homepage ("The Morning
// Ledger") as data. The page components render from this module so the words
// live in exactly one place. School-leader sober register.
// ─────────────────────────────────────────────────────────────────────────────

export const NAV = {
  // Anchor ids must exist on the CURRENT composition (LandingPage.jsx) — the
  // old #your-day/#inside/#networks targets died with the retired day-timeline
  // acts and the links silently went nowhere.
  anchors: [
    { label: 'Home', href: '#top', top: true },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Platform', href: '#platform' },
    { label: 'Cash forecast', href: '#cash-forecast' },
    { label: 'Networks', href: '#networks' },
    { label: 'Board-ready', href: '#board-ready' },
  ],
  signIn: { label: 'Sign in', to: '/login' },
  getStarted: { label: 'Get started', to: '/register' },
}

export const HERO = {
  kicker: 'The operating platform for independent schools',
  h1Line1: 'Many moving parts.',
  h1Line2: 'One platform.',
  subhead:
    'Finance, enrollment, governance, facilities, advancement, and board-ready reporting — the parts of the school that matter, in one place, prioritized for you each morning.',
  ctaPrimary: { label: 'Get started', to: '/register' },
  ctaGhost: { label: 'Sign in', to: '/login' },
  trustLine:
    'Built for heads of school, business officers, and diocese finance teams · Built to FERPA standards. No student-facing surfaces.',
  demoSrSummary:
    'Demo: KYRO imports a trial balance, generates statements, files a document, and answers a multi-school question.',
}

// ── Cash Forecast cinema (#cash-forecast) ────────────────────────────────────
export const CASH_CINEMA = {
  kicker: 'Cash forecast',
  h2: 'See your low point before it sees you.',
  sub: 'Connect QuickBooks and the forecast types itself — open invoices, bills due and a year of history become a rolling cash projection. Five horizons, an Excel-style workbook and the one date that matters, with zero manual entry.',
  liveChip: 'Live from QuickBooks',
  proofChips: [
    'Open invoices scheduled to their due dates',
    'Twelve months of history, seasonalized',
    'Manual entry required: none',
  ],
  cta: { label: 'Run it on your books', to: '/register' },
}

// ── Networks / superintendent command (#networks) ────────────────────────────
export const ORG_COMMAND = {
  kicker: 'For networks & dioceses',
  h2: 'Every school on one screen.',
  sub: 'The superintendent view consolidates the whole network — finances, enrollment, alerts and the morning brief roll up from every school, and every number drills back down to the school that produced it.',
  consoleKicker: 'Superintendent view',
  // A FICTIONAL network (the same made-up Bayview schools the product demo
  // uses) — never a customer's name.
  consoleTitle: 'Bayview Catholic Schools · FY26',
  kpis: [
    { label: 'Schools', value: 6 },
    { label: 'Students', value: 2840 },
    { label: 'Collections', value: 93, suffix: '%' },
    { label: 'Need attention', value: 2, tone: 'amber' },
  ],
  // `pace` = collections pace (%); `short` labels the compare bars.
  schools: [
    { name: 'St. Aurelia Academy', short: 'St. Aurelia', stat: 'Collections 8 days behind', tone: 'amber', pace: 86 },
    { name: 'Cedar Ridge Preparatory', short: 'Cedar Ridge', stat: 'Audit packet clean', tone: 'good', pace: 97 },
    { name: 'Brightwater School', short: 'Brightwater', stat: 'Enrollment +4% vs plan', tone: 'good', pace: 94 },
    { name: 'Mangrove Point Catholic High', short: 'Mangrove Point', stat: 'Maintenance backlog rising', tone: 'amber', pace: 88 },
    { name: 'St. Odile Catholic School', short: 'St. Odile', stat: 'Cash runway 121 days', tone: 'good', pace: 99 },
    { name: 'Heron Cove Academy', short: 'Heron Cove', stat: 'On plan across domains', tone: 'good', pace: 95 },
  ],
  // Each line carries the tone of the school (or the network) it names.
  brief: [
    { text: 'St. Aurelia — tuition collections are 8 days behind the network pace.', tone: 'amber' },
    { text: 'Consolidated cash runway is 94 days; two schools carry the drag.', tone: 'amber' },
    { text: 'Mangrove Point — maintenance backlog crossed its budget line.', tone: 'amber' },
    { text: 'Cedar Ridge — board packet is clean and ready to send.', tone: 'good' },
  ],
  closing: 'One login. Every school. Drill from the network to a single invoice.',
}

// Trust signals shown near the foot of the public homepage.
export const TRUST = {
  heading: 'Built for the trust schools require',
  // APPROVED LANGUAGE ONLY (docs/FERPA_Compliance_Overview.md §2–3): "built to
  // FERPA standards" / "FERPA-aligned by contract" and "no student-facing
  // surfaces, so COPPA does not apply". There is no FERPA certification and
  // COPPA keys to data collected online FROM a child, so the word "compliant"
  // next to either law is a claim we never make — no-compliant-claim.spec.js
  // fails the build on it. The privacy page explains the posture in full.
  sub: 'Built to FERPA standards — FERPA-aligned by contract. KYRO has no student-facing surfaces, so COPPA does not apply. Every record is encrypted in transit and at rest, hosted on AWS in the United States, and AI providers run under no-training, zero-data-retention terms.',
  items: [
    { icon: 'shield', label: 'Built to FERPA standards', to: '/privacy' },
    { icon: 'lock', label: 'Encrypted in transit & at rest' },
    { icon: 'server', label: 'Hosted on AWS · US' },
    { icon: 'sparkles', label: 'AI: no training · zero retention', to: '/privacy' },
  ],
}

export const FOOTER = {
  copyright: '© 2026 KYRO. All rights reserved.',
  links: [
    { label: 'Terms', to: '/terms' },
    { label: 'Privacy', to: '/privacy' },
    { label: 'Sign in', to: '/login' },
  ],
}

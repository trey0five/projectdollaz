// ─────────────────────────────────────────────────────────────────────────────
// tileRegistry.jsx — the HOME v2 tile config, keyed by ModuleKey.
//
// Presentation ONLY: labels always come from lib/modules.js MODULE_META (the
// hand-kept @finrep/db mirror — do NOT extend it), taglines are NEW plain-language
// lines in the mockup's voice (MODULE_META.description is sales copy, too jargony
// for a tile), hues are the locked per-module hues from the UX Redesign Plan §4.
//
// `navId` is a NEW `tile-*` DOM id — NEVER a sidebar navId (those are frozen
// Penny targetRegistry anchors; duplicating one would break getElementById).
//
// `badgeSources`: which briefing AttentionSources roll into this tile's status
// chip (fed to summariseBadges). The finance tile deliberately includes 'cash'
// (Cash & Collections is a Finance child page) — the sidebar's finance rollup
// currently omits it; that gap is a noted follow-up, not copied here.
//
// Every sellable module now has a REAL route (Phase 6 gave hr → /hr and
// planning → /planning their own command centers) — the old page-less rule
// (route:null + a `surface` deep-link) is retired. A licensed module's tile
// navigates to its page; an unlicensed one renders as the upsell tile.
// ─────────────────────────────────────────────────────────────────────────────
import { MODULE_META } from '../../lib/modules.js'
import {
  FinanceArt,
  EnrollmentArt,
  GovernanceArt,
  AccreditationArt,
  FacilitiesArt,
  AdvancementArt,
  StrategyArt,
  HrArt,
  PlanningArt,
} from './tileArt.jsx'

export const HOME_TILES = [
  {
    key: 'finance',
    hue: '#2563EB',
    route: '/finance',
    navId: 'tile-finance',
    tagline: 'Statements, cash, and budget vs. actuals — board-ready.',
    Art: FinanceArt,
    badgeSources: ['metric', 'compliance', 'data', 'cash'],
  },
  {
    key: 'enrollment',
    hue: '#0EA5E9',
    route: '/enrollment',
    navId: 'tile-enrollment',
    tagline: "Who's enrolled, who's coming, and how that compares to plan.",
    Art: EnrollmentArt,
    badgeSources: ['enrollment'],
  },
  {
    key: 'governance',
    hue: '#7C3AED',
    route: '/governance',
    navId: 'tile-governance',
    tagline: 'Board policies, meetings and minutes — all in one place.',
    Art: GovernanceArt,
    badgeSources: ['governance'],
  },
  {
    key: 'accreditation',
    hue: '#F59E0B',
    route: '/accreditation',
    navId: 'tile-accreditation',
    tagline: 'Standards, evidence and your self-study, tracked.',
    Art: AccreditationArt,
    badgeSources: ['accreditation'],
  },
  {
    key: 'facilities',
    hue: '#EA580C',
    route: '/facilities',
    navId: 'tile-facilities',
    tagline: "Buildings, repairs and what they'll cost.",
    Art: FacilitiesArt,
    badgeSources: ['facilities'],
  },
  {
    key: 'advancement',
    hue: '#E11D48',
    route: '/advancement',
    navId: 'tile-advancement',
    tagline: 'Campaigns, gifts and the generosity behind the school.',
    Art: AdvancementArt,
    badgeSources: ['advancement'],
  },
  {
    key: 'strategy',
    hue: '#4F46E5',
    route: '/strategy',
    navId: 'tile-strategy',
    tagline: 'Your strategic plan, measured against the live numbers.',
    Art: StrategyArt,
    badgeSources: ['strategy'],
  },
  {
    // Phase 6 — HR & Staffing command center at /hr (ratio, FTEs, trends + the
    // staffing-FTE add flow).
    key: 'hr',
    hue: '#059669',
    route: '/hr',
    navId: 'tile-hr',
    tagline: 'Staffing ratios, FTEs and trends — on one page.',
    Art: HrArt,
    badgeSources: ['hr'],
  },
  {
    // Phase 6 — Planning & Forecasting command center at /planning (the FY-end
    // forecast workspace + the grade-by-grade enrollment plan).
    key: 'planning',
    hue: '#0891B2',
    route: '/planning',
    navId: 'tile-planning',
    tagline: 'The year-end forecast and your enrollment plan.',
    Art: PlanningArt,
    badgeSources: ['planning'],
  },
]

/** Label for a tile — always MODULE_META (the single source of module names). */
export function tileLabel(key) {
  return MODULE_META[key]?.label ?? key
}

// Keyed lookup over the registry so the Membership cards, the locked-tile info
// popup, and the unlock celebration all pull a module's hue/Art/route/tagline
// from the ONE registry (no duplicated presentation config).
export const TILE_BY_KEY = Object.fromEntries(HOME_TILES.map((t) => [t.key, t]))

// Sell copy for the locked-tile info popup — a short pitch + concrete feature
// bullets per sellable module, in the taglines' plain-language voice. FE-only
// (the backend never touches copy); labels STAY in MODULE_META.
export const MODULE_PITCH = {
  enrollment: {
    pitch:
      "See who's enrolled, who's coming, and what it means for tuition — before the fall surprises you.",
    bullets: [
      'Live counts by grade, synced from your SIS (OneRoster CSV or Blackbaud)',
      'Admissions funnel: inquiries → applications → enrolled',
      'Retention and feeder-grade watchlists',
      "The enrollment → tuition → cash briefing: what a soft grade does to next year's budget",
      'Actuals vs. plan, year over year',
    ],
  },
  governance: {
    pitch: 'Board policies, meetings and minutes — organized, current, and ready for the next ask.',
    bullets: [
      'A policy register with owners and review dates',
      'Overdue-review alerts in your morning briefing',
      'Evidence-ready records when the board or an accreditor asks',
      'Trustee-friendly: shows up in the Board lens',
    ],
  },
  accreditation: {
    pitch: 'Walk into your self-study with the evidence already filed.',
    bullets: [
      "A standards register that mirrors your accreditor's framework",
      'Met / partially met / not met — rated at a glance',
      'Evidence attached to every standard',
      'Coverage-gap alerts in your briefing',
      'A progress picture for the visiting team',
    ],
  },
  facilities: {
    pitch: "Every building, every repair, and what it'll cost — before it becomes an emergency.",
    bullets: [
      'A capital project and maintenance register',
      'Recurring maintenance that never slips off the calendar',
      'Actual cost vs. estimate on every job',
      'Deferred-maintenance exposure in your briefing',
    ],
  },
  advancement: {
    pitch: 'Campaigns, gifts and pledges — with the follow-through numbers your board asks for.',
    bullets: [
      'A campaign register with goals and live progress',
      'Gifts and pledges rolled up — booked vs. collected',
      'Pledge follow-up flags in your briefing',
      'Giving trends alongside your financials',
    ],
  },
  strategy: {
    pitch:
      'Your strategic plan, measured against the live numbers — no more end-of-year scramble.',
    bullets: [
      'Goals bound to real metrics — progress computes itself from your actuals',
      'Pace that knows direction: ahead, on track, or behind',
      'A Horizon view of every pillar and goal',
      'Plan check-ins in your morning briefing',
      'Ask Penny how the plan is going — she answers with real figures',
    ],
  },
  hr: {
    pitch: 'A staffing command center: ratio, FTEs and trends on one page.',
    bullets: [
      'Student–teacher ratio, computed live and banded against targets',
      'Teaching share of total staff — the composition your board asks about',
      'Enter staffing FTEs right in the module',
      'Staffing trends across your saved periods',
      'Staffing flags in your morning briefing',
    ],
  },
  planning: {
    pitch: 'The FY-end forecast workspace, front and center.',
    bullets: [
      'Revise assumptions and project where the year lands',
      'A grade-by-grade enrollment plan that powers actual-vs-plan',
      'Forecast-vs-budget variance in your briefing',
      'Plan readiness at a glance: budget · forecast · enrollment plan',
      'A multi-year outlook built on your saved forecast',
    ],
  },
}

// The sources-map handed to summariseBadges for the HOME v2 surface: every
// tile's rollup, PLUS 'workflow' for the core row's Tasks count (same briefing
// payload — no invented numbers). Built once from the registry so a new tile's
// chip wiring is one array in HOME_TILES.
export const TILE_SOURCES = {
  ...Object.fromEntries(
    HOME_TILES.filter((t) => t.badgeSources.length > 0).map((t) => [t.key, t.badgeSources]),
  ),
  workflow: ['workflow'],
}

// Lens → the verb the briefing-band summary uses (server-authoritative lens;
// presentation only). Lifted from HomeCommandCenter so band copy stays aligned.
export const LENS_VERB = {
  owner: 'need a decision',
  accountant: 'need action',
  viewer: 'to review',
}

/** Time-of-day greeting (same rule the v1 command center uses). */
export function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

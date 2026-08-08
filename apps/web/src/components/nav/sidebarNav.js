// ─────────────────────────────────────────────────────────────────────────────
// sidebarNav.js — the DATA-DRIVEN grouped-nav config for the left Sidebar.
//
// One row per GROUP. A group renders iff `module === null` (always: Core) OR
// hasModule(group.module) === true (the licensed-group rule). Items map 1:1 to
// the former flat TopBar NAV so behavior is byte-preserved — including each
// item's `navId`, which is the STABLE DOM id Penny's target registry anchors her
// glide to (targetRegistry.js). DO NOT rename/drop a navId.
//
// `match(path)` ports TopBar's exact active-route predicates (Home is exact;
// Statements also lights on /history for the /history→/statements redirect;
// everything else is a startsWith). Active state is derived per render from
// useLocation — never stored in state / written from an effect.
//
// To extend declaratively: add a group row (with its `module` key) or an item —
// no branching logic. Every sellable module now has a REAL route (Phase 6 gave
// hr → /hr and planning → /planning their own pages, retiring the old
// page-less rule), so every licensed module contributes a group here; an
// UNLICENSED module is upsold via the Add-ons list (SELLABLE_MODULE_KEYS).
// ─────────────────────────────────────────────────────────────────────────────
import {
  Sparkles,
  Bot,
  Building2,
  ListChecks,
  Database,
  Library,
  FileStack,
  BarChart3,
  Wallet,
  HandCoins,
  FileBarChart2,
  ShieldCheck,
  Landmark,
  BadgeCheck,
  Wrench,
  HeartHandshake,
  Target,
  TrendingUp,
  CircleDollarSign,
  GraduationCap,
  LineChart,
  Users2,
  Settings,
} from 'lucide-react'

export const NAV_GROUPS = [
  {
    id: 'core',
    label: 'Core', // the always-included platform substrate — labeled + pill'd.
    pill: 'Included', // AppShell renders this as a gold "Included" badge.
    module: null, // null = always shown (never gated, never upsold).
    items: [
      // `hero` marks the prioritised briefing — the AI-chief-of-staff surface. AppShell
      // pulls it OUT of the list and renders it as the elevated top entry. navId
      // stays nav-home (Penny's target registry anchors to it); the route is
      // '/app' ('/' is now the public marketing landing).
      { to: '/app', navId: 'nav-home', label: 'Daily Briefing', Icon: Sparkles, hero: true, match: (p) => p === '/app' },
      { to: '/penny', navId: 'nav-penny', label: 'Ask Penny', Icon: Bot, match: (p) => p.startsWith('/penny') },
      { to: '/data', navId: 'nav-data', label: 'Data', Icon: Database, match: (p) => p.startsWith('/data') },
      { to: '/tasks', navId: 'nav-tasks', label: 'Tasks', Icon: ListChecks, match: (p) => p.startsWith('/tasks') },
      { to: '/knowledge', navId: 'nav-knowledge', label: 'Knowledge', Icon: Library, match: (p) => p.startsWith('/knowledge') },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    module: 'finance',
    // A multi-page domain: AppShell renders `Icon` + `label` as the Finance domain
    // header, with the items nested (indented) beneath it. The header links to the
    // Finance MODULE HOME (/finance) and lights ONLY on an EXACT /finance match, so
    // a child page (e.g. /statements) never lights the header as if it were home.
    to: '/finance',
    match: (p) => p === '/finance',
    Icon: CircleDollarSign,
    items: [
      { to: '/statements', navId: 'nav-statements', label: 'Statements', Icon: FileStack, match: (p) => p.startsWith('/statements') || p.startsWith('/history') },
      // The match is EXACT-plus-children, not a prefix: `startsWith('/cash')`
      // also matches '/cash-flow', and the forecast is reached from the Finance
      // tile board rather than from here — a sidebar entry that lit up for a page
      // it does not link to would be worse than no entry.
      { to: '/cash', navId: 'nav-cash', label: 'Cash & Collections', Icon: HandCoins, match: (p) => p === '/cash' || p.startsWith('/cash/') },
      { to: '/analytics', navId: 'nav-analytics', label: 'Analytics', Icon: BarChart3, match: (p) => p.startsWith('/analytics') },
      { to: '/budget', navId: 'nav-budget', label: 'Budget', Icon: Wallet, match: (p) => p.startsWith('/budget') },
      { to: '/reports', navId: 'nav-reports', label: 'Reports', Icon: FileBarChart2, match: (p) => p.startsWith('/reports') },
      // Readiness is finance audit/compliance readiness (same finance license, no
      // own module key) — it lives UNDER Finance, adjacent to Reports as before.
      { to: '/readiness', navId: 'nav-readiness', label: 'Readiness', Icon: ShieldCheck, match: (p) => p.startsWith('/readiness') },
    ],
  },
  {
    // Phase 6 Planning & Forecasting — the FY-end forecast workspace + enrollment
    // plan. Directly AFTER Finance (planning is the finance family's forward look).
    id: 'planning',
    label: 'Planning & Forecasting',
    module: 'planning',
    items: [
      { to: '/planning', navId: 'nav-planning', label: 'Planning & Forecasting', Icon: LineChart, match: (p) => p.startsWith('/planning') },
    ],
  },
  {
    // Phase 2 Enrollment Intelligence — the SIS/roster connector + vs-plan page.
    // Its own gated group (module:'enrollment'), placed right after Finance since
    // enrollment drives tuition/cash. Shown only when the module is licensed.
    id: 'enrollment',
    label: 'Enrollment',
    module: 'enrollment',
    items: [
      { to: '/enrollment', navId: 'nav-enrollment', label: 'Enrollment', Icon: GraduationCap, match: (p) => p.startsWith('/enrollment') },
    ],
  },
  {
    // Phase 6 HR & Staffing — the staffing command center (/hr). Directly AFTER
    // Enrollment (people follow the students).
    id: 'hr',
    label: 'HR & Staffing',
    module: 'hr',
    items: [
      { to: '/hr', navId: 'nav-hr', label: 'HR & Staffing', Icon: Users2, match: (p) => p.startsWith('/hr') },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    module: 'governance',
    items: [
      { to: '/governance', navId: 'nav-governance', label: 'Governance', Icon: Landmark, match: (p) => p.startsWith('/governance') },
    ],
  },
  {
    id: 'accreditation',
    label: 'Accreditation',
    module: 'accreditation',
    items: [
      { to: '/accreditation', navId: 'nav-accreditation', label: 'Accreditation', Icon: BadgeCheck, match: (p) => p.startsWith('/accreditation') },
    ],
  },
  {
    // AIC Phase G — the CONTINUOUS IMPROVEMENT MANAGER. Sits directly after
    // Accreditation because that is where its recommendations come from.
    //
    // `modules` (plural) instead of `module`: OR semantics, mirroring the API
    // guard — the page rides on EITHER accreditation or strategy, and there is
    // deliberately NO `improvement` module key (no third SKU). `module` stays
    // ABSENT so nothing that reads it single-key can misfire: AppShell's
    // lockedModules list is built from SELLABLE_MODULE_KEYS, so a school with
    // neither module sees this group disappear and is upsold by the existing
    // Accreditation / Strategic Planning Add-ons rows — the honest upsell, since
    // those are the two things actually for sale.
    id: 'improvement',
    label: 'Improvement',
    modules: ['accreditation', 'strategy'],
    items: [
      { to: '/improvement', navId: 'nav-improvement', label: 'Improvement', Icon: TrendingUp, match: (p) => p.startsWith('/improvement') },
    ],
  },
  {
    // AIC Phase I — the SUPERINTENDENT PORTFOLIO (/portfolio). Directly after
    // Improvement: the portfolio is what a diocese does with the improvement
    // work once there is more than one school doing it.
    //
    // ── WHY THIS GROUP IS `orgOnly` AND NOT `module: 'accreditation'` ─────────
    // `hasModule` reads the ACTIVE SCHOOL'S billing and nothing else
    // (BillingContext is bound to `activeSchool`), and a group whose module is
    // unlicensed VANISHES — it is not even rendered as an upsell row. So a
    // superintendent of a 14-school diocese who happened to have the ONE school
    // without an accreditation licence selected lost the org-wide portfolio from
    // the sidebar entirely, and `/portfolio` is linked from nowhere else in the
    // app: the page became unreachable except by typing the URL. The offered
    // workaround was worse than the bug — upsell accreditation at ONE school in
    // order to see an ORG view.
    //
    // A per-active-school licence is simply the wrong predicate for an org
    // route. The API agrees: `/organizations/:orgId/accreditation/portfolio` is
    // JwtAuth-only, resolves entitlement PER SCHOOL inside the service, and
    // reports an unlicensed school in `notLicensed[]` by name with no readiness
    // disclosed. Belonging to an organization is the real precondition, so that
    // is what gates the row; the page's own org-scope panel does the rest.
    id: 'portfolio',
    label: 'Portfolio',
    orgOnly: true,
    items: [
      { to: '/portfolio', navId: 'nav-portfolio', label: 'Portfolio', Icon: Building2, match: (p) => p.startsWith('/portfolio') },
    ],
  },
  {
    id: 'facilities',
    label: 'Facilities',
    module: 'facilities',
    items: [
      { to: '/facilities', navId: 'nav-facilities', label: 'Facilities', Icon: Wrench, match: (p) => p.startsWith('/facilities') },
    ],
  },
  {
    id: 'advancement',
    label: 'Advancement',
    module: 'advancement',
    items: [
      { to: '/advancement', navId: 'nav-advancement', label: 'Advancement', Icon: HeartHandshake, match: (p) => p.startsWith('/advancement') },
    ],
  },
  {
    // Phase 5 Strategic Planning — the oversight-cluster group. Its own gated
    // module ('strategy'); the strategic plan (pillars → goals → initiatives) that
    // measures itself against the live financials. Shown only when licensed.
    id: 'strategy',
    label: 'Strategic Planning',
    module: 'strategy',
    items: [
      { to: '/strategy', navId: 'nav-strategy', label: 'Strategic Planning', Icon: Target, match: (p) => p.startsWith('/strategy') },
    ],
  },
]

/**
 * THE ONE VISIBILITY RULE, so AppShell and its spec cannot hold two copies of it.
 *
 * In order:
 *   · `orgOnly` — an ORGANIZATION route. Gated on belonging to an organization
 *     and NOT on the active school's licence, because `hasModule` only ever knows
 *     about the active school and an org rollup has no per-active-school licence
 *     semantics. Entitlement for an org route is resolved per school by the API.
 *   · `module === null` — Core, always on.
 *   · `modules` — OR over several keys (Phase G), mirroring the API guard.
 *   · `module` — the single-key licensed-group rule.
 */
export function navGroupVisible(group, { hasModule, hasOrg }) {
  if (!group) return false
  if (group.orgOnly) return hasOrg === true
  if (group.module === null) return true
  if (group.modules) return group.modules.some(hasModule)
  return hasModule(group.module)
}

// Settings is pinned to the sidebar FOOT, always, module-independent (no group).
export const SETTINGS_ITEM = {
  to: '/settings',
  navId: 'nav-settings',
  label: 'Settings',
  Icon: Settings,
  match: (p) => p.startsWith('/settings'),
}

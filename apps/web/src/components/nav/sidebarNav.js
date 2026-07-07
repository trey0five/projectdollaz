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
// no branching logic. ONLY include a group whose items have REAL routes; a
// licensed-but-page-less module (planning/hr) contributes NO group (its value
// surfaces inside Analytics/briefing) and is upsold via the Add-ons list
// (SELLABLE_MODULE_KEYS) only while UNLICENSED. (Facilities, Advancement AND now
// Enrollment have a page/group — the maintenance / fundraising registers + the
// SIS-roster connector — so they appear here when licensed.)
// ─────────────────────────────────────────────────────────────────────────────
import {
  Sparkles,
  Bot,
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
  CircleDollarSign,
  GraduationCap,
  Settings,
} from 'lucide-react'

export const NAV_GROUPS = [
  {
    id: 'core',
    label: 'Core', // the always-included platform substrate — labeled + pill'd.
    pill: 'Included', // AppShell renders this as a gold "Included" badge.
    module: null, // null = always shown (never gated, never upsold).
    items: [
      // `hero` marks the prioritised briefing — the digital-COO surface. AppShell
      // pulls it OUT of the list and renders it as the elevated top entry. navId
      // stays nav-home (Penny's target registry anchors to it); the route is
      // '/app' ('/' is now the public marketing landing).
      { to: '/app', navId: 'nav-home', label: 'Briefing', Icon: Sparkles, hero: true, match: (p) => p === '/app' },
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
      { to: '/cash', navId: 'nav-cash', label: 'Cash & Collections', Icon: HandCoins, match: (p) => p.startsWith('/cash') },
      { to: '/analytics', navId: 'nav-analytics', label: 'Analytics', Icon: BarChart3, match: (p) => p.startsWith('/analytics') },
      { to: '/budget', navId: 'nav-budget', label: 'Budget', Icon: Wallet, match: (p) => p.startsWith('/budget') },
      { to: '/reports', navId: 'nav-reports', label: 'Reports', Icon: FileBarChart2, match: (p) => p.startsWith('/reports') },
      // Readiness is finance audit/compliance readiness (same finance license, no
      // own module key) — it lives UNDER Finance, adjacent to Reports as before.
      { to: '/readiness', navId: 'nav-readiness', label: 'Readiness', Icon: ShieldCheck, match: (p) => p.startsWith('/readiness') },
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
]

// Settings is pinned to the sidebar FOOT, always, module-independent (no group).
export const SETTINGS_ITEM = {
  to: '/settings',
  navId: 'nav-settings',
  label: 'Settings',
  Icon: Settings,
  match: (p) => p.startsWith('/settings'),
}

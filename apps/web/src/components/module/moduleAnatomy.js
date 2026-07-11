// ─────────────────────────────────────────────────────────────────────────────
// moduleAnatomy — the ui.v2 MODULE TAB registry. Keyed by ModuleKey, it declares
// which of the four canonical tabs (Overview · Add data · Records · Reports) a
// module actually has content for, plus its glyph + eyebrow. Labels come from
// MODULE_META (the ONE source of module names); hues come from HOME_TILES (the
// locked per-module brand hues) so a module's tab accent matches its home tile.
//
// D2 (locked contract): OMIT a tab when a module has no existing content for it.
// Universal core = Overview · Add data · Records where content exists; Reports
// lives ONLY on finance (the only module with real report surfaces today).
// Enrollment has no register → Overview · Add data only.
//
// Presentation only — no data knowledge. ModuleTabs reads this; each module page
// supplies the actual panel nodes.
// ─────────────────────────────────────────────────────────────────────────────
import {
  CircleDollarSign,
  GraduationCap,
  Landmark,
  BadgeCheck,
  Wrench,
  HeartHandshake,
  Compass,
} from 'lucide-react'
import { MODULE_META } from '../../lib/modules.js'
import { HOME_TILES } from '../home/tileRegistry.jsx'

// Per-module hue lifted from the locked home-tile registry (single source).
const HUE = Object.fromEntries(HOME_TILES.map((t) => [t.key, t.hue]))

// The canonical tab order + human labels.
export const TAB_ORDER = ['overview', 'add', 'records', 'reports']
export const TAB_LABEL = {
  overview: 'Overview',
  add: 'Add data',
  records: 'Records',
  reports: 'Reports',
}

// Which tabs each module presents (declarative; omit = no content for it).
export const MODULE_ANATOMY = {
  finance: {
    tabs: ['overview', 'add', 'records', 'reports'],
    Icon: CircleDollarSign,
    eyebrow: 'Finance command center',
  },
  enrollment: {
    tabs: ['overview', 'add'],
    Icon: GraduationCap,
    eyebrow: 'Enrollment intelligence',
  },
  governance: {
    tabs: ['overview', 'add', 'records'],
    Icon: Landmark,
    eyebrow: 'Governance',
  },
  accreditation: {
    tabs: ['overview', 'add', 'records'],
    Icon: BadgeCheck,
    eyebrow: 'Accreditation',
  },
  facilities: {
    tabs: ['overview', 'add', 'records'],
    Icon: Wrench,
    eyebrow: 'Facilities',
  },
  advancement: {
    tabs: ['overview', 'add', 'records'],
    Icon: HeartHandshake,
    eyebrow: 'Advancement',
  },
  strategy: {
    tabs: ['overview', 'add', 'records'],
    Icon: Compass,
    eyebrow: 'Strategic Planning',
  },
}

/** The anatomy record for a module (or null when the key is unknown). */
export function moduleAnatomy(key) {
  return MODULE_ANATOMY[key] ?? null
}

/** The present tab keys for a module (defaults to Overview-only). */
export function moduleTabs(key) {
  return MODULE_ANATOMY[key]?.tabs ?? ['overview']
}

/** The locked brand hue for a module (falls back to the v2 action blue). */
export function moduleHue(key) {
  return HUE[key] ?? '#2563EB'
}

/** The module's display label (always MODULE_META — the single name source). */
export function moduleLabel(key) {
  return MODULE_META[key]?.label ?? key
}

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

// ── Per-module accent theming ─────────────────────────────────────────────────
// The v2 look colors every accent (CTAs, tab underlines, KPI dots, focus rings,
// the record modal) through the --c-gold* / --c-glow / --grad-cta-* custom
// properties (see styles/tokens.css). Overriding those SAME vars on a module
// page's root re-themes the whole page — modals included, since they stay DOM
// descendants — to the module's locked brand hue. Governance renders purple
// throughout, Facilities its hue, etc. Penny's gold (--c-penny*) is untouched.
const hexRgb = (hex) => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
const mixRgb = (rgb, target, t) => rgb.map((c, i) => Math.round(c + (target[i] - c) * t))
const triplet = (rgb) => rgb.join(' ')
const rgbHex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

/** Inline-style object of accent-var overrides for a module page root. */
export function moduleAccentVars(key) {
  const rgb = hexRgb(moduleHue(key))
  return {
    '--c-gold': triplet(rgb),
    '--c-gold-light': triplet(mixRgb(rgb, WHITE, 0.35)),
    '--c-gold-pale': triplet(mixRgb(rgb, WHITE, 0.82)),
    '--c-glow': triplet(rgb),
    '--grad-cta-0': rgbHex(mixRgb(rgb, WHITE, 0.45)),
    '--grad-cta-1': rgbHex(rgb),
    '--grad-cta-2': rgbHex(mixRgb(rgb, BLACK, 0.18)),
  }
}

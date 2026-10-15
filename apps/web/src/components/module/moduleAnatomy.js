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
// Enrollment gained a register in Phase 5 (the student roster) → full core trio.
//
// Presentation only — no data knowledge. ModuleTabs reads this; each module page
// supplies the actual panel nodes.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BookOpen,
  CircleDollarSign,
  GraduationCap,
  Landmark,
  BadgeCheck,
  Wrench,
  HeartHandshake,
  Compass,
  LineChart,
  Users2,
} from 'lucide-react'
import { MODULE_META } from '../../lib/modules.js'
import { HOME_TILES } from '../home/tileRegistry.jsx'

// Per-module hue lifted from the locked home-tile registry (single source).
const HUE = Object.fromEntries(HOME_TILES.map((t) => [t.key, t.hue]))

// The canonical tab order + human labels.
export const TAB_ORDER = ['overview', 'add', 'records', 'analytics', 'reports']
export const TAB_LABEL = {
  overview: 'Overview',
  add: 'Add data',
  records: 'Records',
  // Academics is the first module whose analysis is too large for the Overview
  // tab — a whole diocesan dashboard rather than a KPI strip — so it earns its
  // own door. Declarative like every other tab: a module that omits it has none.
  analytics: 'Analytics',
  reports: 'Reports',
}

// Which tabs each module presents (declarative; omit = no content for it).
export const MODULE_ANATOMY = {
  finance: {
    tabs: ['overview', 'add', 'records', 'reports'],
    Icon: CircleDollarSign,
    eyebrow: 'Finance command center',
    // Finance's third tab is three sub-page doors (Statements / Cash / Budget),
    // not a register — labeling it "Records" made the word mean two different
    // things across modules. The KEY stays `records` (wizard finish(), navIds
    // and deep links are frozen on it); only the human label differs.
    tabLabels: { records: 'Workspaces' },
  },
  // Enrollment earns the analytics door on the same rule Academics did: its
  // analysis is a whole dashboard (trend, grade × year, cohort size, vs plan,
  // demographics) rather than a KPI strip, and the Overview was already full.
  // The trend and the roster mix MOVED there — Overview keeps "is my data
  // flowing, and what is the headline".
  enrollment: {
    tabs: ['overview', 'add', 'records', 'analytics'],
    Icon: GraduationCap,
    eyebrow: 'Enrollment intelligence',
  },
  academics: {
    tabs: ['overview', 'add', 'records', 'analytics'],
    Icon: BookOpen,
    eyebrow: 'Academics',
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
  // Phase 6 — HR is two per-period FTE fields, not a register: NO records tab
  // (never force a tab a module has no content for). Same for planning (the
  // enrollment plan lives in the Add tab; the forecast workspace on Overview).
  hr: {
    tabs: ['overview', 'add'],
    Icon: Users2,
    eyebrow: 'HR & Staffing',
  },
  planning: {
    tabs: ['overview', 'add'],
    Icon: LineChart,
    eyebrow: 'Planning & Forecasting',
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

/** The human label for a module's tab: per-module override (tabLabels) first,
 *  then the canonical TAB_LABEL, then the raw key. The ONE read path for tab
 *  labels — render sites must not index TAB_LABEL directly, or per-module
 *  renames (finance's "Workspaces") silently miss them. */
export function moduleTabLabel(key, tab) {
  return MODULE_ANATOMY[key]?.tabLabels?.[tab] ?? TAB_LABEL[tab] ?? tab
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
    '--c-module': triplet(rgb),
    '--c-gold': triplet(rgb),
    '--c-gold-light': triplet(mixRgb(rgb, WHITE, 0.35)),
    '--c-gold-pale': triplet(mixRgb(rgb, WHITE, 0.82)),
    '--c-glow': triplet(rgb),
    '--grad-cta-0': rgbHex(mixRgb(rgb, WHITE, 0.45)),
    '--grad-cta-1': rgbHex(rgb),
    '--grad-cta-2': rgbHex(mixRgb(rgb, BLACK, 0.18)),
    // The Aurora band palette rides along, so every Aurora primitive inside a
    // module page (ModuleTabs / ModuleAccent root) is hue-themed with no prop.
    ...auroraVarsFromHue(moduleHue(key)),
  }
}

// ── Aurora band palette (the approved "Aurora" module look) ───────────────────
// Every Aurora surface (components/ui/aurora/*, styles/aurora.css) is painted
// from ONE module hue — the locked HOME_TILES hue above. Nothing here is a second
// palette: the deep band stops are the hue darkened, and the two companion
// hues are the hue turned round the colour wheel, so a module added to
// HOME_TILES gets its band for free.
//
// TWO GUARDS make the band readable for EVERY hue (review 2026-10-15):
//   1. Companion turn by FAMILY. Cool hues turn +28° / −22° (Finance's blue →
//      violet + cyan, Enrollment's sky → indigo + teal — the mockup pairings).
//      A fixed +28° on a WARM hue walks into yellow-green (Accreditation's amber
//      became chartreuse), so warm hues (≈15–70°) turn both companions toward
//      red/orange instead (−12° / −24°) — amber → orange + red-orange, the
//      mockup's glow.
//   2. White text must stay ≥4.5:1 over anything on the band. The blobs drift,
//      so any word can end up over any blob: each GLOW colour (--au-g1..g3) is
//      darkened until white over the blob (70% opacity over the lightest band
//      stop) clears 4.5:1, and the band stops and --au-deep (the white button's
//      label colour) get the same floor. A blue band is untouched; amber and
//      orange deepen toward brown — the approved accreditation band.
const rgbHsl = ([r, g, b]) => {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h * 60, s, l]
}
const hslRgb = ([h, s, l]) => {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255))
}
const turn = (rgb, deg) => {
  const [h, s, l] = rgbHsl(rgb)
  return hslRgb([(h + deg + 360) % 360, s, l])
}
const rgba = (rgb, a) => `rgba(${rgb.join(',')},${a})`

/** WCAG relative luminance of an sRGB triplet. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast of white text over an sRGB triplet. */
export function whiteContrast(rgb) {
  return 1.05 / (luminance(rgb) + 0.05)
}
// The blob's peak opacity (styles/aurora.css .au-blob) and the floor we hold.
export const BLOB_ALPHA = 0.7
/** A blob of `glow` at `alpha` over `base` — what white text actually sits on. */
export const overBand = (glow, base, alpha = BLOB_ALPHA) => mixRgb(base, glow, alpha)
const MIN_WHITE = 4.6 // a hair over AA 4.5 so rounding never lands under it

/** Darken `rgb` toward black just until `test(candidate)` passes. */
const deepenUntil = (rgb, test) => {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = mixRgb(rgb, BLACK, t)
    if (test(c)) return c
  }
  return BLACK
}

/** Is this a warm hue (red-orange through amber/yellow) on the colour wheel? */
const isWarm = (rgb) => {
  const [h, s] = rgbHsl(rgb)
  return s > 0.2 && h >= 15 && h <= 70
}

/** Aurora custom properties for ONE hue (hex). Consumed by styles/aurora.css. */
export function auroraVarsFromHue(hex) {
  const rgb = hexRgb(hex || '#2563EB')
  const warm = isWarm(rgb)
  const two = turn(rgb, warm ? -12 : 28)
  const three = turn(rgb, warm ? -24 : -22)
  // A warm band leans its dark stops a touch toward red so amber deepens to
  // brown (the mockup's #92400e family), not to mustard.
  const base = warm ? turn(rgb, -8) : rgb
  // Band stops: the hue darkened — and never so light that white fails on it.
  const d0 = deepenUntil(mixRgb(base, BLACK, 0.3), (c) => whiteContrast(c) >= MIN_WHITE)
  const d1 = mixRgb(base, BLACK, 0.58)
  const d2 = mixRgb(base, BLACK, 0.8)
  const glow = (c) => deepenUntil(c, (g) => whiteContrast(overBand(g, d0)) >= MIN_WHITE)
  const g1 = glow(mixRgb(base, WHITE, 0.12))
  const deep = deepenUntil(mixRgb(base, BLACK, 0.25), (c) => whiteContrast(c) >= MIN_WHITE)
  return {
    '--au-h': rgbHex(rgb),
    '--au-h2': rgbHex(two),
    '--au-h3': rgbHex(three),
    '--au-b1': rgbHex(g1),
    '--au-g1': rgbHex(g1),
    '--au-g2': rgbHex(glow(two)),
    '--au-g3': rgbHex(glow(three)),
    '--au-d0': rgbHex(d0),
    '--au-d1': rgbHex(d1),
    '--au-d2': rgbHex(d2),
    '--au-deep': rgbHex(deep),
    '--au-ink': rgbHex(mixRgb(rgb, [11, 16, 32], 0.5)),
    '--au-veil': rgba(d2, 0.5),
    '--au-shadow': rgba(d0, 0.6),
  }
}

/** Aurora custom properties for a module key (its locked HOME_TILES hue). */
export function moduleAuroraVars(key) {
  return auroraVarsFromHue(moduleHue(key))
}

/** Exposed for the contrast spec: hex → [r, g, b]. */
export const hexToRgb = hexRgb

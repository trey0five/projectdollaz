import type { Lens } from '../analytics/briefing-lens.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — the portfolio's LENS SHAPER. Pure: no Nest, no I/O, no clock.
// Applied LAST, to the finished payload.
//
// THE INVARIANT THIS CODEBASE HAS HELD SINCE PHASE 1: numbers never differ by
// lens. A board member and a superintendent see the SAME attention scores, the
// SAME bands, the SAME verified percentages and the SAME counts. What the board
// does not see is WHICH NAMED PERSON owns which piece of work at another school —
// that is somebody's employment context, not a governance figure.
//
// The omitted keys are OMITTED, not nulled. A `null` owner still tells you the
// shape of the record and still invites a UI to render "Owner: —" beside a school
// that has one. Absence is the only honest encoding of "not your business", and
// spec API-5 asserts key-shape (not just value) for exactly that reason.
// ─────────────────────────────────────────────────────────────────────────────

/** Any key naming a person who owns work. Matched case-insensitively, at any depth. */
const OWNER_KEY = /owner/i

/** Per-initiative detail arrays. The COUNTS survive; the titles and ids do not. */
const VIEWER_OMIT_KEYS: ReadonlySet<string> = new Set([
  'initiativeTitles',
  'initiativeTitle',
  'initiativeIds',
])

/**
 * Dotted paths (array indices skipped) omitted for the viewer. Today: the
 * intervention-priorities per-school breakdown — a board sees that COG-14 is below
 * threshold at 9 of 14 schools, not the roster of which nine.
 */
const VIEWER_OMIT_PATHS: ReadonlySet<string> = new Set(['priorities.schools'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function strip(value: unknown, path: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => strip(v, path))
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (OWNER_KEY.test(key)) continue
    if (VIEWER_OMIT_KEYS.has(key)) continue
    const next = [...path, key]
    if (VIEWER_OMIT_PATHS.has(next.join('.'))) continue
    out[key] = strip(v, next)
  }
  return out
}

/**
 * Shape a finished portfolio payload for a lens.
 *
 * `owner` / `accountant` → the payload, unchanged and by reference (identity, so a
 * reviewer can see at a glance that the full path is not transformed at all).
 * `viewer` → a NEW deep structure with the omitted keys absent. Every remaining
 * value is copied verbatim: no rounding, no re-derivation, no rewriting.
 */
export function shapeForLens<T>(payload: T, lens: Lens): T {
  if (lens !== 'viewer') return payload
  return strip(payload, []) as T
}

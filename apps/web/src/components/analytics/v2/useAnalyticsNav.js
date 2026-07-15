// ─────────────────────────────────────────────────────────────────────────────
// useAnalyticsNav — the analytics-v2 URL model. Clones ModuleTabs' `?tab=` idiom
// (useSearchParams, validate→default, push history) but over the TWO analytics axes
// plus the chip selections:
//
//   ?scope=school|compare|org       (dropped when =school — the canonical default)
//   &view=overview|charts|scorecard (dropped when =overview)
//   &school=<id>                    (school scope only)
//   &schools=<id>,<id>              (compare scope only, min 1)
//   &highlight=<metricKey>          (a scorecard row to scroll+flash)
//
// Canonical clean URL = /analytics (school + overview, no chips). Every change
// PUSHes history so the back button walks the trail. Per-scope last-view MEMORY
// lives in a ref (viewByScope): switching scope restores the view you last had in
// it.
//
// Storage and the global-scope seed are folded INTO the URL once at mount (a
// single replace — no history entry); afterwards the URL is the single source of
// truth, so a clean URL unambiguously means school+overview and Back/forward walk
// deterministically. The same mount pass normalizes the legacy pre-rename scope
// alias (see SCOPE_ALIASES) and the legacy ?metric=<key> drawer deep-link
// (→ view=scorecard&highlight=<key>).
//
// The hook never writes ScopeContext — analytics owns its scope space in the URL
// only (read-only seed from the global scope happens in AnalyticsV2, passed as
// `seed`). `isMultiSchool=false` clamps every scope to 'school'.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

export const SCOPES = ['school', 'compare', 'org']
export const VIEWS = ['overview', 'charts', 'scorecard']
const STORAGE_KEY = 'finrep.analytics.nav'

// Legacy scope alias — old links/storage may still carry scope=diocese; it maps to
// 'org'. This is the ONLY place the string 'diocese' survives in the v2 folder
// (code-only, never rendered).
const SCOPE_ALIASES = { diocese: 'org' }

function normalizeScope(raw) {
  return SCOPES.includes(raw) ? raw : SCOPE_ALIASES[raw] ?? null
}

function readStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!raw) return null
    const scope = normalizeScope(raw.scope) // migrates legacy stored scope names
    if (scope && VIEWS.includes(raw.view)) return { scope, view: raw.view }
  } catch {
    /* ignore */
  }
  return null
}
function writeStored(scope, view) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scope, view }))
  } catch {
    /* ignore */
  }
}

// Build the search string from a full nav state, applying the drop rules. Rebuilt
// from scratch every push, so leaving a scope automatically clears its scope-only
// params (school/schools) — they simply aren't re-emitted for the new scope.
function buildSearch({ scope, view, school, schools, highlight }) {
  const p = new URLSearchParams()
  if (scope && scope !== 'school') p.set('scope', scope)
  if (view && view !== 'overview') p.set('view', view)
  if (scope === 'school' && school) p.set('school', school)
  if (scope === 'compare' && schools && schools.length) p.set('schools', schools.join(','))
  if (highlight) p.set('highlight', highlight)
  return p
}

/**
 * @param {object} opts
 * @param {boolean} opts.isMultiSchool  false → every scope clamps to 'school'.
 * @param {boolean} opts.ready  TRUE once isMultiSchool is actually KNOWN (the org
 *        roster resolved). The mount normalization MUST wait for it: running while
 *        isMultiSchool is still its loading default (false) would clamp a
 *        ?scope=org deep link to school and REWRITE the URL — permanently locking
 *        the page out of the org/compare scopes (the inverse of the stuck bug).
 * @param {{scope?:string, school?:string, schools?:string[]}} opts.seed  read-only
 *        seed from the global scope (org→'org', else school+activeSchool).
 */
export function useAnalyticsNav({ isMultiSchool, ready = true, seed }) {
  const [params, setParams] = useSearchParams()
  const stored = useMemo(() => readStored(), [])

  const rawScope = params.get('scope')
  const rawView = params.get('view')
  const legacyMetric = params.get('metric') // pre-v2 drawer deep-link

  // Flips true once the mount normalization below has committed the resolved state
  // into the URL. Before that, render still falls back through storage/seed (so the
  // very first paint of a clean URL honors them); after it, the URL alone decides.
  const normalizedRef = useRef(false)

  // Effective scope: URL (alias-normalized) > [pre-normalization only: storage >
  // seed] > 'school'; clamped for single-school.
  let scope =
    normalizeScope(rawScope) ??
    (normalizedRef.current ? 'school' : stored?.scope ?? seed?.scope ?? 'school')
  if (!isMultiSchool) scope = 'school'

  // Per-scope last-view memory (survives scope switches within the session). Read
  // ONLY inside event handlers (setScope/go) — never during render — so the current
  // pair always comes from the URL. The ref is written in an effect below.
  const viewByScope = useRef({})

  // Effective view: URL > (legacy metric ⇒ scorecard) > [pre-normalization only:
  // storage for the resolved scope] > 'overview'. Scope switches restore per-scope
  // memory via the handlers, which push the remembered view onto the URL — so
  // render never needs to read the ref.
  let view
  if (VIEWS.includes(rawView)) view = rawView
  else if (legacyMetric) view = 'scorecard'
  else if (normalizedRef.current) view = 'overview'
  else view = (stored?.scope === scope ? stored?.view : null) ?? 'overview'

  const highlight = params.get('highlight') || legacyMetric || null
  const school = params.get('school') || seed?.school || null
  // Whether the compare selection came from an EXPLICIT ?schools= (a user chip pick)
  // vs. the roster seed — lets the parent apply a smart default only when unset.
  const schoolsExplicit = Boolean(params.get('schools'))
  const schools = useMemo(() => {
    const raw = params.get('schools')
    const fromUrl = raw ? raw.split(',').filter(Boolean) : null
    return fromUrl && fromUrl.length ? fromUrl : seed?.schools || (seed?.school ? [seed.school] : [])
  }, [params, seed])

  // Record memory + storage for the visible pair (write-during-effect, deferred).
  useEffect(() => {
    viewByScope.current[scope] = view
    writeStored(scope, view)
  }, [scope, view])

  // Mount normalization (replace, no history entry): fold (i) the legacy scope
  // alias, (ii) the legacy ?metric= deep-link → view=scorecard&highlight=, and
  // (iii) the storage/seed fallback into ONE explicit, self-describing URL. Only
  // URL-carried chip params are re-emitted (never the seed), so the canonical
  // clean URL stays clean and schoolsExplicit stays false until a real chip pick.
  useEffect(() => {
    if (!ready) return undefined // wait for a KNOWN isMultiSchool before committing
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      let nextScope =
        normalizeScope(params.get('scope')) ?? stored?.scope ?? seed?.scope ?? 'school'
      if (!isMultiSchool) nextScope = 'school'
      const urlView = params.get('view')
      const nextView = VIEWS.includes(urlView)
        ? urlView
        : legacyMetric
          ? 'scorecard'
          : (stored?.scope === nextScope ? stored?.view : null) ?? 'overview'
      const next = buildSearch({
        scope: nextScope,
        view: nextView,
        school: params.get('school') || null,
        schools: (params.get('schools') || '').split(',').filter(Boolean),
        highlight: params.get('highlight') || legacyMetric || null,
      })
      if (next.toString() !== params.toString()) setParams(next, { replace: true })
      normalizedRef.current = true
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyMetric, ready])

  const schoolsSig = schools.join(',')
  const current = { scope, view, school, schools, highlight }

  // The one push primitive: merge a patch onto the current state + PUSH history.
  const go = useCallback(
    (patch = {}) => {
      const next = { ...current, ...patch }
      if (!isMultiSchool) next.scope = 'school'
      // Switching scope with no explicit view restores that scope's remembered view.
      if (patch.scope && patch.view === undefined) {
        next.view = viewByScope.current[patch.scope] ?? 'overview'
      }
      // Changing view (without an explicit highlight) drops any stale highlight.
      if (patch.view !== undefined && patch.highlight === undefined) next.highlight = null
      setParams(buildSearch(next))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, view, school, schoolsSig, highlight, isMultiSchool, setParams],
  )

  const setScope = useCallback((next) => go({ scope: next }), [go])
  const setView = useCallback((next) => go({ view: next }), [go])
  const setSchool = useCallback((id) => go({ scope: 'school', school: id }), [go])
  const setSchools = useCallback((ids) => go({ scope: 'compare', schools: ids }), [go])

  // Strip the highlight in place (replace, no history entry) — used after a cross-
  // link flash lands, mirroring v1's ?metric= self-strip.
  const clearHighlight = useCallback(() => {
    if (!highlight) return
    setParams(buildSearch({ ...current, highlight: null }), { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, setParams, scope, view, school, schoolsSig])

  return { scope, view, school, schools, schoolsExplicit, highlight, go, setScope, setView, setSchool, setSchools, clearHighlight }
}

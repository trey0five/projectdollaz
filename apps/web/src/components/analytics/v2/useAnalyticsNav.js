// ─────────────────────────────────────────────────────────────────────────────
// useAnalyticsNav — the analytics-v2 URL model. Clones ModuleTabs' `?tab=` idiom
// (useSearchParams, validate→default, push history) but over the TWO analytics axes
// plus the chip selections:
//
//   ?scope=school|compare|diocese   (dropped when =school — the canonical default)
//   &view=overview|charts|scorecard (dropped when =overview)
//   &school=<id>                    (school scope only)
//   &schools=<id>,<id>              (compare scope only, min 1)
//   &highlight=<metricKey>          (a scorecard row to scroll+flash)
//
// Canonical clean URL = /analytics (school + overview, no chips). Every change
// PUSHes history so the back button walks the trail. Per-scope last-view MEMORY
// lives in a ref (viewByScope): switching scope restores the view you last had in
// it. Storage persists the last {scope,view} as the fallback when the URL is clean;
// URL always WINS over storage. The legacy ?metric=<key> drawer deep-link resolves
// to view=scorecard&highlight=<key> (normalized once on mount).
//
// The hook never writes ScopeContext — analytics owns its scope space in the URL
// only (read-only seed from the global scope happens in AnalyticsV2, passed as
// `seed`). `isMultiSchool=false` clamps every scope to 'school'.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

export const SCOPES = ['school', 'compare', 'diocese']
export const VIEWS = ['overview', 'charts', 'scorecard']
const STORAGE_KEY = 'finrep.analytics.nav'

function readStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (raw && SCOPES.includes(raw.scope) && VIEWS.includes(raw.view)) return raw
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
 * @param {{scope?:string, school?:string, schools?:string[]}} opts.seed  read-only
 *        seed from the global scope (org→diocese, else school+activeSchool).
 */
export function useAnalyticsNav({ isMultiSchool, seed }) {
  const [params, setParams] = useSearchParams()
  const stored = useMemo(() => readStored(), [])

  const rawScope = params.get('scope')
  const rawView = params.get('view')
  const legacyMetric = params.get('metric') // pre-v2 drawer deep-link

  // Effective scope: URL > storage > seed > 'school'; clamped for single-school.
  let scope = SCOPES.includes(rawScope) ? rawScope : stored?.scope ?? seed?.scope ?? 'school'
  if (!isMultiSchool) scope = 'school'

  // Per-scope last-view memory (survives scope switches within the session). Read
  // ONLY inside event handlers (setScope/go) — never during render — so the current
  // pair always comes from the URL. The ref is written in an effect below.
  const viewByScope = useRef({})

  // Effective view: URL > (legacy metric ⇒ scorecard) > storage (seeded scope) >
  // 'overview'. Scope switches restore per-scope memory via the handlers, which push
  // the remembered view onto the URL — so render never needs to read the ref.
  let view
  if (VIEWS.includes(rawView)) view = rawView
  else if (legacyMetric) view = 'scorecard'
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

  // Normalize the legacy ?metric= deep-link → ?view=scorecard&highlight= (replace,
  // once), so a manual refresh/close doesn't reopen and the URL reads canonically.
  useEffect(() => {
    if (!legacyMetric) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      const next = buildSearch({ scope, view: 'scorecard', school, schools, highlight: legacyMetric })
      setParams(next, { replace: true })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyMetric])

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

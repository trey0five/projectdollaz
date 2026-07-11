// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsV2 — the Phase-D analytics shell. Owns its OWN scope space (the global
// School↔Org ScopeToggle is suppressed on /analytics; seeded read-only from it on
// mount, never written back). Composes: back-to-dashboard + breadcrumb, the
// persistent AnalyticsScopeBar (scope × chips × school-year), the AnalyticsSubTabs
// (Overview·Charts·Scorecard), and the active (scope × view) panel. Data comes from
// the existing per-school engine (useAnalytics), the org roll-up (useOrgMetrics),
// and the Phase-D per-school compare endpoint (useCompareMetrics) — every number a
// @finrep/analytics MetricResult, so Overview tile = Scorecard row = chart center.
//
// Cross-link: a Scorecard "chart →" sets pendingFlash + switches to Charts; an
// effect keyed on (view, pendingFlash) scrolls+flashes the anchored card once it's
// in the DOM. A chart "view as table" pushes ?view=scorecard&highlight=<key>, which
// the Scorecard scrolls+flashes then strips. Reduced-motion → instant scroll + a
// static ring (analytics-v2.css).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, BarChart3 } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { useScope } from '../../../context/ScopeContext.jsx'
import { useSchools } from '../../../context/SchoolContext.jsx'
import { useBilling } from '../../../context/BillingContext.jsx'
import { orgsApi } from '../../../lib/api.js'
import { useAnalytics, useOrgMetrics, useCompareMetrics, useDashboardLayout } from '../../../hooks/useAnalytics.js'
import { metricLabel } from '../../../lib/metricMeta.js'
import EntitlementPausedPanel from '../EntitlementPausedPanel.jsx'
import '../../../styles/analytics-v2.css'
import { useAnalyticsNav } from './useAnalyticsNav.js'
import { useSchoolPeriods, useSparkTrends, useMultiSchoolTrends } from './data.js'
import { fyOptionsFromPeriods, fyLabelOf } from './helpers.js'
import { chartAnchorFor } from './chartAnchors.js'
import { flashElement } from './flash.js'
import AnalyticsScopeBar from './AnalyticsScopeBar.jsx'
import AnalyticsSubTabs from './AnalyticsSubTabs.jsx'
import OverviewView from './OverviewView.jsx'
import ChartsView from './ChartsView.jsx'
import ScorecardView from './ScorecardView.jsx'

const SCHOOL_TREND_KEYS = [
  'operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency', 'enrollment_change_yoy',
]
const DEFAULT_COLS = [
  'operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency',
  'cost_per_pupil', 'net_tuition_per_student', 'pct_students_on_aid', 'tuition_discount_rate',
]

export default function AnalyticsV2() {
  const reduce = useReducedMotion()
  const { scope: globalScope, isMultiSchool, orgId } = useScope()
  const { activeSchool } = useSchools()
  const { loading: billingLoading, entitled, isOwner } = useBilling()

  // Roster (id + name) — the chip source (same call ScopeContext uses).
  const [roster, setRoster] = useState([])
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled || !activeSchool?.id) return
      try {
        const res = await orgsApi.me()
        if (cancelled) return
        const list = Array.isArray(res.data?.schools) ? res.data.schools.map((s) => ({ id: s.id, name: s.name })) : []
        setRoster(list)
      } catch {
        if (!cancelled) setRoster([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeSchool?.id])

  // Read-only seed from the global scope (org→diocese, else school+activeSchool).
  // seed.schools is EMPTY so entering compare (via click or bare URL) does NOT write
  // the whole roster to ?schools= — that keeps schoolsExplicit false and lets the
  // smart 5-schools-with-data default apply; a chip pick then sets it explicitly.
  const seed = useMemo(
    () => ({
      scope: globalScope === 'org' ? 'diocese' : 'school',
      school: activeSchool?.id ?? null,
      schools: [],
    }),
    [globalScope, activeSchool?.id],
  )

  const nav = useAnalyticsNav({ isMultiSchool, seed })
  const scopes = isMultiSchool ? ['school', 'compare', 'diocese'] : ['school']

  // ── School-year picker (drives school periodId + the org FY anchor) ──────────
  const primarySchool = nav.school || activeSchool?.id || null
  const { periods } = useSchoolPeriods(primarySchool)
  const fyOptions = useMemo(() => fyOptionsFromPeriods(periods), [periods])
  const [fiscalYearStart, setFiscalYearStart] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setFiscalYearStart((cur) => (cur == null && fyOptions.length ? fyOptions[0].start : cur))
    })
    return () => {
      cancelled = true
    }
  }, [fyOptions])
  const fyLabel = fiscalYearStart ? Number(fiscalYearStart.slice(0, 4)) + 1 : null
  const periodId = useMemo(() => {
    if (!periods.length) return null
    const inFy = periods.filter((p) => fyLabelOf(p.periodEndDate) === fyLabel)
    return (inFy[0] || periods[0]).id
  }, [periods, fyLabel])

  // ── Data reads (gated by scope so idle scopes don't fetch) ───────────────────
  const isSchool = nav.scope === 'school'
  const isCompare = nav.scope === 'compare'
  const isDiocese = nav.scope === 'diocese'
  const wantPerSchool = isCompare || isDiocese

  const { metrics } = useAnalytics(isSchool ? primarySchool : null, periodId)
  const sparkTrends = useSparkTrends(isSchool ? primarySchool : null, SCHOOL_TREND_KEYS)
  const { schools: compareAll } = useCompareMetrics(wantPerSchool ? orgId : null, fiscalYearStart || undefined)
  const { metrics: orgMetrics } = useOrgMetrics(isDiocese ? orgId : null, fiscalYearStart || undefined)
  const { layout } = useDashboardLayout(primarySchool)

  const metricsByKey = useMemo(() => {
    const map = {}
    for (const m of metrics) map[m.key] = m
    return map
  }, [metrics])

  // Attach seriesIndex = roster index (colour follows the school, never rank).
  const rosterIndex = useMemo(() => {
    const map = {}
    roster.forEach((r, i) => (map[r.id] = i))
    return map
  }, [roster])
  const perSchool = useMemo(
    () => compareAll.map((s) => ({ ...s, seriesIndex: rosterIndex[s.schoolId] ?? 0 })),
    [compareAll, rosterIndex],
  )

  // Compare subset. An EXPLICIT chip selection (?schools=) is honored as-is (never
  // capped, min 1). With no explicit pick we DON'T flood the charts with the whole
  // roster: default to schools that actually carry data (a finite cash or margin),
  // primary school first, capped at 5 — so a seed org full of empty test schools
  // shows a clean handful. The user can still add more via chips.
  const selectedSchools = useMemo(() => {
    const present = new Set(perSchool.map((s) => s.schoolId))
    if (nav.schoolsExplicit) {
      const chosen = nav.schools.filter((id) => present.has(id))
      const ids = chosen.length ? chosen : perSchool.map((s) => s.schoolId)
      return perSchool.filter((s) => ids.includes(s.schoolId))
    }
    const hasData = (s) =>
      Number.isFinite(s.metrics?.days_cash_on_hand?.value) ||
      Number.isFinite(s.metrics?.operating_margin?.value)
    const pool = perSchool.filter(hasData)
    const ranked = (pool.length ? pool : perSchool)
      .slice()
      .sort((a, b) => (a.schoolId === primarySchool ? -1 : 0) - (b.schoolId === primarySchool ? -1 : 0))
    const ids = new Set(ranked.slice(0, 5).map((s) => s.schoolId))
    return perSchool.filter((s) => ids.has(s.schoolId))
  }, [perSchool, nav.schools, nav.schoolsExplicit, primarySchool])

  // Multi-school trend fan-out for the compare/diocese time charts (real /trends).
  const trendIds = useMemo(() => {
    if (isCompare) return selectedSchools.map((s) => s.schoolId)
    if (isDiocese) return perSchool.map((s) => s.schoolId)
    return []
  }, [isCompare, isDiocese, selectedSchools, perSchool])
  const trends = useMultiSchoolTrends(trendIds, 'days_cash_on_hand')

  // Scorecard columns = the user's visible-metric set (shared by all three tables).
  const columns = useMemo(() => {
    const keys = layout && layout.length ? layout.filter((i) => i.visible).map((i) => i.metricKey) : DEFAULT_COLS
    return keys.map((k) => ({ key: k, label: metricLabel(k) }))
  }, [layout])

  // ── Cross-link flash: Scorecard → Charts (transient pendingFlash ref) ────────
  const [pendingFlash, setPendingFlash] = useState(null)
  const onCrossToChart = (metricKey) => {
    const a = chartAnchorFor(metricKey)
    if (!a) return
    setPendingFlash(a.anchorId)
    nav.setView('charts')
  }
  const flashCleanup = useRef(() => {})
  useEffect(() => {
    if (nav.view !== 'charts' || !pendingFlash) return undefined
    const t = window.setTimeout(() => {
      flashCleanup.current = flashElement(pendingFlash, reduce)
      setPendingFlash(null)
    }, 90)
    return () => {
      window.clearTimeout(t)
      flashCleanup.current?.()
    }
  }, [nav.view, pendingFlash, reduce])

  const onCrossToTable = (metricKey) => nav.go({ view: 'scorecard', highlight: metricKey })

  // ── Shaped context per scope ─────────────────────────────────────────────────
  const schoolCtx = { id: primarySchool, periodId, metrics, metricsByKey, sparkTrends }
  const compareCtx = { schools: selectedSchools, trends }
  const dioceseCtx = { schools: perSchool, orgMetrics, trends }

  const canCustomize = isOwner && entitled

  if (!billingLoading && !entitled) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
        <Shell />
        <EntitlementPausedPanel />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
      <Shell />

      <AnalyticsScopeBar
        scopes={scopes}
        scope={nav.scope}
        onScope={nav.setScope}
        roster={roster}
        school={primarySchool}
        onSchool={nav.setSchool}
        selectedSchools={selectedSchools.map((s) => s.schoolId)}
        onToggleSchool={(id) => {
          const cur = selectedSchools.map((s) => s.schoolId)
          const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
          nav.setSchools(next.length ? next : cur) // keep min 1
        }}
        fyOptions={fyOptions}
        fiscalYearStart={fiscalYearStart}
        onFy={setFiscalYearStart}
      />

      <AnalyticsSubTabs view={nav.view} onView={nav.setView} />

      <div role="tabpanel" id="av2-panel" aria-labelledby={`av2-subtab-${nav.view}`} className="pt-5">
        {nav.view === 'overview' && (
          <OverviewView scope={nav.scope} school={schoolCtx} compare={compareCtx} diocese={dioceseCtx} />
        )}
        {nav.view === 'charts' && (
          <ChartsView scope={nav.scope} school={schoolCtx} compare={compareCtx} diocese={dioceseCtx} onCrossToTable={onCrossToTable} />
        )}
        {nav.view === 'scorecard' && (
          <ScorecardView
            scope={nav.scope}
            school={schoolCtx}
            compare={compareCtx}
            diocese={dioceseCtx}
            columns={columns}
            canCustomize={canCustomize}
            onCrossToChart={onCrossToChart}
            highlight={nav.highlight}
            onHighlightConsumed={nav.clearHighlight}
          />
        )}
      </div>
    </div>
  )
}

function Shell() {
  return (
    <div className="mb-4">
      <Link
        to="/app"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-navy"
      >
        ← Back to dashboard
      </Link>
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-[12.5px] text-muted">
        <Link to="/app" className="hover:text-navy">Home</Link>
        <ChevronRight size={13} />
        <span className="font-semibold text-navy">Analytics</span>
      </nav>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
          <BarChart3 size={20} />
        </span>
        <div>
          <h1 className="font-serif text-xl font-semibold text-navy sm:text-2xl">Analytics</h1>
          <p className="text-[14px] text-muted">One school, any school, or the whole diocese — the story, the graphs, the metrics.</p>
        </div>
      </div>
    </div>
  )
}

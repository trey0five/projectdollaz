import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, PieChart } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useBilling } from '../../context/BillingContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import {
  useAnalytics,
  useDashboardLayout,
} from '../../hooks/useAnalytics.js'
import { analyticsApi, apiErrorMessage } from '../../lib/api.js'
import { isMixMetric, metricDomain } from '../../lib/metricMeta.js'
import ContextBar from './ContextBar.jsx'
import HeroVitals from './HeroVitals.jsx'
import PeriodComparison from './PeriodComparison.jsx'
import MetricGrid from './MetricGrid.jsx'
import MetricSection from './MetricSection.jsx'
import MetricDrawer from './MetricDrawer.jsx'
import MixDonut from './MixDonut.jsx'
import EntitlementPausedPanel from './EntitlementPausedPanel.jsx'
import ReservedSlotCard from './ReservedSlotCard.jsx'
import CustomizeBar from './CustomizeBar.jsx'
import CustomizePanel from './CustomizePanel.jsx'
import {
  MetricCardSkeleton,
  DonutSkeleton,
  HeadlineSkeleton,
} from './skeletons.jsx'

// Vital metrics shown as large hero tiles — exactly the band-bearing financial
// health metrics. Hero treatment derives from this set BUT is reconciled against
// the saved 4C layout (visibility + order) below, so a hidden vital never appears.
const VITAL_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve']

// Scalar metric keys whose sparklines we fetch up-front (hero + compact cards).
const SPARK_KEYS = [
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'tuition_dependency',
  'cost_per_pupil',
  'net_tuition_per_student',
  'financial_aid_per_student',
  'aid_per_aided_student',
  'tuition_discount_rate',
  'pct_students_on_aid',
]

// Default scalar order (Tier-1 then Tier-2) — fallback when no saved layout.
const DEFAULT_KEYS = [
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'tuition_dependency',
  'revenue_mix',
  'expense_mix',
  'cost_per_pupil',
  'net_tuition_per_student',
  'financial_aid_per_student',
  'aid_per_aided_student',
  'tuition_discount_rate',
  'pct_students_on_aid',
  // Enrollment domain (thin wedge) — appended last, mirrors METRIC_KEYS order.
  'enrollment_change_yoy',
  // HR domain (page-less module) — appended last, mirrors METRIC_KEYS order.
  'student_teacher_ratio',
]

// Compact cards are grouped BY DOMAIN into these ordered sections. Enrollment leads
// (most-scannable, and the thin-wedge focus). A section only renders when it has at
// least one visible card — matching the existing "section only when items>0" rule.
// Any non-vital, non-mix finance key falls into "Financial (Other)".
const DOMAIN_SECTIONS = [
  { domain: 'enrollment', title: 'Enrollment' },
  // People & Staffing (HR) — a page-less module; the section renders only when the
  // school licenses hr (the gated metric is present in the API response) AND that
  // metric survives the layout filter. An unlicensed school's gated key is stripped
  // from the response, so the render loop's metricsByKey intersection drops it.
  { domain: 'hr', title: 'People & Staffing' },
  { domain: 'aid', title: 'Tuition & Aid' },
  { domain: 'operations', title: 'Operations' },
  { domain: 'finance', title: 'Financial (Other)' },
]

function PageHeader() {
  return (
    <div className="mb-5">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted transition-colors hover:text-gold"
      >
        <ArrowLeft size={15} /> Back to dashboard
      </Link>
      <div className="flex items-center gap-2.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
          <BarChart3 size={22} />
        </span>
        <div>
          <h1 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
            Financial Insights
          </h1>
          <p className="text-[15px] text-muted">
            At-a-glance metrics from your saved statements.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsDashboard() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const { loading: billingLoading, entitled, isOwner } = useBilling()
  const { periods, hydrating } = usePersistence()

  const savedPeriods = useMemo(
    () => (periods || []).filter((p) => p.hasSnapshot),
    [periods],
  )

  const [selectedPeriodId, setSelectedPeriodId] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (savedPeriods.length === 0) {
        setSelectedPeriodId((cur) => (cur === null ? cur : null))
      } else {
        setSelectedPeriodId((cur) =>
          savedPeriods.some((p) => p.id === cur) ? cur : savedPeriods[0].id,
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [savedPeriods])

  const { data, metrics, loading: metricsLoading, notEntitled, reload: reloadMetrics } =
    useAnalytics(schoolId, selectedPeriodId)

  // Penny autonomous-write refresh: a write that affects metrics broadcasts a
  // 'penny:data-changed' signal — re-pull the analytics so the cards reflect it.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'metrics') reloadMetrics()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [reloadMetrics])

  // Sparkline trends for the cards (fetched once per school).
  const [sparkTrends, setSparkTrends] = useState({})
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled || !schoolId) return
      try {
        const results = await Promise.all(
          SPARK_KEYS.map((k) =>
            analyticsApi
              .trends(schoolId, k)
              .then((r) => [k, r.data])
              .catch(() => [k, null]),
          ),
        )
        if (cancelled) return
        const map = {}
        for (const [k, v] of results) if (v) map[k] = v
        setSparkTrends(map)
      } catch {
        if (!cancelled) setSparkTrends({})
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, savedPeriods.length])

  // ── Phase 4C: per-school dashboard layout + customize mode ─────────────────
  const {
    layout: savedLayout,
    loading: layoutLoading,
    save: saveLayout,
    reset: resetLayout,
  } = useDashboardLayout(schoolId)

  const [customizing, setCustomizing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [savingLayout, setSavingLayout] = useState(false)
  const [layoutError, setLayoutError] = useState('')

  const enterCustomize = () => {
    if (!savedLayout) return
    setDraft(savedLayout.map((i) => ({ ...i })))
    setLayoutError('')
    setCustomizing(true)
  }
  const cancelCustomize = () => {
    setDraft(null)
    setLayoutError('')
    setCustomizing(false)
  }
  const dirty = useMemo(
    () =>
      customizing &&
      draft != null &&
      JSON.stringify(draft) !== JSON.stringify(savedLayout ?? []),
    [customizing, draft, savedLayout],
  )
  const onSaveLayout = async () => {
    if (!draft) return
    setSavingLayout(true)
    setLayoutError('')
    try {
      await saveLayout(draft)
      setCustomizing(false)
      setDraft(null)
    } catch (e) {
      setLayoutError(apiErrorMessage(e, 'Could not save your layout.'))
    } finally {
      setSavingLayout(false)
    }
  }
  const onResetLayout = async () => {
    setSavingLayout(true)
    setLayoutError('')
    try {
      await resetLayout()
      setCustomizing(false)
      setDraft(null)
    } catch (e) {
      setLayoutError(apiErrorMessage(e, 'Could not reset your layout.'))
    } finally {
      setSavingLayout(false)
    }
  }

  // The layout that drives rendering: live draft while customizing, else saved.
  const effectiveLayout = customizing && draft ? draft : savedLayout
  const canCustomize = isOwner && entitled

  const metricsByKey = useMemo(() => {
    const m = {}
    for (const r of metrics) m[r.key] = r
    return m
  }, [metrics])

  // ── Region derivation (PURE presentation over effectiveLayout) ─────────────
  // ONE rule everywhere: a metric is rendered only if visible in the layout, and
  // in layout order. Hidden => gone from hero, sections, AND donuts.
  const orderedVisibleKeys = useMemo(() => {
    if (effectiveLayout && effectiveLayout.length) {
      return effectiveLayout
        .filter((i) => i.visible)
        .map((i) => ({ key: i.metricKey, span: i.span ?? 1 }))
    }
    return DEFAULT_KEYS.map((key) => ({ key, span: 1 }))
  }, [effectiveLayout])

  // Hero vitals = visible band metrics, in layout order.
  const vitalKeys = useMemo(
    () => orderedVisibleKeys.filter((i) => VITAL_KEYS.includes(i.key)).map((i) => i.key),
    [orderedVisibleKeys],
  )

  // Compact section cards = visible, non-vital, non-mix metrics, in layout order.
  const sectionItems = useMemo(
    () =>
      orderedVisibleKeys.filter(
        (i) => !VITAL_KEYS.includes(i.key) && !isMixMetric(i.key),
      ),
    [orderedVisibleKeys],
  )

  // Flattened compact cards for the ONE dense grid: cluster by DOMAIN_SECTIONS order
  // so groups still read together, tag each card with its category eyebrow, and
  // intersect with metricsByKey so gated (absent) metrics drop. Within-group layout
  // order is preserved (sectionItems is already ordered). No section header per
  // domain → a lone-category card never wastes a full row.
  const flatSectionItems = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const { domain, title } of DOMAIN_SECTIONS) {
      for (const it of sectionItems) {
        if (seen.has(it.key)) continue
        if (metricDomain(it.key) !== domain || !metricsByKey[it.key]) continue
        seen.add(it.key)
        out.push({ ...it, category: title })
      }
    }
    // Any visible card whose domain isn't in DOMAIN_SECTIONS still renders (untagged),
    // in layout order, so nothing silently disappears.
    for (const it of sectionItems) {
      if (seen.has(it.key) || !metricsByKey[it.key]) continue
      seen.add(it.key)
      out.push({ ...it })
    }
    return out
  }, [sectionItems, metricsByKey])

  // Donuts = revenue_mix / expense_mix, visibility-driven, in layout order.
  const donutKeys = useMemo(
    () => orderedVisibleKeys.filter((i) => isMixMetric(i.key)).map((i) => i.key),
    [orderedVisibleKeys],
  )

  // ── Drill-down drawer ──────────────────────────────────────────────────────
  const [drawerKey, setDrawerKey] = useState(null)
  const drawerMetric = drawerKey ? metricsByKey[drawerKey] : null
  // Don't let the drawer open over customize mode (edits stay focused).
  const openDrawer = (key) => {
    if (customizing) return
    setDrawerKey(key)
  }
  const closeDrawer = () => setDrawerKey(null)

  // Deep link from the home command center: /analytics?metric=<key> preselects
  // and opens that metric's drawer once its data has loaded, then strips the
  // param (so a manual close/refresh doesn't reopen). Microtask-deferred so no
  // setState fires synchronously in the effect body.
  const [searchParams, setSearchParams] = useSearchParams()
  const metricDeepLinkHandled = useRef(false)
  useEffect(() => {
    const wanted = searchParams.get('metric')
    if (!wanted || metricDeepLinkHandled.current) return
    if (customizing || !metricsByKey[wanted]) return
    metricDeepLinkHandled.current = true
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setDrawerKey(wanted)
      const next = new URLSearchParams(searchParams)
      next.delete('metric')
      setSearchParams(next, { replace: true })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, metricsByKey, customizing])

  // ── Entitlement gate ───────────────────────────────────────────────────────
  if (!billingLoading && (!entitled || notEntitled)) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
        <PageHeader />
        <EntitlementPausedPanel />
      </div>
    )
  }

  const initialLoading = billingLoading || hydrating

  if (!initialLoading && savedPeriods.length === 0) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
        <PageHeader />
        <div className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">No saved statements yet.</p>
          <p className="mt-1 text-[15px] text-muted">
            Generate and save a period on the dashboard to see your insights.
          </p>
          <Link to="/" className="btn-primary mt-6">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const showSkeleton = initialLoading || layoutLoading || (metricsLoading && !data)
  const dimWhileCustomizing = customizing ? 'pointer-events-none opacity-50' : ''

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
      <PageHeader />

      {!showSkeleton && (
        // id anchors Penny's "customize your dashboard" glide (the Customize entry
        // lives in the ContextBar).
        <div id="analytics-customize-bar">
          <ContextBar
            periods={savedPeriods}
            activePeriodId={selectedPeriodId}
            onSelectPeriod={setSelectedPeriodId}
            freshness={data?.freshness}
            canCustomize={canCustomize}
            customizing={customizing}
            onCustomize={enterCustomize}
          />
        </div>
      )}

      <AnimatePresence initial={false}>
        {customizing && draft && (
          <motion.div
            key="customize"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <CustomizeBar
              dirty={dirty}
              saving={savingLayout}
              error={layoutError}
              onSave={onSaveLayout}
              onCancel={cancelCustomize}
              onReset={onResetLayout}
            />
            <div className="mb-6">
              <CustomizePanel draft={draft} onChange={setDraft} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showSkeleton ? (
        <div className="space-y-5 sm:space-y-6">
          <HeadlineSkeleton />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <DonutSkeleton />
            <DonutSkeleton />
          </div>
        </div>
      ) : (
        <div className="space-y-5 sm:space-y-7">
          {/* HERO VITALS (id anchors Penny's "your at-a-glance insights" glide). */}
          {vitalKeys.length > 0 && (
            <div id="analytics-ai-insight" className={dimWhileCustomizing}>
              <HeroVitals
                vitalKeys={vitalKeys}
                metricsByKey={metricsByKey}
                trendsByKey={sparkTrends}
                periodKey={selectedPeriodId}
                onOpen={openDrawer}
              />
            </div>
          )}

          {/* Period-over-period comparison table (Phase 3) */}
          <div className={dimWhileCustomizing}>
            <PeriodComparison metrics={metrics} />
          </div>

          {/* COMPACT metrics — ONE continuous dense grid that fills the width.
              Grouping meaning (Enrollment / People & Staffing / Tuition & Aid /
              Operations / Financial) is preserved by CLUSTERING each domain's cards
              together in DOMAIN_SECTIONS order and tagging every card with a small
              category eyebrow — so a single-metric domain no longer strands an empty
              row. Each card is intersected with metricsByKey (the GATED API
              response): a module-gated metric is absent entirely and simply drops;
              a licensed-but-no-data metric IS present and renders its unavailable
              card. Within a domain, layout order is preserved (flatSectionItems is
              already ordered). */}
          {flatSectionItems.length > 0 && (
            <div className={dimWhileCustomizing}>
              <MetricSection title="Key Metrics">
                <div className="bg-page-glow bg-no-repeat">
                  <MetricGrid
                    items={flatSectionItems}
                    metricsByKey={metricsByKey}
                    trendsByKey={sparkTrends}
                    periodKey={selectedPeriodId}
                    onOpen={openDrawer}
                  />
                </div>
              </MetricSection>
            </div>
          )}

          {/* REVENUE & EXPENSE MIX donuts */}
          {donutKeys.length > 0 && (
            <div className={dimWhileCustomizing}>
              <MetricSection title="Revenue & Expense Mix">
                <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
                  {donutKeys.includes('revenue_mix') && (
                    <DonutCard
                      title="Revenue Mix"
                      icon={<PieChart size={17} />}
                      metric={metricsByKey.revenue_mix}
                      onOpen={() => openDrawer('revenue_mix')}
                    />
                  )}
                  {donutKeys.includes('expense_mix') && (
                    <DonutCard
                      title="Expense Mix"
                      icon={<BarChart3 size={17} />}
                      metric={metricsByKey.expense_mix}
                      onOpen={() => openDrawer('expense_mix')}
                    />
                  )}
                </div>
              </MetricSection>
            </div>
          )}

          {/* Phase 5 reserved slot */}
          <div className={dimWhileCustomizing}>
            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <ReservedSlotCard
                title="Peer benchmarking"
                phase="Phase 5"
                subtitle="Compare your metrics against similar schools — coming soon."
              />
            </div>
          </div>
        </div>
      )}

      <MetricDrawer
        schoolId={schoolId}
        metric={drawerMetric}
        open={Boolean(drawerMetric)}
        onClose={closeDrawer}
      />
    </div>
  )
}

function DonutCard({ title, icon, metric, onOpen }) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="card-vital w-full p-4 text-left sm:p-5"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
          {icon}
        </span>
        <h3 className="font-serif text-base font-semibold text-navy sm:text-lg">{title}</h3>
      </div>
      <MixDonut metric={metric} />
    </motion.button>
  )
}

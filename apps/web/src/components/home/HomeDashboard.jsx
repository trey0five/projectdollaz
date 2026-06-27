// ─────────────────────────────────────────────────────────────────────────────
// Home command center (IA overhaul). The hybrid landing page at '/': a hero/
// context band, a live health-graded vitals row + compliance tile, feature-
// gateway navigation tiles, and a recent-periods strip — all reusing the existing
// analytics/compliance hooks and components. No new endpoints; presentation only.
//
// Period selection mirrors AnalyticsDashboard exactly (microtask-deferred default
// to savedPeriods[0]). Entitlement-gated, skeleton-loaded, empty/onboarding aware.
// AppContext/useApp is intentionally NOT used here (that lives on /statements).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { FileText, ArrowRight, Compass, Database } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useBilling } from '../../context/BillingContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { useAnalytics, useInsights } from '../../hooks/useAnalytics.js'
import { useCompliance } from '../../hooks/useCompliance.js'
import { analyticsApi } from '../../lib/api.js'
import EntitlementPausedPanel from '../analytics/EntitlementPausedPanel.jsx'
import { HeadlineSkeleton, MetricCardSkeleton } from '../analytics/skeletons.jsx'
import HomeHero from './HomeHero.jsx'
import BoardPacketExportButton from '../reports/BoardPacketExportButton.jsx'
import HomeVitals from './HomeVitals.jsx'
import FeatureGateway from './FeatureGateway.jsx'
import RecentPeriods from './RecentPeriods.jsx'

const VITAL_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve']

function EmptyOnboarding({ schoolName, billing, isOwner }) {
  const reduce = useReducedMotion()
  return (
    <div className="space-y-5 sm:space-y-8">
      <HomeHero
        schoolName={schoolName}
        periods={[]}
        selectedPeriodId={null}
        onSelectPeriod={() => {}}
        statusLine="Let's get your first set of statements on the board."
        billing={billing}
        isOwner={isOwner}
      />
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="card-soft flex flex-col items-center gap-5 px-6 py-14 text-center"
      >
        <motion.span
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow"
          animate={reduce ? undefined : { y: [0, -10, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <FileText size={34} />
        </motion.span>
        <div>
          <h2 className="font-serif text-2xl font-semibold text-navy">Get started</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
            Upload your first trial balance to generate the four financial statements,
            unlock analytics, and run your review-readiness checks.
          </p>
        </div>
        <Link to="/statements" className="btn-primary inline-flex items-center gap-2">
          Upload your first trial balance <ArrowRight size={16} />
        </Link>
      </motion.div>
    </div>
  )
}

// Fancy on-theme divider that visually separates the Explore and Recent-periods
// sections — a gold gradient hairline fading into a small diamond at center.
// Prominent pointer to the unified Data hub — the one place to import/enter every
// kind of data. Shown on the home page so users always know where to add data.
function DataHubBanner() {
  return (
    <Link
      to="/data"
      className="group flex items-center gap-4 rounded-2xl border-2 border-gold/40 bg-gradient-to-r from-gold/[0.08] to-transparent px-5 py-4 shadow-card transition-all hover:border-gold/70 hover:shadow-glow"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
        <Database size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-base font-semibold text-navy">
          Get all your numbers in one place
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
          Trial balances, monthly actuals, budget, enrollment and more — the Data hub walks you
          through exactly what to add, with a friendly guide to help.
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-bold uppercase tracking-[0.08em] text-gold sm:inline-flex">
        Go to Data hub
        <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

function SectionDivider() {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/40" />
      <span className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-gold/70 shadow-[0_0_8px_rgba(184,150,80,0.5)]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/40" />
    </div>
  )
}

export default function HomeDashboard() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const { billing, loading: billingLoading, entitled, isOwner } = useBilling()
  const { periods, hydrating } = usePersistence()

  const savedPeriods = useMemo(
    () => (periods || []).filter((p) => p.hasSnapshot),
    [periods],
  )

  // A revision token over the saved-period set (ids + snapshot flag + end date).
  // Keying the sparkline-trends fetch on this — rather than just the count —
  // refreshes the trends when a period is added, removed, OR re-saved (its end
  // date changes), not only when the count changes.
  const periodsRevision = useMemo(
    () => savedPeriods.map((p) => `${p.id}:${p.hasSnapshot}:${p.periodEndDate}`).join('|'),
    [savedPeriods],
  )

  // Default to the newest saved period (same microtask-deferred pattern as
  // AnalyticsDashboard to satisfy react-hooks/set-state-in-effect).
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

  const { data, metrics, loading: metricsLoading, notEntitled } = useAnalytics(
    schoolId,
    selectedPeriodId,
  )
  const { text: insightText, source: insightSource } = useInsights(schoolId, selectedPeriodId)
  const { summary: complianceSummary, loading: complianceLoading } = useCompliance(
    schoolId,
    selectedPeriodId,
  )

  // Sparkline trends for the 3 vital keys only (cheap subset).
  const [sparkTrends, setSparkTrends] = useState({})
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled || !schoolId) return
      try {
        const results = await Promise.all(
          VITAL_KEYS.map((k) =>
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
  }, [schoolId, periodsRevision])

  const metricsByKey = useMemo(() => {
    const m = {}
    for (const r of metrics) m[r.key] = r
    return m
  }, [metrics])

  // Compose the hero status line: prefer the AI insight, else a compliance summary.
  const statusLine = useMemo(() => {
    if (insightText) return insightText
    if (complianceSummary) {
      const material = complianceSummary.counts?.material ?? 0
      const reportable = complianceSummary.counts?.reportable ?? 0
      if (material > 0) return `${material} material finding${material === 1 ? '' : 's'} to address before review.`
      if (reportable > 0) return `${reportable} reportable item${reportable === 1 ? '' : 's'} to review.`
      return 'On track for review — no exceptions found.'
    }
    return null
  }, [insightText, complianceSummary])

  const initialLoading = billingLoading || hydrating

  // ── Entitlement gate (mirror AnalyticsDashboard) ───────────────────────────
  if (!billingLoading && (!entitled || notEntitled)) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-10 sm:py-8">
        <HomeHero
          schoolName={activeSchool?.name}
          periods={[]}
          selectedPeriodId={null}
          onSelectPeriod={() => {}}
          statusLine={null}
          billing={billing}
          isOwner={isOwner}
        />
        <EntitlementPausedPanel />
      </div>
    )
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
        <HeadlineSkeleton />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  // ── Empty / onboarding ─────────────────────────────────────────────────────
  if (savedPeriods.length === 0) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-10 sm:py-8">
        <EmptyOnboarding schoolName={activeSchool?.name} billing={billing} isOwner={isOwner} />
        <div className="mt-6">
          <DataHubBanner />
        </div>
        <div className="mt-8">
          <FeatureGateway
            savedPeriodCount={0}
            metricCount={0}
            complianceSummary={null}
            billing={billing}
          />
        </div>
      </div>
    )
  }

  const vitalsLoading = metricsLoading && !data

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:space-y-8 sm:px-10 sm:py-8">
      <HomeHero
        schoolName={activeSchool?.name}
        periods={savedPeriods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={setSelectedPeriodId}
        statusLine={statusLine}
        insightKind={insightText ? insightSource : null}
        billing={billing}
        isOwner={isOwner}
      />

      {selectedPeriodId && (
        <div className="flex justify-end">
          <BoardPacketExportButton periodId={selectedPeriodId} />
        </div>
      )}

      <DataHubBanner />

      <HomeVitals
        metricsByKey={metricsByKey}
        trendsByKey={sparkTrends}
        periodKey={selectedPeriodId}
        loading={vitalsLoading}
        complianceSummary={complianceSummary}
        complianceLoading={complianceLoading}
      />

      <div>
        <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold text-navy">
          <Compass size={18} className="text-gold" /> Explore
        </h2>
        <FeatureGateway
          savedPeriodCount={savedPeriods.length}
          metricCount={metrics.length}
          complianceSummary={complianceSummary}
          billing={billing}
        />
      </div>

      <SectionDivider />

      <RecentPeriods periods={periods} />
    </div>
  )
}

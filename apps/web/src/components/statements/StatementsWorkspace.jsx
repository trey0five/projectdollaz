// ─────────────────────────────────────────────────────────────────────────────
// Statements & Periods workspace (the merge). Combines the saved-periods list
// (the old HistoryPanel) with the live statements workspace (the old AuthedShell
// AppProvider -> Dashboard tree). The two-mode model is PRESERVED, not rewritten:
//   • The NEWEST/active period IS the live editable workspace (intake -> generate
//     -> save) via AppProvider seeded with the hydrated files (verbatim wiring).
//   • Any OTHER saved period opens its stored canonical snapshot READ-ONLY via
//     reopenPeriod() -> ReportTabs (reproducibility preserved, no recompute).
// A `?period=<id>` deep link (from the home recent-periods strip) preselects a
// saved period on mount.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, FileStack, Database } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { formatShortDate, PERIOD_LABELS } from '../../lib/format.js'
import CreateSchoolForm from '../CreateSchoolForm.jsx'
import ReportTabs from '../reports/ReportTabs.jsx'
import SavedPeriodsRail from './SavedPeriodsRail.jsx'
import BackLink from '../ui/BackLink.jsx'

// Read-only statements view for one period (module scope — not an in-render def).
function StatementsView({ bundle, label, periodId, periodEndDate, periodType, school, onBack }) {
  return (
    <div className="card-soft overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-lg font-semibold text-navy">
            {label || 'Statements'}
          </h2>
          <p className="text-[14px] text-muted">
            {formatShortDate(periodEndDate)} · generated statements (read-only)
          </p>
        </div>
        {onBack && (
          <button type="button" onClick={onBack} className="btn-ghost shrink-0">
            Back to current
          </button>
        )}
      </div>
      <ReportTabs
        bundle={bundle}
        school={school}
        periodId={periodId}
        dateLabel={formatShortDate(periodEndDate)}
        periodLabel={PERIOD_LABELS[periodType] || ''}
      />
    </div>
  )
}

// Empty state — no snapshot for the active period yet; send them to the Data hub.
function NoStatementsCard() {
  return (
    <div className="card-soft flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
        <Database size={28} />
      </span>
      <div>
        <h2 className="font-serif text-xl font-semibold text-navy">No statements yet</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">
          Add your trial balance in the Data hub and we’ll generate your four financial statements
          right here.
        </p>
      </div>
      <Link to="/data" className="btn-primary inline-flex items-center gap-2">
        Go to the Data hub <ArrowRight size={16} />
      </Link>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        className="h-10 w-10 rounded-full border-4 border-gold/30 border-t-gold"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

export default function StatementsWorkspace() {
  const { schools, activeSchool, loading } = useSchools()
  const { periods, hydrating, activePeriod, latestSnapshot, reopenPeriod } = usePersistence()
  const [searchParams, setSearchParams] = useSearchParams()

  // Read-only reopen state for non-active saved periods.
  const [openId, setOpenId] = useState(null)
  const [openBundle, setOpenBundle] = useState(null)
  const [openPeriod, setOpenPeriod] = useState(null)
  const [loadingId, setLoadingId] = useState(null)

  const workspaceRef = useRef(null)

  const showLive = (period) => {
    setOpenId(null)
    setOpenBundle(null)
    setOpenPeriod(null)
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    if (period) void period
  }

  const openReadOnly = async (period) => {
    if (!period.hasSnapshot) return
    setLoadingId(period.id)
    const snapshot = await reopenPeriod(period.id)
    setLoadingId(null)
    if (snapshot) {
      setOpenBundle(snapshot.payload)
      setOpenId(period.id)
      setOpenPeriod(period)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const onSelectPeriod = (period) => {
    // Active/newest period -> the live editable workspace; others -> read-only.
    if (period.id === activePeriod?.id) showLive(period)
    else openReadOnly(period)
  }

  // Deep link: ?period=<id> preselects a saved period once hydration settles.
  // Side effects run in a deferred microtask (await-before-setState pattern) so
  // no setState is called synchronously inside the effect body.
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (hydrating || deepLinkHandled.current) return
    const wanted = searchParams.get('period')
    if (!wanted) return
    deepLinkHandled.current = true
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      const target = (periods || []).find((p) => p.id === wanted)
      const next = new URLSearchParams(searchParams)
      next.delete('period')
      setSearchParams(next, { replace: true })
      if (!target) return
      if (target.id === activePeriod?.id) showLive(target)
      else openReadOnly(target)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrating, periods, activePeriod, searchParams])

  if (loading) return <Splash />
  if (schools.length === 0) return <CreateSchoolForm />
  if (hydrating) return <Splash />

  return (
    <div className="mx-auto max-w-page bg-page-glow bg-no-repeat px-4 py-6 sm:px-10">
      <BackLink className="mb-4" />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
            <FileStack size={22} />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">
              Finance · Records
            </p>
            <h1 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
              Statements &amp; Periods
            </h1>
            <p className="text-[15px] text-muted">
              Your generated financial statements — view any period here. Add or update data in the
              Data hub.
            </p>
          </div>
        </div>
        <Link
          to="/data"
          className="btn-primary inline-flex shrink-0 items-center gap-1.5 self-start sm:self-auto"
        >
          <Database size={15} /> Go to Data hub
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        {/* Saved-periods rail */}
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-[224px]">
          <h2 className="mb-2.5 px-1 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
            Saved periods
          </h2>
          {periods.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-section px-4 py-8 text-center">
              <p className="font-serif text-[16px] italic text-muted">No saved periods yet.</p>
              <p className="mt-1 text-[14px] text-muted">
                Upload a trial balance and save to build your history.
              </p>
            </div>
          ) : (
            <SavedPeriodsRail
              periods={periods}
              activePeriodId={activePeriod?.id ?? null}
              selectedId={openId ?? activePeriod?.id ?? null}
              loadingId={loadingId}
              onSelect={onSelectPeriod}
            />
          )}
        </aside>

        {/* Read-only statements: a reopened older period, the active period's saved
            snapshot, or an empty state pointing to the Data hub. */}
        <section ref={workspaceRef} className="min-w-0 flex-1">
          {openId && openBundle ? (
            <StatementsView
              bundle={openBundle}
              label={openPeriod?.label}
              periodId={openPeriod?.id}
              periodEndDate={openPeriod?.periodEndDate}
              periodType={openPeriod?.periodType}
              school={activeSchool}
              onBack={() => showLive(null)}
            />
          ) : latestSnapshot?.payload ? (
            <StatementsView
              bundle={latestSnapshot.payload}
              label={activePeriod?.label}
              periodId={activePeriod?.id}
              periodEndDate={activePeriod?.periodEndDate}
              periodType={activePeriod?.periodType}
              school={activeSchool}
            />
          ) : (
            <NoStatementsCard />
          )}
        </section>
      </div>
    </div>
  )
}

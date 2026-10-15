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
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Database, CloudUpload, Loader2 } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { addDataHref } from '../../lib/dataDestinations.js'
import { formatShortDate, PERIOD_LABELS } from '../../lib/format.js'
import CreateSchoolForm from '../CreateSchoolForm.jsx'
import ReportTabs from '../reports/ReportTabs.jsx'
import SavedPeriodsRail from './SavedPeriodsRail.jsx'
import BackLink from '../ui/BackLink.jsx'
import { PageHeader, Section, Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'

// Read-only statements view for one period (module scope — not an in-render def).
// Premium UI P4: a Section on the ground — the period label + date as the
// label row, "Back to current" as its aside; the statements below on ink tabs.
function StatementsView({ bundle, label, periodId, periodEndDate, periodType, school, onBack }) {
  return (
    <Section
      label={`${label || 'Statements'} · ${formatShortDate(periodEndDate)} · read-only`}
      aside={
        onBack ? (
          <Button variant="quiet" size="sm" onClick={onBack} icon={<ArrowLeft size={13} />}>
            Back to current
          </Button>
        ) : null
      }
      className="!mt-0"
    >
      <ReportTabs
        bundle={bundle}
        school={school}
        periodId={periodId}
        dateLabel={formatShortDate(periodEndDate)}
        periodLabel={PERIOD_LABELS[periodType] || ''}
      />
    </Section>
  )
}

// Empty state — no snapshot for the active period yet; deep-link the add flow
// directly (flag-aware — never through the /data redirect, which strips params).
function NoStatementsCard({ addHref }) {
  return (
    <div className="b2-note">
      <Database size={22} aria-hidden="true" className="mx-auto text-ink2" />
      <p className="b2-note-title">No statements yet</p>
      <p className="mx-auto max-w-sm">
        Add your trial balance and we&rsquo;ll generate your four financial statements right here.
      </p>
      <div className="pt-2">
        <Button variant="primary" to={addHref}>
          Add trial balance <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

// A static splash while the schools/periods hydrate (no infinite spinner loop in
// app chrome beyond the one-shot fade; the standard spinner stays).
function Splash() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
      <Loader2 size={28} aria-label="Loading" className="animate-spin text-ink2" />
    </div>
  )
}

export default function StatementsWorkspace() {
  const { schools, activeSchool, loading } = useSchools()
  const { periods, hydrating, activePeriod, latestSnapshot, reopenPeriod } = usePersistence()
  const uiV2 = useUiV2()
  const addHref = addDataHref(uiV2, { add: 'tb' })
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
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10">
      <BackLink className="mb-2" />
      <PageHeader
        eyebrow={['Finance', activeSchool?.name, 'Workspaces'].filter(Boolean).join(' · ')}
        title="Statements & periods"
        meta="Your generated financial statements — view any period here. Add or update numbers from Add data."
        hue="37 99 235"
        actions={
          <Button variant="primary" to={addHref} icon={<CloudUpload size={14} />}>
            Add data
          </Button>
        }
      />

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        {/* Saved-periods rail */}
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-[240px]">
          <div className="sec-head">
            <h2 className="sec-label">Saved periods</h2>
            <span className="sec-rule" aria-hidden="true" />
          </div>
          {periods.length === 0 ? (
            <div className="b2-note">
              <p>No saved periods yet.</p>
              <p>Upload a trial balance and save to build your history.</p>
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
            snapshot, or an empty state deep-linking the add flow. */}
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
            <NoStatementsCard addHref={addHref} />
          )}
        </section>
      </div>
    </div>
  )
}

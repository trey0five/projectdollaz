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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CloudUpload,
  Database,
  FileStack,
  Percent,
  Scale,
} from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import { addDataHref } from '../../lib/dataDestinations.js'
import { formatShortDate, PERIOD_LABELS } from '../../lib/format.js'
import CreateSchoolForm from '../CreateSchoolForm.jsx'
import ReportTabs from '../reports/ReportTabs.jsx'
import BoardPacketExportButton from '../reports/BoardPacketExportButton.jsx'
import {
  AuroraButton,
  AuroraEmpty,
  AuroraLightButton,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  HowThisWorks,
  VerdictEm,
  fyLabel,
} from '../ui/aurora/index.js'
import { comparisonBasis, financeVerdict, kpiCaption, kpiFigure, metricVerdict, moneyShort, periodClosed } from '../finance/financeAurora.js'
import { metricFormat } from '../../lib/metricMeta.js'
import { FinanceSubPage, FinanceSubBand, FinanceMore, FinancePeriodSwitch, yearName } from './financeSub.jsx'

// What each saved FILE is (said the same way on every year's tile).
const ROLE_LABEL = { cy: 'Trial balance', py: 'Prior-year balance', audit: 'Audit' }

// The read-only statements for one period, straight on the section (ReportTabs
// draws its own paper card — never wrapped in a second one).
function StatementsView({ bundle, periodId, periodEndDate, periodType, school }) {
  return (
    <ReportTabs
      bundle={bundle}
      school={school}
      periodId={periodId}
      dateLabel={formatShortDate(periodEndDate)}
      periodLabel={PERIOD_LABELS[periodType] || ''}
    />
  )
}

// One line for a saved-year tile: its end date + which files it holds.
function periodLine(p) {
  const roles = ['cy', 'py', 'audit'].filter((r) => p.roles?.[r])
  const when = `Ends ${formatShortDate(p.periodEndDate)}`
  return roles.length ? `${when} · ${roles.map((r) => ROLE_LABEL[r]).join(', ')}` : `${when} · no numbers yet`
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

  // ── The period on screen: a reopened older year, else the live one ────────
  const shown = openId && openBundle ? openPeriod : activePeriod
  const shownBundle = openId && openBundle ? openBundle : latestSnapshot?.payload ?? null
  const shownId = shown?.id ?? null
  const shownLabel = shown ? yearName(shown.label) : null

  // Headline figures for the band — the SAME metric source the Finance
  // overview reads (revenue_mix / expense_mix totals). Missing → "—", never 0.
  const { metrics, loading: metricsLoading } = useAnalytics(
    activeSchool?.id ?? null,
    shownBundle ? shownId : null,
  )
  const figures = useMemo(() => {
    const by = Object.fromEntries((metrics || []).map((m) => [m.key, m]))
    const rev = by.revenue_mix?.available ? by.revenue_mix.value : null
    const exp = by.expense_mix?.available ? by.expense_mix.value : null
    const change = rev != null && exp != null ? rev - exp : null
    // Did the statements actually produce anything? (Same honesty signal as
    // the Finance overview: a saved file over thirty zeros is not "ready".)
    const hasNumbers = (rev ?? 0) !== 0 || (exp ?? 0) !== 0
    return { rev, exp, change, hasNumbers, margin: by.operating_margin ?? null }
  }, [metrics])

  // Years you can open: the live one + every year with saved statements.
  const openable = useMemo(
    () => (periods || []).filter((p) => p.id === activePeriod?.id || p.hasSnapshot),
    [periods, activePeriod],
  )
  // The Saved-years tiles: years you can open first (newest first — the list
  // already comes newest-first), the empty years after them, muted.
  const savedYears = useMemo(() => {
    const list = periods || []
    const canOpen = (p) => p.id === activePeriod?.id || p.hasSnapshot
    return [...list.filter(canOpen), ...list.filter((p) => !canOpen(p))]
  }, [periods, activePeriod])
  const withStatements = (periods || []).filter((p) => p.hasSnapshot).length

  if (loading || hydrating) {
    return (
      <FinanceSubPage crumb="Statements">
        <FinanceSubBand title="Statements" verdict="Opening your statements…" />
        <div className="mt-8" aria-busy="true">
          <AuroraEmpty icon={FileStack} text="Loading your saved years…" />
        </div>
      </FinanceSubPage>
    )
  }
  if (schools.length === 0) return <CreateSchoolForm />

  const closed = periodClosed(shown?.periodEndDate)
  const eyebrow = shown?.periodEndDate
    ? `${closed ? 'Year ended' : 'Year ends'} ${formatShortDate(shown.periodEndDate)}`
    : null

  // ONE sentence, from the shown year's real totals.
  let verdict
  if (!shownBundle) {
    verdict = <>No statements yet. Add this year&rsquo;s numbers and they appear here.</>
  } else if (metricsLoading) {
    verdict = null
  } else if (!figures.hasNumbers) {
    verdict = <>We can&rsquo;t read these accounts yet. Sort them in Add data and the statements fill in.</>
  } else {
    const v = financeVerdict({ periodLabel: shownLabel, periodEndDate: shown?.periodEndDate, change: figures.change })
    verdict = v.lead ? (
      <>
        {v.lead} <VerdictEm tone={v.emTone}>{v.em}</VerdictEm>.
      </>
    ) : null
  }

  const kpis =
    shownBundle && figures.hasNumbers
      ? [
          { key: 'in', icon: ArrowDownLeft, label: 'Money in', value: moneyShort(figures.rev), caption: 'Total income' },
          { key: 'out', icon: ArrowUpRight, label: 'Money out', value: moneyShort(figures.exp), caption: 'Total spending' },
          {
            key: 'left',
            icon: Scale,
            label: 'Left over',
            value: figures.change == null ? null : `${figures.change >= 0 ? '+' : ''}${moneyShort(figures.change)}`,
            caption: 'Income minus spending',
            // A SIGN, not a band: surplus vs. deficit.
            verdict: figures.change == null ? null : figures.change >= 0 ? 'good' : 'risk',
            verdictLabel: figures.change == null ? null : figures.change >= 0 ? 'Surplus' : 'Deficit',
          },
          {
            key: 'margin',
            icon: Percent,
            label: 'Operating margin',
            ...kpiFigure(figures.margin, metricFormat('operating_margin', figures.margin?.unit)),
            caption: kpiCaption(figures.margin, metricFormat('operating_margin', figures.margin?.unit), null, shown ? comparisonBasis(periods, shown, fyLabel) : undefined),
            // The metric's own band — or no pill.
            verdict: metricVerdict(figures.margin),
          },
        ]
      : null

  return (
    <FinanceSubPage crumb="Statements">
      <FinanceSubBand
        eyebrow={eyebrow}
        title="Statements"
        verdict={verdict}
        actions={
          <>
            <AuroraButton variant="primary" to={addHref} icon={<CloudUpload size={19} aria-hidden="true" />}>
              Add data
            </AuroraButton>
            {shownBundle ? <BoardPacketExportButton periodId={shownId} /> : null}
            <AuroraButton to="/analytics" icon={<BarChart3 size={19} aria-hidden="true" />}>
              Analytics
            </AuroraButton>
          </>
        }
        aside={
          <FinancePeriodSwitch
            label="Year"
            periods={openable}
            activeId={shownId}
            onSelect={(id) => {
              const p = openable.find((x) => x.id === id)
              if (p) onSelectPeriod(p)
            }}
          />
        }
        kpis={kpis}
      />

      {/* ── The statements themselves ─────────────────────────────────────── */}
      <section ref={workspaceRef} className="min-w-0">
        <AuroraSection
          first
          icon={FileStack}
          title="Your statements"
          subtitle="The four statements, read-only"
          count={shownLabel}
          aside={
            openId ? (
              <AuroraLightButton size="sm" variant="ghost" onClick={() => showLive(null)} icon={<ArrowLeft size={15} aria-hidden="true" />}>
                Back to current
              </AuroraLightButton>
            ) : null
          }
        >
          {shownBundle ? (
            <StatementsView
              bundle={shownBundle}
              periodId={shownId}
              periodEndDate={shown?.periodEndDate}
              periodType={shown?.periodType}
              school={activeSchool}
            />
          ) : (
            <AuroraEmpty
              icon={Database}
              text="No statements yet."
              sub="Add your trial balance and the four statements are built here."
              action={
                <AuroraLightButton to={addHref} icon={<CloudUpload size={15} aria-hidden="true" />}>
                  Add this year&rsquo;s numbers
                </AuroraLightButton>
              }
            />
          )}
        </AuroraSection>
      </section>

      {/* ── Every saved year ─────────────────────────────────────────────── */}
      <AuroraSection
        icon={CalendarRange}
        title="Saved years"
        subtitle="Open any year’s statements"
        count={periods.length ? `${withStatements} of ${periods.length} with statements` : null}
      >
        {periods.length === 0 ? (
          <AuroraEmpty
            icon={CalendarRange}
            text="No saved years yet."
            action={
              <AuroraLightButton variant="ghost" to={addHref}>
                Add a trial balance
              </AuroraLightButton>
            }
          />
        ) : (
          <AuroraTileGrid cols={3}>
            {savedYears.map((p, i) => {
              const live = p.id === activePeriod?.id
              const canOpen = live || p.hasSnapshot
              const isShown = p.id === shownId
              return (
                <AuroraTile
                  key={p.id}
                  icon={CalendarRange}
                  title={yearName(p.label)}
                  desc={periodLine(p)}
                  hue={canOpen ? (i % 3 === 1 ? 'var(--au-h2)' : i % 3 === 2 ? 'var(--au-h3)' : undefined) : '#94a3b8'}
                  className={canOpen ? undefined : 'opacity-75'}
                  verdictLabel={isShown ? 'Showing' : live ? 'Latest' : p.hasSnapshot ? 'Saved' : null}
                  foot={
                    // Only a year with NO files gets "Add numbers"; a year that
                    // holds a file but no statements yet already has its numbers.
                    canOpen || ['cy', 'py', 'audit'].some((r) => p.roles?.[r]) ? null : (
                      <AuroraLightButton size="sm" variant="ghost" to={addHref}>
                        Add numbers
                      </AuroraLightButton>
                    )
                  }
                  onClick={canOpen && !isShown ? () => onSelectPeriod(p) : null}
                  ariaLabel={canOpen ? `Open ${yearName(p.label)} statements` : undefined}
                  aria-busy={loadingId === p.id || undefined}
                  art={false}
                />
              )
            })}
          </AuroraTileGrid>
        )}
      </AuroraSection>

      <FinanceMore current="statements" />

      <HowThisWorks>
        <p>Statements are built from the trial balance you add for each year.</p>
        <p>The latest year is the one you are working on. Older years open exactly as they were saved.</p>
        <p>To add or change numbers, use Add data.</p>
      </HowThisWorks>
    </FinanceSubPage>
  )
}

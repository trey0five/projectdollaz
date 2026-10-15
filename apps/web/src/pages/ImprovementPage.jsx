// ─────────────────────────────────────────────────────────────────────────────
// /improvement — THE CONTINUOUS IMPROVEMENT MANAGER (AIC Phase G).
//
// The point of this page, stated plainly: before it existed, an early warning was
// a sentence a head of school read and then had nowhere to put. Here every
// recommendation gets an owner, a date, a milestone plan, and progress COMPUTED
// from the school's own numbers — never self-reported, never estimated on the
// school's behalf.
//
// NO MODULE KEY, ON PURPOSE. There is no `improvement` SKU and there must not be
// one: the page rides on `accreditation` OR `strategy` (the API guard is OR over
// exactly those two keys). Consequences, all deliberate:
//   · the sidebar group carries `modules: [...]`, not `module`, and simply does
//     not render for a school licensing neither — the existing Accreditation /
//     Strategic Planning Add-ons rows are the upsell;
//   · MODULE_ANATOMY is untouched, so /improvement has no module tab-rail and
//     `activeModuleKey` correctly resolves to null there;
//   · a direct visit by an unlicensed school still renders — a friendly 402 panel
//     naming BOTH modules, never a crash and never a blank screen.
//
// The page carries its own teal accent vars (see improvementMeta) so the shared
// RecordFlow, CTAs and focus rings theme themselves exactly as they do on a real
// module page.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { AlertTriangle, CalendarClock, Check, Flag, TrendingDown, TrendingUp } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import { VerdictEm } from '../components/ui/aurora/index.js'
import RecordFlow from '../components/recordwizard/RecordFlow.jsx'
import RecommendationRail from '../components/improvement/RecommendationRail.jsx'
import InitiativeList from '../components/improvement/InitiativeList.jsx'
import InitiativeDrawer from '../components/improvement/InitiativeDrawer.jsx'
import { buildImprovementFlow } from '../components/improvement/improvementFlow.jsx'
import {
  IMPROVEMENT_HUE,
  improvementAccentVars,
  pctLabel,
  seedFromDeepLink,
  seedFromRecommendation,
  shortDate,
} from '../components/improvement/improvementMeta.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useImprovement } from '../hooks/useImprovement.js'
import '../styles/pending/b1-domain.css'
import '../styles/pending/aurora-accred.css'

const TABS = [{ key: 'initiatives', label: 'Initiatives' }]

// ── Gate: a plain page header on the ground (same shape as /strategy's) ─────
function GatePanel({ notLicensed }) {
  return (
    <div style={improvementAccentVars()}>
      <DomainStatePanel
        showBack
        title="Improvement"
        hue={IMPROVEMENT_HUE}
        verdict={notLicensed ? 'Improvement rides on Accreditation or Strategic Planning.' : 'Your subscription is paused.'}
        icon={Flag}
        text={
          notLicensed
            ? 'Add either one to turn your gaps and warnings into owned, dated work.'
            : 'Resume your plan to manage your improvement initiatives.'
        }
      />
    </div>
  )
}

function ImprovementWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    initiatives,
    counts,
    summary,
    dataAsOf,
    recommendations,
    recommendationsError,
    recommendationsBasis,
    members,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
    updateInitiative,
    deleteInitiative,
    recordProgress,
  } = useImprovement(schoolId)

  // `seed` doubles as the flow's open/closed state: null = the command center,
  // an object = the seeded RecordFlow ({} for a hand-typed initiative).
  const [seed, setSeed] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [tab, setTab] = useState('initiatives')

  // The drawer reads the LIVE row out of the register rather than holding a copy,
  // so a refresh after a write can never leave a stale panel open over fresh data.
  const openInitiative = useMemo(
    () => initiatives.find((it) => it.id === openId) ?? null,
    [initiatives, openId],
  )

  const startWork = useCallback(
    (rec) => setSeed(seedFromRecommendation(rec, members)),
    [members],
  )

  // ── Deep link: /improvement?rec=<findingKey|originRef> opens that gap's flow ──
  // Used by the Accreditation Improvement rail's "Work this gap" links. It is
  // ADVISORY: an unknown key simply lands on the page, never an error.
  // THE LINK IS SELF-SUFFICIENT, and it has to be. The rail is capped at eight
  // recommendations ranked by index lift, and a school-scoped early warning
  // carries no lift at all — so on any school with eight-plus scored gaps, the
  // finding the user clicked is the FIRST thing truncated. Resolving the key only
  // against the rail meant "Work this gap" did nothing at all, silently, in the
  // ordinary mid-accreditation case (and always, for a warning that fired since
  // the last reconciliation and has no ledger row yet). When the key is not on
  // the rail the flow is seeded FROM THE LINK: the finding's own key and title,
  // which is exactly what the adopt endpoint needs.
  const consumedDeepLink = useRef(false)
  useEffect(() => {
    if (consumedDeepLink.current) return
    const wanted = searchParams.get('rec')
    if (!wanted || loading) return
    consumedDeepLink.current = true
    const seeded = seedFromDeepLink({
      wanted,
      title: searchParams.get('recTitle') ?? '',
      recommendations,
      members,
    })
    // Microtask-defer so no setState runs synchronously inside the effect body.
    Promise.resolve().then(() => setSeed(seeded))
  }, [searchParams, recommendations, members, loading])

  const closeFlow = useCallback(() => {
    setSeed(null)
    if (searchParams.get('rec')) {
      const next = new URLSearchParams(searchParams)
      next.delete('rec')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const flow = useMemo(() => buildImprovementFlow(seed ?? {}), [seed])
  const flowCtx = useMemo(
    () => ({ schoolId, reduce, canEdit, onSaved: refresh }),
    [schoolId, reduce, canEdit, refresh],
  )

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const inFlight = (counts.planned ?? 0) + (counts.in_progress ?? 0) + (counts.blocked ?? 0)
    const mean = pctLabel(summary.meanProgressPct)
    return [
      {
        label: 'Work in flight',
        icon: Flag,
        value: String(inFlight),
        status: inFlight > 0 ? 'good' : 'neutral',
        sub: {
          icon: Check,
          text: `of ${summary.total ?? 0} initiative${summary.total === 1 ? '' : 's'}`,
          tone: 'good',
        },
      },
      {
        label: 'Overdue',
        icon: CalendarClock,
        value: String(summary.overdue ?? 0),
        // Nothing to be overdue → no verdict (never "Good" about nothing).
        status: (summary.overdue ?? 0) > 0 ? 'risk' : (summary.total ?? 0) === 0 ? 'neutral' : 'good',
        sub:
          (summary.overdue ?? 0) > 0
            ? { icon: CalendarClock, text: 'past their due date', tone: 'bad' }
            : { icon: Check, text: 'nothing past due', tone: 'good' },
      },
      {
        label: 'Behind pace',
        icon: TrendingDown,
        value: String(summary.behind ?? 0),
        status: (summary.behind ?? 0) > 0 ? 'risk' : (summary.total ?? 0) === 0 ? 'neutral' : 'good',
        sub:
          (summary.behind ?? 0) > 0
            ? { icon: TrendingDown, text: 'measured under pace', tone: 'bad' }
            : // Says EXACTLY what the number counts. `summary.behind` is the count
              // of initiatives whose PACE verdict is behind (the server counts
              // paceStatus, not the precedence-ranked riskSignal), so a zero here
              // means nothing measured is behind — not that everything is fine.
              { icon: Check, text: 'nothing measured is behind pace', tone: 'good' },
      },
      {
        // meanProgressPct is null — never 0 — when nothing is measured. An em dash
        // says "we have not measured this"; 0% would say "measured, and at zero".
        label: 'Average progress',
        icon: TrendingUp,
        value: mean ?? '—',
        status: 'neutral',
        sub:
          mean == null
            ? { icon: AlertTriangle, text: 'nothing measured yet', tone: 'neutral' }
            : {
                icon: TrendingUp,
                text: `${summary.statusOnly ?? 0} report status only`,
                tone: 'neutral',
              },
      },
    ]
  }, [counts, summary])

  // ── Needs attention (client-derived from the payload; actions open the drawer) ─
  // AURORA: the band's one plain sentence, from the same summary the cards read.
  const verdict = useMemo(() => {
    const total = summary.total ?? 0
    const inFlight = (counts.planned ?? 0) + (counts.in_progress ?? 0) + (counts.blocked ?? 0)
    const overdue = summary.overdue ?? 0
    const behind = summary.behind ?? 0
    const ideas = recommendations.length
    if (total === 0) {
      return ideas > 0 ? (
        <>
          No work started yet. <VerdictEm>{ideas} idea{ideas === 1 ? ' is' : 's are'}</VerdictEm> ready to pick up.
        </>
      ) : (
        <>No work started yet.</>
      )
    }
    return (
      <>
        <VerdictEm>
          {inFlight} initiative{inFlight === 1 ? '' : 's'}
        </VerdictEm>{' '}
        in flight.
        {overdue > 0 ? (
          <>
            {' '}
            <VerdictEm tone="risk">{overdue} overdue</VerdictEm>.
          </>
        ) : null}
        {behind > 0 ? (
          <>
            {' '}
            <VerdictEm tone="risk">{behind} behind pace</VerdictEm>.
          </>
        ) : null}
        {overdue === 0 && behind === 0 ? <> Nothing is overdue.</> : null}
      </>
    )
  }, [summary, counts, recommendations])

  const attentionItems = useMemo(() => {
    const raw = []
    for (const it of initiatives) {
      if (it.riskSignal === 'overdue') {
        raw.push({
          id: `overdue-${it.id}`,
          tone: 'risk',
          sortKey: 0,
          title: `${it.title} is overdue`,
          why: `Due ${shortDate(it.dueDate) ?? 'earlier'} · ${it.owner?.name ?? 'unassigned'}`,
          actions: [{ label: 'Open', primary: true, onClick: () => setOpenId(it.id) }],
        })
      } else if (it.riskSignal === 'behind') {
        raw.push({
          id: `behind-${it.id}`,
          tone: 'risk',
          sortKey: 1,
          title: `${it.title} is behind pace`,
          why: `${pctLabel(it.progressPct) ?? 'No measured progress'} · ${it.progressBasis ?? 'Status only'}`,
          actions: [{ label: 'Open', primary: true, onClick: () => setOpenId(it.id) }],
        })
      }
    }
    if ((summary.unowned ?? 0) > 0) {
      raw.push({
        id: 'unowned',
        tone: 'watch',
        sortKey: 2,
        title: `${summary.unowned} initiative${summary.unowned === 1 ? '' : 's'} without an owner`,
        why: 'Work with no name against it is the work that stalls.',
        actions: [],
      })
    }
    return raw.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
  }, [initiatives, summary])

  // ── Gate / loading ─────────────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />
  if (loading) {
    return (
      <div style={improvementAccentVars()}>
        <DomainStatePanel
          showBack
          title="Improvement"
          hue={IMPROVEMENT_HUE}
          verdict="Loading your initiatives…"
          icon={Flag}
          text="Reading your initiatives and recommendations…"
          busy
        />
      </div>
    )
  }

  // ── The seeded RecordFlow ("Work this gap" / "+ New") ─────────────────────
  if (seed) {
    return (
      <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8" style={improvementAccentVars()}>
        <RecordFlow
          key={flow.key + (seed.originRef ?? '')}
          flow={flow}
          ctx={flowCtx}
          hue={IMPROVEMENT_HUE}
          title={seed.templateId ? 'Work this gap' : 'New improvement initiative'}
          subtitle={
            seed.templateId
              ? 'Adopting this recommendation gives it an owner, a date and a way to measure itself. Adopting the same gap twice returns the same initiative — it never mints a second plan.'
              : 'Give the work an owner, a date, and something it can measure itself against.'
          }
          exitLabel="Improvement overview"
          onCancel={closeFlow}
          onDone={() => {
            closeFlow()
            refresh()
          }}
        />
      </div>
    )
  }

  const errorBanner = error ? (
    <div className="mx-auto max-w-page px-4 pt-4 sm:px-10">
      <p role="alert" className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
        <i className="mark tone-risk" aria-hidden="true" />
        {error}
      </p>
    </div>
  ) : null

  return (
    <div style={improvementAccentVars()}>
      {errorBanner}
      <DomainCommandCenter
        showBack
        eyebrow={dataAsOf ? `Data as of ${shortDate(dataAsOf) ?? dataAsOf}` : null}
        title="Improvement"
        hue={IMPROVEMENT_HUE}
        verdict={verdict}
        newLabel="New initiative"
        registerSubtitle="Owned, dated work — click one to open it"
        registerIcon={Flag}
        howItWorks={
          <>
            <p>
              Recommendations come from your accreditation gaps, unmet must-pass checks and open warnings. A lift in
              index points is shown only when the readiness engine can attribute one.
            </p>
            <p>
              Progress is computed from each initiative&apos;s own measure. An initiative that reports status only
              never shows a percentage.
            </p>
          </>
        }
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={canEdit ? () => setSeed({}) : null}
        registerTable={
          <InitiativeList initiatives={initiatives} onOpen={(it) => setOpenId(it.id)} reduce={reduce} />
        }
        attentionItems={attentionItems}
        beforeBody={
          <RecommendationRail
            recommendations={recommendations}
            canEdit={canEdit}
            onWork={startWork}
            loading={loading}
            degraded={recommendationsError}
            basis={recommendationsBasis}
            reduce={reduce}
          />
        }
      />
      <InitiativeDrawer
        initiative={openInitiative}
        canEdit={canEdit}
        reduce={reduce}
        onClose={() => setOpenId(null)}
        onUpdate={updateInitiative}
        onRecordReading={recordProgress}
        onDelete={async (it) => {
          if (window.confirm(`Delete "${it.title}"?`)) {
            setOpenId(null)
            await deleteInitiative(it.id)
          }
        }}
      />
    </div>
  )
}

export default function ImprovementPage() {
  return (
    <div className="acc-hue min-h-screen">
      <BillingBanner />
      <ImprovementWorkspace />
    </div>
  )
}

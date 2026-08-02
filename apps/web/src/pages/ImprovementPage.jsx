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
import { AlertTriangle, CalendarClock, Check, TrendingDown, TrendingUp } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import BackLink from '../components/ui/BackLink.jsx'
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

const TABS = [{ key: 'initiatives', label: 'Initiatives' }]

// ── Light-theme gate panels (same shape as /strategy's) ──────────────────────
function CenteredPanel({ children }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-glow"
          style={{ background: IMPROVEMENT_HUE }}
        >
          <TrendingUp size={26} />
        </span>
        {children}
      </div>
    </div>
  )
}

function GatePanel({ notLicensed }) {
  return (
    <CenteredPanel>
      {notLicensed ? (
        <>
          <h2 className="font-serif text-xl font-semibold text-navy">
            Improvement rides on Accreditation or Strategic Planning
          </h2>
          <p className="max-w-md text-[15px] text-muted">
            It isn&apos;t a separate module — adding either one turns your readiness gaps and early
            warnings into owned, dated work whose progress is computed from your own numbers.
          </p>
        </>
      ) : (
        <>
          <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
          <p className="max-w-md text-[15px] text-muted">
            Resume your plan to manage your improvement initiatives.
          </p>
        </>
      )}
    </CenteredPanel>
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
        value: String(summary.overdue ?? 0),
        status: (summary.overdue ?? 0) > 0 ? 'risk' : 'good',
        sub:
          (summary.overdue ?? 0) > 0
            ? { icon: CalendarClock, text: 'past their due date', tone: 'bad' }
            : { icon: Check, text: 'nothing past due', tone: 'good' },
      },
      {
        label: 'Behind pace',
        value: String(summary.behind ?? 0),
        status: (summary.behind ?? 0) > 0 ? 'risk' : 'good',
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
        label: 'Mean progress',
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
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="h-64 animate-pulse rounded-3xl bg-section" />
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
      <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-[13px] font-semibold text-danger">
        {error}
      </p>
    </div>
  ) : null

  return (
    <div style={improvementAccentVars()}>
      {errorBanner}
      <DomainCommandCenter
        showBack
        eyebrow="Continuous improvement · owned, dated work"
        title="Improvement"
        Icon={TrendingUp}
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
        headerAside={
          dataAsOf ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rule/60 bg-white px-2.5 py-1 text-[12px] text-muted">
              <CalendarClock size={12} aria-hidden /> as of {shortDate(dataAsOf) ?? dataAsOf}
            </span>
          ) : null
        }
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
    <div className="min-h-screen">
      <BillingBanner />
      <ImprovementWorkspace />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy route — the Strategic Planning DOMAIN COMMAND CENTER (Phase 5). Built
// on the reusable DomainCommandCenter scaffold, with the DISTINCTIVE StrategyHorizon
// arc hero injected via beforeBody. Penny lands you on the plan's health: the KPIs
// that define it (overall progress, on-track goals, behind pace, next review), the
// items that need a decision (behind-pace goals, stale initiatives, review-due —
// v1 actions are NAVIGATIONAL), with the plan register (Plans / Goals / Initiatives)
// a tab away. Self-measuring: metric goals read LIVE from the financials.
//
// School-scoped. Gated by the 'strategy' module — an unlicensed school gets a
// friendly light 402 panel (useStrategy notLicensed). Board/viewer may READ. The
// add/edit forms reuse the shared premium EntityFormModal (dark overlay).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Target,
  TrendingUp,
  TrendingDown,
  Check,
  CalendarClock,
  Clock,
  Plus,
  Compass,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import StrategyHorizon from '../components/strategy/StrategyHorizon.jsx'
import PillarCard from '../components/strategy/PillarCard.jsx'
import GoalCard from '../components/strategy/GoalCard.jsx'
import InitiativeRow from '../components/strategy/InitiativeRow.jsx'
import {
  PlanForm,
  PillarForm,
  GoalForm,
  InitiativeForm,
  goalToFormInitial,
} from '../components/strategy/StrategyForms.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useStrategy } from '../hooks/useStrategy.js'

const TABS = [
  { key: 'plans', label: 'Plan & Pillars' },
  { key: 'goals', label: 'Goals' },
  { key: 'initiatives', label: 'Initiatives' },
]

function shortDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// Overall pace → the KPI card status token (good=gold, watch, risk).
const PACE_TO_STATUS = { on_track: 'good', achieved: 'good', at_risk: 'watch', behind: 'risk', no_data: 'neutral' }

// ── Light-theme gate / empty panels ──────────────────────────────────────────
function CenteredPanel({ children }) {
  return (
    <div className="mx-auto max-w-[1180px] space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <Target size={26} />
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
          <h2 className="font-serif text-xl font-semibold text-navy">Strategic Planning isn&apos;t on your plan yet</h2>
          <p className="max-w-md text-[15px] text-muted">
            Add the Strategic Planning module to turn your board&apos;s plan into a living scorecard — goals that
            measure themselves against your live financials, and their slice of the briefing here.
          </p>
        </>
      ) : (
        <>
          <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
          <p className="max-w-md text-[15px] text-muted">Resume your plan to manage the strategic-plan register.</p>
        </>
      )}
    </CenteredPanel>
  )
}

function EmptyPlanPanel({ canEdit, onCreate }) {
  return (
    <CenteredPanel>
      <h2 className="font-serif text-xl font-semibold text-navy">No strategic plan yet</h2>
      <p className="max-w-md text-[15px] text-muted">
        Create your plan, add a few pillars, then bind goals to the metrics you already track — days cash on hand,
        operating margin, enrollment — and watch them measure themselves.
      </p>
      {canEdit ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-4 py-2 text-[13px] font-semibold text-navy shadow-glow transition hover:brightness-105"
        >
          <Plus size={15} /> Create strategic plan
        </button>
      ) : null}
    </CenteredPanel>
  )
}

// ═══════════════════════════ Register tab bodies ════════════════════════════
function PlansBody({ plan, pillars, canEdit, onEditPlan, onNewPillar, onEditPillar, onDeletePillar }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule/50 bg-cream/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Active plan</p>
          <p className="truncate font-serif text-[17px] font-semibold text-navy">{plan.name}</p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onEditPlan}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy transition hover:border-gold/60 hover:text-gold"
          >
            Edit plan
          </button>
        ) : null}
      </div>

      {pillars.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
          <p className="font-serif text-[16px] italic text-muted">No pillars yet.</p>
          <p className="mt-1 text-[13px] text-muted">Add a pillar to group your goals under a strategic theme.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pillars.map((p, i) => (
            <PillarCard
              key={p.id}
              pillar={p}
              index={i}
              canEdit={canEdit}
              onEdit={onEditPillar}
              onDelete={onDeletePillar}
            />
          ))}
        </div>
      )}

      {canEdit ? (
        <button
          type="button"
          onClick={onNewPillar}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-rule/60 px-3 py-1.5 text-[13px] font-semibold text-muted transition hover:border-gold/60 hover:text-navy"
        >
          <Plus size={14} /> Add pillar
        </button>
      ) : null}
    </div>
  )
}

function GoalsBody({ goals, canEdit, onEdit, onDelete }) {
  if (goals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
        <p className="font-serif text-[16px] italic text-muted">No goals yet.</p>
        <p className="mt-1 text-[13px] text-muted">Bind a goal to a live metric and it starts measuring itself.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {goals.map((g, i) => (
        <div key={g.id} id={`strategy-goal-${g.id}`}>
          <GoalCard goal={g} index={i} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  )
}

function InitiativesBody({ initiatives, canEdit, onEdit, onDelete }) {
  if (initiatives.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
        <p className="font-serif text-[16px] italic text-muted">No initiatives yet.</p>
        <p className="mt-1 text-[13px] text-muted">Add the projects that will move your goals forward.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-rule/50 px-3">
      {initiatives.map((it, i) => (
        <InitiativeRow
          key={it.id}
          initiative={it}
          index={i}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

// ═══════════════════════════ PAGE ═══════════════════════════════════════════
function StrategyWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  const uiV2 = useUiV2()

  const strat = useStrategy(schoolId)
  const {
    plan,
    pillars,
    goals,
    initiatives,
    members,
    summary,
    hasPlan,
    loading,
    error,
    notLicensed,
    notEntitled,
    createPlan,
    updatePlan,
    createPillar,
    updatePillar,
    deletePillar,
    createGoal,
    updateGoal,
    deleteGoal,
    createInitiative,
    updateInitiative,
    deleteInitiative,
  } = strat

  const [tab, setTab] = useState('plans')
  const [modal, setModal] = useState(null) // { type, entity } | null
  const closeModal = () => setModal(null)

  // Navigational attention action: switch tab (and scroll to a goal by title).
  const goToGoalByTitle = (title) => {
    setTab('goals')
    const g = goals.find((x) => x.title === title)
    if (g && typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        document.getElementById(`strategy-goal-${g.id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      })
    }
  }

  // ── KPIs (from the computed summary / plan) ────────────────────────────────
  const kpis = useMemo(() => {
    const gc = plan?.goalCounts ?? {}
    const pct = Math.round((plan?.overallProgressPct ?? 0) * 100)
    const onTrack = (gc.onTrack ?? 0) + (gc.achieved ?? 0)
    const behind = summary.behindPaceGoalCount ?? gc.behind ?? 0
    const atRisk = summary.atRiskGoalCount ?? gc.atRisk ?? 0
    const total = gc.total ?? 0
    const reviewDate = summary.nextReviewDate ?? plan?.nextReviewDate ?? null

    return [
      {
        label: 'Overall progress',
        value: `${pct}%`,
        status: PACE_TO_STATUS[plan?.overallPaceStatus] ?? 'neutral',
        sub: {
          icon: plan?.overallPaceStatus === 'behind' ? TrendingDown : TrendingUp,
          text:
            plan?.overallPaceStatus === 'behind'
              ? 'behind pace overall'
              : plan?.overallPaceStatus === 'at_risk'
                ? 'at risk overall'
                : 'on pace overall',
          tone: plan?.overallPaceStatus === 'behind' ? 'bad' : plan?.overallPaceStatus === 'at_risk' ? 'neutral' : 'good',
        },
      },
      {
        label: 'On-track goals',
        value: String(onTrack),
        status: total && onTrack === total ? 'good' : onTrack ? 'good' : 'neutral',
        sub: { icon: Check, text: `of ${total} goal${total === 1 ? '' : 's'}`, tone: 'good' },
      },
      {
        label: 'Behind pace',
        value: String(behind),
        status: behind > 0 ? 'risk' : 'good',
        sub:
          behind > 0
            ? { icon: TrendingDown, text: 'goals under pace', tone: 'bad' }
            : atRisk > 0
              ? { icon: Clock, text: `${atRisk} at risk`, tone: 'neutral' }
              : { icon: Check, text: 'all goals on pace', tone: 'good' },
      },
      {
        label: 'Next review',
        value: reviewDate ? (shortDate(reviewDate) ?? '—') : '—',
        status: summary.reviewDueThisMonth ? 'watch' : 'neutral',
        sub: summary.reviewDueThisMonth
          ? { icon: CalendarClock, text: 'due this month', tone: 'neutral' }
          : { icon: CalendarClock, text: reviewDate ? 'on schedule' : 'not scheduled', tone: 'neutral' },
      },
    ]
  }, [plan, summary])

  // ── Needs-attention (client-derived from summary; navigational actions) ────
  const attentionItems = useMemo(() => {
    const raw = []
    for (const g of summary.behindPaceGoals ?? []) {
      raw.push({
        id: `behind-${g.title}`,
        tone: 'risk',
        sortKey: 0,
        title: `${g.title} is behind pace`,
        why: `${g.formattedCurrent ?? '—'} now · target ${g.formattedTarget ?? '—'}${g.targetDate ? ` by ${shortDate(g.targetDate)}` : ''}`,
        actions: [{ label: 'View goal', primary: true, onClick: () => goToGoalByTitle(g.title) }],
      })
    }
    for (const it of summary.staleInitiatives ?? []) {
      raw.push({
        id: `stale-${it.title}`,
        tone: 'watch',
        sortKey: 1,
        title: `${it.title} has stalled`,
        why: `No movement in ${it.staleDays ?? 60}+ days · ${it.ownerName ?? 'unassigned'}`,
        actions: [{ label: 'View initiatives', primary: false, onClick: () => setTab('initiatives') }],
      })
    }
    if (summary.reviewDueThisMonth) {
      raw.push({
        id: 'review-due',
        tone: 'neutral',
        sortKey: 2,
        title: 'Plan review is due this month',
        why: summary.nextReviewDate ? `Scheduled for ${shortDate(summary.nextReviewDate)}` : 'Scheduled this month',
        actions: canEdit ? [{ label: 'Open plan', primary: false, onClick: () => setModal({ type: 'plan', entity: plan }) }] : [],
      })
    }
    return raw.sort((a, b) => a.sortKey - b.sortKey).slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, canEdit, plan, goals, reduce])

  // ── Gate / loading / empty ─────────────────────────────────────────────────
  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />
  if (loading) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-10">
        <div className="h-64 animate-pulse rounded-3xl bg-section" />
      </div>
    )
  }
  if (!hasPlan) {
    return (
      <>
        <EmptyPlanPanel canEdit={canEdit} onCreate={() => setModal({ type: 'plan', entity: null })} />
        {renderModal()}
      </>
    )
  }

  // ── +New wiring per tab ────────────────────────────────────────────────────
  const onNew = canEdit
    ? () => {
        if (tab === 'goals') {
          if (pillars.length === 0) {
            setTab('plans')
            setModal({ type: 'pillar', entity: null })
          } else {
            setModal({ type: 'goal', entity: null })
          }
        } else if (tab === 'initiatives') {
          if (goals.length === 0) {
            setTab('goals')
            setModal({ type: 'goal', entity: null })
          } else {
            setModal({ type: 'initiative', entity: null })
          }
        } else {
          setModal({ type: 'pillar', entity: null })
        }
      }
    : null

  const registerTable =
    tab === 'goals' ? (
      <GoalsBody
        goals={goals}
        canEdit={canEdit}
        onEdit={(g) => setModal({ type: 'goal', entity: g })}
        onDelete={async (g) => {
          if (window.confirm(`Delete "${g.title}"?`)) await deleteGoal(g.id)
        }}
      />
    ) : tab === 'initiatives' ? (
      <InitiativesBody
        initiatives={initiatives}
        canEdit={canEdit}
        onEdit={(it) => setModal({ type: 'initiative', entity: it })}
        onDelete={async (it) => {
          if (window.confirm(`Delete "${it.title}"?`)) await deleteInitiative(it.id)
        }}
      />
    ) : (
      <PlansBody
        plan={plan}
        pillars={pillars}
        canEdit={canEdit}
        onEditPlan={() => setModal({ type: 'plan', entity: plan })}
        onNewPillar={() => setModal({ type: 'pillar', entity: null })}
        onEditPillar={(p) => setModal({ type: 'pillar', entity: p })}
        onDeletePillar={async (p) => {
          if (window.confirm(`Delete "${p.name}" and its goals?`)) await deletePillar(p.id)
        }}
      />
    )

  // ── Modal dispatch ─────────────────────────────────────────────────────────
  function renderModal() {
    if (!modal) return null
    if (modal.type === 'plan') {
      const initial = modal.entity
        ? {
            name: modal.entity.name ?? '',
            mission: modal.entity.mission ?? '',
            fyStartYear: modal.entity.fyStartYear != null ? String(modal.entity.fyStartYear) : '',
            fyEndYear: modal.entity.fyEndYear != null ? String(modal.entity.fyEndYear) : '',
            status: modal.entity.status ?? 'draft',
            nextReviewDate: modal.entity.nextReviewDate ?? '',
          }
        : null
      return (
        <PlanForm
          key={modal.entity ? modal.entity.id : 'new-plan'}
          initial={initial}
          reduce={reduce}
          onClose={closeModal}
          onSave={async (body) => {
            if (modal.entity) await updatePlan(modal.entity.id, body)
            else await createPlan(body)
          }}
        />
      )
    }
    if (modal.type === 'pillar') {
      const initial = modal.entity ? { name: modal.entity.name ?? '', description: modal.entity.description ?? '' } : null
      return (
        <PillarForm
          key={modal.entity ? modal.entity.id : 'new-pillar'}
          initial={initial}
          reduce={reduce}
          onClose={closeModal}
          onSave={async (body) => {
            if (modal.entity) await updatePillar(modal.entity.id, body)
            else await createPillar(plan.id, body)
          }}
        />
      )
    }
    if (modal.type === 'goal') {
      const initial = modal.entity ? goalToFormInitial(modal.entity) : null
      return (
        <GoalForm
          key={modal.entity ? modal.entity.id : 'new-goal'}
          initial={initial}
          pillars={modal.entity ? null : pillars}
          members={members}
          reduce={reduce}
          onClose={closeModal}
          onSave={async (body) => {
            if (modal.entity) {
              await updateGoal(modal.entity.id, body)
            } else {
              const { pillarId, ...rest } = body
              await createGoal(pillarId, rest)
            }
          }}
        />
      )
    }
    if (modal.type === 'initiative') {
      const initial = modal.entity
        ? { title: modal.entity.title ?? '', status: modal.entity.status ?? 'planned', ownerUserId: modal.entity.ownerUserId ?? '' }
        : null
      return (
        <InitiativeForm
          key={modal.entity ? modal.entity.id : 'new-initiative'}
          initial={initial}
          goals={modal.entity ? null : goals}
          members={members}
          reduce={reduce}
          onClose={closeModal}
          onSave={async (body) => {
            if (modal.entity) {
              await updateInitiative(modal.entity.id, body)
            } else {
              const { goalId, ...rest } = body
              await createInitiative(goalId, rest)
            }
          }}
        />
      )
    }
    return null
  }

  const errorBanner = error ? (
    <div className="mx-auto max-w-[1180px] px-4 pt-4 sm:px-10">
      <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-[13px] font-semibold text-danger">
        {error}
      </p>
    </div>
  ) : null

  const commandCenter = (
    <DomainCommandCenter
      eyebrow="Domain · Strategic Planning · self-measuring scorecard"
      title="Strategic Planning"
      Icon={Compass}
      attentionCount={attentionItems.length}
      kpis={kpis}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onNew={onNew}
      registerTable={registerTable}
      attentionItems={attentionItems}
      beforeBody={<StrategyHorizon plan={plan} pillars={pillars} summary={summary} />}
    />
  )

  if (uiV2) {
    return (
      <ModuleAccent moduleKey="strategy">
        {errorBanner}
        <ModuleTabs
          moduleKey="strategy"
          overview={commandCenter}
          addData={<AddDataTab module="strategy" schoolId={schoolId} canEdit={canEdit} />}
          records={
            <ModuleRegister
              moduleKey="strategy"
              hue={moduleHue('strategy')}
              tabs={TABS}
              activeTab={tab}
              onTabChange={setTab}
              onNew={onNew}
              registerTable={registerTable}
            />
          }
        />
        {renderModal()}
      </ModuleAccent>
    )
  }

  return (
    <>
      {errorBanner}
      {commandCenter}
      {renderModal()}
    </>
  )
}

export default function StrategyPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <StrategyWorkspace />
    </div>
  )
}

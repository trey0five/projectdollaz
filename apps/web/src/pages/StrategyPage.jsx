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
// plain 402 page header (useStrategy notLicensed). Board/viewer may READ. The
// add/edit forms reuse the shared EntityFormModal.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Check,
  CalendarClock,
  Clock,
  Plus,
  Compass,
  Pencil,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import ModuleBreadcrumb from '../components/module/ModuleBreadcrumb.jsx'
import { moduleLabel } from '../components/module/moduleAnatomy.js'
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
import { PageHeader, Section, Button } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

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

// ── Gate / empty: a plain page header on the ground, never a hero card ───────
// The same Dashboard › Strategic Planning trail the populated page (ModuleTabs)
// renders, so the empty, gate and loading states speak one navigation grammar.
function StrategyTrail() {
  return (
    <div className="mb-2">
      <ModuleBreadcrumb crumbs={[{ label: 'Dashboard', to: '/app' }, { label: moduleLabel('strategy') }]} />
    </div>
  )
}

function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <StrategyTrail />
      <PageHeader
        eyebrow="Strategic Planning"
        title={notLicensed ? 'Strategic Planning isn\u2019t on your plan yet' : 'Your subscription is paused'}
        meta={
          notLicensed
            ? 'Add the Strategic Planning module to turn your board\u2019s plan into a living scorecard: goals that measure themselves against your live financials, and their slice of the briefing here.'
            : 'Resume your plan to manage the strategic-plan register.'
        }
      />
    </div>
  )
}

function EmptyPlanPanel({ schoolName, canEdit, onCreate }) {
  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <StrategyTrail />
      <PageHeader
        eyebrow={`Strategic Planning · ${schoolName ?? 'School'}`}
        title={
          <span className="inline-flex items-center gap-3">
            <Compass size={26} strokeWidth={1.75} className="shrink-0 text-navy-soft" aria-hidden="true" />
            Strategic Planning
          </span>
        }
        meta="No strategic plan yet"
      />
      <Section label="Start the plan">
        <div className="b1-empty b1-empty-left">
          <p className="b1-empty-title">Create your plan, add a few pillars, then bind goals to the metrics you already track.</p>
          <p>
            Days cash on hand, operating margin, enrollment: a goal bound to a live metric measures itself, so the
            scorecard is never typed in.
          </p>
          {canEdit ? (
            <Button variant="primary" onClick={onCreate} icon={<Plus size={15} />} className="mt-1">
              Create strategic plan
            </Button>
          ) : (
            <p>An owner or accountant can create the plan.</p>
          )}
        </div>
      </Section>
    </div>
  )
}

/** A ruled state row inside a register tab (empty / none yet). */
function StateRow({ title, children }) {
  return (
    <div className="b1-empty">
      {title ? <p className="b1-empty-title">{title}</p> : null}
      {children ? <p>{children}</p> : null}
    </div>
  )
}

// ═══════════════════════════ Register tab bodies ════════════════════════════
function PlansBody({ plan, pillars, canEdit, onEditPlan, onNewPillar, onEditPillar, onDeletePillar }) {
  return (
    <div className="flex flex-col gap-8">
      <dl className="b1-facts">
        <div>
          <dt>Active plan</dt>
          <dd className="inline-flex items-center justify-end gap-2">
            <span className="font-serif text-[17px] font-medium">{plan.name}</span>
            {canEdit ? (
              <Button size="sm" variant="quiet" onClick={onEditPlan} icon={<Pencil size={13} />}>
                Edit plan
              </Button>
            ) : null}
          </dd>
        </div>
      </dl>

      {pillars.length === 0 ? (
        <StateRow title="No pillars yet">Add a pillar to group your goals under a strategic theme.</StateRow>
      ) : (
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {pillars.map((p) => (
            <PillarCard key={p.id} pillar={p} canEdit={canEdit} onEdit={onEditPillar} onDelete={onDeletePillar} />
          ))}
        </div>
      )}

      {canEdit ? (
        <Button size="sm" onClick={onNewPillar} icon={<Plus size={14} />} className="self-start">
          Add pillar
        </Button>
      ) : null}
    </div>
  )
}

function GoalsBody({ goals, canEdit, onEdit, onDelete }) {
  if (goals.length === 0) {
    return <StateRow title="No goals yet">Bind a goal to a live metric and it starts measuring itself.</StateRow>
  }
  return (
    <ul className="b1-list">
      {goals.map((g) => (
        <li key={g.id} id={`strategy-goal-${g.id}`}>
          <GoalCard goal={g} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  )
}

function InitiativesBody({ initiatives, canEdit, onEdit, onDelete }) {
  if (initiatives.length === 0) {
    return <StateRow title="No initiatives yet">Add the projects that will move your goals forward.</StateRow>
  }
  return (
    <ul className="b1-list">
      {initiatives.map((it) => (
        <InitiativeRow key={it.id} initiative={it} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </ul>
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
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <StrategyTrail />
        <PageHeader eyebrow={`Strategic Planning · ${activeSchool?.name ?? 'School'}`} title="Strategic Planning" meta="Loading the plan…" />
      </div>
    )
  }
  if (!hasPlan) {
    return (
      <>
        <ModuleAccent moduleKey="strategy">
          <EmptyPlanPanel
            schoolName={activeSchool?.name}
            canEdit={canEdit}
            onCreate={() => setModal({ type: 'plan', entity: null })}
          />
        </ModuleAccent>
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
    <div className="mx-auto max-w-page px-4 pt-4 sm:px-10">
      <p role="alert" className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
        <i className="mark tone-risk" aria-hidden="true" />
        {error}
      </p>
    </div>
  ) : null

  const commandCenter = (
    <DomainCommandCenter
      showAddData
      moduleKey="strategy"
      eyebrow={`Strategic Planning · ${activeSchool?.name ?? 'School'}`}
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

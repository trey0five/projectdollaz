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
  Gauge,
  Target,
  CreditCard,
  Flag,
  Layers,
  Rocket,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import { AuroraButton, HowThisWorks, VerdictEm } from '../components/ui/aurora/index.js'
import RegisterEmpty from '../components/module/RegisterEmpty.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
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
import { Button } from '../components/ui/surface/index.js'
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

// ── Gate / empty: the Aurora band + one line + one button ────────────────────
function GatePanel({ notLicensed }) {
  const { activeSchool } = useSchools()
  const isOwner = activeSchool?.role === 'owner'
  return (
    <DomainStatePanel
      showBack
      moduleKey="strategy"
      title={moduleLabel('strategy')}
      Icon={Compass}
      icon={Compass}
      verdict={notLicensed ? 'Strategic Planning isn\u2019t on your plan yet.' : 'Your subscription is paused.'}
      primaryAction={
        <AuroraButton
          variant="primary"
          to={isOwner ? '/settings/billing' : '/settings'}
          icon={<CreditCard size={19} aria-hidden="true" />}
        >
          {notLicensed ? 'See plans' : 'Resume your plan'}
        </AuroraButton>
      }
      text={
        notLicensed
          ? 'Add Strategic Planning to turn your plan into goals that measure themselves.'
          : 'Resume your plan to manage your strategic plan.'
      }
    />
  )
}

// No plan yet — the screen a new school lands on. The Aurora band (one plain
// sentence + the one job) over a designed empty state; the "how goals measure
// themselves" explanation sits behind How this works.
function EmptyPlanPanel({ canEdit, onCreate }) {
  return (
    <DomainStatePanel
      showBack
      moduleKey="strategy"
      title={moduleLabel('strategy')}
      Icon={Compass}
      icon={Compass}
      verdict="No strategic plan yet. Start one and its goals measure themselves."
      primaryAction={
        canEdit ? (
          <AuroraButton variant="primary" onClick={onCreate} icon={<Plus size={19} aria-hidden="true" />}>
            Create strategic plan
          </AuroraButton>
        ) : null
      }
      text="Create the plan, add a few pillars, then link goals to numbers you already track."
      sub={canEdit ? null : 'An owner or accountant can create the plan.'}
    />
  )
}

/** A ruled state row inside a register tab (empty / none yet). */
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
        <RegisterEmpty icon={Layers} text="No pillars yet." sub="A pillar groups goals under one theme." actionLabel="Add a pillar" />
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
    return (
      <RegisterEmpty icon={Target} text="No goals yet." sub="Link one to a number you track." actionLabel="Add a goal" />
    )
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
    return (
      <RegisterEmpty icon={Rocket} text="No initiatives yet." sub="The projects that move a goal." actionLabel="Add an initiative" />
    )
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
  // Pace is each goal's OWN target and date; with no goals bound there is
  // nothing to judge, so the cards show plain figures and no pill.
  const kpis = useMemo(() => {
    const gc = plan?.goalCounts ?? {}
    const pct = Math.round((plan?.overallProgressPct ?? 0) * 100)
    const onTrack = (gc.onTrack ?? 0) + (gc.achieved ?? 0)
    const behind = summary.behindPaceGoalCount ?? gc.behind ?? 0
    const atRisk = summary.atRiskGoalCount ?? gc.atRisk ?? 0
    const total = gc.total ?? 0
    // A goal with no data (no actuals yet, or target = baseline) is never
    // judged: every pill and "on pace" word is gated on MEASURED goals.
    const measured = Math.max(0, total - (gc.noData ?? 0))
    const reviewDate = summary.nextReviewDate ?? plan?.nextReviewDate ?? null

    return [
      {
        label: 'Overall progress',
        icon: Gauge,
        value: measured ? `${pct}%` : '—',
        status: measured ? (PACE_TO_STATUS[plan?.overallPaceStatus] ?? 'neutral') : 'neutral',
        sub: !total
          ? { icon: Target, text: 'no goals linked yet', tone: 'neutral' }
          : !measured
            ? { icon: Clock, text: 'no goal has data yet', tone: 'neutral' }
            : {
              icon: plan?.overallPaceStatus === 'behind' ? TrendingDown : TrendingUp,
              text:
                plan?.overallPaceStatus === 'behind'
                  ? 'behind pace overall'
                  : plan?.overallPaceStatus === 'at_risk'
                    ? 'slipping overall'
                    : 'on pace overall',
              tone:
                plan?.overallPaceStatus === 'behind' ? 'bad' : plan?.overallPaceStatus === 'at_risk' ? 'neutral' : 'good',
            },
      },
      {
        label: 'Goals on track',
        icon: Target,
        value: String(onTrack),
        unit: total ? `of ${total}` : null,
        status: measured && onTrack ? 'good' : 'neutral',
        sub: {
          icon: Check,
          text: !total ? 'add a goal to start' : measured ? 'on pace or achieved' : 'waiting for data',
          tone: 'neutral',
        },
      },
      {
        label: 'Behind pace',
        icon: TrendingDown,
        value: String(behind),
        status: !measured ? 'neutral' : behind > 0 ? 'risk' : 'good',
        sub:
          behind > 0
            ? { icon: TrendingDown, text: 'goals under pace', tone: 'bad' }
            : atRisk > 0
              ? { icon: Clock, text: `${atRisk} slipping`, tone: 'neutral' }
              : !total
                ? { icon: Check, text: 'nothing to judge yet', tone: 'neutral' }
                : !measured
                  ? { icon: Clock, text: 'no goal has data yet', tone: 'neutral' }
                  : { icon: Check, text: gc.noData ? 'measured goals on pace' : 'all goals on pace', tone: 'neutral' },
      },
      {
        label: 'Next review',
        icon: CalendarClock,
        value: reviewDate ? (shortDate(reviewDate) ?? '—') : '—',
        status: summary.reviewDueThisMonth ? 'watch' : 'neutral',
        sub: summary.reviewDueThisMonth
          ? { icon: CalendarClock, text: 'due this month', tone: 'neutral' }
          : { icon: CalendarClock, text: reviewDate ? 'on schedule' : 'not scheduled', tone: 'neutral' },
      },
    ]
  }, [plan, summary])

  // ── The band's one sentence (real figures only; worst thing first) ────────
  const verdict = useMemo(() => {
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
    const gc = plan?.goalCounts ?? {}
    const total = gc.total ?? 0
    if (!plan) return null
    if (!total) return <>Link a goal to a number you already track and the plan starts measuring itself.</>
    const noData = gc.noData ?? 0
    if (noData >= total) {
      return (
        <>
          None of the <VerdictEm>{plural(total, 'goal', 'goals')}</VerdictEm> has data yet.
        </>
      )
    }
    const pct = Math.round((plan.overallProgressPct ?? 0) * 100)
    const behind = summary.behindPaceGoalCount ?? gc.behind ?? 0
    const atRisk = summary.atRiskGoalCount ?? gc.atRisk ?? 0
    const stale = (summary.staleInitiatives ?? []).length
    const issues = [
      behind && { tone: 'risk', text: `${plural(behind, 'goal is', 'goals are')} behind pace.` },
      atRisk && { tone: 'watch', text: `${plural(atRisk, 'goal is', 'goals are')} slipping.` },
      stale && { tone: 'watch', text: `${plural(stale, 'initiative has', 'initiatives have')} stalled.` },
      summary.reviewDueThisMonth && { tone: 'watch', text: 'The plan review is due this month.' },
    ].filter(Boolean)
    const top = issues[0]
    return (
      <>
        The plan is <VerdictEm>{pct}% of the way</VerdictEm> across{' '}
        <VerdictEm>{plural(total, 'goal', 'goals')}</VerdictEm>.{' '}
        {top ? (
          <VerdictEm tone={top.tone}>{top.text}</VerdictEm>
        ) : noData ? (
          <VerdictEm tone="good">The measured goals are on pace.</VerdictEm>
        ) : (
          <VerdictEm tone="good">Every goal is on pace.</VerdictEm>
        )}
        {noData ? <> {plural(noData, 'goal has', 'goals have')} no data yet.</> : null}
      </>
    )
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
        why: `No movement in ${it.staleDays ?? 60}+ days. Owner: ${it.ownerName ?? 'nobody yet'}.`,
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
      <ModuleAccent moduleKey="strategy">
        <DomainStatePanel
          showBack
          moduleKey="strategy"
          title={moduleLabel('strategy')}
          Icon={Compass}
          icon={Compass}
          verdict="Loading the plan…"
          text="Reading your pillars, goals and initiatives."
          busy
        />
      </ModuleAccent>
    )
  }
  if (!hasPlan) {
    return (
      <>
        <ModuleAccent moduleKey="strategy">
          <EmptyPlanPanel
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

  // What needs a decision comes first (register + Needs attention); the plan's
  // arc — the module's numbers — follows, then How this works.
  const commandCenter = (
    <>
      <DomainCommandCenter
        showAddData
        moduleKey="strategy"
        eyebrow={
          plan?.fyStartYear
            ? `FY ${plan.fyStartYear}${plan.fyEndYear && plan.fyEndYear !== plan.fyStartYear ? `–${plan.fyEndYear}` : ''}`
            : null
        }
        title="Strategic Planning"
        Icon={Compass}
        verdict={verdict}
        attentionCount={attentionItems.length}
        kpis={kpis}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        onNew={onNew}
        registerTable={registerTable}
        attentionItems={attentionItems}
        registerSubtitle="Pillars, goals and the projects behind them"
        registerIcon={Flag}
      />
      <div className="au-scope mx-auto max-w-page px-4 pb-8 sm:px-10">
        <StrategyHorizon plan={plan} pillars={pillars} summary={summary} />
        <HowThisWorks>
          <p>
            A goal linked to a number you already track (cash, margin, enrollment) reads it live, so its progress is
            never typed in.
          </p>
          <p>
            Pace compares each goal&rsquo;s progress with how much time is left before its own target date. An
            initiative counts as stalled after 60 days with no movement.
          </p>
        </HowThisWorks>
      </div>
    </>
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

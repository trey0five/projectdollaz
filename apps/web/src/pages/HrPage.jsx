// ─────────────────────────────────────────────────────────────────────────────
// HR & Staffing route (Phase 6) — the hr module's DOMAIN COMMAND CENTER at /hr.
// A staffing command center on EXISTING endpoints only: the student-teacher
// ratio (banded), teaching/total staff FTEs, teaching share and FTE change as
// .kpi-3d KPI cards; staffing trends (shared TrendSpark) across saved periods;
// a Needs-attention rail (ratio risk/watch → the Analytics deep link that has
// always worked; missing FTEs → the Add tab); and the hr.staffing RecordFlow as
// the module's add path (partial PUT onto the operational row — the Data hub's
// OperationalDataPanel keeps owning the full operational intake, untouched).
//
// School-scoped. Gated CLIENT-SIDE by the 'hr' module (StrategyPage pattern) —
// the server already strips hr metrics for an unlicensed school; this page adds
// the friendly upsell panel instead of an empty shell.
//
// AIC PHASE F adds the module's FIRST REGISTER OF RECORDS — staff evaluations —
// as a second register tab beside the staffing trends, plus one KPI card bound to
// the counts-only /summary route.
//
// THE PII SPLIT IS THE WHOLE DESIGN, so it is stated here as well as in the panel:
//   • the KPI card reads /summary — INTEGERS ONLY, and every role reads it, so
//     there is exactly one code path behind the number;
//   • the register itself names people and is owner/accountant only. A viewer is
//     403'd by the server and never sees a row; the panel prints one frozen
//     sentence in its place.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import {
  Users2,
  UserCog,
  TrendingUp,
  TrendingDown,
  Minus,
  ClipboardCheck,
  Check,
  AlertTriangle,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter from '../components/domain/DomainCommandCenter.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import TrendSpark from '../components/analytics/v2/TrendSpark.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useBilling } from '../context/BillingContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useAnalytics, useOperational } from '../hooks/useAnalytics.js'
import { useStaffEvaluations } from '../hooks/useStaffEvaluations.js'
import StaffEvaluationsPanel, {
  StaffEvaluationFormModal,
  evaluationToForm,
} from '../components/hr/StaffEvaluationsPanel.jsx'
import {
  EVAL_OVERDUE_RISK_COUNT,
  EVAL_OVERDUE_RISK_DAYS,
  canReadStaffEvaluations,
} from '../components/hr/staffEvaluationMeta.js'
import { useSparkTrends } from '../components/analytics/v2/data.js'
import { formatMetric } from '../components/analytics/v2/helpers.js'
import { formatMetricValue } from '../lib/metricMeta.js'

// The hr module hue (locked brand hue — matches tileRegistry/moduleAnatomy).
const HR_HUE = '#059669'

const TREND_KEYS = ['student_teacher_ratio', 'teaching_staff_share', 'total_staff_fte']

// The register tabs. 'trends' keeps the pre-Phase-F register slot byte-for-byte;
// 'evaluations' is the new register of records.
const TABS = [
  { key: 'trends', label: 'Staffing trends' },
  { key: 'evaluations', label: 'Evaluations' },
]

const fteText = (v) =>
  v == null || !Number.isFinite(Number(v))
    ? '—'
    : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })

const signedPct = (v) =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

// Band-target context ("Target ≤ 12.0") for a banded metric.
function bandTarget(m) {
  const b = m?.bands
  if (!b || !Number.isFinite(b.good)) return null
  const dir = b.goodDirection ?? m.goodDirection
  return `target ${dir === 'lower' ? '≤' : '≥'} ${formatMetricValue(b.good, m.unit ?? 'ratio')}`
}

// ── Light-theme gate panel (StrategyPage pattern) ────────────────────────────
function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <Users2 size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">HR &amp; Staffing isn&apos;t on your plan yet</h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the HR &amp; Staffing module for a staffing command center — the student-teacher
              ratio, FTEs and trends on one page, with staffing flags in your morning briefing.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">Resume your plan to see your staffing picture.</p>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════ PAGE ═══════════════════════════════════════════
function HrWorkspace() {
  const navigate = useNavigate()
  const uiV2 = useUiV2()
  const { activeSchool } = useSchools()
  const { periods, activePeriod } = usePersistence()
  const { entitled, hasModule } = useBilling()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()
  // The register's role gate is the SERVER's, restated: @Roles('owner','accountant')
  // on every route except /summary. Asking here means we never fire a request we
  // already know 403s — and a 403 is still handled as a first-class answer.
  const canReadEvaluations = canReadStaffEvaluations(activeSchool?.role)

  // Period derivation — the AddDataTab/DataHub idiom incl. the school-swap race
  // guard (adopt on VALIDITY, never a stale cross-tenant id).
  const defaultPeriodId =
    ((periods || []).some((p) => p.id === activePeriod?.id) ? activePeriod?.id : null) ??
    (periods || []).find((p) => p.hasSnapshot)?.id ??
    (periods || [])[0]?.id ??
    null
  const [derivedPeriodId, setDerivedPeriodId] = useState(null)
  const [lastSchoolId, setLastSchoolId] = useState(schoolId)
  if (schoolId !== lastSchoolId) {
    setLastSchoolId(schoolId)
    setDerivedPeriodId(null)
  }
  const periodValid = derivedPeriodId != null && (periods || []).some((p) => p.id === derivedPeriodId)
  if (defaultPeriodId && !periodValid) setDerivedPeriodId(defaultPeriodId)
  const periodId = derivedPeriodId
  const periodLabel = (periods || []).find((p) => p.id === periodId)?.label || 'this period'

  // Existing reads only: gated metrics, the (ungated) operational row, /trends.
  const { metrics, loading: metricsLoading } = useAnalytics(schoolId, periodId)
  const { operational } = useOperational(schoolId, periodId)
  const trends = useSparkTrends(schoolId, TREND_KEYS)

  // AIC Phase F — the staff-evaluation register (school-scoped, not period-scoped).
  const {
    evaluations,
    summary: evalSummary,
    loading: evalLoading,
    error: evalError,
    restricted: evalRestricted,
    createEvaluation,
    updateEvaluation,
    removeEvaluation,
  } = useStaffEvaluations(schoolId, { canRead: canReadEvaluations })

  const [tab, setTab] = useState('trends')
  const [evalModalOpen, setEvalModalOpen] = useState(false)
  const [editingEval, setEditingEval] = useState(null)

  const openAddEvaluation = () => {
    setEditingEval(null)
    setEvalModalOpen(true)
  }
  const openEditEvaluation = (ev) => {
    setEditingEval(ev)
    setEvalModalOpen(true)
  }
  const onSaveEvaluation = async (body) => {
    if (editingEval) await updateEvaluation(editingEval.id, body)
    else await createEvaluation(body)
  }
  const onDeleteEvaluation = async (ev) => {
    if (window.confirm(`Delete the ${ev.cycleLabel ?? 'evaluation'} record for ${ev.personName ?? 'this person'}?`))
      await removeEvaluation(ev.id)
  }
  const editingEvalForm = useMemo(
    () => (editingEval ? evaluationToForm(editingEval) : null),
    [editingEval],
  )

  const m = useMemo(() => {
    const map = {}
    for (const x of metrics) map[x.key] = x
    return map
  }, [metrics])

  const ratio = m.student_teacher_ratio
  const share = m.teaching_staff_share
  const fteYoy = m.fte_change_yoy
  const teachingFte = operational?.teachingFte != null ? Number(operational.teachingFte) : null
  const totalStaffFte = operational?.totalStaffFte != null ? Number(operational.totalStaffFte) : null

  // ── KPI row (.kpi-3d via DomainKpiCard) ────────────────────────────────────
  const kpis = useMemo(
    () => [
      {
        label: 'Students per teacher',
        value: ratio?.value != null ? formatMetric(ratio) : '—',
        status: ratio?.status ?? 'neutral',
        sub: {
          icon: UserCog,
          text: bandTarget(ratio) ?? 'enter FTEs to compute',
          tone: ratio?.status === 'risk' ? 'bad' : ratio?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Teaching FTE',
        value: fteText(teachingFte),
        status: 'neutral',
        sub: { icon: Users2, text: 'instructional staff', tone: 'neutral' },
      },
      {
        label: 'Total staff FTE',
        value: fteText(totalStaffFte),
        status: 'neutral',
        sub: { icon: Users2, text: 'all staff', tone: 'neutral' },
      },
      {
        label: 'Teaching share',
        value: share?.value != null ? formatMetric(share) : '—',
        status: share?.status ?? 'neutral',
        sub: {
          icon: UserCog,
          text: bandTarget(share) ?? 'of total staff are teaching',
          tone: share?.status === 'risk' ? 'bad' : share?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Teaching FTE (YoY)',
        value: fteYoy?.value != null ? signedPct(fteYoy.value) : '—',
        status: 'neutral',
        sub: {
          icon: fteYoy?.value > 0 ? TrendingUp : fteYoy?.value < 0 ? TrendingDown : Minus,
          text: 'vs. last year — contextual',
          tone: 'neutral',
        },
      },
      // AIC Phase F — bound to /summary, which is COUNTS ONLY and readable by
      // every role including viewer. There is no percentage here and there will
      // not be one: a "% of staff evaluated" needs a staff denominator, and the
      // people register is a partial, opt-in roster we cannot vouch for.
      //
      // "WE COULD NOT LOOK" IS NOT "WE LOOKED AND IT IS FINE". `evalSummary` is
      // null when the /summary read failed (or has not returned), and a green 0
      // reading "no cycle recorded yet" would be the same card a school with a
      // spotless register sees. The register panel's error text is below the fold
      // and a viewer never gets the panel at all, so the card has to say it.
      evalSummary == null
        ? {
            label: 'Evaluations overdue',
            value: '—',
            status: 'neutral',
            sub: {
              icon: ClipboardCheck,
              text: evalLoading ? 'reading your register…' : 'we could not read the register',
              tone: 'neutral',
            },
          }
        : {
            label: 'Evaluations overdue',
            value: String(evalSummary.overdue ?? 0),
            status: (evalSummary.overdue ?? 0) > 0 ? 'risk' : 'good',
            sub:
              (evalSummary.overdue ?? 0) > 0
                ? {
                    icon: AlertTriangle,
                    text:
                      (evalSummary.oldestOverdueDays ?? 0) > 0
                        ? `oldest ${evalSummary.oldestOverdueDays}d past due`
                        : 'past their own due date',
                    tone: 'bad',
                  }
                : (evalSummary.total ?? 0) > 0
                  ? { icon: Check, text: `${evalSummary.total} on file`, tone: 'good' }
                  : { icon: ClipboardCheck, text: 'no cycle recorded yet', tone: 'neutral' },
          },
    ],
    [ratio, share, fteYoy, teachingFte, totalStaffFte, evalSummary, evalLoading],
  )

  // ── Needs attention (navigational) ─────────────────────────────────────────
  const attentionItems = useMemo(() => {
    const items = []
    if (ratio && (ratio.status === 'risk' || ratio.status === 'watch')) {
      items.push({
        id: 'ratio-band',
        tone: ratio.status,
        title: `Student-teacher ratio is ${ratio.status === 'risk' ? 'at risk' : 'on watch'}`,
        why: `${formatMetric(ratio)} students per teacher · ${bandTarget(ratio) ?? 'against the sector default band'}`,
        actions: [
          {
            label: 'View in Analytics',
            primary: true,
            onClick: () => navigate('/analytics?metric=student_teacher_ratio'),
          },
        ],
      })
    }
    if (share && (share.status === 'risk' || share.status === 'watch')) {
      items.push({
        id: 'share-band',
        tone: share.status,
        title: 'Teaching share of staff is slipping',
        why: `${formatMetric(share)} of your staff FTEs are teaching · ${bandTarget(share) ?? ''}`,
        actions: [
          { label: 'View in Analytics', primary: false, onClick: () => navigate('/analytics?metric=teaching_staff_share') },
        ],
      })
    }
    // AIC Phase F — the new register feeds the rail, like every sibling domain.
    // Without this the header pill reads "all clear" beside a red KPI card saying
    // twelve evaluations are overdue, and the one thing on the page that is
    // actually wrong has no action affordance. Guarded by the register's own role
    // gate so a viewer is not offered a register the server will 403.
    if (canReadEvaluations && (evalSummary?.overdue ?? 0) > 0) {
      const overdue = evalSummary.overdue
      const oldest = evalSummary.oldestOverdueDays ?? 0
      items.push({
        id: 'evaluations-overdue',
        tone: overdue >= EVAL_OVERDUE_RISK_COUNT || oldest > EVAL_OVERDUE_RISK_DAYS ? 'risk' : 'watch',
        title: `${overdue} staff evaluation${overdue === 1 ? '' : 's'} past their own due date`,
        why:
          oldest > 0
            ? `The oldest has been outstanding ${oldest} day${oldest === 1 ? '' : 's'}.`
            : 'Recorded in your evaluation register, past the date it set for itself.',
        actions: [{ label: 'Open the register', primary: true, onClick: () => setTab('evaluations') }],
      })
    }
    if (operational && (teachingFte == null || totalStaffFte == null)) {
      items.push({
        id: 'fte-missing',
        tone: 'watch',
        title: `Staffing FTEs not entered for ${periodLabel}`,
        why: 'The ratio and staffing mix stay dark until both FTEs are in.',
        actions: canEdit
          ? [{ label: 'Add staffing', primary: true, onClick: () => navigate('/hr?tab=add') }]
          : [],
      })
    }
    return items
  }, [
    ratio,
    share,
    operational,
    teachingFte,
    totalStaffFte,
    periodLabel,
    canEdit,
    navigate,
    canReadEvaluations,
    evalSummary,
  ])

  // ── Staffing trends (the register slot HR shipped with) ────────────────────
  const trendsTable = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-rule/50 p-3">
        <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Students per teacher</p>
        <TrendSpark trend={trends.student_teacher_ratio} color={HR_HUE} formatter={(v) => v.toFixed(1)} />
      </div>
      <div className="rounded-xl border border-rule/50 p-3">
        <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Teaching share</p>
        <TrendSpark trend={trends.teaching_staff_share} color={HR_HUE} formatter={(v) => `${(v * 100).toFixed(0)}%`} />
      </div>
      <div className="rounded-xl border border-rule/50 p-3">
        <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Total staff FTE</p>
        <TrendSpark trend={trends.total_staff_fte} color={HR_HUE} formatter={(v) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })} />
      </div>
    </div>
  )

  // ── Gate / loading ─────────────────────────────────────────────────────────
  // The module gate runs FIRST and unconditionally, so an unlicensed school gets
  // the upsell panel and never a 402-shaped crash from the new register.
  if (!hasModule('hr')) return <GatePanel notLicensed={entitled} />
  if (metricsLoading && !metrics.length) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="h-64 animate-pulse rounded-3xl bg-section" />
      </div>
    )
  }

  const registerTable =
    tab === 'evaluations' ? (
      <StaffEvaluationsPanel
        evaluations={evaluations}
        loading={evalLoading}
        error={evalError}
        restricted={evalRestricted}
        canEdit={canEdit}
        reduce={reduce}
        onAdd={openAddEvaluation}
        onEdit={openEditEvaluation}
        onDelete={onDeleteEvaluation}
      />
    ) : (
      trendsTable
    )

  // "+ New" belongs to the evaluations register only — staffing trends is a chart
  // slot with nothing to create. It is also hidden while the register is
  // restricted: offering an action a role cannot take is its own small dishonesty.
  const onNew =
    tab === 'evaluations' && canEdit && !evalRestricted ? openAddEvaluation : null

  const commandCenter = (
    <DomainCommandCenter
      showAddData={canEdit}
      moduleKey="hr"
      eyebrow="Domain · HR & Staffing · the people behind the ratios"
      title="HR & Staffing"
      Icon={Users2}
      attentionCount={attentionItems.length}
      kpis={kpis}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onNew={onNew}
      registerTable={registerTable}
      attentionItems={attentionItems}
    />
  )

  const modal = (
    <StaffEvaluationFormModal
      key={editingEval ? editingEval.id : 'new'}
      open={evalModalOpen}
      schoolId={schoolId}
      initial={editingEvalForm}
      editingPersonName={editingEval?.personName ?? null}
      onClose={() => setEvalModalOpen(false)}
      onSave={onSaveEvaluation}
      reduce={reduce}
    />
  )

  if (uiV2) {
    return (
      <ModuleAccent moduleKey="hr">
        <ModuleTabs
          moduleKey="hr"
          overview={commandCenter}
          addData={<AddDataTab module="hr" schoolId={schoolId} periodId={periodId} canEdit={canEdit} />}
        />
        {modal}
      </ModuleAccent>
    )
  }
  return (
    <>
      {commandCenter}
      {modal}
    </>
  )
}

export default function HrPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <HrWorkspace />
    </div>
  )
}

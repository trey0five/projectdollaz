// ─────────────────────────────────────────────────────────────────────────────
// HR & Staffing route (Phase 6) — the hr module's DOMAIN COMMAND CENTER at /hr.
// A staffing command center on EXISTING endpoints only: the student-teacher
// ratio (banded), teaching/total staff FTEs, teaching share and FTE change as
// Stats in the command center's StatStrip; staffing trends as a ruled StatStrip
// of latest values over the shared TrendSpark (no mini-cards);
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
  GraduationCap,
  PieChart,
  CreditCard,
  LineChart,
  BarChart3,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DomainCommandCenter, { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import { AuroraButton, AuroraEmpty, AuroraLightButton, VerdictEm, fyLabel } from '../components/ui/aurora/index.js'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
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
import { StatStrip, Stat } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'

// The hr module hue — read from the ONE registry (tileRegistry → moduleHue).
const HR_HUE = moduleHue('hr')

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

// Band-target context in plain words ("good at 12 or fewer", "good at 60% or
// more") for a banded metric — the registry band's own threshold, never invented.
function bandTarget(m) {
  const b = m?.bands
  if (!b || !Number.isFinite(b.good)) return null
  const dir = b.goodDirection ?? m.goodDirection
  const unit = m.unit ?? 'ratio'
  const value =
    unit === 'pct' || unit === 'percent'
      ? `${Math.round(b.good * 100)}%`
      : unit === 'ratio' || unit === 'count'
        ? Number(b.good).toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(b.good) ? 0 : 1 })
        : formatMetricValue(b.good, unit)
  return `good at ${value} or ${dir === 'lower' ? 'fewer' : 'more'}`
}

// ── Gate: the Aurora band + one line + one button ───────────────────────────
function GatePanel({ notLicensed }) {
  const { activeSchool } = useSchools()
  const isOwner = activeSchool?.role === 'owner'
  return (
    <DomainStatePanel
      showBack
      moduleKey="hr"
      title="HR & Staffing"
      Icon={Users2}
      icon={Users2}
      verdict={notLicensed ? 'HR & Staffing isn\u2019t on your plan yet.' : 'Your subscription is paused.'}
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
          ? 'Add HR & Staffing to see students per teacher, staff numbers and their trend.'
          : 'Resume your plan to see your staffing picture.'
      }
    />
  )
}

// The latest point of a /trends series, formatted — the figure above its spark.
function latest(trend, fmt) {
  const pts = trend?.points ?? []
  const v = pts.length ? pts[pts.length - 1]?.value : null
  return v == null || !Number.isFinite(Number(v)) ? '—' : fmt(Number(v))
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

  // ── KPI row (Stats via DomainKpiCard) ────────────────────────────────────
  // The first four are the band's glass cards (the banded ratio and mix, then
  // the evaluations register and teacher headcount); the rest ride as chips.
  const kpis = useMemo(() => {
    const k = [
      {
        label: 'Students per teacher',
        icon: GraduationCap,
        value: ratio?.value != null ? formatMetric(ratio) : '—',
        status: ratio?.status ?? 'neutral',
        sub: {
          icon: UserCog,
          text: bandTarget(ratio) ?? 'enter FTEs to compute',
          tone: ratio?.status === 'risk' ? 'bad' : ratio?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Teachers (FTE)',
        icon: UserCog,
        value: fteText(teachingFte),
        status: 'neutral',
        sub: { icon: Users2, text: 'instructional staff', tone: 'neutral' },
      },
      {
        label: 'All staff (FTE)',
        icon: Users2,
        value: fteText(totalStaffFte),
        status: 'neutral',
        sub: { icon: Users2, text: 'all staff', tone: 'neutral' },
      },
      {
        label: 'Teaching share',
        icon: PieChart,
        value: share?.value != null ? formatMetric(share) : '—',
        status: share?.status ?? 'neutral',
        sub: {
          icon: UserCog,
          text: bandTarget(share) ?? 'of total staff are teaching',
          tone: share?.status === 'risk' ? 'bad' : share?.status === 'good' ? 'good' : 'neutral',
        },
      },
      {
        label: 'Teachers vs. last year',
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
            icon: ClipboardCheck,
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
            icon: ClipboardCheck,
            value: String(evalSummary.overdue ?? 0),
            // An empty register is not "Good": no cycle on file → no verdict.
            status: (evalSummary.overdue ?? 0) > 0 ? 'risk' : (evalSummary.total ?? 0) > 0 ? 'good' : 'neutral',
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
    ]
    return [k[0], k[3], k[5], k[1], k[2], k[4]]
  }, [ratio, share, fteYoy, teachingFte, totalStaffFte, evalSummary, evalLoading])

  // ── Needs attention (navigational) ─────────────────────────────────────────
  const attentionItems = useMemo(() => {
    const items = []
    if (ratio && (ratio.status === 'risk' || ratio.status === 'watch')) {
      items.push({
        id: 'ratio-band',
        tone: ratio.status,
        title: `Student-teacher ratio is ${ratio.status === 'risk' ? 'at risk' : 'on watch'}`,
        why: `${formatMetric(ratio)} students per teacher, ${bandTarget(ratio) ?? 'outside the standard range'}.`,
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
        why: `${formatMetric(share)} of staff are teaching${bandTarget(share) ? `, ${bandTarget(share)}` : ''}.`,
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
        title: `Staff numbers missing for ${periodLabel}`,
        why: 'Students per teacher fills in once both are in.',
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

  // ── The band's one sentence (real figures only; worst thing first) ────────
  const verdict = useMemo(() => {
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
    const BAND_WORD = { risk: 'at risk', watch: 'one to watch' }
    const hasRatio = ratio?.value != null
    const lead = hasRatio ? (
      <>
        <VerdictEm>{formatMetric(ratio)} students</VerdictEm> per teacher
        {teachingFte != null ? (
          <>
            {' '}across <VerdictEm>{fteText(teachingFte)} teaching FTE</VerdictEm>
          </>
        ) : null}
        .{' '}
      </>
    ) : null
    // /summary is counts-only and readable by every role, and the glass card
    // already shows it to every role — so the sentence counts it for every role
    // too (else a viewer's band reads "healthy" over an At risk card).
    const overdueEvals = evalSummary?.overdue ?? 0
    const issues = [
      ratio?.status === 'risk' && { tone: 'risk', text: `Students per teacher is ${BAND_WORD.risk}.` },
      share?.status === 'risk' && { tone: 'risk', text: `Teaching share is ${BAND_WORD.risk}.` },
      overdueEvals && { tone: 'risk', text: `${plural(overdueEvals, 'evaluation is', 'evaluations are')} overdue.` },
      ratio?.status === 'watch' && { tone: 'watch', text: `Students per teacher is the ${BAND_WORD.watch}.` },
      share?.status === 'watch' && { tone: 'watch', text: `Teaching share is the ${BAND_WORD.watch}.` },
    ].filter(Boolean)
    const top = issues[0]
    if (!lead && !top) {
      return <>Add this year&rsquo;s staff numbers and students per teacher fills in.</>
    }
    const banded = [ratio?.status, share?.status].filter((x) => x === 'good' || x === 'watch' || x === 'risk')
    return (
      <>
        {lead}
        {top ? (
          <VerdictEm tone={top.tone}>{top.text}</VerdictEm>
        ) : banded.length ? (
          <VerdictEm tone="good">Staffing looks healthy.</VerdictEm>
        ) : null}
      </>
    )
  }, [ratio, share, teachingFte, evalSummary])

  // ── Staffing trends (the register slot HR shipped with): a ruled strip of
  //    the latest figure over its trend line — no mini-cards. ─────────────────
  const fmtRatio = (v) => v.toFixed(1)
  const fmtShare = (v) => `${(v * 100).toFixed(0)}%`
  const fmtFte = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })
  const hasTrend = TREND_KEYS.some((key) =>
    (trends[key]?.points ?? []).some((pt) => pt?.value != null && Number.isFinite(Number(pt.value))),
  )
  const trendsTable = !hasTrend ? (
    <AuroraEmpty
      icon={LineChart}
      text="No staffing history yet."
      sub="Add staff numbers and the trend draws here."
      action={
        canEdit ? (
          <AuroraLightButton variant="ghost" to="/hr?tab=add" icon={<BarChart3 size={15} aria-hidden="true" />}>
            Add staffing
          </AuroraLightButton>
        ) : null
      }
    />
  ) : (
    <StatStrip cols={3} className="stats-compact lg:!grid-cols-3">
      <Stat label="Students per teacher" value={latest(trends.student_teacher_ratio, fmtRatio)}>
        <div className="mt-2">
          <TrendSpark trend={trends.student_teacher_ratio} color={HR_HUE} formatter={fmtRatio} />
        </div>
      </Stat>
      <Stat label="Teaching share" value={latest(trends.teaching_staff_share, fmtShare)}>
        <div className="mt-2">
          <TrendSpark trend={trends.teaching_staff_share} color={HR_HUE} formatter={fmtShare} />
        </div>
      </Stat>
      <Stat label="Total staff FTE" value={latest(trends.total_staff_fte, fmtFte)}>
        <div className="mt-2">
          <TrendSpark trend={trends.total_staff_fte} color={HR_HUE} formatter={fmtFte} />
        </div>
      </Stat>
    </StatStrip>
  )

  // ── Gate / loading ─────────────────────────────────────────────────────────
  // The module gate runs FIRST and unconditionally, so an unlicensed school gets
  // the upsell panel and never a 402-shaped crash from the new register.
  if (!hasModule('hr')) return <GatePanel notLicensed={entitled} />
  if (metricsLoading && !metrics.length) {
    return (
      <DomainStatePanel
        moduleKey="hr"
        title="HR & Staffing"
        Icon={Users2}
        icon={Users2}
        busy
        verdict="Loading your staffing picture…"
        text="Reading staff numbers and evaluations."
      />
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
      eyebrow={periodId ? fyLabel(periodLabel) : null}
      title="HR & Staffing"
      Icon={Users2}
      verdict={verdict}
      attentionCount={attentionItems.length}
      kpis={kpis}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      onNew={onNew}
      registerTable={registerTable}
      registerSubtitle="Staff numbers over time, and evaluations"
      registerIcon={Users2}
      attentionItems={attentionItems}
      actions={
        <AuroraButton to="/analytics?metric=student_teacher_ratio" icon={<BarChart3 size={19} aria-hidden="true" />}>
          Analytics
        </AuroraButton>
      }
      howItWorks={
        <>
          <p>
            Students per teacher and teaching share come from the staff numbers (FTE) you enter for{' '}
            {periodLabel}. FTE counts part-timers as fractions.
          </p>
          <p>Good, Watch and At risk use KYRO&rsquo;s standard range for each measure. The change on last year has no range.</p>
          <p>
            The evaluations register names people, so only owners and accountants can open it. Everyone else sees counts
            only.
          </p>
        </>
      }
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

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — the accreditation twin / early-warning rule engine.
//
// This file is where the honesty contract stops being prose. Six of its sections
// are not "tests" in the ordinary sense; they are the enforcement mechanism for
// promises the product makes to a school in writing:
//
//   §5  every numeral in a rationale traces to that finding's evidence[],
//       proven twice — once over the frozen TEMPLATES (no digit may appear
//       outside a {{…}} placeholder) and once over generated FINDINGS by regex
//       extraction;
//   §6  no finding ever renders without a real school standard code;
//   §7  the vocabulary prohibitions — the word this program reserves for five
//       readings, the word it will never use for a staffing level, and the
//       absolute ban on a numeric likelihood;
//   §9  a standard with no evidence scores null, never zero, and 'critical' is
//       reachable only through the assurance bypass;
//   §10 a domain band counts DISTINCT FACTS, so one fact speaking through three
//       rules darkens one domain once;
//   §13 the four named holes are on every payload, forever.
//
// If one of these fails, the correct response is to fix the engine. There is no
// version of "adjust the assertion" that leaves the product honest.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { MetricKey, MetricUnit, GoodDirection, MetricTrend, TrendPoint } from '@finrep/analytics'
import { bandsFor } from '@finrep/analytics'

import {
  ACCREDITATION_TWIN_VERSION,
  ENTRY_GRADE_KEYS,
  FAC_BACKLOG_HONESTY_NOTE,
  TWIN_LIKELIHOODS,
  TWIN_NO_REASON_FALLBACK,
  TWIN_RULE_DEFS,
  TWIN_RULE_IDS,
  TWIN_RULES_BY_ID,
  TWIN_THRESHOLDS,
  TwinTemplateError,
  TwinUndeclaredSignalError,
  VISIBLE_HOLE_RULE_IDS,
  bandForFacts,
  bandForRisk,
  deriveTwin,
  type PriorFact,
  type TwinEvidenceGroupView,
  type TwinFinding,
  type TwinRegisterView,
  type TwinRuleDef,
  type TwinRuleId,
  type TwinSignalAvailability,
  type TwinSignalView,
  type TwinStandardView,
} from '../src/accreditation-twin.js'
import { DOMAIN_KEYS, DOMAIN_REASON_NOUN, type DomainKey } from '../src/accreditation-domains.js'
import { MIN_N_FOR_TREND, TREND_WORD, computeTrendSignal } from '../src/trend-signal.js'
import type { SmallCell } from '../src/small-cells.js'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(resolve(here, '..', 'src', 'accreditation-twin.ts'), 'utf-8')

const NOW = '2026-07-31'
const TH = TWIN_THRESHOLDS

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

interface SignalSeed {
  label: string
  moduleKey: string | null
  domainKeys: DomainKey[]
  table: string
  field?: string
  metricKey?: string
}

/** Mirrors the shipped twin signal catalog for every key a rule declares. */
const SIGNAL_SEEDS: Record<string, SignalSeed> = {
  'gov.minutes_lag': {
    label: 'Days from meeting to approved minutes',
    moduleKey: 'governance',
    domainKeys: ['governance'],
    table: 'Meeting',
    field: 'minutesApprovedAt',
  },
  'gov.meeting_cadence': {
    label: 'Board meetings held in the last year',
    moduleKey: 'governance',
    domainKeys: ['governance'],
    table: 'Meeting',
    field: 'scheduledAt',
  },
  'gov.policy_review': {
    label: 'Policies overdue for review',
    moduleKey: 'governance',
    domainKeys: ['governance'],
    table: 'Policy',
    field: 'lastReviewedDate',
  },
  'gov.board_terms': {
    label: 'Board terms already expired',
    moduleKey: 'governance',
    domainKeys: ['governance'],
    table: 'GovernancePerson',
    field: 'termEnd',
  },
  'gov.committee_chairs': {
    label: 'Active committees without a chair',
    moduleKey: 'governance',
    domainKeys: ['governance'],
    table: 'Committee',
    field: 'chair',
  },
  'fin.months_operating_reserve': {
    label: 'Months of operating reserve',
    moduleKey: 'finance',
    domainKeys: ['finance'],
    table: 'StatementSnapshot',
    metricKey: 'months_operating_reserve',
  },
  'fin.operating_margin': {
    label: 'Operating margin',
    moduleKey: 'finance',
    domainKeys: ['finance'],
    table: 'StatementSnapshot',
    metricKey: 'operating_margin',
  },
  'fin.ar_aging': {
    label: 'Receivables over 90 days',
    moduleKey: 'finance',
    domainKeys: ['finance'],
    table: 'ArApAgingSnapshot',
    field: 'ar90Plus',
  },
  'strat.plan_horizon': {
    label: 'Strategic plan horizon',
    moduleKey: 'strategy',
    domainKeys: ['continuous_improvement', 'leadership'],
    table: 'StrategicPlan',
    field: 'endDate',
  },
  'fac.maintenance_backlog': {
    label: 'Open maintenance items',
    moduleKey: 'facilities',
    domainKeys: ['facilities'],
    table: 'MaintenanceItem',
    field: 'status',
  },
  'enr.headcount': {
    label: 'Total enrollment',
    moduleKey: 'enrollment',
    domainKeys: ['finance', 'leadership'],
    table: 'EnrollmentSnapshot',
    field: 'totalEnrolled',
  },
  'enr.feeder_grades': {
    label: 'Enrollment by grade',
    moduleKey: 'enrollment',
    domainKeys: ['finance', 'leadership'],
    table: 'EnrollmentSnapshot',
    field: 'byGrade',
  },
  'acc.evidence_currency': {
    label: 'Standards with out-of-date evidence',
    moduleKey: 'accreditation',
    domainKeys: ['continuous_improvement'],
    table: 'AccreditationCatalogRequirement',
    field: 'tag',
  },
  'acc.readiness_series': {
    label: 'Recorded readiness',
    moduleKey: 'accreditation',
    domainKeys: ['continuous_improvement'],
    table: 'AccreditationReadinessSnapshot',
    field: 'readinessPct',
  },
  'acc.unscored_standards': {
    label: 'Standards with no rubric score',
    moduleKey: 'accreditation',
    domainKeys: ['continuous_improvement'],
    table: 'AccreditationStandard',
    field: 'rubricScore',
  },
  'acc.unsupported_score': {
    label: 'High scores with no evidence attached',
    moduleKey: 'accreditation',
    domainKeys: ['continuous_improvement'],
    table: 'AccreditationStandard',
    field: 'rubricScore',
  },
  'hr.student_teacher_ratio': {
    label: 'Student-teacher ratio',
    moduleKey: 'hr',
    domainKeys: ['hr'],
    table: 'PeriodOperationalData',
    metricKey: 'student_teacher_ratio',
  },
  'hr.pd_participation': {
    label: 'Professional-development participation',
    moduleKey: 'hr',
    domainKeys: ['hr'],
    table: 'ProfessionalDevelopment',
  },
  'safe.clearances': {
    label: 'Safe-environment clearances',
    moduleKey: 'hr',
    domainKeys: ['governance', 'student_services'],
    table: 'Clearance',
  },
  'acad.assessment_growth': {
    label: 'Measured growth in student learning',
    moduleKey: null,
    domainKeys: ['academic_excellence'],
    table: 'LMS',
  },
  'curr.doc_review': {
    label: 'Curriculum documents overdue for review',
    moduleKey: 'governance',
    domainKeys: ['academic_excellence'],
    table: 'Policy',
    field: 'category',
  },
  // ── AIC Phase F. Appended in catalog order. The first two are the FLIP: they
  // shipped `declaredNotTracked` in Phase E and now resolve through the licence
  // check like any other register signal.
  'hr.staff_evaluations': {
    label: 'Staff evaluation cycle',
    moduleKey: 'hr',
    domainKeys: ['hr'],
    table: 'StaffEvaluation',
    field: 'dueDate',
  },
  'fac.inspections': {
    label: 'Life-safety inspections',
    moduleKey: 'facilities',
    domainKeys: ['facilities'],
    table: 'MaintenanceItem',
    field: 'complianceKind',
  },
  'acc.prior_visit_findings': {
    label: 'Findings from your last accreditation visit',
    moduleKey: 'accreditation',
    domainKeys: ['continuous_improvement'],
    table: 'PriorVisitFinding',
    field: 'status',
  },
}

const ALL_SIGNAL_KEYS = Object.keys(SIGNAL_SEEDS)

/**
 * The signals no school populates today — `not_tracked`/`no_data` by default.
 *
 * AIC PHASE K removed `hr.pd_participation` and `safe.clearances`: both now have
 * a register behind them and resolve through the licence check like any other
 * register signal, exactly as Phase F did for staff evaluations.
 */
const HOLE_SIGNAL_KEYS = ['acad.assessment_growth']

function mkSignal(key: string, over: Partial<TwinSignalView> = {}): TwinSignalView {
  const seed = SIGNAL_SEEDS[key]
  const base: TwinSignalView = {
    key,
    label: seed.label,
    availability: 'no_data',
    unavailableReason: 'No reading is available for this signal yet.',
    moduleKey: seed.moduleKey,
    value: null,
    trend: null,
    observedOn: null,
    ageDays: null,
    changeState: 'never_observed',
    staleAfterDays: 400,
    cells: null,
    domainKeys: seed.domainKeys,
    lineage: { table: seed.table, field: seed.field, metricKey: seed.metricKey },
  }
  const merged = { ...base, ...over }
  if (merged.availability === 'available') merged.unavailableReason = null
  return merged
}

/** Every catalog key, in catalog order. A signal is NEVER omitted from the set. */
function signalSet(over: Record<string, Partial<TwinSignalView>> = {}): TwinSignalView[] {
  return ALL_SIGNAL_KEYS.map((k) => {
    const seed: Partial<TwinSignalView> = HOLE_SIGNAL_KEYS.includes(k)
      ? { availability: 'not_tracked', unavailableReason: 'KYRO does not track this today.' }
      : {}
    return mkSignal(k, { ...seed, ...(over[k] ?? {}) })
  })
}

function available(
  value: number | string | boolean | null,
  observedOn: string | null = '2026-06-30',
  extra: Partial<TwinSignalView> = {},
): Partial<TwinSignalView> {
  return { availability: 'available', value, observedOn, changeState: 'moved', ageDays: 31, ...extra }
}

// ── Register ─────────────────────────────────────────────────────────────────

function mkStandard(code: string, over: Partial<TwinStandardView> = {}): TwinStandardView {
  return {
    standardId: `std-${code}`,
    code,
    title: `Standard ${code}`,
    isAssurance: false,
    assuranceSatisfied: null,
    rubricScore: 2,
    evidenceCount: 2,
    domainKeys: ['governance'],
    primaryDomainKey: 'governance',
    boundMetricKeys: [],
    requirements: [],
    ...over,
  }
}

const REGISTER_CODES = [
  'COG-6',
  'COG-7',
  'COG-8',
  'COG-9',
  'COG-11',
  'COG-12',
  'COG-13',
  'COG-14',
  'COG-15',
  'COG-24',
  'COG-26',
  'COG-29',
  'COG-30',
  'COG-31',
  'COG-A1',
  'COG-A2',
  'COG-A3',
  'COG-A4',
]

function mkGroup(tag: string, over: Partial<TwinEvidenceGroupView> = {}): TwinEvidenceGroupView {
  return {
    tag,
    label: `${tag.replace(/_/g, ' ')} artifact`,
    state: 'current',
    dataAvailability: 'platform',
    expiresOn: null,
    daysUntilExpiry: null,
    servesStandards: [{ standardId: 'std-COG-8', code: 'COG-8' }],
    servesAssurance: false,
    ...over,
  }
}

function mkRegister(over: Partial<TwinRegisterView> = {}): TwinRegisterView {
  return {
    frameworkCode: 'cognia_2022',
    standards: REGISTER_CODES.map((c) => mkStandard(c)),
    evidenceGroups: [],
    // AIC Phase F. The EMPTY-REGISTER default: no citations, no summaries. A school
    // that has entered nothing must look exactly as it did before Phase F.
    priorVisitCitations: [],
    staffEvaluations: null,
    complianceInspections: null,
    // AIC Phase K. Same empty-register default: a school that has entered nothing
    // must look exactly as it did before Phase K.
    clearances: null,
    professionalDevelopment: null,
    demoData: false,
    snapshotAsOf: '2026-06-30',
    ...over,
  }
}

// ── Trends ───────────────────────────────────────────────────────────────────

function point(periodEndDate: string, value: number): TrendPoint {
  return { periodId: `p-${periodEndDate}`, label: periodEndDate, periodEndDate, value, available: true }
}

function annualTrend(opts: {
  metric: MetricKey
  label: string
  unit: MetricUnit
  goodDirection: GoodDirection
  values: number[]
  startFy: number
}) {
  const t: MetricTrend = {
    metric: opts.metric,
    label: opts.label,
    unit: opts.unit,
    goodDirection: opts.goodDirection,
    granularity: 'annual',
    points: opts.values.map((v, i) => point(`${opts.startFy + i}-06-30`, v)),
  }
  return computeTrendSignal(t, { now: NOW })
}

/** Five falling readings — a confirmed direction. */
function marginTrend(last = 0.015) {
  return annualTrend({
    metric: 'operating_margin',
    label: 'Operating margin',
    unit: 'percent',
    goodDirection: 'higher',
    values: [0.06, 0.048, 0.036, 0.026, last],
    startFy: 2022,
  })
}

/** Three falling readings — a direction the arithmetic cannot yet confirm. */
function marginTrendShort() {
  return annualTrend({
    metric: 'operating_margin',
    label: 'Operating margin',
    unit: 'percent',
    goodDirection: 'higher',
    values: [0.06, 0.04, 0.02],
    startFy: 2024,
  })
}

function ratioTrend(last = 15.2) {
  return annualTrend({
    metric: 'student_teacher_ratio',
    label: 'Student-teacher ratio',
    unit: 'ratio',
    goodDirection: 'lower',
    values: [11.4, 12.4, 13.4, 14.3, last],
    startFy: 2022,
  })
}

function cells(spec: Record<string, number | null>): SmallCell[] {
  return Object.entries(spec).map(([key, value]) => ({
    key,
    value,
    suppressed: value === null,
    band: value === null ? 'fewer than 10' : null,
    reason: value === null ? 'below_min_cell' : null,
  }))
}

// ── Scenario: every firing rule, on demand ───────────────────────────────────

interface ScenarioOpts {
  /**
   * AIC Phase K. The two Phase-K registers hold FIRING data.
   *
   * Same shape as `phaseF` and for the same reason: the base scenario lights both
   * signals with a PASSING value, so every count-shaped assertion elsewhere keeps
   * reading a school whose clearances are current and whose staff all have PD.
   */
  phaseK?: boolean
  /** false ⇒ gov.minutes_lag is no_data, which is GOV-MINUTES-NEVER-RECORDED's fact. */
  minutesLagReadable?: boolean
  /** true ⇒ the strategic plan has already ended. */
  planExpired?: boolean
  /**
   * AIC Phase F. The three new registers hold FIRING data.
   *
   * The default is deliberately the other way round: the base scenario lights the
   * three new signals but with PASSING data (nothing overdue, nothing open), so
   * every pre-existing §9/§10/§13 assertion sees exactly the findings it saw before
   * Phase F. "We looked and it is fine" is a state this suite has to be able to
   * express, and it is also the state that proves the new rules add no finding to a
   * school that is up to date.
   */
  phaseF?: boolean
  seed?: number
}

function scenario(opts: ScenarioOpts = {}) {
  const i = opts.seed ?? 0
  const minutesLagReadable = opts.minutesLagReadable ?? true
  const phaseF = opts.phaseF ?? false
  const phaseK = opts.phaseK ?? false
  const planEnd = opts.planExpired ? `2026-0${(i % 6) + 1}-15` : `2026-12-1${i % 10}`

  const over: Record<string, Partial<TwinSignalView>> = {
    'gov.meeting_cadence': available(2, '2026-05-10'),
    'gov.policy_review': available(7 + (i % 5), '2026-04-01'),
    'gov.board_terms': available(2 + (i % 3), '2026-01-01'),
    'gov.committee_chairs': available(2 + (i % 2), null),
    'fin.months_operating_reserve': available(1.8 + (i % 4) * 0.2, '2026-06-30', {
      trend: null,
    }),
    'fin.operating_margin': available(0.015, '2026-06-30', { trend: marginTrend(0.015 - i * 0.001) }),
    'fin.ar_aging': available(84200 + i * 100, '2026-06-30', {
      changeState: 'stale_data',
      ageDays: 120 + i,
    }),
    'strat.plan_horizon': available(planEnd, '2023-07-01'),
    'fac.maintenance_backlog': available(31 + i, '2026-03-01', {
      changeState: 'stale_data',
      ageDays: 152 + i,
    }),
    'enr.headcount': available(186 - (i % 7), '2026-09-15'),
    'enr.feeder_grades': available(null, '2026-09-15', {
      cells: cells({ K: 12, '1': 10, '5': 24 }),
      changeState: 'stale_data',
      ageDays: 300 + i,
    }),
    'acc.evidence_currency': available(4, null),
    'acc.readiness_series': available(61, '2026-06-30'),
    'acc.unscored_standards': available(6, null),
    'acc.unsupported_score': available(2, null),
    'hr.student_teacher_ratio': available(15.2, '2026-06-30', { trend: ratioTrend(15.2 + i * 0.05) }),
    // curr.doc_review is DELIBERATELY left unlit: it is one of the four named
    // holes, `no_data` for every school today, and the scenario must reproduce
    // that rather than paper over it.
    // ── AIC Phase F. Lit, because the flip is that these signals now resolve
    // through the licence check instead of shipping `declaredNotTracked`. The
    // VALUE is the overdue/open count, and zero is a PASS, never a refusal.
    'hr.staff_evaluations': available(phaseF ? 4 + (i % 3) : 0, '2026-05-31'),
    'fac.inspections': available(phaseF ? 1 + (i % 3) : 0, '2026-04-15'),
    'acc.prior_visit_findings': available(phaseF ? 2 : 0, '2021-03-12'),
    // ── AIC Phase K. Lit for the same reason Phase F's were: these shipped
    // `declaredNotTracked` and now resolve through the licence check. The base
    // value PASSES (every clearance current, PD participation above the bar), so
    // only the phaseK sweep produces findings.
    'safe.clearances': available(phaseK ? 2 + (i % 3) : 0, '2026-06-30'),
    'hr.pd_participation': available(phaseK ? 0.4 : 0.9, '2026-06-30'),
  }
  if (minutesLagReadable) over['gov.minutes_lag'] = available(74 + i, '2026-05-20')

  const priors: Record<string, PriorFact> = {
    'fin.ar_aging': { value: 51400, observedOn: '2026-03-31', cells: null },
    'enr.headcount': { value: 204, observedOn: '2025-09-15', cells: null },
    'enr.feeder_grades': {
      value: null,
      observedOn: '2025-09-15',
      cells: cells({ K: 18, '1': 13, '5': 22 }),
    },
  }

  const standards: TwinStandardView[] = REGISTER_CODES.map((code) => {
    if (code === 'COG-A2') {
      return mkStandard(code, {
        isAssurance: true,
        assuranceSatisfied: false,
        rubricScore: null,
        evidenceCount: 1,
        domainKeys: ['finance'],
        primaryDomainKey: 'finance',
      })
    }
    if (code === 'COG-15') {
      return mkStandard(code, {
        rubricScore: 4,
        evidenceCount: 0,
        domainKeys: ['finance'],
        primaryDomainKey: 'finance',
        boundMetricKeys: ['operating_margin', 'months_operating_reserve'],
        requirements: [
          {
            tag: 'financial_audit',
            label: 'Financial audit',
            state: 'stale',
            dataAvailability: 'platform',
            expiresOn: '2025-06-30',
            daysUntilExpiry: -396,
          },
          {
            tag: 'budget',
            label: 'Budget',
            state: 'current',
            dataAvailability: 'platform',
            expiresOn: '2027-06-30',
            daysUntilExpiry: 334,
          },
        ],
      })
    }
    if (code === 'COG-13') {
      return mkStandard(code, {
        rubricScore: 3,
        evidenceCount: 3,
        domainKeys: ['hr'],
        primaryDomainKey: 'hr',
        boundMetricKeys: ['student_teacher_ratio'],
      })
    }
    if (code === 'COG-24' || code === 'COG-26' || code === 'COG-30') {
      return mkStandard(code, {
        rubricScore: null,
        domainKeys: ['continuous_improvement'],
        primaryDomainKey: 'continuous_improvement',
      })
    }
    if (code === 'COG-31') return mkStandard(code, { rubricScore: null })
    if (code === 'COG-29') return mkStandard(code, { rubricScore: null })
    if (code === 'COG-9') return mkStandard(code, { rubricScore: null })
    return mkStandard(code)
  })

  const evidenceGroups: TwinEvidenceGroupView[] = [
    mkGroup('financial_audit', {
      label: 'Financial audit',
      state: 'stale',
      expiresOn: '2025-06-30',
      daysUntilExpiry: -396,
      servesAssurance: true,
      servesStandards: [
        { standardId: 'std-COG-15', code: 'COG-15' },
        { standardId: 'std-COG-A2', code: 'COG-A2' },
      ],
    }),
    mkGroup('board_minutes', {
      label: 'board minutes',
      state: 'stale',
      expiresOn: '2025-08-31',
      daysUntilExpiry: -334,
      servesStandards: [
        { standardId: 'std-COG-8', code: 'COG-8' },
        { standardId: 'std-COG-A1', code: 'COG-A1' },
      ],
    }),
    mkGroup('safety_plan', {
      label: 'safety plan',
      state: 'missing',
      servesAssurance: true,
      servesStandards: [{ standardId: 'std-COG-A3', code: 'COG-A3' }],
    }),
    // NOT a finding, ever: a requirement WE chose not to track is our hole.
    mkGroup('staff_credentials', { state: 'missing', dataAvailability: 'external' }),
  ]

  // ── AIC Phase F register axis. `phaseF: false` is a school that HAS the three
  // registers and is up to date on all three: real summaries, nothing overdue,
  // nothing open. That is a PASS, and it must produce exactly zero findings.
  const staffEvaluations = phaseF
    ? { registerSize: 18 + i, overdueCount: 4 + (i % 3), oldestOverdueDays: 120 + i * 40 }
    : { registerSize: 18, overdueCount: 0, oldestOverdueDays: 0 }
  const complianceInspections = phaseF
    ? {
        trackedCount: 6 + i,
        overdueCount: 1 + (i % 3),
        oldestOverdueDays: 45 + i,
        // Seeds that leave (i % 3) === 0 give exactly one overdue item, which is
        // the singular template; the kind rotates so the life-safety severity
        // discriminator is exercised in both directions across the sweep.
        overdueKinds: i % 2 === 0 ? ['fire_life_safety'] : ['health'],
        anyLifeSafety: i % 2 === 0,
      }
    : {
        trackedCount: 6,
        overdueCount: 0,
        oldestOverdueDays: 0,
        overdueKinds: [] as string[],
        anyLifeSafety: false,
      }
  // AIC Phase K summaries. The PASS shape is a register that HAS rows and nothing
  // wrong in it — the "we looked and it is fine" state, which is a different fact
  // from an empty register and must not be conflated with it.
  const clearances = phaseK
    ? {
        trackedCount: 24 + i,
        lapsedCount: 2 + (i % 3),
        // Seeds leaving (i % 3) === 0 give exactly two lapsed; the day count
        // crosses SAFE_ENV_LAPSED_CRITICAL_DAYS across the sweep so both severity
        // branches are exercised.
        expiringSoonCount: i % 4,
        oldestLapsedDays: 30 + i * 7,
      }
    : { trackedCount: 24, lapsedCount: 0, expiringSoonCount: 1, oldestLapsedDays: 0 }
  const professionalDevelopment = phaseK
    ? { staffCount: 20 + i, participantCount: Math.floor((20 + i) * 0.4) }
    : { staffCount: 20, participantCount: 19 }

  const priorVisitCitations = phaseF
    ? [
        // Sorted by code, as the caller's contract requires.
        { code: 'COG-26', visitDate: '2021-03-12', openCount: 1 },
        // Never reaches a finding: the engine matches by exact code and this one is
        // not in the register. A citation we cannot place is shown as unmatched by
        // the API, never fuzzy-matched into a standard the team did not cite.
        { code: 'COG-99', visitDate: '2021-03-12', openCount: 3 },
        { code: 'COG-A4', visitDate: '2021-03-12', openCount: 2 },
      ]
    : []

  return {
    signals: signalSet(over),
    register: mkRegister({
      standards,
      evidenceGroups,
      staffEvaluations,
      complianceInspections,
      priorVisitCitations,
      clearances,
      professionalDevelopment,
    }),
    priors,
  }
}

function runScenario(opts: ScenarioOpts = {}) {
  const s = scenario(opts)
  return deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, { priorFacts: s.priors })
}

function findingsFor(result: { findings: TwinFinding[] }, ruleId: TwinRuleId): TwinFinding[] {
  return result.findings.filter((f) => f.ruleId === ruleId)
}

function oneFor(ruleId: TwinRuleId, opts: ScenarioOpts = {}): TwinFinding {
  const f = findingsFor(runScenario(opts), ruleId)
  expect(f.length, `${ruleId} should have fired in this scenario`).toBeGreaterThanOrEqual(1)
  return f[0]
}

/** Every finding this suite can generate, across all three mutually exclusive worlds. */
function generatedFindings(iterations = 25): TwinFinding[] {
  const out: TwinFinding[] = []
  for (let i = 0; i < iterations; i++) {
    out.push(...runScenario({ seed: i }).findings)
    out.push(
      ...runScenario({ seed: i, minutesLagReadable: false, planExpired: true }).findings,
    )
    // AIC Phase F. The three new registers hold firing data here and nowhere else,
    // so the numeral, standard-code and vocabulary specs below run over the new
    // rules while every count-shaped assertion keeps reading the base scenario.
    out.push(...runScenario({ seed: i, phaseF: true }).findings)
    // AIC Phase K. Same reasoning: the two Phase-K registers hold firing data
    // here and nowhere else.
    out.push(...runScenario({ seed: i, phaseK: true }).findings)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// §0 SHAPE
// ─────────────────────────────────────────────────────────────────────────────

describe('the frozen catalog', () => {
  it('ships 27 firing rules + 2 visible holes = 29, with no duplicate id', () => {
    expect(TWIN_RULE_IDS).toHaveLength(29)
    expect(new Set(TWIN_RULE_IDS).size).toBe(29)
    expect(TWIN_RULE_DEFS).toHaveLength(29)
    expect(TWIN_RULE_DEFS.map((d) => d.id)).toEqual([...TWIN_RULE_IDS])
    // AIC Phase F took the catalog 26 → 29 and the HOLE COUNT DID NOT MOVE. AIC
    // Phase K leaves the catalog at 29 and moves the HOLE COUNT instead: it builds
    // no new rule, it gives two existing ones the registers they were waiting for.
    expect(VISIBLE_HOLE_RULE_IDS).toHaveLength(2)
    expect([...VISIBLE_HOLE_RULE_IDS]).toEqual(['CURR-DOC-AGING', 'ACAD-GROWTH-FLAT'])
  })

  it('AIC Phase F appended its three rules and interleaved nothing', () => {
    // The order is the render order; appending moves no existing row.
    expect(TWIN_RULE_IDS.slice(-3)).toEqual([
      'HR-EVAL-OVERDUE',
      'FAC-INSPECTION-DUE',
      'ACC-PRIOR-FINDING-OPEN',
    ])
    expect(TWIN_RULE_IDS.slice(0, 26)).toEqual([
      'GOV-MINUTES-LAG',
      'GOV-MINUTES-NEVER-RECORDED',
      'GOV-CADENCE-GAP',
      'GOV-POLICY-OVERDUE',
      'GOV-TERM-EXPIRY',
      'GOV-COMMITTEE-NO-CHAIR',
      'FIN-AUDIT-STALE',
      'FIN-RESERVE-THIN',
      'FIN-BUDGET-DETERIORATING',
      'FIN-AR-AGING-WORSENING',
      'STRAT-PLAN-EXPIRING',
      'STRAT-PLAN-EXPIRED',
      'ENR-DECLINE',
      'ENR-FEEDER-EROSION',
      'ACC-UNSCORED',
      'ACC-UNSUPPORTED-SCORE',
      'ACC-ASSURANCE-GAP',
      'EVI-STALE',
      'EVI-MISSING-REQUIRED',
      'FAC-BACKLOG',
      'HR-RATIO-DRIFT',
      'SCHOOL-NOT-REPORTING',
      'HR-PD-LOW',
      'SAFE-ENV-GAP',
      'CURR-DOC-AGING',
      'ACAD-GROWTH-FLAT',
    ])
  })

  it('every def is complete, and every rule declares at least one required signal', () => {
    for (const d of TWIN_RULE_DEFS) {
      expect(d.requiredAvailable.length, d.id).toBeGreaterThanOrEqual(1)
      expect(typeof d.evaluate).toBe('function')
      expect(d.title.length).toBeGreaterThan(0)
      expect(d.rationaleTemplate.length).toBeGreaterThan(0)
      for (const fw of ['cognia_2022', 'msa_cess_2022', 'nsbecs'] as const) {
        expect(Array.isArray(d.standardCodes[fw]), `${d.id}/${fw}`).toBe(true)
      }
      // Every declared signal must exist in the catalog this suite mirrors.
      for (const k of [...d.requiredAvailable, ...d.requiredAbsent, ...d.requiredPriors]) {
        expect(ALL_SIGNAL_KEYS, `${d.id} declares ${k}`).toContain(k)
      }
    }
  })

  it('RESERVE_RISK_MONTHS is READ from the analytics band table, never re-typed', () => {
    expect(TH.RESERVE_RISK_MONTHS.value).toBe(bandsFor('months_operating_reserve')?.risk)
    expect(TH.RESERVE_RISK_MONTHS.value).toBe(3)
  })

  it('every threshold ships the sentence that justifies it', () => {
    for (const [key, entry] of Object.entries(TH)) {
      expect(typeof entry.value, key).toBe('number')
      expect(entry.basis.length, key).toBeGreaterThan(20)
    }
  })

  it('exports a version', () => {
    expect(ACCREDITATION_TWIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §1 GATE TOTALITY — the whole contract, over every rule × every availability
// ─────────────────────────────────────────────────────────────────────────────

const UNAVAILABLE: { availability: Exclude<TwinSignalAvailability, 'available'>; reason: string }[] = [
  { availability: 'not_licensed', reason: 'signal_not_licensed' },
  { availability: 'no_data', reason: 'signal_no_data' },
  { availability: 'not_tracked', reason: 'signal_not_tracked' },
]

describe('§1 the availability gate is total', () => {
  for (const def of TWIN_RULE_DEFS) {
    const key = def.requiredAvailable[0]
    for (const { availability, reason } of UNAVAILABLE) {
      it(`${def.id}: ${availability} on ${key} ⇒ cannot_evaluate, naming that signal`, () => {
        const own = `This is ${key}'s own sentence about why it cannot be read.`
        const signals = signalSet({ [key]: { availability, unavailableReason: own } })
        const r = deriveTwin(signals, mkRegister(), [def], NOW)
        expect(r.findings).toHaveLength(0)
        expect(r.notEvaluated).toHaveLength(1)
        const ne = r.notEvaluated[0]
        expect(ne.ruleId).toBe(def.id)
        expect(ne.reason).toBe(reason)
        expect(ne.blockingSignalKey).toBe(key)
        expect(ne.blockingSignalLabel).toBe(SIGNAL_SEEDS[key].label)
        // The signal's OWN sentence, verbatim — never a sentence we invented for it.
        expect(ne.message).toBe(own)
        expect(ne.title).toBe(def.title)
      })
    }

    it(`${def.id}: an available signal is EVALUATED, never refused for availability`, () => {
      const s = scenario()
      const r = deriveTwin(s.signals, s.register, [def], NOW, { priorFacts: s.priors })
      const availabilityRefusals = r.notEvaluated.filter(
        (n) =>
          n.reason === 'signal_not_licensed' ||
          n.reason === 'signal_no_data' ||
          n.reason === 'signal_not_tracked',
      )
      // The four named holes are the deliberate exception: their signal is
      // not_tracked/no_data for every school, and that IS the deliverable.
      if ((VISIBLE_HOLE_RULE_IDS as readonly string[]).includes(def.id)) {
        expect(availabilityRefusals.length).toBe(1)
      } else {
        expect(availabilityRefusals).toEqual([])
      }
    })
  }

  it('a signal missing from the set entirely is a named refusal, not a crash', () => {
    const def = TWIN_RULES_BY_ID.get('GOV-CADENCE-GAP') as TwinRuleDef
    const r = deriveTwin([], mkRegister(), [def], NOW)
    expect(r.notEvaluated[0].reason).toBe('signal_no_data')
    expect(r.notEvaluated[0].blockingSignalKey).toBe('gov.meeting_cadence')
  })

  it('a signal with no reason of its own falls back to the frozen sentence', () => {
    const signals = signalSet({
      'gov.meeting_cadence': { availability: 'no_data', unavailableReason: null },
    })
    const def = TWIN_RULES_BY_ID.get('GOV-CADENCE-GAP') as TwinRuleDef
    const r = deriveTwin(signals, mkRegister(), [def], NOW)
    expect(r.notEvaluated[0].message).toBe(TWIN_NO_REASON_FALLBACK)
  })

  it('an UNLICENSED module never produces a finding — it lowers coverage', () => {
    const licensed = runScenario()
    const s = scenario()
    const unlicensed = deriveTwin(
      s.signals.map((x) =>
        x.key === 'fac.maintenance_backlog'
          ? { ...x, availability: 'not_licensed' as const, value: null, unavailableReason: 'Unlock the Facilities module to read this.' }
          : x,
      ),
      s.register,
      TWIN_RULE_DEFS,
      NOW,
      { priorFacts: s.priors },
    )
    expect(findingsFor(licensed, 'FAC-BACKLOG').length).toBeGreaterThan(0)
    expect(findingsFor(unlicensed, 'FAC-BACKLOG')).toHaveLength(0)
    const ne = unlicensed.notEvaluated.find((n) => n.ruleId === 'FAC-BACKLOG')
    expect(ne?.reason).toBe('signal_not_licensed')
    expect(ne?.blockingSignalKey).toBe('fac.maintenance_backlog')
    expect(ne?.moduleKey).toBe('facilities')
    expect(unlicensed.coverage.rulesEvaluated).toBe(licensed.coverage.rulesEvaluated - 1)
    expect(unlicensed.coverage.blockedByModule['facilities']).toContain('FAC-BACKLOG')
  })

  it('zero findings from a predicate is a PASS, not a refusal', () => {
    const def = TWIN_RULES_BY_ID.get('GOV-CADENCE-GAP') as TwinRuleDef
    const signals = signalSet({ 'gov.meeting_cadence': available(9, '2026-05-10') })
    const r = deriveTwin(signals, mkRegister(), [def], NOW)
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated).toHaveLength(0)
    expect(r.coverage.rulesEvaluated).toBe(1)
    expect(r.coverage.rulesFired).toBe(0)
  })

  it('a rule can never read a signal it did not declare', () => {
    const rogue: TwinRuleDef = {
      ...(TWIN_RULES_BY_ID.get('GOV-CADENCE-GAP') as TwinRuleDef),
      evaluate(c) {
        c.signal('fin.operating_margin')
        return []
      },
    }
    const signals = signalSet({
      'gov.meeting_cadence': available(1),
      'fin.operating_margin': available(0.01),
    })
    expect(() => deriveTwin(signals, mkRegister(), [rogue], NOW)).toThrow(TwinUndeclaredSignalError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §2 THE ABSENCE GATE — where a missing reading IS the fact
// ─────────────────────────────────────────────────────────────────────────────

describe('§2 requiredAbsent', () => {
  const def = TWIN_RULES_BY_ID.get('GOV-MINUTES-NEVER-RECORDED') as TwinRuleDef

  it('exactly one rule uses the absence gate, and it names its partner', () => {
    const users = TWIN_RULE_DEFS.filter((d) => d.requiredAbsent.length > 0)
    expect(users.map((d) => d.id)).toEqual(['GOV-MINUTES-NEVER-RECORDED'])
    expect(def.requiredAbsent).toEqual(['gov.minutes_lag'])
    // The invariant that makes the gate SOUND: the absent key and the required
    // key are collected by the same memoised query, so a failed query would make
    // BOTH no_data and this rule would not fire.
    expect(def.requiredAvailable).toEqual(['gov.meeting_cadence'])
  })

  it('fires when cadence is readable AND minutes_lag is no_data', () => {
    const signals = signalSet({ 'gov.meeting_cadence': available(6, '2026-05-10') })
    const r = deriveTwin(signals, mkRegister(), [def], NOW)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0].rationale).toContain('6 board meetings')
  })

  it('refuses when the absent signal is in fact present', () => {
    const signals = signalSet({
      'gov.meeting_cadence': available(6, '2026-05-10'),
      'gov.minutes_lag': available(12, '2026-05-20'),
    })
    const r = deriveTwin(signals, mkRegister(), [def], NOW)
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('signal_present_but_expected_absent')
    expect(r.notEvaluated[0].blockingSignalKey).toBe('gov.minutes_lag')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3 THE PRIOR GATE
// ─────────────────────────────────────────────────────────────────────────────

describe('§3 requiredPriors', () => {
  const comparisonRules = TWIN_RULE_DEFS.filter((d) => d.requiredPriors.length > 0)

  it('the three comparison rules are the only ones needing a previous observation', () => {
    expect(comparisonRules.map((d) => d.id)).toEqual([
      'FIN-AR-AGING-WORSENING',
      'ENR-DECLINE',
      'ENR-FEEDER-EROSION',
    ])
  })

  for (const def of comparisonRules) {
    const key = def.requiredPriors[0]

    it(`${def.id}: no prior at all ⇒ no_prior_observation naming ${key}`, () => {
      const s = scenario()
      const r = deriveTwin(s.signals, s.register, [def], NOW, { priorFacts: {} })
      expect(r.findings).toHaveLength(0)
      expect(r.notEvaluated[0].reason).toBe('no_prior_observation')
      expect(r.notEvaluated[0].blockingSignalKey).toBe(key)
    })

    it(`${def.id}: a prior observed on the SAME day is the same observation`, () => {
      const s = scenario()
      const live = s.signals.find((x) => x.key === key) as TwinSignalView
      const r = deriveTwin(s.signals, s.register, [def], NOW, {
        priorFacts: { [key]: { ...s.priors[key], observedOn: live.observedOn } },
      })
      expect(r.findings).toHaveLength(0)
      expect(r.notEvaluated[0].reason).toBe('no_prior_observation')
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// §4 PER-RULE FIRING FIXTURES — one section per rule, 26 sections
// ─────────────────────────────────────────────────────────────────────────────

/** Every firing rule must, in every fixture, carry a code, a basis and a horizon. */
function assertWellFormed(f: TwinFinding) {
  expect(f.standardTags.length, `${f.ruleId} standardTags`).toBeGreaterThanOrEqual(1)
  expect(f.evidence.length, `${f.ruleId} evidence`).toBeGreaterThanOrEqual(1)
  expect(f.rationale).not.toMatch(/\{\{/)
  expect(TWIN_LIKELIHOODS).toContain(f.likelihood)
  expect(f.consequence.length).toBeGreaterThan(20)
  if (f.horizon.kind === 'none') expect(f.horizon.reason).toBeTruthy()
}

function singleRule(ruleId: TwinRuleId, over: Record<string, Partial<TwinSignalView>>, register = mkRegister()) {
  const def = TWIN_RULES_BY_ID.get(ruleId) as TwinRuleDef
  return deriveTwin(signalSet(over), register, [def], NOW)
}

describe('§4 GOV-MINUTES-LAG', () => {
  it('fires above the threshold and not at it', () => {
    expect(singleRule('GOV-MINUTES-LAG', { 'gov.minutes_lag': available(61) }).findings).toHaveLength(1)
    expect(singleRule('GOV-MINUTES-LAG', { 'gov.minutes_lag': available(60) }).findings).toHaveLength(0)
  })
  it('escalates past two missed meetings, and never projects a date', () => {
    const warn = singleRule('GOV-MINUTES-LAG', { 'gov.minutes_lag': available(74) }).findings[0]
    expect(warn.severity).toBe('warn')
    expect(warn.likelihood).toBe('possible')
    expect(warn.confidence).toBe('observation')
    expect(warn.horizon.kind).toBe('none')
    expect(warn.factKey).toBe('register:minutes_lag@2026-06-30')
    expect(warn.rationale).toBe(
      'The most recently approved board minutes were approved 74 days after the meeting they record, against a working expectation of 60 days.',
    )
    assertWellFormed(warn)
    const crit = singleRule('GOV-MINUTES-LAG', { 'gov.minutes_lag': available(121) }).findings[0]
    expect(crit.severity).toBe('critical')
    expect(crit.likelihood).toBe('likely')
  })
})

describe('§4 GOV-MINUTES-NEVER-RECORDED', () => {
  it('needs at least one HELD meeting to be a fact about anything', () => {
    expect(singleRule('GOV-MINUTES-NEVER-RECORDED', { 'gov.meeting_cadence': available(0) }).findings).toHaveLength(0)
    const f = singleRule('GOV-MINUTES-NEVER-RECORDED', { 'gov.meeting_cadence': available(1) }).findings[0]
    expect(f.severity).toBe('warn')
    expect(f.likelihood).toBe('likely')
    expect(f.factKey).toBe('register:minutes_never_approved@school')
    assertWellFormed(f)
  })
})

describe('§4 GOV-CADENCE-GAP', () => {
  it('fires below quarterly, and zero meetings is critical', () => {
    expect(singleRule('GOV-CADENCE-GAP', { 'gov.meeting_cadence': available(4) }).findings).toHaveLength(0)
    const three = singleRule('GOV-CADENCE-GAP', { 'gov.meeting_cadence': available(3) }).findings[0]
    expect(three.severity).toBe('warn')
    expect(three.likelihood).toBe('possible')
    expect(three.factKey).toBe('register:board_meetings@trailing12')
    const none = singleRule('GOV-CADENCE-GAP', { 'gov.meeting_cadence': available(0) }).findings[0]
    expect(none.severity).toBe('critical')
    expect(none.likelihood).toBe('likely')
    assertWellFormed(three)
  })
})

describe('§4 GOV-POLICY-OVERDUE', () => {
  it('one overdue policy is a queue; five is a stopped process', () => {
    expect(singleRule('GOV-POLICY-OVERDUE', { 'gov.policy_review': available(0) }).findings).toHaveLength(0)
    const one = singleRule('GOV-POLICY-OVERDUE', { 'gov.policy_review': available(1) }).findings[0]
    expect(one.severity).toBe('warn')
    expect(one.factKey).toBe('register:policy_review_overdue@2026-06-30')
    expect(singleRule('GOV-POLICY-OVERDUE', { 'gov.policy_review': available(5) }).findings[0].severity).toBe('critical')
    assertWellFormed(one)
  })
})

describe('§4 GOV-TERM-EXPIRY', () => {
  it('reports a condition and refuses to forecast the next lapse', () => {
    expect(singleRule('GOV-TERM-EXPIRY', { 'gov.board_terms': available(0) }).findings).toHaveLength(0)
    const f = singleRule('GOV-TERM-EXPIRY', { 'gov.board_terms': available(2) }).findings[0]
    expect(f.severity).toBe('warn')
    expect(f.horizon.kind).toBe('none')
    expect(f.horizon.reason).toBe('We can see which terms have lapsed, not when the next one will.')
    expect(singleRule('GOV-TERM-EXPIRY', { 'gov.board_terms': available(3) }).findings[0].severity).toBe('critical')
    assertWellFormed(f)
  })
})

describe('§4 GOV-COMMITTEE-NO-CHAIR', () => {
  it('is honestly undated and says so in its factKey', () => {
    expect(singleRule('GOV-COMMITTEE-NO-CHAIR', { 'gov.committee_chairs': available(0, null) }).findings).toHaveLength(0)
    const f = singleRule('GOV-COMMITTEE-NO-CHAIR', { 'gov.committee_chairs': available(2, null) }).findings[0]
    expect(f.factKey).toBe('register:committees_without_chair@school')
    expect(f.severity).toBe('warn')
    expect(f.likelihood).toBe('possible')
    assertWellFormed(f)
  })
})

describe('§4 FIN-AUDIT-STALE', () => {
  const reg = (over: Partial<TwinEvidenceGroupView>) =>
    mkRegister({
      evidenceGroups: [
        mkGroup('financial_audit', {
          label: 'Financial audit',
          servesAssurance: true,
          servesStandards: [
            { standardId: 'std-COG-15', code: 'COG-15' },
            { standardId: 'std-COG-A2', code: 'COG-A2' },
          ],
          ...over,
        }),
      ],
    })

  it('a lapsed audit is critical and carries the stated date as its horizon', () => {
    const f = singleRule(
      'FIN-AUDIT-STALE',
      { 'acc.evidence_currency': available(1, null) },
      reg({ state: 'stale', expiresOn: '2025-06-30', daysUntilExpiry: -396 }),
    ).findings[0]
    expect(f.severity).toBe('critical')
    expect(f.likelihood).toBe('likely')
    expect(f.horizon).toEqual({ kind: 'by_date', value: '2025-06-30', confidence: null, reason: null })
    expect(f.factKey).toBe('evidence:financial_audit@2025-06-30')
    expect(f.standardTags).toEqual(['COG-15', 'COG-A2'])
    expect(f.rationale).toBe(
      'The most recent financial audit on file stopped being current on 30 June 2025 — 396 days ago — and 2 standards cite it.',
    )
    assertWellFormed(f)
  })

  it('an expiring audit is a warning, on the OTHER frozen sentence', () => {
    const f = singleRule(
      'FIN-AUDIT-STALE',
      { 'acc.evidence_currency': available(1, null) },
      reg({ state: 'expiring', expiresOn: '2026-09-10', daysUntilExpiry: 41 }),
    ).findings[0]
    expect(f.severity).toBe('warn')
    expect(f.likelihood).toBe('possible')
    expect(f.rationale).toBe(
      'The financial audit on file stops being current on 10 September 2026, in 41 days, and 2 standards cite it.',
    )
  })

  it('a current audit is not a finding, and neither is an untracked one', () => {
    expect(
      singleRule('FIN-AUDIT-STALE', { 'acc.evidence_currency': available(1, null) }, reg({ state: 'current' }))
        .findings,
    ).toHaveLength(0)
    expect(
      singleRule(
        'FIN-AUDIT-STALE',
        { 'acc.evidence_currency': available(1, null) },
        reg({ state: 'stale', dataAvailability: 'external', expiresOn: '2025-06-30', daysUntilExpiry: -396 }),
      ).findings,
    ).toHaveLength(0)
  })
})

describe('§4 FIN-RESERVE-THIN', () => {
  it('is a LEVEL against the analytics risk line, and never consults the statistics', () => {
    const risk = TH.RESERVE_RISK_MONTHS.value
    expect(singleRule('FIN-RESERVE-THIN', { 'fin.months_operating_reserve': available(risk) }).findings).toHaveLength(0)
    const f = singleRule('FIN-RESERVE-THIN', { 'fin.months_operating_reserve': available(1.8) }).findings[0]
    expect(f.severity).toBe('warn')
    expect(f.confidence).toBe('observation')
    expect(f.horizon.reason).toBe('Already below its risk threshold — this is a condition, not a forecast.')
    expect(f.factKey).toBe('metric:months_operating_reserve@2026-06-30')
    expect(f.rationale).toContain('1.8 months')
    expect(f.rationale).toContain('below the 3-month level')
    assertWellFormed(f)
    expect(singleRule('FIN-RESERVE-THIN', { 'fin.months_operating_reserve': available(1.4) }).findings[0].severity).toBe(
      'critical',
    )
  })
})

describe('§4 FIN-BUDGET-DETERIORATING', () => {
  it('at a confirmed direction it reports the statistic and may project a horizon', () => {
    const f = singleRule('FIN-BUDGET-DETERIORATING', {
      'fin.operating_margin': available(0.015, '2026-06-30', { trend: marginTrend() }),
    }).findings[0]
    expect(f.confidence).toBe('trend')
    expect(f.likelihood).toBe('likely')
    expect(f.severity).toBe('warn')
    expect(f.factKey).toBe('metric:operating_margin@FY2026')
    expect(f.rationale).toContain('Mann-Kendall p =')
    expect(f.evidence.map((e) => e.key)).toContain('pValue')
    assertWellFormed(f)
  })

  it('escalates only once the LEVEL is past its own risk band', () => {
    const f = singleRule('FIN-BUDGET-DETERIORATING', {
      'fin.operating_margin': available(-0.02, '2026-06-30', { trend: marginTrend(-0.02) }),
    }).findings[0]
    expect(f.severity).toBe('critical')
  })

  it('below a confirmable direction it says so, in its own sentence, with no horizon', () => {
    const short = marginTrendShort()
    expect(short.confidence).toBe('directional')
    const f = singleRule('FIN-BUDGET-DETERIORATING', {
      'fin.operating_margin': available(0.02, '2026-06-30', { trend: short }),
    }).findings[0]
    expect(f.confidence).toBe('directional')
    expect(f.likelihood).toBe('possible')
    expect(f.horizon.kind).toBe('none')
    expect(f.rationale).toContain('cannot yet confirm a direction')
    expect(f.evidence.map((e) => e.key)).not.toContain('pValue')
    assertWellFormed(f)
  })

  it('the low-confidence copy makes NO per-reading claim over a non-monotone series', () => {
    // 0.06 → 0.02 → 0.04: a declining Theil-Sen slope whose MOST RECENT year rose
    // two points. `trendDraft` selects the low template on `confidence:
    // 'directional'`, which covers exactly this shape, so the copy may not say
    // "fell in each of 3 readings" — the same claim `trend-signal.ts` refuses to
    // make, for the same reason.
    const wobble = annualTrend({
      metric: 'operating_margin',
      label: 'Operating margin',
      unit: 'percent',
      goodDirection: 'higher',
      values: [0.06, 0.02, 0.04],
      startFy: 2024,
    })
    expect(wobble.confidence).toBe('directional')
    const f = singleRule('FIN-BUDGET-DETERIORATING', {
      'fin.operating_margin': available(0.04, '2026-06-30', { trend: wobble }),
    }).findings[0]
    expect(f.rationale).not.toContain('in each of')
    expect(f.rationale).not.toMatch(/\bfell in\b/)
    expect(f.rationale).toContain('moved down across')
    assertWellFormed(f)

    // Same for the ratio, whose low template previously carried no caveat at all.
    const ratioWobble = annualTrend({
      metric: 'student_teacher_ratio',
      label: 'Student-teacher ratio',
      unit: 'ratio',
      goodDirection: 'lower',
      values: [10, 14, 11, 15, 13, 22],
      startFy: 2016,
    })
    const hr = singleRule('HR-RATIO-DRIFT', {
      'hr.student_teacher_ratio': available(22, '2026-06-30', { trend: ratioWobble }),
    }).findings[0]
    expect(hr.rationale).not.toContain('in each of')
    expect(hr.rationale).toContain('cannot yet confirm a direction')
    assertWellFormed(hr)
  })

  it('the low-confidence caveat does not blame the READING COUNT for a spacing cap', () => {
    // n = 6 is more than enough readings; it is the six-year hole that capped the
    // ladder. "With 6 readings the arithmetic cannot confirm a direction" would be
    // the wrong explanation of the right refusal.
    const gapped = annualTrend({
      metric: 'student_teacher_ratio',
      label: 'Student-teacher ratio',
      unit: 'ratio',
      goodDirection: 'lower',
      values: [10, 14, 11, 15, 13, 22],
      startFy: 2016,
    })
    const hr = singleRule('HR-RATIO-DRIFT', {
      'hr.student_teacher_ratio': available(22, '2026-06-30', { trend: gapped }),
    }).findings[0]
    expect(hr.rationale).not.toMatch(/With \d+ readings/)
  })

  it('an improving margin is not a finding', () => {
    const up = annualTrend({
      metric: 'operating_margin',
      label: 'Operating margin',
      unit: 'percent',
      goodDirection: 'higher',
      values: [0.01, 0.02, 0.03, 0.04, 0.05],
      startFy: 2022,
    })
    expect(
      singleRule('FIN-BUDGET-DETERIORATING', {
        'fin.operating_margin': available(0.05, '2026-06-30', { trend: up }),
      }).findings,
    ).toHaveLength(0)
  })
})

describe('§4 FIN-AR-AGING-WORSENING', () => {
  const run = (now90: number, prior90: number) => {
    const def = TWIN_RULES_BY_ID.get('FIN-AR-AGING-WORSENING') as TwinRuleDef
    return deriveTwin(signalSet({ 'fin.ar_aging': available(now90) }), mkRegister(), [def], NOW, {
      priorFacts: { 'fin.ar_aging': { value: prior90, observedOn: '2026-03-31', cells: null } },
    })
  }

  it('needs a quarter-over-quarter rise past normal seasonal noise', () => {
    expect(run(62_500, 50_000).findings).toHaveLength(0) // exactly +25% is not past it
    const f = run(84_200, 51_400).findings[0]
    expect(f.severity).toBe('warn')
    expect(f.confidence).toBe('observation')
    expect(f.factKey).toBe('register:ar90plus@2026-06-30')
    expect(f.rationale).toBe(
      'Receivables over 90 days rose from $51,400 at 31 March 2026 to $84,200 at 30 June 2026 — an increase of 64%.',
    )
    assertWellFormed(f)
    expect(run(120_000, 51_400).findings[0].severity).toBe('critical')
  })

  it('a zero prior is not a denominator', () => {
    expect(run(10_000, 0).findings).toHaveLength(0)
  })
})

describe('§4 STRAT-PLAN-EXPIRING / STRAT-PLAN-EXPIRED', () => {
  const run = (ruleId: TwinRuleId, endDate: string) =>
    singleRule(ruleId, { 'strat.plan_horizon': available(endDate, '2023-07-01') })

  it('warns a year out, escalates at six months and again at ninety days', () => {
    expect(run('STRAT-PLAN-EXPIRING', '2027-08-01').findings).toHaveLength(0) // 366 days
    expect(run('STRAT-PLAN-EXPIRING', '2027-07-31').findings[0].severity).toBe('info') // exactly 365
    expect(run('STRAT-PLAN-EXPIRING', '2027-01-01').findings[0].severity).toBe('warn')
    expect(run('STRAT-PLAN-EXPIRING', '2026-10-01').findings[0].severity).toBe('critical')
  })

  it('an expiring plan carries the STATED date, with no statistical confidence on it', () => {
    const f = run('STRAT-PLAN-EXPIRING', '2026-12-25').findings[0]
    expect(f.horizon).toEqual({ kind: 'by_date', value: '2026-12-25', confidence: null, reason: null })
    expect(f.factKey).toBe('register:strategic_plan_end@2026-12-25')
    assertWellFormed(f)
  })

  it('an expired plan is critical, and shares the SAME factKey — one date, one fact', () => {
    const f = run('STRAT-PLAN-EXPIRED', '2026-04-26').findings[0]
    expect(f.severity).toBe('critical')
    expect(f.likelihood).toBe('likely')
    expect(f.factKey).toBe('register:strategic_plan_end@2026-04-26')
    expect(f.horizon.reason).toBe('The date has passed — this is a condition, not a forecast.')
    assertWellFormed(f)
  })

  it('a plan with only a fiscal end year is a NAMED refusal, not a guess', () => {
    const r = singleRule('STRAT-PLAN-EXPIRING', { 'strat.plan_horizon': available(2027, '2023-07-01') })
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('value_not_usable')
    expect(r.notEvaluated[0].blockingSignalKey).toBe('strat.plan_horizon')
    expect(r.notEvaluated[0].message).toContain('no end date')
  })
})

describe('§4 ENR-DECLINE', () => {
  const run = (now: number, prior: number) => {
    const def = TWIN_RULES_BY_ID.get('ENR-DECLINE') as TwinRuleDef
    return deriveTwin(signalSet({ 'enr.headcount': available(now, '2026-09-15') }), mkRegister(), [def], NOW, {
      priorFacts: { 'enr.headcount': { value: prior, observedOn: '2025-09-15', cells: null } },
    })
  }

  it('three per cent is the floor, seven is a budget event', () => {
    expect(run(195, 200).findings).toHaveLength(0)
    expect(run(194, 200).findings[0].severity).toBe('warn')
    expect(run(186, 200).findings[0].severity).toBe('critical')
  })

  it('never borrows the vocabulary reserved for five readings', () => {
    const f = run(186, 204).findings[0]
    expect(f.confidence).toBe('observation')
    expect(f.likelihood).toBe('possible')
    expect(f.factKey).toBe('register:enrollment_headcount@2026-09-15')
    expect(f.rationale).toBe(
      'Enrollment fell from 204 at 15 September 2025 to 186 at 15 September 2026 — a decline of 8.8%.',
    )
    assertWellFormed(f)
  })
})

describe('§4 ENR-FEEDER-EROSION', () => {
  const def = () => TWIN_RULES_BY_ID.get('ENR-FEEDER-EROSION') as TwinRuleDef
  const run = (nowCells: SmallCell[], priorCells: SmallCell[]) =>
    deriveTwin(
      signalSet({ 'enr.feeder_grades': available(null, '2026-09-15', { cells: nowCells }) }),
      mkRegister(),
      [def()],
      NOW,
      { priorFacts: { 'enr.feeder_grades': { value: null, observedOn: '2025-09-15', cells: priorCells } } },
    )

  it('the two lowest matched entry grades are the cohort, in the frozen order', () => {
    expect(ENTRY_GRADE_KEYS[0]).toBe('PK')
    const f = run(cells({ K: 12, '1': 10, '5': 40 }), cells({ K: 18, '1': 13, '5': 40 })).findings[0]
    expect(f.rationale).toContain('(K, 1)')
    expect(f.rationale).toContain('from 31')
    expect(f.rationale).toContain('to 22')
    expect(f.severity).toBe('warn')
    expect(f.factKey).toBe('register:feeder_grades@2026-09-15')
    assertWellFormed(f)
  })

  it('does not fire below the erosion floor', () => {
    expect(run(cells({ K: 18, '1': 13 }), cells({ K: 19, '1': 13 })).findings).toHaveLength(0)
  })

  it('a suppressed cell in EITHER observation is excluded — and full suppression is a named refusal', () => {
    // K is suppressed now: only grade 1 survives, and 13 -> 10 is a 23% drop.
    const partial = run(cells({ K: null, '1': 10 }), cells({ K: 18, '1': 13 })).findings[0]
    expect(partial.rationale).toContain('(1)')
    expect(partial.rationale).not.toContain('K')

    const r = run(cells({ K: null, '1': null }), cells({ K: 18, '1': 13 }))
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('cells_suppressed')
    expect(r.notEvaluated[0].blockingSignalKey).toBe('enr.feeder_grades')
    expect(r.notEvaluated[0].message).toContain('without disclosing them')
  })
})

describe('§4 ACC-UNSCORED', () => {
  it('is ONE school-scoped finding, never one per standard, and caps the chip row only', () => {
    const standards = REGISTER_CODES.map((c, i) => mkStandard(c, { rubricScore: i < 14 ? null : 3 }))
    const r = singleRule('ACC-UNSCORED', { 'acc.unscored_standards': available(14, null) }, mkRegister({ standards }))
    expect(r.findings).toHaveLength(1)
    const f = r.findings[0]
    expect(f.scopeKey).toBe('school')
    expect(f.factKey).toBe('readiness:unscored_standards@school')
    expect(f.severity).toBe('critical') // 14/18 is well past a third
    expect(f.standardTags.length).toBeLessThanOrEqual(12)
    const codes = f.evidence.find((e) => e.key === 'unscoredCodes')
    expect(codes?.display.split(', ')).toHaveLength(14)
    expect(f.rationale).toBe('14 of 18 standards carry no rubric score at all.')
    assertWellFormed(f)
  })

  it('a small gap list is a warning, not an unstarted self-study', () => {
    const standards = REGISTER_CODES.map((c, i) => mkStandard(c, { rubricScore: i < 2 ? null : 3 }))
    const f = singleRule('ACC-UNSCORED', { 'acc.unscored_standards': available(2, null) }, mkRegister({ standards }))
      .findings[0]
    expect(f.severity).toBe('warn')
  })
})

describe('§4 ACC-UNSUPPORTED-SCORE', () => {
  it('is deliberately per-standard and uncapped', () => {
    const standards = [
      mkStandard('COG-8', { rubricScore: 4, evidenceCount: 0 }),
      mkStandard('COG-15', { rubricScore: 3, evidenceCount: 0 }),
      mkStandard('COG-9', { rubricScore: 2, evidenceCount: 0 }), // below the bar
      mkStandard('COG-11', { rubricScore: 4, evidenceCount: 2 }), // supported
    ]
    const r = singleRule('ACC-UNSUPPORTED-SCORE', { 'acc.unsupported_score': available(2, null) }, mkRegister({ standards }))
    expect(r.findings).toHaveLength(2)
    const f = r.findings.find((x) => x.standardTags[0] === 'COG-8') as TwinFinding
    expect(f.scopeKey).toBe('standard:std-COG-8')
    expect(f.factKey).toBe('standard:std-COG-8:unsupported_score')
    expect(f.rationale).toBe('COG-8 is self-scored 4 out of 4 with 0 artifacts attached.')
    assertWellFormed(f)
  })

  it('an unsupported ASSURANCE score is critical', () => {
    const standards = [mkStandard('COG-A2', { isAssurance: true, rubricScore: 4, evidenceCount: 0 })]
    const f = singleRule('ACC-UNSUPPORTED-SCORE', { 'acc.unsupported_score': available(1, null) }, mkRegister({ standards }))
      .findings[0]
    expect(f.severity).toBe('critical')
  })
})

describe('§4 ACC-ASSURANCE-GAP', () => {
  it('is a standing critical with no ladder in either direction', () => {
    const standards = [
      mkStandard('COG-A2', { isAssurance: true, assuranceSatisfied: false, evidenceCount: 0 }),
      mkStandard('COG-A1', { isAssurance: true, assuranceSatisfied: true }),
      mkStandard('COG-8'),
    ]
    const r = singleRule('ACC-ASSURANCE-GAP', { 'acc.unsupported_score': available(1, null) }, mkRegister({ standards }))
    expect(r.findings).toHaveLength(1)
    const f = r.findings[0]
    expect(f.severity).toBe('critical')
    expect(f.likelihood).toBe('likely')
    expect(f.factKey).toBe('standard:std-COG-A2:assurance_gap')
    expect(f.rationale).toBe('COG-A2 is an assurance gate with 0 artifacts attached.')
    // Acceptance: an assurance finding must not read like a coverage count.
    expect(f.rationale).not.toMatch(/\d+ of \d+ standard/)
    assertWellFormed(f)
  })

  it('an assurance whose gate result is UNKNOWN is not a finding', () => {
    const standards = [mkStandard('COG-A2', { isAssurance: true, assuranceSatisfied: null })]
    expect(
      singleRule('ACC-ASSURANCE-GAP', { 'acc.unsupported_score': available(1, null) }, mkRegister({ standards }))
        .findings,
    ).toHaveLength(0)
  })
})

describe('§4 EVI-STALE / EVI-MISSING-REQUIRED', () => {
  const groups: TwinEvidenceGroupView[] = [
    mkGroup('board_minutes', {
      label: 'board minutes',
      state: 'stale',
      expiresOn: '2025-08-31',
      daysUntilExpiry: -334,
      servesStandards: [
        { standardId: 'std-COG-8', code: 'COG-8' },
        { standardId: 'std-COG-A1', code: 'COG-A1' },
      ],
    }),
    mkGroup('financial_audit', {
      state: 'stale',
      expiresOn: '2025-06-30',
      daysUntilExpiry: -396,
      servesStandards: [{ standardId: 'std-COG-15', code: 'COG-15' }],
    }),
    mkGroup('safety_plan', {
      label: 'safety plan',
      state: 'missing',
      servesAssurance: true,
      servesStandards: [{ standardId: 'std-COG-A3', code: 'COG-A3' }],
    }),
    mkGroup('staff_credentials', { state: 'missing', dataAvailability: 'external' }),
  ]
  const reg = mkRegister({ evidenceGroups: groups })

  it('EVI-STALE never touches the tag FIN-AUDIT-STALE owns', () => {
    const r = singleRule('EVI-STALE', { 'acc.evidence_currency': available(2, null) }, reg)
    expect(r.findings).toHaveLength(1)
    const f = r.findings[0]
    expect(f.scopeKey).toBe('evidence:board_minutes')
    expect(f.factKey).toBe('evidence:board_minutes@2025-08-31')
    expect(f.standardTags).toEqual(['COG-8', 'COG-A1'])
    expect(f.horizon.kind).toBe('by_date')
    expect(f.rationale).toBe(
      'The board minutes on file stopped being current on 31 August 2025, 334 days ago, and 2 standards cite it.',
    )
    assertWellFormed(f)
  })

  it('EVI-MISSING-REQUIRED never blames a school for a hole WE chose', () => {
    const r = singleRule('EVI-MISSING-REQUIRED', { 'acc.evidence_currency': available(2, null) }, reg)
    expect(r.findings).toHaveLength(1)
    const f = r.findings[0]
    expect(f.scopeKey).toBe('evidence:safety_plan')
    expect(f.factKey).toBe('evidence:safety_plan@missing')
    expect(f.severity).toBe('critical') // it serves an assurance
    expect(f.rationale).toBe('No safety plan is on file anywhere in KYRO, and 1 standards ask for one.')
    assertWellFormed(f)
    // The externally-sourced missing artifact produced NOTHING.
    expect(r.findings.some((x) => x.scopeKey === 'evidence:staff_credentials')).toBe(false)
  })
})

describe('§4 FAC-BACKLOG', () => {
  it('fires at ten and escalates at twenty-five, and ships its own refusal note', () => {
    expect(singleRule('FAC-BACKLOG', { 'fac.maintenance_backlog': available(9) }).findings).toHaveLength(0)
    const f = singleRule('FAC-BACKLOG', { 'fac.maintenance_backlog': available(31) }).findings[0]
    expect(f.severity).toBe('critical')
    expect(f.likelihood).toBe('possible')
    expect(f.factKey).toBe('register:maintenance_backlog@2026-06-30')
    expect(f.rationale).toBe(
      '31 maintenance items are open, against a working expectation of fewer than 10.',
    )
    const note = f.evidence.find((e) => e.key === 'honestyNote')
    expect(note?.display).toContain('We will not say your fire inspection is overdue by guessing at free text')
    assertWellFormed(f)
    expect(singleRule('FAC-BACKLOG', { 'fac.maintenance_backlog': available(10) }).findings[0].severity).toBe('warn')
  })
})

describe('§4 HR-RATIO-DRIFT', () => {
  it("reads the metric's own 'declining' as the ratio RISING", () => {
    const f = singleRule('HR-RATIO-DRIFT', {
      'hr.student_teacher_ratio': available(15.2, '2026-06-30', { trend: ratioTrend() }),
    }).findings[0]
    expect(f.confidence).toBe('trend')
    expect(f.factKey).toBe('metric:student_teacher_ratio@FY2026')
    expect(f.rationale).toContain('has risen across 5 readings')
    expect(f.rationale).toContain('from 11.4 to 15.2')
    assertWellFormed(f)
  })

  it('escalates only past the band risk line', () => {
    expect(
      singleRule('HR-RATIO-DRIFT', {
        'hr.student_teacher_ratio': available(15.2, '2026-06-30', { trend: ratioTrend(15.2) }),
      }).findings[0].severity,
    ).toBe('warn')
    expect(
      singleRule('HR-RATIO-DRIFT', {
        'hr.student_teacher_ratio': available(17.5, '2026-06-30', { trend: ratioTrend(17.5) }),
      }).findings[0].severity,
    ).toBe('critical')
  })
})

describe('§4 SCHOOL-NOT-REPORTING', () => {
  const stale = (ageDays: number): Partial<TwinSignalView> => ({
    availability: 'available',
    value: 1,
    observedOn: '2025-01-01',
    changeState: 'stale_data',
    ageDays,
  })

  it('one stale signal is a holiday; three is a school that stopped reporting', () => {
    const two = singleRule('SCHOOL-NOT-REPORTING', {
      'acc.readiness_series': available(61, '2026-06-30'),
      'gov.policy_review': stale(200),
      'fac.maintenance_backlog': stale(300),
    })
    expect(two.findings).toHaveLength(0)

    const r = singleRule('SCHOOL-NOT-REPORTING', {
      'acc.readiness_series': available(61, '2026-06-30'),
      'gov.policy_review': stale(200),
      'fac.maintenance_backlog': stale(300),
      'fin.ar_aging': stale(412),
    })
    const f = r.findings[0]
    expect(f.severity).toBe('info') // ALWAYS. We lost sight; the school did not fail.
    expect(f.likelihood).toBe('possible')
    expect(f.factKey).toBe(`meta:not_reporting@${NOW}`)
    expect(f.rationale).toBe(
      '3 operating signals have gone quiet past their own expected cadence; the oldest was last observed 412 days ago.',
    )
    expect(f.consequence).toContain('never as resolved')
    assertWellFormed(f)
  })
})

describe('§4 the four visible holes', () => {
  for (const id of VISIBLE_HOLE_RULE_IDS) {
    it(`${id} ships VISIBLE, cannot evaluate, and names the intake that closes it`, () => {
      const r = runScenario()
      const ne = r.notEvaluated.find((n) => n.ruleId === id)
      expect(ne, `${id} must be on every payload`).toBeTruthy()
      expect(findingsFor(r, id)).toHaveLength(0)
      expect(ne?.unlock?.intake.length).toBeGreaterThan(5)
      expect(ne?.unlock?.copy.length).toBeGreaterThan(60)
    })
  }

  it('CURR-DOC-AGING is implemented, not stubbed — it fires the day the signal lights', () => {
    const f = singleRule('CURR-DOC-AGING', { 'curr.doc_review': available(3, '2026-02-01') }).findings[0]
    expect(f.severity).toBe('warn')
    expect(f.standardTags).toEqual(['COG-12', 'COG-14'])
    expect(f.rationale).toBe('3 curriculum documents are past their own scheduled review date.')
    assertWellFormed(f)
  })

  it('the three that need a table we do not have refuse even with a lit signal', () => {
    for (const id of ['HR-PD-LOW', 'SAFE-ENV-GAP', 'ACAD-GROWTH-FLAT'] as const) {
      const def = TWIN_RULES_BY_ID.get(id) as TwinRuleDef
      const key = def.requiredAvailable[0]
      const r = deriveTwin(signalSet({ [key]: available(1) }), mkRegister(), [def], NOW)
      expect(r.findings, id).toHaveLength(0)
    }
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// §4F AIC PHASE F — the three rules the new intake registers make evaluable
//
// The plan said Phase F would "flip HR-EVAL-OVERDUE and FAC-INSPECTION-DUE live".
// Neither rule existed: Phase E shipped 26 ids and neither was among them. These
// sections are the rules the plan assumed, built to the same bar as every rule
// above them — a real standard code, every numeral bound to evidence, an ordinal
// likelihood, and a refusal by name whenever the register cannot be read.
// ─────────────────────────────────────────────────────────────────────────────

/** A school that HAS all three new registers, with something wrong in each. */
function phaseFRegister(over: Partial<TwinRegisterView> = {}): TwinRegisterView {
  return mkRegister({
    staffEvaluations: { registerSize: 20, overdueCount: 5, oldestOverdueDays: 90 },
    complianceInspections: {
      trackedCount: 8,
      overdueCount: 2,
      oldestOverdueDays: 40,
      overdueKinds: ['fire_life_safety', 'health'],
      anyLifeSafety: true,
    },
    priorVisitCitations: [{ code: 'COG-A4', visitDate: '2021-03-12', openCount: 2 }],
    ...over,
  })
}

const STAFF_EVAL_LIT = { 'hr.staff_evaluations': available(5, '2026-05-31') }
const INSPECTION_LIT = { 'fac.inspections': available(2, '2026-04-15') }
const PRIOR_VISIT_LIT = { 'acc.prior_visit_findings': available(2, '2021-03-12') }

describe('§4F HR-EVAL-OVERDUE', () => {
  const fire = (
    staffEvaluations: TwinRegisterView['staffEvaluations'],
    register: Partial<TwinRegisterView> = {},
  ) => singleRule('HR-EVAL-OVERDUE', STAFF_EVAL_LIT, phaseFRegister({ staffEvaluations, ...register }))

  it('fires at the working expectation and not below it', () => {
    const at = fire({ registerSize: 20, overdueCount: 3, oldestOverdueDays: 30 })
    const below = fire({ registerSize: 20, overdueCount: 2, oldestOverdueDays: 30 })
    expect(at.findings).toHaveLength(1)
    // Below the threshold is a PASS — zero findings AND zero refusals.
    expect(below.findings).toHaveLength(0)
    expect(below.notEvaluated).toHaveLength(0)
  })

  it('renders one frozen sentence whose every numeral is in its own evidence', () => {
    const f = fire({ registerSize: 20, overdueCount: 5, oldestOverdueDays: 90 }).findings[0]
    expect(f.rationale).toBe(
      '5 staff evaluations are past their own recorded due date; the oldest has been outstanding 90 days, against a working expectation of fewer than 3 overdue.',
    )
    expect(f.evidence.map((e) => e.key)).toEqual([
      'overdueCount',
      'oldestOverdueDays',
      'threshold',
      'registerSize',
    ])
    expect(f.severity).toBe('warn')
    expect(f.likelihood).toBe('likely')
    expect(f.confidence).toBe('observation')
    expect(f.horizon.kind).toBe('none')
    assertWellFormed(f)
  })

  it('says "1 day", never "1 days", on the first day a due date passes', () => {
    // The rule refuses below one day, so ONE is its minimum firing value and this
    // sentence is reachable the morning after a due date passes. It is read
    // verbatim in the briefing, so the inflection is not cosmetic.
    const f = fire({ registerSize: 10, overdueCount: 3, oldestOverdueDays: 1 }).findings[0]
    expect(f.rationale).toBe(
      '3 staff evaluations are past their own recorded due date; the oldest has been outstanding 1 day, against a working expectation of fewer than 3 overdue.',
    )
    expect(f.rationale).not.toContain('1 days')
    assertWellFormed(f)
  })

  it('escalates on EITHER numeral it quotes, and on neither by surprise', () => {
    expect(fire({ registerSize: 40, overdueCount: 10, oldestOverdueDays: 30 }).findings[0].severity).toBe(
      'critical',
    )
    expect(fire({ registerSize: 40, overdueCount: 9, oldestOverdueDays: 30 }).findings[0].severity).toBe(
      'warn',
    )
    expect(fire({ registerSize: 40, overdueCount: 4, oldestOverdueDays: 366 }).findings[0].severity).toBe(
      'critical',
    )
    expect(fire({ registerSize: 40, overdueCount: 4, oldestOverdueDays: 365 }).findings[0].severity).toBe(
      'warn',
    )
  })

  it('NAMES NOBODY — the payload is four integers and no identity of any kind', () => {
    const f = fire({ registerSize: 20, overdueCount: 5, oldestOverdueDays: 90 }).findings[0]
    const copy = `${f.title} ${f.rationale} ${f.consequence} ${JSON.stringify(f.evidence)}`
    for (const forbidden of ['evaluator', 'personId', 'person_id', 'cycleLabel', 'cycle_label']) {
      expect(copy, forbidden).not.toContain(forbidden)
    }
    for (const e of f.evidence) expect(typeof e.value).toBe('number')
  })

  it('an available signal with no register summary REFUSES rather than invent a zero', () => {
    const r = singleRule('HR-EVAL-OVERDUE', STAFF_EVAL_LIT, phaseFRegister({ staffEvaluations: null }))
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('value_not_usable')
    expect(r.notEvaluated[0].blockingSignalKey).toBe('hr.staff_evaluations')
  })

  it('a summary that contradicts itself refuses instead of narrating it', () => {
    // More overdue rows than rows, and an overdue row nought days past its own date.
    for (const bad of [
      { registerSize: 2, overdueCount: 5, oldestOverdueDays: 90 },
      { registerSize: 20, overdueCount: 5, oldestOverdueDays: 0 },
    ]) {
      const r = fire(bad)
      expect(r.findings, JSON.stringify(bad)).toHaveLength(0)
      expect(r.notEvaluated[0].reason).toBe('value_not_usable')
    }
  })

  it('lands on the codes this school actually holds, and refuses when it holds none', () => {
    // The shipped Cognia catalog carries COG-10 AND COG-13; this fixture register
    // carries only COG-13, so the finding renders under COG-13 alone.
    expect(fire({ registerSize: 20, overdueCount: 5, oldestOverdueDays: 90 }).findings[0].standardTags).toEqual(
      ['COG-13'],
    )
    const withCog10 = singleRule(
      'HR-EVAL-OVERDUE',
      STAFF_EVAL_LIT,
      phaseFRegister({ standards: [...REGISTER_CODES, 'COG-10'].map((c) => mkStandard(c)) }),
    )
    expect(withCog10.findings[0].standardTags).toEqual(['COG-10', 'COG-13'])

    const foreign = singleRule(
      'HR-EVAL-OVERDUE',
      STAFF_EVAL_LIT,
      phaseFRegister({ standards: [mkStandard('NSBECS-99')] }),
    )
    expect(foreign.findings).toHaveLength(0)
    expect(foreign.notEvaluated[0].reason).toBe('no_standards')
  })

  it('is no longer reachable through the not-tracked refusal — that is the flip', () => {
    const def = TWIN_RULES_BY_ID.get('HR-EVAL-OVERDUE') as TwinRuleDef
    expect(def.requiredAvailable).toEqual(['hr.staff_evaluations'])
    expect(def.unlock).toBeNull()
    expect((VISIBLE_HOLE_RULE_IDS as readonly string[])).not.toContain('HR-EVAL-OVERDUE')
  })
})

describe('§4F FAC-INSPECTION-DUE', () => {
  const fire = (complianceInspections: TwinRegisterView['complianceInspections']) =>
    singleRule('FAC-INSPECTION-DUE', INSPECTION_LIT, phaseFRegister({ complianceInspections }))

  const inspections = (over: Partial<NonNullable<TwinRegisterView['complianceInspections']>> = {}) => ({
    trackedCount: 8,
    overdueCount: 2,
    oldestOverdueDays: 40,
    overdueKinds: ['fire_life_safety', 'health'] as readonly string[],
    anyLifeSafety: true,
    ...over,
  })

  it('fires on the first overdue item and passes on none', () => {
    expect(fire(inspections({ overdueCount: 1, overdueKinds: ['boiler'], anyLifeSafety: true })).findings)
      .toHaveLength(1)
    const clean = fire(
      inspections({ overdueCount: 0, oldestOverdueDays: 0, overdueKinds: [], anyLifeSafety: false }),
    )
    expect(clean.findings).toHaveLength(0)
    expect(clean.notEvaluated).toHaveLength(0)
  })

  it('names the kinds it is talking about, in both frozen sentences', () => {
    const many = fire(inspections()).findings[0]
    expect(many.rationale).toBe(
      '2 recorded compliance inspections are past their own target date (fire and life-safety, health); the oldest is 40 days past.',
    )
    const one = fire(
      inspections({ overdueCount: 1, oldestOverdueDays: 12, overdueKinds: ['health'], anyLifeSafety: false }),
    ).findings[0]
    expect(one.rationale).toBe(
      'A recorded health inspection is past its own target date, by 12 days.',
    )
    assertWellFormed(many)
    assertWellFormed(one)
  })

  it('says "1 day", never "1 days", in BOTH templates', () => {
    // `oldest < 1` refuses, so one day past target is the minimum firing value —
    // the single most likely day for this rule to fire for the first time.
    const one = fire(
      inspections({ overdueCount: 1, oldestOverdueDays: 1, overdueKinds: ['boiler'], anyLifeSafety: true }),
    ).findings[0]
    expect(one.rationale).toBe('A recorded boiler inspection is past its own target date, by 1 day.')
    const many = fire(
      inspections({ overdueCount: 3, oldestOverdueDays: 1, overdueKinds: ['boiler'], anyLifeSafety: true }),
    ).findings[0]
    expect(many.rationale).toBe(
      '3 recorded compliance inspections are past their own target date (boiler); the oldest is 1 day past.',
    )
    for (const f of [one, many]) {
      expect(f.rationale).not.toContain('1 days')
      assertWellFormed(f)
    }
  })

  it('severity is decided by the KIND, and the sentence names that same kind', () => {
    const life = fire(inspections({ overdueKinds: ['elevator'], overdueCount: 1, anyLifeSafety: true }))
      .findings[0]
    expect(life.severity).toBe('critical')
    expect(life.rationale).toContain('elevator')

    const ordinary = fire(
      inspections({ overdueKinds: ['playground'], overdueCount: 1, anyLifeSafety: false }),
    ).findings[0]
    expect(ordinary.severity).toBe('warn')
    expect(ordinary.rationale).toContain('playground')
  })

  it('will not say "an inspection of an unnamed kind is overdue"', () => {
    const r = fire(inspections({ overdueKinds: [] }))
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('value_not_usable')
    expect(r.notEvaluated[0].blockingSignalKey).toBe('fac.inspections')
  })

  it('an available signal with no register summary refuses, never invents a zero', () => {
    const r = singleRule('FAC-INSPECTION-DUE', INSPECTION_LIT, phaseFRegister({ complianceInspections: null }))
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('value_not_usable')
  })

  it('the refusal to guess from free text is UNCHANGED, word for word', () => {
    expect(FAC_BACKLOG_HONESTY_NOTE).toBe(
      'We can say a recurring facilities item is overdue. We will not say your fire inspection is overdue by guessing at free text — see fac.inspections.',
    )
    const backlog = oneFor('FAC-BACKLOG')
    expect(backlog.evidence.find((e) => e.key === 'honestyNote')?.value).toBe(FAC_BACKLOG_HONESTY_NOTE)
  })

  it('overlaps FAC-BACKLOG on purpose, and the two facts stay distinct', () => {
    const r = runScenario({ phaseF: true })
    const backlog = findingsFor(r, 'FAC-BACKLOG')
    const inspection = findingsFor(r, 'FAC-INSPECTION-DUE')
    expect(backlog).toHaveLength(1)
    expect(inspection).toHaveLength(1)
    // A backlog SIZE and a named regulatory inspection past its own date are two
    // different facts about one school; the domain band counts DISTINCT factKeys.
    expect(backlog[0].factKey).not.toBe(inspection[0].factKey)
    expect(backlog[0].factKey).toMatch(/^register:maintenance_backlog@/)
    expect(inspection[0].factKey).toMatch(/^register:compliance_inspection_overdue@/)
  })
})

describe('§4F ACC-PRIOR-FINDING-OPEN', () => {
  const fire = (priorVisitCitations: TwinRegisterView['priorVisitCitations']) =>
    singleRule('ACC-PRIOR-FINDING-OPEN', PRIOR_VISIT_LIT, phaseFRegister({ priorVisitCitations }))

  it('emits one finding per MATCHED standard and silently places no other', () => {
    const r = fire([
      { code: 'COG-26', visitDate: '2021-03-12', openCount: 1 },
      { code: 'COG-99', visitDate: '2021-03-12', openCount: 9 },
      { code: 'COG-A4', visitDate: '2020-11-02', openCount: 2 },
    ])
    expect(r.findings.map((f) => f.scopeKey).sort()).toEqual(['standard:std-COG-26', 'standard:std-COG-A4'])
    // The unmatched code is NEVER fuzzy-matched into a standard the team did not
    // cite; it stays on the register endpoint, shown as unmatched.
    for (const f of r.findings) expect(f.standardTags).not.toContain('COG-99')
  })

  it('says the most credible sentence the product can say, in both variants', () => {
    const many = fire([{ code: 'COG-A4', visitDate: '2021-03-12', openCount: 2 }]).findings[0]
    expect(many.rationale).toBe(
      '2 citations against COG-A4 from the visit of 12 March 2021 are still recorded as open in your own register.',
    )
    const one = fire([{ code: 'COG-A4', visitDate: '2021-03-12', openCount: 1 }]).findings[0]
    expect(one.rationale).toBe(
      'One citation against COG-A4, from the visit of 12 March 2021, is still recorded as open in your own register.',
    )
    // 'One' is a WORD: the singular sentence carries no digit of its own.
    expect(one.evidence.map((e) => e.key)).toEqual(['code', 'title', 'visitDate', 'openCount'])
    assertWellFormed(many)
    assertWellFormed(one)
  })

  // ── The sentence may not out-run its arithmetic (§3.5 / Phase-E class) ──────
  //
  // A school cited on ONE standard at TWO visits is the ordinary case for a school
  // in its second or third cycle. The caller groups by (code, visit), so each
  // visit gets its OWN finding, its OWN factKey and its OWN count — never one
  // merged sentence attributing an older team's citation to the newer visit.
  it('a standard cited at TWO visits emits TWO findings, each true about its own visit', () => {
    const r = fire([
      { code: 'COG-A4', visitDate: '2015-01-01', openCount: 1 },
      { code: 'COG-A4', visitDate: '2021-03-12', openCount: 1 },
    ])
    expect(r.findings).toHaveLength(2)
    const rationales = r.findings.map((f) => f.rationale).sort()
    expect(rationales).toEqual([
      'One citation against COG-A4, from the visit of 1 January 2015, is still recorded as open in your own register.',
      'One citation against COG-A4, from the visit of 12 March 2021, is still recorded as open in your own register.',
    ])
    // Two distinct, separately-closable facts — the domain band counts factKeys,
    // so a shared key would silently net two visits down to one.
    expect(new Set(r.findings.map((f) => f.factKey)).size).toBe(2)
    for (const f of r.findings) expect(f.factKey).toMatch(/:prior_visit_open@\d{4}-\d{2}-\d{2}$/)
  })

  it('never says "N citations … from the visit of X" about a set spanning two visits', () => {
    // The exact shape the register collector used to produce: one open citation
    // from 2015 and one from 2021, merged into `{ openCount: 2, visitDate: 2021 }`.
    // If any caller ever hands that back, the plural sentence would be false — so
    // the count a finding quotes must equal the citations of the visit it names.
    const r = fire([
      { code: 'COG-A4', visitDate: '2015-01-01', openCount: 1 },
      { code: 'COG-A4', visitDate: '2021-03-12', openCount: 1 },
    ])
    for (const f of r.findings) {
      const open = Number(f.evidence.find((e) => e.key === 'openCount')?.value)
      const date = String(f.evidence.find((e) => e.key === 'visitDate')?.value)
      expect(f.rationale).toContain(open === 1 ? 'One citation' : `${open} citations`)
      expect(f.factKey.endsWith(`@${date}`), f.factKey).toBe(true)
    }
  })

  it('the TITLE says "a previous visit", because the date may not be the last one', () => {
    // `visitDate` is the date of the visit THAT citation came from, not the
    // school's most recent visit: a 2021 team can leave nothing open while a 2015
    // citation still stands. The briefing renders `${code} — ${title}`, so a title
    // claiming "your last accreditation visit" would put a false clause in front
    // of a rationale that correctly names 2015.
    const f = fire([{ code: 'COG-A4', visitDate: '2015-01-01', openCount: 1 }]).findings[0]
    expect(f.title).toBe('A citation from a previous accreditation visit is still open')
    expect(f.title.toLowerCase()).not.toContain('last accreditation visit')
  })

  it('never carries the citation TEXT into the payload', () => {
    const f = fire([{ code: 'COG-A4', visitDate: '2021-03-12', openCount: 2 }]).findings[0]
    const copy = `${f.rationale} ${f.consequence} ${JSON.stringify(f.evidence)}`
    expect(copy).not.toMatch(/lorem|the team wrote/i)
    expect(f.evidence.map((e) => e.key)).not.toContain('text')
  })

  it('a school with a visit history and nothing open is a PASS, not a refusal', () => {
    const r = singleRule('ACC-PRIOR-FINDING-OPEN', PRIOR_VISIT_LIT, phaseFRegister({ priorVisitCitations: [] }))
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated).toHaveLength(0)
  })

  it('refuses by name when the register was never populated', () => {
    const r = singleRule('ACC-PRIOR-FINDING-OPEN', {}, phaseFRegister())
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('signal_no_data')
    expect(r.notEvaluated[0].blockingSignalKey).toBe('acc.prior_visit_findings')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7F THE G10 PROHIBITION — a prior visit may not calibrate ANYTHING
//
// One visiting team per six years per school is not calibratable, and D4 stays
// frozen. A matched open citation may be DISPLAYED and it may raise a standard's
// visibility exactly as any other `warn` fact does. It may not tune the risk
// arithmetic, and no threshold reads it.
// ─────────────────────────────────────────────────────────────────────────────

describe('§7F prior-visit findings calibrate nothing', () => {
  const base = scenario({ phaseF: true })
  /** The same school, with twenty times the citations from twenty years earlier. */
  const exaggerated = {
    ...base,
    register: {
      ...base.register,
      priorVisitCitations: base.register.priorVisitCitations.map((c) => ({
        ...c,
        openCount: c.openCount * 20,
        visitDate: `${Number(c.visitDate.slice(0, 4)) - 20}${c.visitDate.slice(4)}`,
      })),
    },
  }
  const a = deriveTwin(base.signals, base.register, TWIN_RULE_DEFS, NOW, { priorFacts: base.priors })
  const b = deriveTwin(exaggerated.signals, exaggerated.register, TWIN_RULE_DEFS, NOW, {
    priorFacts: exaggerated.priors,
  })

  it('the exaggerated run is genuinely different data, or this spec proves nothing', () => {
    expect(findingsFor(a, 'ACC-PRIOR-FINDING-OPEN').length).toBeGreaterThan(0)
    expect(a.findings.map((f) => f.rationale)).not.toEqual(b.findings.map((f) => f.rationale))
  })

  it('moves no severity, likelihood, confidence or horizon on the prior-visit rule', () => {
    const ordinal = (r: typeof a) =>
      findingsFor(r, 'ACC-PRIOR-FINDING-OPEN').map((f) => ({
        scopeKey: f.scopeKey,
        severity: f.severity,
        likelihood: f.likelihood,
        confidence: f.confidence,
        horizon: f.horizon,
      }))
    expect(ordinal(a)).toEqual(ordinal(b))
    for (const f of findingsFor(a, 'ACC-PRIOR-FINDING-OPEN')) {
      expect(f.severity).toBe('warn')
      expect(f.likelihood).toBe('likely')
      expect(f.confidence).toBe('observation')
    }
  })

  it('moves no OTHER rule at all', () => {
    const others = (r: typeof a) => r.findings.filter((f) => f.ruleId !== 'ACC-PRIOR-FINDING-OPEN')
    expect(others(a)).toEqual(others(b))
    expect(a.notEvaluated).toEqual(b.notEvaluated)
    expect(a.coverage).toEqual(b.coverage)
  })

  it('moves no risk driver — the 40·C + 40·T + 20·E inputs are byte-identical', () => {
    const drivers = (r: typeof a) =>
      r.perStandardRisk.map((s) => ({ code: s.code, raw: s.drivers.map((d) => d.raw), risk: s.risk, band: s.band }))
    expect(drivers(a)).toEqual(drivers(b))
    expect(a.domainBands).toEqual(b.domainBands)
  })

  it('no threshold in the whole engine reads prior-visit data', () => {
    for (const key of Object.keys(TH)) expect(key.toLowerCase()).not.toContain('visit')
    for (const key of Object.keys(TH)) expect(key.toLowerCase()).not.toContain('prior')
    // And the rule's four judgement fields are literals in the source, not functions.
    expect(SRC).toContain("id: 'ACC-PRIOR-FINDING-OPEN'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §5 THE NUMERAL SPEC — acceptance criterion 5, in both required forms
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER = /\{\{\s*[A-Za-z0-9_]+\s*\}\}/g
const NUMERAL = /-?\d[\d,]*(?:\.\d+)?/g

function normalise(s: string): string {
  return s.replace(/[,%$]/g, '')
}

describe('§5 every numeral in a rationale traces to that finding’s evidence', () => {
  it('(a) TEMPLATE FORM — no digit appears outside a {{…}} placeholder', () => {
    const offenders: string[] = []
    for (const def of TWIN_RULE_DEFS) {
      for (const [which, tpl] of [
        ['rationaleTemplate', def.rationaleTemplate],
        ['rationaleTemplateLow', def.rationaleTemplateLow],
      ] as const) {
        if (!tpl) continue
        const stripped = tpl.replace(PLACEHOLDER, '')
        if (!/^[^\d]*$/.test(stripped)) offenders.push(`${def.id}.${which}: ${stripped}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('(b) EXTRACTION FORM — over 200+ generated findings across every firing rule', () => {
    const findings = generatedFindings()
    expect(findings.length).toBeGreaterThanOrEqual(200)

    const orphans: string[] = []
    for (const f of findings) {
      const hay = normalise(f.evidence.map((e) => e.display).join(' '))
      for (const m of f.rationale.match(NUMERAL) ?? []) {
        if (!hay.includes(normalise(m))) {
          orphans.push(`${f.ruleId} :: orphan numeral "${m}" :: ${f.rationale} :: [${hay}]`)
        }
      }
    }
    expect(orphans).toEqual([])
  })

  it('(b) covers every one of the 27 firing rules', () => {
    const fired = new Set(generatedFindings().map((f) => f.ruleId))
    const holes = new Set<string>(VISIBLE_HOLE_RULE_IDS)
    const expected = TWIN_RULE_IDS.filter((id) => !holes.has(id))
    expect(expected).toHaveLength(27)
    expect([...fired].sort()).toEqual([...expected].sort())
  })

  it('a rule whose template names a key its evidence lacks THROWS rather than shipping', () => {
    const broken: TwinRuleDef = {
      ...(TWIN_RULES_BY_ID.get('GOV-CADENCE-GAP') as TwinRuleDef),
      rationaleTemplate: 'A number we cannot justify: {{nowhere}}.',
    }
    const signals = signalSet({ 'gov.meeting_cadence': available(1) })
    expect(() => deriveTwin(signals, mkRegister(), [broken], NOW)).toThrow(TwinTemplateError)
  })

  it('every finding carries a NON-EMPTY basis chain', () => {
    for (const f of generatedFindings(4)) {
      expect(f.evidence.length, f.ruleId).toBeGreaterThanOrEqual(1)
      for (const e of f.evidence) expect(e.display.length, `${f.ruleId}.${e.key}`).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §6 G3 — every finding renders under at least one real standard code
// ─────────────────────────────────────────────────────────────────────────────

describe('§6 no finding ever ships without a standard code', () => {
  it('holds over every generated finding', () => {
    for (const f of generatedFindings()) {
      expect(f.standardTags.length, `${f.ruleId} ${f.factKey}`).toBeGreaterThanOrEqual(1)
      for (const tag of f.standardTags) expect(typeof tag).toBe('string')
    }
  })

  it('a register with none of a rule’s codes produces a REFUSAL, never a tagless finding', () => {
    const foreign = mkRegister({ standards: [mkStandard('NSBECS-99')] })
    const r = singleRule('GOV-CADENCE-GAP', { 'gov.meeting_cadence': available(1) }, foreign)
    expect(r.findings).toHaveLength(0)
    expect(r.notEvaluated[0].reason).toBe('no_standards')
    expect(r.notEvaluated[0].blockingSignalKey).toBeNull()
  })

  it('resolves against the school’s OWN framework', () => {
    const msa = mkRegister({
      frameworkCode: 'msa_cess_2022',
      standards: [mkStandard('MSA-2'), mkStandard('MSA-4')],
    })
    const f = singleRule('GOV-CADENCE-GAP', { 'gov.meeting_cadence': available(1) }, msa).findings[0]
    expect(f.standardTags).toEqual(['MSA-2'])
  })

  it('a register-dependent rule with an EMPTY register refuses with no_standards', () => {
    const empty = mkRegister({ standards: [] })
    const r = singleRule('ACC-UNSCORED', { 'acc.unscored_standards': available(3, null) }, empty)
    expect(r.notEvaluated[0].reason).toBe('no_standards')
  })

  it('a rule never appears in both findings and notEvaluated, nor twice in either', () => {
    const r = runScenario()
    const refused = r.notEvaluated.map((n) => n.ruleId)
    const fired = new Set(r.findings.map((f) => f.ruleId))
    expect(new Set(refused).size).toBe(refused.length)
    for (const id of refused) expect(fired.has(id)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7 VOCABULARY — the three prohibitions, mechanised
// ─────────────────────────────────────────────────────────────────────────────

describe('§7 the vocabulary prohibitions', () => {
  it('the word reserved for five readings never appears below that confidence', () => {
    const offenders: string[] = []
    for (const f of generatedFindings()) {
      if (f.confidence === 'trend') continue
      const copy = `${f.title} ${f.rationale} ${f.consequence}`
      if (TREND_WORD.test(copy)) offenders.push(`${f.ruleId}: ${copy}`)
    }
    expect(offenders).toEqual([])
  })

  it('the staffing-departure word appears nowhere in the source, nor in any emitted string', () => {
    expect(SRC).not.toMatch(/turnover/i)
    for (const f of generatedFindings(4)) {
      expect(`${f.title} ${f.rationale} ${f.consequence}`).not.toMatch(/turnover/i)
      for (const e of f.evidence) expect(e.display).not.toMatch(/turnover/i)
    }
  })

  it('likelihood is two ordinal words and is never a number or a percentage', () => {
    for (const f of generatedFindings(4)) {
      expect(TWIN_LIKELIHOODS).toContain(f.likelihood)
      expect(f.likelihood).not.toMatch(/\d/)
      expect(f.likelihood).not.toMatch(/\d+\s*%/)
    }
    for (const l of TWIN_LIKELIHOODS) expect(typeof l).toBe('string')
  })

  it('no rule TITLE contains a numeral', () => {
    for (const d of TWIN_RULE_DEFS) expect(d.title, d.id).not.toMatch(/\d/)
  })

  it('no firing rule ever emits the ladder’s default confidence', () => {
    for (const f of generatedFindings(4)) expect(f.confidence).not.toBe('insufficient')
  })

  it('no finding predicts an accreditation decision', () => {
    for (const f of generatedFindings(4)) {
      expect(`${f.rationale} ${f.consequence}`).not.toMatch(/will (?:be )?(?:lose|denied|revoked)/i)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §8 MUTUAL EXCLUSION
// ─────────────────────────────────────────────────────────────────────────────

describe('§8 rules that must never both fire', () => {
  it('STRAT-PLAN-EXPIRING and STRAT-PLAN-EXPIRED are disjoint over 500 dates', () => {
    const expiring = TWIN_RULES_BY_ID.get('STRAT-PLAN-EXPIRING') as TwinRuleDef
    const expired = TWIN_RULES_BY_ID.get('STRAT-PLAN-EXPIRED') as TwinRuleDef
    let both = 0
    let neither = 0
    for (let d = -250; d < 250; d++) {
      // A civil date d days from a fixed anchor, without touching a clock.
      const iso = isoFromOffset('2026-07-31', d)
      const r = deriveTwin(
        signalSet({ 'strat.plan_horizon': available(iso, '2023-07-01') }),
        mkRegister(),
        [expiring, expired],
        NOW,
      )
      const a = findingsFor(r, 'STRAT-PLAN-EXPIRING').length
      const b = findingsFor(r, 'STRAT-PLAN-EXPIRED').length
      if (a > 0 && b > 0) both++
      if (a === 0 && b === 0) neither++
    }
    expect(both).toBe(0)
    // Every offset in this window is either inside the 365-day warning or past it.
    expect(neither).toBe(0)
  })

  it('EVI-STALE never emits the tag FIN-AUDIT-STALE owns, in any scenario', () => {
    for (const f of generatedFindings()) {
      if (f.ruleId !== 'EVI-STALE') continue
      expect(f.scopeKey).not.toBe('evidence:financial_audit')
    }
  })
})

/** Civil-date arithmetic for the fixture, with no clock read. */
function isoFromOffset(anchor: string, days: number): string {
  const [y, m, d] = anchor.split('-').map(Number)
  // Days-from-civil (Howard Hinnant), inlined so the spec owns no date library.
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  const z = era * 146097 + doe - 719468 + days
  // Civil-from-days.
  const z2 = z + 719468
  const era2 = Math.floor((z2 >= 0 ? z2 : z2 - 146096) / 146097)
  const doe2 = z2 - era2 * 146097
  const yoe2 = Math.floor((doe2 - Math.floor(doe2 / 1460) + Math.floor(doe2 / 36524) - Math.floor(doe2 / 146096)) / 365)
  const y2 = yoe2 + era2 * 400
  const doy2 = doe2 - (365 * yoe2 + Math.floor(yoe2 / 4) - Math.floor(yoe2 / 100))
  const mp = Math.floor((5 * doy2 + 2) / 153)
  const d2 = doy2 - Math.floor((153 * mp + 2) / 5) + 1
  const m2 = mp + (mp < 10 ? 3 : -9)
  const yr = y2 + (m2 <= 2 ? 1 : 0)
  return `${String(yr).padStart(4, '0')}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// §9 RISK — 40·C + 40·T + 20·E, and the two exits from the formula
// ─────────────────────────────────────────────────────────────────────────────

describe('§9 per-standard risk', () => {
  it('every entry carries drivers, and every driver carries a sentence', () => {
    const r = runScenario()
    expect(r.perStandardRisk.length).toBe(REGISTER_CODES.length)
    for (const s of r.perStandardRisk) {
      expect(s.drivers.length, s.code).toBeGreaterThanOrEqual(1)
      for (const d of s.drivers) {
        expect(d.detail.length, `${s.code}.${d.component}`).toBeGreaterThan(10)
        expect([40, 20]).toContain(d.weight)
        expect(d.raw).toBeGreaterThanOrEqual(0)
        expect(d.raw).toBeLessThanOrEqual(1)
      }
      expect(s.reason === null).toBe(s.risk !== null)
    }
  })

  it('40·C + 40·T + 20·E reproduces risk, over 200 generated standards', () => {
    const standards: TwinStandardView[] = []
    for (let i = 0; i < 200; i++) {
      standards.push(
        mkStandard(`GEN-${String(i).padStart(3, '0')}`, {
          rubricScore: (i % 5) as number,
          evidenceCount: 1 + (i % 3),
          boundMetricKeys: i % 3 === 0 ? ['operating_margin'] : i % 3 === 1 ? ['student_teacher_ratio'] : [],
          requirements: Array.from({ length: i % 4 }, (_, j) => ({
            tag: `tag-${j}`,
            label: `Artifact ${j}`,
            state: (j % 2 === 0 ? 'current' : 'stale') as 'current' | 'stale',
            dataAvailability: (j === 3 ? 'external' : 'platform') as 'platform' | 'external',
            expiresOn: null,
            daysUntilExpiry: null,
          })),
        }),
      )
    }
    const r = deriveTwin(
      signalSet({
        'fin.operating_margin': available(0.015, '2026-06-30', { trend: marginTrend() }),
        'hr.student_teacher_ratio': available(15.2, '2026-06-30', { trend: ratioTrend() }),
      }),
      mkRegister({ standards }),
      TWIN_RULE_DEFS,
      NOW,
    )
    expect(r.perStandardRisk).toHaveLength(200)
    for (const s of r.perStandardRisk) {
      if (s.risk === null) continue
      const by = Object.fromEntries(s.drivers.map((d) => [d.component, d]))
      const recomputed = Math.round((40 * by.C.raw + 40 * by.T.raw + 20 * by.E.raw) * 10) / 10
      expect(s.risk, s.code).toBe(recomputed)
      expect(s.risk).toBeGreaterThanOrEqual(0)
      expect(s.risk).toBeLessThanOrEqual(100)
      expect(s.band).toBe(bandForRisk(s.risk))
    }
  })

  it('T === 0 for want of a bound signal NAMES the hole rather than scoring silently', () => {
    const r = deriveTwin(signalSet(), mkRegister({ standards: [mkStandard('COG-8')] }), TWIN_RULE_DEFS, NOW)
    const t = r.perStandardRisk[0].drivers.find((d) => d.component === 'T')
    expect(t?.raw).toBe(0)
    expect(t?.detail).toBe(
      'No operating signal is bound to this standard, so trajectory contributes nothing to this score.',
    )
  })

  it('T counts the STANDARD’s binding, not the readable part of it — an unlicensed module never moves the score', () => {
    // COG-15 binds three metrics. Two of them sit behind unlicensed modules. The
    // readable one is falling at confirmed confidence.
    const standards = [
      mkStandard('COG-15', {
        boundMetricKeys: ['operating_margin', 'student_teacher_ratio', 'months_operating_reserve'],
      }),
    ]
    const dark = deriveTwin(
      signalSet({
        'fin.operating_margin': available(0.015, '2026-06-30', { trend: marginTrend() }),
        'hr.student_teacher_ratio': { availability: 'not_licensed', unavailableReason: 'HR is not licensed.' },
        'fin.months_operating_reserve': { availability: 'not_licensed', unavailableReason: 'Not licensed.' },
      }),
      mkRegister({ standards }),
      TWIN_RULE_DEFS,
      NOW,
    )
    const darkT = dark.perStandardRisk[0].drivers.find((d) => d.component === 'T')
    // The denominator is THREE, and the two we could not read are NAMED.
    expect(darkT?.detail).toContain('1 of 3 bound signals are moving unfavourably')
    expect(darkT?.detail).toContain('2 of 3 could not be read')
    expect(darkT?.detail).toContain('Student-teacher ratio')

    // And the SCORE is identical to the same standard with those signals present
    // and flat: an unlicensed module lowers coverage, never the score, in either
    // direction.
    const flat = deriveTwin(
      signalSet({
        'fin.operating_margin': available(0.015, '2026-06-30', { trend: marginTrend() }),
        'hr.student_teacher_ratio': available(12, '2026-06-30', {
          trend: annualTrend({
            metric: 'student_teacher_ratio',
            label: 'Student-teacher ratio',
            unit: 'ratio',
            goodDirection: 'lower',
            values: [12, 12, 12, 12, 12],
            startFy: 2022,
          }),
        }),
        'fin.months_operating_reserve': available(6, '2026-06-30', {
          trend: annualTrend({
            metric: 'months_operating_reserve',
            label: 'Months of operating reserve',
            unit: 'ratio',
            goodDirection: 'higher',
            values: [6, 6, 6, 6, 6],
            startFy: 2022,
          }),
        }),
      }),
      mkRegister({ standards }),
      TWIN_RULE_DEFS,
      NOW,
    )
    const flatT = flat.perStandardRisk[0].drivers.find((d) => d.component === 'T')
    expect(darkT?.raw).toBe(flatT?.raw)
  })

  it('a standard whose every driver is a hole is NOT SCORED — never a green zero', () => {
    const r = deriveTwin(
      signalSet(),
      // Evidence is attached (so EXIT 2 does not catch it), but nothing under it
      // is tracked, nothing is bound, and no finding cites it.
      mkRegister({ standards: [mkStandard('COG-8', { evidenceCount: 2, boundMetricKeys: [], requirements: [] })] }),
      TWIN_RULE_DEFS,
      NOW,
    )
    const entry = r.perStandardRisk[0]
    expect(entry.risk).toBeNull()
    expect(entry.band).toBeNull()
    expect(entry.reason).toContain('This is not a risk of zero.')
    expect(entry.drivers).toHaveLength(3)
  })

  it('E === 0 for want of a TRACKED requirement names its hole too', () => {
    const r = deriveTwin(signalSet(), mkRegister({ standards: [mkStandard('COG-8')] }), TWIN_RULE_DEFS, NOW)
    const e = r.perStandardRisk[0].drivers.find((d) => d.component === 'E')
    expect(e?.raw).toBe(0)
    expect(e?.detail).toBe(
      'This standard has no tracked evidence requirement, so evidence contributes nothing to this score.',
    )
  })

  it('a requirement WE do not track never enters the evidence denominator', () => {
    const std = mkStandard('COG-8', {
      requirements: [
        { tag: 'a', label: 'A', state: 'current', dataAvailability: 'platform', expiresOn: null, daysUntilExpiry: null },
        { tag: 'b', label: 'B', state: 'missing', dataAvailability: 'external', expiresOn: null, daysUntilExpiry: null },
      ],
    })
    const r = deriveTwin(signalSet(), mkRegister({ standards: [std] }), TWIN_RULE_DEFS, NOW)
    const e = r.perStandardRisk[0].drivers.find((d) => d.component === 'E')
    expect(e?.raw).toBe(0)
    expect(e?.detail).toBe('1 of 1 tracked artifacts are current.')
  })

  it('ZERO EVIDENCE scores null — never 0 — and still returns all three drivers', () => {
    const std = mkStandard('COG-8', { evidenceCount: 0 })
    const r = deriveTwin(signalSet(), mkRegister({ standards: [std] }), TWIN_RULE_DEFS, NOW)
    const s = r.perStandardRisk[0]
    expect(s.risk).toBeNull()
    expect(s.risk).not.toBe(0)
    expect(s.band).toBeNull()
    expect(s.bypass).toBeNull()
    expect(s.drivers.map((d) => d.component)).toEqual(['C', 'T', 'E'])
    expect(s.reason).toContain('This is not a risk of zero.')
  })

  it('an UNMET assurance bypasses the formula to a standing critical', () => {
    const std = mkStandard('COG-A2', { isAssurance: true, assuranceSatisfied: false, evidenceCount: 4 })
    const r = deriveTwin(signalSet(), mkRegister({ standards: [std] }), TWIN_RULE_DEFS, NOW)
    const s = r.perStandardRisk[0]
    expect(s.risk).toBeNull()
    expect(s.band).toBe('critical')
    expect(s.bypass).toBe('unmet_assurance')
    expect(s.drivers.length).toBeGreaterThanOrEqual(1)
    expect(s.reason).toBe('Assurance gates are pass or fail; a risk percentage would soften a binary.')
  })

  it("'critical' is unreachable by the formula, over 1,000 generated standards", () => {
    for (let i = 0; i <= 1000; i++) {
      expect(bandForRisk(i / 10)).not.toBe('critical')
    }
    expect(bandForRisk(24.9)).toBe('clear')
    expect(bandForRisk(25)).toBe('watch')
    expect(bandForRisk(49.9)).toBe('watch')
    expect(bandForRisk(50)).toBe('elevated')
    expect(bandForRisk(74.9)).toBe('elevated')
    expect(bandForRisk(75)).toBe('high')
    expect(bandForRisk(100)).toBe('high')
  })

  it('both exits still carry findingCount and findingKeys, so the UI never renders a blank', () => {
    const r = runScenario()
    const cog15 = r.perStandardRisk.find((s) => s.code === 'COG-15') as (typeof r.perStandardRisk)[number]
    expect(cog15.risk).toBeNull() // zero evidence attached
    expect(cog15.findingCount).toBeGreaterThan(0)
    expect(cog15.findingKeys.length).toBeGreaterThan(0)
  })

  it('C counts DISTINCT FACTS, not findings — one date speaking twice counts once', () => {
    // The strategic plan end date fires EXPIRING or EXPIRED under one factKey.
    const r = runScenario({ planExpired: true })
    const facts = new Set(
      r.findings.filter((f) => f.factKey.startsWith('register:strategic_plan_end@')).map((f) => f.factKey),
    )
    expect(facts.size).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §10 DOMAIN BANDS — ordinal, over DISTINCT factKeys
// ─────────────────────────────────────────────────────────────────────────────

describe('§10 domain bands', () => {
  it('are ALWAYS all ten, in the frozen order', () => {
    const r = runScenario()
    expect(r.domainBands.map((d) => d.domainKey)).toEqual([...DOMAIN_KEYS])
    const empty = deriveTwin([], mkRegister({ standards: [] }), TWIN_RULE_DEFS, NOW)
    expect(empty.domainBands.map((d) => d.domainKey)).toEqual([...DOMAIN_KEYS])
  })

  it('band === null exactly when reason !== null', () => {
    for (const d of runScenario().domainBands) {
      expect(d.band === null).toBe(d.reason !== null)
    }
  })

  it('no standard AND no signal ⇒ grey WITH A REASON, never grey with a number', () => {
    const r = deriveTwin([], mkRegister({ standards: [] }), TWIN_RULE_DEFS, NOW)
    const tech = r.domainBands.find((d) => d.domainKey === 'technology')
    expect(tech?.band).toBeNull()
    expect(tech?.reason).toBe(
      `No standard in your framework and no KYRO signal reaches ${DOMAIN_REASON_NOUN.technology}. Not measured.`,
    )
    expect(tech?.facts).toEqual({ critical: 0, warn: 0, info: 0, total: 0 })
  })

  it('one fact firing three rules darkens ONE domain, ONCE', () => {
    const shared = 'register:shared_fact@2026-06-30'
    const mkRule = (id: TwinRuleId, severity: 'warn' | 'info'): TwinRuleDef => ({
      ...(TWIN_RULES_BY_ID.get(id) as TwinRuleDef),
      requiredAvailable: ['gov.meeting_cadence'],
      requiredAbsent: [],
      requiredPriors: [],
      needsRegister: false,
      standardCodes: { cognia_2022: ['COG-8'], msa_cess_2022: [], nsbecs: [] },
      rationaleTemplate: 'A shared fact reported as {{n}}.',
      evaluate() {
        return [
          {
            scopeKey: 'school',
            factKey: shared,
            evidence: [{ key: 'n', label: 'n', value: 1, display: '1', asOf: null, lineage: null }],
            severity,
            likelihood: 'possible',
            confidence: 'observation',
            horizon: { kind: 'none', value: null, confidence: null, reason: 'A condition.' },
            consequence: 'This is one fact, however many rules speak about it, and it counts once.',
          },
        ]
      },
    })
    const rules = [
      mkRule('GOV-CADENCE-GAP', 'warn'),
      mkRule('GOV-POLICY-OVERDUE', 'info'),
      mkRule('GOV-TERM-EXPIRY', 'info'),
    ]
    const r = deriveTwin(signalSet({ 'gov.meeting_cadence': available(1) }), mkRegister(), rules, NOW)
    expect(r.findings).toHaveLength(3)
    const gov = r.domainBands.find((d) => d.domainKey === 'governance')
    expect(gov?.facts.total).toBe(1)
    // The WORST severity across the fact wins; the other two never double-count.
    expect(gov?.facts).toEqual({ critical: 0, warn: 1, info: 0, total: 1 })
    expect(gov?.band).toBe('watch')
  })

  it('the ordinal ladder is exactly as frozen', () => {
    expect(bandForFacts({ critical: 1, warn: 0, info: 0 })).toBe('high')
    expect(bandForFacts({ critical: 0, warn: 4, info: 0 })).toBe('high')
    expect(bandForFacts({ critical: 0, warn: 2, info: 0 })).toBe('elevated')
    expect(bandForFacts({ critical: 0, warn: 1, info: 2 })).toBe('elevated')
    expect(bandForFacts({ critical: 0, warn: 1, info: 1 })).toBe('watch')
    expect(bandForFacts({ critical: 0, warn: 0, info: 2 })).toBe('watch')
    expect(bandForFacts({ critical: 0, warn: 0, info: 1 })).toBe('clear')
    expect(bandForFacts({ critical: 0, warn: 0, info: 0 })).toBe('clear')
  })

  it('an injected primary-domain map overrides defaultDomainKey, and agrees on a clean register', () => {
    const s = scenario()
    const plain = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, { priorFacts: s.priors })
    const map: Record<string, DomainKey> = {}
    for (const f of plain.findings) map[f.factKey] = f.defaultDomainKey
    const injected = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, {
      priorFacts: s.priors,
      primaryDomainByFactKey: map,
    })
    expect(injected.domainBands).toEqual(plain.domainBands)

    const moved: Record<string, DomainKey> = {}
    for (const f of plain.findings) moved[f.factKey] = 'technology'
    const shifted = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, {
      priorFacts: s.priors,
      primaryDomainByFactKey: moved,
    })
    const tech = shifted.domainBands.find((d) => d.domainKey === 'technology')
    expect(tech?.facts.total).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §11 DETERMINISM
// ─────────────────────────────────────────────────────────────────────────────

describe('§11 determinism', () => {
  it('two runs on one input are deep-equal', () => {
    const s = scenario()
    const a = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, { priorFacts: s.priors })
    const b = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, { priorFacts: s.priors })
    expect(a).toEqual(b)
  })

  it('shuffling signals and standards cannot change a payload', () => {
    const s = scenario()
    const base = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, { priorFacts: s.priors })
    const rot = <T>(xs: readonly T[], by: number): T[] => [...xs.slice(by), ...xs.slice(0, by)]
    for (const by of [1, 3, 7]) {
      const shuffled = deriveTwin(
        rot(s.signals, by),
        {
          ...s.register,
          standards: rot(s.register.standards, by),
          evidenceGroups: rot(s.register.evidenceGroups, by % s.register.evidenceGroups.length),
        },
        TWIN_RULE_DEFS,
        NOW,
        { priorFacts: s.priors },
      )
      expect(shuffled).toEqual(base)
    }
  })

  it('findings are sorted by (severity, ruleId, scopeKey)', () => {
    const rank = { critical: 0, warn: 1, info: 2 }
    const fs = runScenario().findings
    for (let i = 1; i < fs.length; i++) {
      const a = fs[i - 1]
      const b = fs[i]
      const key = (f: TwinFinding) => [rank[f.severity], f.ruleId, f.scopeKey, f.factKey].join(' ')
      expect(key(a) <= key(b)).toBe(true)
    }
  })

  it('notEvaluated is emitted in the frozen rule order', () => {
    const order = new Map(TWIN_RULE_IDS.map((id, i) => [id, i]))
    const ne = runScenario().notEvaluated.map((n) => order.get(n.ruleId) as number)
    expect([...ne].sort((a, b) => a - b)).toEqual(ne)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §12 PURITY — the guard walks src/ automatically; these pin the intent
// ─────────────────────────────────────────────────────────────────────────────

describe('§12 purity', () => {
  it('the engine reads no clock, no randomness and no I/O', () => {
    for (const re of [/\bDate\s*\./, /\bnew\s+Date\b/, /\bMath\.random\b/, /\bfetch\s*\(/, /from\s+['"]node:fs['"]/]) {
      expect(SRC, String(re)).not.toMatch(re)
    }
  })

  it('`now` is a string parameter, and the same string always yields the same answer', () => {
    const s = scenario()
    const a = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, '2026-07-31', { priorFacts: s.priors })
    const b = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, '2026-07-31', { priorFacts: s.priors })
    expect(a.now).toBe('2026-07-31')
    expect(a).toEqual(b)
    const later = deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, '2027-07-31', { priorFacts: s.priors })
    expect(later.now).toBe('2027-07-31')
  })

  it('deriveTwin does not mutate a deep-frozen input', () => {
    const s = scenario()
    const freeze = <T>(o: T): T => {
      if (o && typeof o === 'object') {
        for (const v of Object.values(o)) freeze(v)
        Object.freeze(o)
      }
      return o
    }
    freeze(s.signals)
    freeze(s.register)
    freeze(s.priors)
    expect(() => deriveTwin(s.signals, s.register, TWIN_RULE_DEFS, NOW, { priorFacts: s.priors })).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §13 COVERAGE — the published size of the hole
// ─────────────────────────────────────────────────────────────────────────────

describe('§13 coverage', () => {
  it('every rule is either evaluated or refused, and never both', () => {
    const r = runScenario()
    expect(r.coverage.rulesTotal).toBe(29)
    expect(r.coverage.rulesEvaluated + r.coverage.rulesNotEvaluated).toBe(29)
    expect(r.coverage.rulesNotEvaluated).toBe(r.notEvaluated.length)
    expect(r.coverage.rulesFired).toBe(new Set(r.findings.map((f) => f.ruleId)).size)
    expect(r.coverage.evaluablePct).toBeCloseTo(r.coverage.rulesEvaluated / 29, 3)
  })

  it('counts every signal by availability, omitting none', () => {
    const r = runScenario()
    const c = r.coverage.signals
    expect(c.available + c.not_licensed + c.no_data + c.not_tracked).toBe(ALL_SIGNAL_KEYS.length)
  })

  it('blockedByModule names ONLY rules whose sole blocker is a licence', () => {
    const s = scenario()
    const signals = s.signals.map((x) =>
      x.moduleKey === 'governance'
        ? { ...x, availability: 'not_licensed' as const, value: null, unavailableReason: 'Unlock Governance.' }
        : x,
    )
    const r = deriveTwin(signals, s.register, TWIN_RULE_DEFS, NOW, { priorFacts: s.priors })
    const gov = r.coverage.blockedByModule['governance'] ?? []
    expect(gov).toContain('GOV-CADENCE-GAP')
    expect(gov).toContain('GOV-POLICY-OVERDUE')
    for (const id of gov) {
      const ne = r.notEvaluated.find((n) => n.ruleId === id)
      expect(ne?.reason).toBe('signal_not_licensed')
    }
    // A rule refused for any OTHER reason is never in the upsell surface.
    for (const ne of r.notEvaluated) {
      if (ne.reason === 'signal_not_licensed') continue
      for (const ids of Object.values(r.coverage.blockedByModule)) expect(ids).not.toContain(ne.ruleId)
    }
  })

  it('the named holes are on EVERY payload, with the intake that closes each', () => {
    // AIC Phase K took this four → two. The two that remain each keep a REASON of
    // its own: CURR-DOC-AGING is closable today with a Policy row (a data-entry
    // gap, not a build gap), and ACAD-GROWTH-FLAT needs an integration KYRO does
    // not have and must never be proxied.
    for (const r of [runScenario(), deriveTwin([], mkRegister({ standards: [] }), TWIN_RULE_DEFS, NOW)]) {
      expect(r.coverage.namedHoles).toHaveLength(2)
      expect(r.coverage.namedHoles.map((h) => h.ruleId)).toEqual([...VISIBLE_HOLE_RULE_IDS])
      for (const h of r.coverage.namedHoles) {
        expect(h.intake.length).toBeGreaterThan(5)
        expect(h.copy.length).toBeGreaterThan(60)
      }
    }
  })

  it('unlockableByYears counts the readings a school still owes, and names the year', () => {
    const twoReadings = annualTrend({
      metric: 'operating_margin',
      label: 'Operating margin',
      unit: 'percent',
      goodDirection: 'higher',
      values: [0.06, 0.02],
      startFy: 2025,
    })
    const r = deriveTwin(
      signalSet({ 'fin.operating_margin': available(0.02, '2026-06-30', { trend: twoReadings }) }),
      mkRegister(),
      TWIN_RULE_DEFS,
      NOW,
    )
    expect(r.coverage.unlockableByYears.signalKey).toBe('fin.operating_margin')
    expect(r.coverage.unlockableByYears.ruleIds).toContain('FIN-BUDGET-DETERIORATING')
    expect(r.coverage.unlockableByYears.yearsNeeded).toBe(MIN_N_FOR_TREND - twoReadings.n)
    // The earliest present FY is 2025, so the years that would extend the series
    // are FY2024, FY2023 and FY2022 — EVERY one of them, rendered the way a school
    // reads them on its own uploader. Naming only the first while needing three is
    // how the ask stops being true.
    expect(r.coverage.unlockableByYears.fyLabels).toEqual(['FY2023–24', 'FY2022–23', 'FY2021–22'])
    expect(r.coverage.unlockableByYears.fyLabels).toHaveLength(
      r.coverage.unlockableByYears.yearsNeeded,
    )
  })

  it('the years ask names ONE signal — the rules listed are only the rules those years unlock', () => {
    // Margin: 3 readings from FY2024 (needs 2). Ratio: 4 readings from FY2023
    // (needs 1). The aggregated first cut paired the ratio's gap with the margin's
    // earliest year and listed BOTH rules against it, an ask that unlocked neither.
    const r = deriveTwin(
      signalSet({
        // Both series are HEALTHY, so neither rule has fired; both are still too
        // short for the trend test, which is exactly what this CTA is about.
        'fin.operating_margin': available(0.06, '2026-06-30', {
          trend: annualTrend({
            metric: 'operating_margin',
            label: 'Operating margin',
            unit: 'percent',
            goodDirection: 'higher',
            values: [0.02, 0.04, 0.06],
            startFy: 2024,
          }),
        }),
        'hr.student_teacher_ratio': available(12, '2026-06-30', {
          trend: annualTrend({
            metric: 'student_teacher_ratio',
            label: 'Student-teacher ratio',
            unit: 'ratio',
            goodDirection: 'lower',
            values: [15, 14, 13, 12],
            startFy: 2023,
          }),
        }),
      }),
      mkRegister(),
      TWIN_RULE_DEFS,
      NOW,
    )
    const u = r.coverage.unlockableByYears
    expect(u.signalKey).toBe('hr.student_teacher_ratio')
    expect(u.ruleIds).toEqual(['HR-RATIO-DRIFT'])
    expect(u.yearsNeeded).toBe(1)
    expect(u.fyLabels).toEqual(['FY2021–22'])
  })

  it('with no trend reading at all there is no year to name, and it says so', () => {
    const r = deriveTwin(signalSet(), mkRegister(), TWIN_RULE_DEFS, NOW)
    expect(r.coverage.unlockableByYears.signalKey).toBeNull()
    expect(r.coverage.unlockableByYears.fyLabels).toEqual([])
    expect(r.coverage.unlockableByYears.ruleIds).toEqual([])
  })

  it('carries the register’s own provenance through, unedited', () => {
    const r = runScenario()
    expect(r.frameworkCode).toBe('cognia_2022')
    expect(r.snapshotAsOf).toBe('2026-06-30')
    expect(r.demoData).toBe(false)
    expect(r.version).toBe(ACCREDITATION_TWIN_VERSION)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE THRESHOLD SENTENCE MUST AGREE WITH THE THRESHOLD COMPARISON.
//
// Found live, not by a test: HR-EVAL-OVERDUE fired on exactly three overdue
// evaluations and said "against a working expectation of NO MORE THAN 3 overdue".
// Both halves are individually true and together they are nonsense — the sentence
// tells the school the number it is being flagged for is the number that is
// allowed. FAC-BACKLOG shipped in Phase E with the identical shape.
//
// Every rule of this form gates on `value < THRESHOLD -> silent`, so it fires AT
// the threshold and the honest phrase is "FEWER THAN". This asserts over the rule
// table rather than over two known ids, so a rule added later cannot reintroduce it.
// ─────────────────────────────────────────────────────────────────────────────
describe('a threshold sentence may not contradict the comparison behind it', () => {
  it('no template says "no more than {{threshold}}" — these rules fire AT the threshold', () => {
    const offenders = TWIN_RULE_DEFS.flatMap((d) =>
      [d.rationaleTemplate, (d as { rationaleTemplateLow?: string }).rationaleTemplateLow]
        .filter((t): t is string => typeof t === 'string')
        .filter((t) => /no more than \{\{threshold\}\}/.test(t))
        .map(() => d.id),
    )
    expect(
      offenders,
      `"no more than {{threshold}}" is false for a rule that fires at the threshold: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  // The assertion above is a prohibition, and a prohibition passes trivially once
  // the string it bans is gone. This proves the COUNT rules actually carry the
  // replacement, so deleting the phrase entirely cannot masquerade as a fix.
  //
  // Scoped to count comparisons on purpose: GOV-MINUTES-LAG says "an expectation of
  // {{threshold}} days", which is a DURATION and reads correctly as written — the
  // defect is specific to a count that fires at its own threshold.
  it('the COUNT rules that fire at their threshold say "fewer than" it', () => {
    const COUNT_RULES = ['FAC-BACKLOG', 'HR-EVAL-OVERDUE']
    for (const id of COUNT_RULES) {
      const d = TWIN_RULE_DEFS.find((x) => x.id === id)
      expect(d, `${id} is missing from the rule table`).toBeDefined()
      expect(d!.rationaleTemplate, id).toMatch(/fewer than \{\{threshold\}\}/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// "1 days" — A VARIABLE DAY COUNT MUST CARRY ITS OWN NOUN.
//
// Phase F introduced fmtDays for its two new rules and left eight shipped A–E
// templates rendering "{{n}} days". Five of those are reachable at n = 1 — an
// audit that lapsed yesterday, a plan that ends tomorrow, a plan that ended
// yesterday (reachable at 0 too), an artifact one day out of date — so production
// copy read "1 days ago". The numeral is right and the sentence is not, which is
// the same class of defect as every other one this file guards.
//
// The three that still hardcode " days" are each provably unreachable at 1 and are
// listed with the reason, so this stays a real assertion rather than a list of
// whatever happens to be true today.
// ─────────────────────────────────────────────────────────────────────────────
describe('a variable day count never renders "1 days"', () => {
  /** Placeholders whose value is a CONSTANT or provably > 1 when the rule fires. */
  const EXEMPT: Record<string, string> = {
    // GOV-MINUTES-LAG gates on `lag <= 60 -> silent`, so the smallest value it can
    // render is 61. `{{threshold}}` is the constant 60 itself.
    lagDays: 'fires only above MINUTES_LAG_WARN_DAYS (60)',
    threshold: 'a constant from TWIN_THRESHOLDS, never 1 for a day-valued rule',
    // The AR bucket is the 90-day bucket label, not an elapsed count.
    agingBucketDays: 'a fixed bucket width (90), not an elapsed duration',
    // A signal is stale only past 1.5x its cadence; the smallest cadence in the
    // catalog is monthly (45), so the oldest stale age is at least 68.
    oldestAgeDays: 'a signal is stale only past 1.5x cadence; min is 68 days',
  }

  it('no template pairs a variable day placeholder with a hardcoded " days"', () => {
    const offenders: string[] = []
    for (const d of TWIN_RULE_DEFS) {
      const templates = [
        d.rationaleTemplate,
        (d as { rationaleTemplateLow?: string }).rationaleTemplateLow,
      ].filter((t): t is string => typeof t === 'string')
      for (const t of templates) {
        for (const m of t.matchAll(/\{\{(\w+)\}\}\s+days?\b/g)) {
          const key = m[1]
          if (!(key in EXEMPT)) offenders.push(`${d.id}: {{${key}}} days`)
        }
      }
    }
    expect(
      offenders,
      `these render "1 days" when the count is 1 — pass the figure through fmtDays and drop the noun: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('the exemptions are real placeholders, not stale entries', () => {
    const used = new Set<string>()
    for (const d of TWIN_RULE_DEFS) {
      for (const t of [d.rationaleTemplate, (d as { rationaleTemplateLow?: string }).rationaleTemplateLow]) {
        if (typeof t !== 'string') continue
        for (const m of t.matchAll(/\{\{(\w+)\}\}/g)) used.add(m[1])
      }
    }
    for (const key of Object.keys(EXEMPT)) {
      expect(used.has(key), `${key} is exempted but appears in no template`).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — THE INERTNESS GOLDEN, GENERATED BEFORE THE FIRST EDIT.
//
// This is a ONE-SHOT SCRIPT, deliberately NOT a spec and deliberately NOT wired
// to any test flag. `vitest.config.ts` includes only `src/**/*.spec.ts`, so
// nothing in CI can ever re-run the write path and silently re-bless a golden
// that has drifted. A baseline regenerated after the change proves only that the
// change agrees with itself, which is not a claim anybody needs.
//
// WHAT IT CAPTURES
//   `computeForPlan(schoolId, planId, FIXED_ASOF)` over a CONSTRUCTED plan, twice:
//     preG-strategy-payload.json             — with a statement snapshot
//     preG-strategy-payload-nosnapshot.json  — the same plan, snapshot absent
//
// WHY CONSTRUCTED AND NOT THE DEV DATABASE
//   The dev database holds 0 strategy goals and 0 strategy initiatives. A
//   byte-identity assertion over an empty plan passes against almost any
//   refactor, including one that breaks every initiative on a real school. That
//   is the vacuous-fixture failure mode this program keeps hitting, so the plan
//   below is built to exercise the code paths the Phase G refactor moves.
//
// PATHS THE FIXTURE EXERCISES (see phase-g-inert.spec.ts for the running list):
//   • computeForPlan end to end, both pillars, all four buildGoal branches;
//   • the metric baseline FREEZE (A/G1) and the persist-on-first-read BACKFILL
//     (A/G2) including the post-loop strategyGoal.update write;
//   • a metric whose MetricResult.available === false (A/G3 → current null);
//   • coerceMilestones' two drop branches (a non-object entry, a label-less
//     entry) and the id←label fallback (B/G4);
//   • the task groupBy rollup including its null-sourceRef guard (B/G5);
//   • computePace on ALL FIVE PaceStatus outcomes — achieved+overshoot (A/G1),
//     behind (A/G2, B/G6), no_data (A/G3), on_track (B/G4), at_risk (B/G5);
//   • initiativeStatusCounts with EVERY key non-zero in one object (A/G1);
//   • ownerName's full-name branch, its email fallback, and the null-owner path;
//   • stale detection, its status guard (a `done`/`cancelled` row is never
//     stale) and the staleDays-desc sort (three stale rows);
//   • the behindPaceGoals pctToTarget-asc sort (two behind goals, 0 vs 0.25);
//   • meanFraction with a null in the list, worstPace, tallyGoal all six
//     counters, reviewDueThisMonth, isoDate on @db.Date and timestamp columns,
//     and the goal.startDate ?? planStartDate fallback (A/G3).
//
// TO RE-RUN (deliberately manual, and it must be done on a tree with the Phase G
// refactor REVERTED or the golden means nothing):
//   1. create apps/api/src/strategy/__regen.spec.ts containing
//        import { it } from 'vitest'
//        import { generateGoldens } from './__fixtures__/generate-phase-g-golden.js'
//        it('regen', () => { generateGoldens() })
//   2. pnpm -C apps/api test __regen
//   3. delete __regen.spec.ts
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Prisma } from '@finrep/db'
import { StrategyProgressService } from '../strategy-progress.service.js'
import type { PrismaService } from '../../prisma/prisma.service.js'

/** The clock is a PARAMETER. Every date below is anchored to it. */
export const FIXED_ASOF = new Date('2026-07-31T00:00:00.000Z')
export const FIXTURE_SCHOOL_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
export const FIXTURE_PLAN_ID = 'bbbbbbbb-0000-4000-8000-000000000001'

const DAY_MS = 86_400_000
/** A timestamp exactly `n` whole days before FIXED_ASOF (so staleDays === n). */
function daysBefore(n: number): Date {
  return new Date(FIXED_ASOF.getTime() - n * DAY_MS)
}
/** UTC-midnight for a yyyy-mm-dd — the house @db.Date convention. */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

// ── The financial basis ──────────────────────────────────────────────────────
// operating_margin          = netChange / totalRev      = 50_000 / 1_000_000 = 0.05
// months_operating_reserve  = naWithout / (totalExp/12) = 500_000 / (950_000/12)
const TOTAL_REV = 1_000_000
const TOTAL_EXP = 950_000
const NET_CHANGE = 50_000
const NA_WITHOUT = 500_000

/** The minimal ReportBundle the pure adapter (fromBundle) actually reads. */
function bundle(): unknown {
  const soa = {
    tuition: 820_000, dev: 90_000, studAct: 15_000, textbook: 10_000, other: 25_000,
    support: 30_000, intlRev: 0, investments: 8_000, interest: 2_000,
    totalRev: TOTAL_REV,
    instructional: 560_000, facilities: 120_000, fixedOther: 60_000, intlExp: 0,
    bus: 20_000, food: 30_000, studActExp: 15_000, athletics: 25_000,
    admin: 120_000, restricted: 0,
    totalExp: TOTAL_EXP, netChange: NET_CHANGE,
  }
  const sfp = {
    cash: 300_000, restrictedCash: 40_000, tuitionRec: 25_000, prepaid: 10_000,
    totalCurrentA: 375_000, ppNet: 1_200_000, rouAsset: 0, restrictInvst: 150_000,
    totalAssets: 1_725_000, apAccrued: 60_000, leaseCurr: 0, studentClubs: 5_000,
    deferredIntl: 0, totalCurrL: 65_000, leaseNonCurr: 0, totalLiab: 65_000,
    naWithout: NA_WITHOUT, naWith: 1_160_000, totalNA: 1_660_000, totalLiabNA: 1_725_000,
  }
  return {
    soaResults: {
      cy: soa, py: null, audit: null, hasPY: false, hasAudit: false,
      cyNABegin: 1_610_000, cyNAEnd: 1_660_000, pyNABegin: 0, pyNAEnd: null,
      auditNABegin: 0, auditNAEnd: null,
    },
    sfpResults: { cy: sfp, py: null, audit: null, hasPY: false, hasAudit: false },
    scf: null,
    netAssets: {
      cy: { begin: 1_610_000, change: NET_CHANGE, end: 1_660_000, withoutDonor: NA_WITHOUT, withDonor: 1_160_000 },
      py: null, audit: null, hasPY: false, hasAudit: false,
    },
    unmapped: [],
    validation: { balanced: true, totalDebits: 0, totalCredits: 0, difference: 0, issues: [] },
    meta: { engineVersion: 'fixture', mappingVersion: 'fixture', standardChartVersion: 'fixture' },
  }
}

// ── Owners ───────────────────────────────────────────────────────────────────
const OWNER_NAMED = {
  id: 'cccccccc-0000-4000-8000-000000000001',
  firstName: 'Jo',
  lastName: 'Ruiz',
  email: 'jo.ruiz@fixture.test',
}
/** BOTH names null — the ownerName EMAIL FALLBACK branch. */
const OWNER_NAMELESS = {
  id: 'cccccccc-0000-4000-8000-000000000002',
  firstName: null,
  lastName: null,
  email: 'ops@fixture.test',
}

interface IniSeed {
  id: string
  title: string
  status: string
  daysStale: number
  owner: typeof OWNER_NAMED | typeof OWNER_NAMELESS | null
}

function initiative(seed: IniSeed, goalId: string, orderIndex: number) {
  return {
    id: seed.id,
    schoolId: FIXTURE_SCHOOL_ID,
    goalId,
    title: seed.title,
    description: null,
    status: seed.status,
    orderIndex,
    ownerUserId: seed.owner?.id ?? null,
    owner: seed.owner,
    updatedByUserId: null,
    createdAt: d('2026-01-01'),
    updatedAt: daysBefore(seed.daysStale),
  }
}

/**
 * A/G1's six initiatives: EVERY InitiativeStatusCounts key non-zero in ONE
 * counts object, both ownerName branches, the null-owner path, two stale rows at
 * different ages (so the staleDays-desc sort is observable) and two rows that are
 * old but CLOSED (so the status guard on staleness is observable).
 */
const G1_INITIATIVES: IniSeed[] = [
  { id: 'dddddddd-0000-4000-8000-000000000001', title: 'Rebid the insurance program', status: 'planned', daysStale: 90, owner: OWNER_NAMED },
  { id: 'dddddddd-0000-4000-8000-000000000002', title: 'Renegotiate the food-service contract', status: 'in_progress', daysStale: 120, owner: OWNER_NAMELESS },
  { id: 'dddddddd-0000-4000-8000-000000000003', title: 'Freeze discretionary travel', status: 'blocked', daysStale: 2, owner: null },
  { id: 'dddddddd-0000-4000-8000-000000000004', title: 'Publish the monthly variance pack', status: 'done', daysStale: 90, owner: OWNER_NAMED },
  { id: 'dddddddd-0000-4000-8000-000000000005', title: 'Outsource the print room', status: 'cancelled', daysStale: 200, owner: null },
  { id: 'dddddddd-0000-4000-8000-000000000006', title: 'Move to a single ERP', status: 'in_progress', daysStale: 75, owner: OWNER_NAMED },
]

/** B/G5 carries the task-rollup initiatives (the goal type needs rows to roll up). */
const G5_INITIATIVES: IniSeed[] = [
  { id: 'dddddddd-0000-4000-8000-000000000007', title: 'Stand up the advising rubric', status: 'in_progress', daysStale: 1, owner: OWNER_NAMED },
  { id: 'dddddddd-0000-4000-8000-000000000008', title: 'Train the middle-school team', status: 'planned', daysStale: 1, owner: null },
]

function buildPlan() {
  return {
    id: FIXTURE_PLAN_ID,
    schoolId: FIXTURE_SCHOOL_ID,
    name: 'Toward 2030',
    mission: 'A school that is financially durable and academically distinctive.',
    status: 'adopted',
    fyStartYear: 2026,
    fyEndYear: 2030,
    startDate: d('2026-07-01'),
    endDate: d('2030-06-30'),
    adoptedAt: new Date('2026-06-15T14:30:00.000Z'),
    // July 2026 — the same calendar month as FIXED_ASOF, so reviewDueThisMonth is true.
    nextReviewDate: d('2026-07-20'),
    createdAt: d('2026-05-01'),
    updatedAt: d('2026-06-15'),
    pillars: [
      {
        id: 'eeeeeeee-0000-4000-8000-00000000000a',
        schoolId: FIXTURE_SCHOOL_ID,
        name: 'Financial durability',
        description: 'Margin, reserves, and the discipline behind them.',
        orderIndex: 0,
        createdAt: d('2026-05-01'),
        updatedAt: d('2026-05-01'),
        goals: [
          {
            // A/G1 — metric, baseline FROZEN, current has OVERSHOT the target.
            id: 'ffffffff-0000-4000-8000-000000000001',
            schoolId: FIXTURE_SCHOOL_ID,
            pillarId: 'eeeeeeee-0000-4000-8000-00000000000a',
            title: 'Hold a 4% operating margin',
            description: 'A durable surplus, not a one-year rebound.',
            goalType: 'metric',
            orderIndex: 0,
            ownerUserId: OWNER_NAMED.id,
            owner: OWNER_NAMED,
            metricKey: 'operating_margin',
            targetValue: new Prisma.Decimal(0.04),
            baselineValue: new Prisma.Decimal(0.01),
            baselineDate: d('2025-06-30'),
            baselineMetricPeriodId: 'baseline-period-1',
            startDate: d('2026-01-01'),
            targetDate: d('2027-01-01'),
            manualProgressPct: null,
            milestones: null,
            createdAt: d('2026-05-01'),
            updatedAt: d('2026-05-01'),
            initiatives: G1_INITIATIVES.map((s, i) => initiative(s, 'ffffffff-0000-4000-8000-000000000001', i)),
          },
          {
            // A/G2 — metric, baseline NULL (BACKFILL + the persisted write), past due.
            id: 'ffffffff-0000-4000-8000-000000000002',
            schoolId: FIXTURE_SCHOOL_ID,
            pillarId: 'eeeeeeee-0000-4000-8000-00000000000a',
            title: 'Reach twelve months of operating reserve',
            description: null,
            goalType: 'metric',
            orderIndex: 1,
            ownerUserId: null,
            owner: null,
            metricKey: 'months_operating_reserve',
            targetValue: new Prisma.Decimal(12),
            baselineValue: null,
            baselineDate: null,
            baselineMetricPeriodId: null,
            startDate: d('2025-07-01'),
            targetDate: d('2026-06-30'),
            manualProgressPct: null,
            milestones: null,
            createdAt: d('2026-05-01'),
            updatedAt: d('2026-05-01'),
            initiatives: [],
          },
          {
            // A/G3 — metric bound to a key whose MetricResult.available is false
            // (no enrollment plan is threaded through this Prisma-only path), and
            // startDate NULL so the plan-start fallback is exercised.
            id: 'ffffffff-0000-4000-8000-000000000003',
            schoolId: FIXTURE_SCHOOL_ID,
            pillarId: 'eeeeeeee-0000-4000-8000-00000000000a',
            title: 'Land within 2% of the enrollment plan',
            description: null,
            goalType: 'metric',
            orderIndex: 2,
            ownerUserId: OWNER_NAMELESS.id,
            owner: OWNER_NAMELESS,
            metricKey: 'enrollment_vs_plan',
            targetValue: new Prisma.Decimal(0.02),
            baselineValue: null,
            baselineDate: null,
            baselineMetricPeriodId: null,
            startDate: null,
            targetDate: d('2027-06-30'),
            manualProgressPct: null,
            milestones: null,
            createdAt: d('2026-05-01'),
            updatedAt: d('2026-05-01'),
            initiatives: [],
          },
        ],
      },
      {
        id: 'eeeeeeee-0000-4000-8000-00000000000b',
        schoolId: FIXTURE_SCHOOL_ID,
        name: 'Academic distinctiveness',
        description: null,
        orderIndex: 1,
        createdAt: d('2026-05-01'),
        updatedAt: d('2026-05-01'),
        goals: [
          {
            // B/G4 — milestone. FIVE raw entries: one null (non-object drop), one
            // with no label (drop), one with no id (id←label fallback). 4 kept, 1 done.
            id: 'ffffffff-0000-4000-8000-000000000004',
            schoolId: FIXTURE_SCHOOL_ID,
            pillarId: 'eeeeeeee-0000-4000-8000-00000000000b',
            title: 'Launch the signature capstone',
            description: null,
            goalType: 'milestone',
            orderIndex: 0,
            ownerUserId: OWNER_NAMED.id,
            owner: OWNER_NAMED,
            metricKey: null,
            targetValue: null,
            baselineValue: null,
            baselineDate: null,
            baselineMetricPeriodId: null,
            startDate: d('2026-07-01'),
            targetDate: d('2027-06-30'),
            manualProgressPct: null,
            milestones: [
              { id: 'm1', label: 'Charter signed', done: true },
              { id: 'm2', label: 'Faculty lead named', done: false },
              null,
              { label: 'Board briefed' },
              { id: 'm5', done: true },
              { id: 'm6', label: 'Pilot cohort enrolled', done: false },
            ],
            createdAt: d('2026-05-01'),
            updatedAt: d('2026-05-01'),
            initiatives: [],
          },
          {
            // B/G5 — task_rollup. 5 linked tasks, 2 done.
            id: 'ffffffff-0000-4000-8000-000000000005',
            schoolId: FIXTURE_SCHOOL_ID,
            pillarId: 'eeeeeeee-0000-4000-8000-00000000000b',
            title: 'Rebuild the advising programme',
            description: null,
            goalType: 'task_rollup',
            orderIndex: 1,
            ownerUserId: null,
            owner: null,
            metricKey: null,
            targetValue: null,
            baselineValue: null,
            baselineDate: null,
            baselineMetricPeriodId: null,
            startDate: d('2026-01-01'),
            targetDate: d('2027-01-31'),
            manualProgressPct: null,
            milestones: null,
            createdAt: d('2026-05-01'),
            updatedAt: d('2026-05-01'),
            initiatives: G5_INITIATIVES.map((s, i) => initiative(s, 'ffffffff-0000-4000-8000-000000000005', i)),
          },
          {
            // B/G6 — manual, past due. The SECOND behind goal, at a different
            // pctToTarget from A/G2, so the behindPaceGoals sort is observable.
            id: 'ffffffff-0000-4000-8000-000000000006',
            schoolId: FIXTURE_SCHOOL_ID,
            pillarId: 'eeeeeeee-0000-4000-8000-00000000000b',
            title: 'Publish the curriculum review',
            description: null,
            goalType: 'manual',
            orderIndex: 2,
            ownerUserId: null,
            owner: null,
            metricKey: null,
            targetValue: null,
            baselineValue: null,
            baselineDate: null,
            baselineMetricPeriodId: null,
            startDate: d('2025-08-01'),
            targetDate: d('2026-06-30'),
            manualProgressPct: new Prisma.Decimal(0.25),
            milestones: null,
            createdAt: d('2026-05-01'),
            updatedAt: d('2026-05-01'),
            initiatives: [],
          },
        ],
      },
    ],
  }
}

/** Task groupBy rows. The null sourceRef row exercises the skip guard. */
const TASK_GROUPS = [
  { sourceRef: 'dddddddd-0000-4000-8000-000000000007', status: 'done', _count: { _all: 1 } },
  { sourceRef: 'dddddddd-0000-4000-8000-000000000007', status: 'in_progress', _count: { _all: 2 } },
  { sourceRef: 'dddddddd-0000-4000-8000-000000000008', status: 'done', _count: { _all: 1 } },
  { sourceRef: 'dddddddd-0000-4000-8000-000000000008', status: 'todo', _count: { _all: 1 } },
  { sourceRef: null, status: 'done', _count: { _all: 9 } },
]

export interface GoalUpdateCall {
  where: { id: string }
  data: Record<string, unknown>
}

export interface PhaseGFixture {
  svc: StrategyProgressService
  /** Every strategyGoal.update the compute performed, in call order. */
  goalUpdates: GoalUpdateCall[]
}

/**
 * Build the service over a hand-rolled PrismaService double. No vitest import —
 * this file is not a spec and must stay runnable outside the test runner.
 */
export function buildFixture(opts: { hasSnapshot: boolean }): PhaseGFixture {
  const goalUpdates: GoalUpdateCall[] = []
  const period = { id: 'period-2026', periodEndDate: d('2026-06-30') }
  const prisma = {
    strategicPlan: {
      findFirst: async (args: { where: { id: string; schoolId: string } }) =>
        args.where.id === FIXTURE_PLAN_ID && args.where.schoolId === FIXTURE_SCHOOL_ID ? buildPlan() : null,
    },
    fiscalPeriod: { findFirst: async () => (opts.hasSnapshot ? period : null) },
    statementSnapshot: {
      findFirst: async () =>
        opts.hasSnapshot
          ? { createdAt: new Date('2026-07-15T12:00:00.000Z'), payload: bundle() }
          : null,
    },
    periodOperationalData: {
      findUnique: async () =>
        opts.hasSnapshot
          ? {
              enrollment: 320,
              enrollmentFte: new Prisma.Decimal(315.5),
              studentsOnAid: 90,
              financialAidTotal: new Prisma.Decimal(450_000),
              teachingFte: new Prisma.Decimal(28),
              totalStaffFte: new Prisma.Decimal(45),
            }
          : null,
    },
    task: { groupBy: async () => TASK_GROUPS },
    strategyGoal: {
      update: async (args: GoalUpdateCall) => {
        goalUpdates.push(args)
        return { id: args.where.id }
      },
    },
  } as unknown as PrismaService
  return { svc: new StrategyProgressService(prisma), goalUpdates }
}

/** The two goldens, keyed by their on-disk file name. */
export const GOLDEN_FILES = {
  snapshot: 'preG-strategy-payload.json',
  nosnapshot: 'preG-strategy-payload-nosnapshot.json',
} as const

export async function computeGolden(hasSnapshot: boolean): Promise<unknown> {
  const { svc } = buildFixture({ hasSnapshot })
  const payload = await svc.computeForPlan(FIXTURE_SCHOOL_ID, FIXTURE_PLAN_ID, FIXED_ASOF)
  // Round-trip through JSON so the golden and the assertion compare the same
  // wire shape the controller would actually serialise.
  return JSON.parse(JSON.stringify(payload)) as unknown
}

/** THE WRITE PATH. Never called from a spec. */
export async function generateGoldens(): Promise<void> {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  for (const [k, file] of Object.entries(GOLDEN_FILES)) {
    const payload = await computeGolden(k === 'snapshot')
    writeFileSync(`${dir}${file}`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }
}

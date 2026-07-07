import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@finrep/db'
import { StrategyProgressService } from './strategy-progress.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// StrategyProgressService — the Prisma-only compute spine. Proves the BASELINE
// FREEZE invariant end-to-end against a REAL metric (operating_margin computed from
// a minimal ReportBundle via the canonical @finrep/analytics path):
//   • a pre-frozen baseline is used VERBATIM and NEVER overwritten on read;
//   • a null baseline is BACKFILLED (persist-on-first-read) from the current value;
//   • no snapshot → no fabrication (baseline stays null, goal reads no_data).
// Framework-free: a hand-mocked PrismaService, no Nest boot.
// ─────────────────────────────────────────────────────────────────────────────

/** A minimal ReportBundle the adapter (fromBundle) reads. operating_margin = netChange/totalRev. */
function bundle(over: { totalRev: number; totalExp: number; netChange: number }): unknown {
  const soa = {
    tuition: over.totalRev, dev: 0, studAct: 0, textbook: 0, other: 0,
    support: 0, intlRev: 0, investments: 0, interest: 0,
    totalRev: over.totalRev,
    instructional: over.totalExp, facilities: 0, fixedOther: 0, intlExp: 0,
    bus: 0, food: 0, studActExp: 0, athletics: 0, admin: 0, restricted: 0,
    totalExp: over.totalExp, netChange: over.netChange,
  }
  return {
    soaResults: { cy: soa, py: null, audit: null, hasPY: false, hasAudit: false, cyNABegin: 0, cyNAEnd: 0, pyNABegin: 0, pyNAEnd: null, auditNABegin: 0, auditNAEnd: null },
    sfpResults: { cy: null, py: null, audit: null, hasPY: false, hasAudit: false },
    scf: null,
    netAssets: { cy: { begin: 0, change: 0, end: 0, withoutDonor: 0, withDonor: 0 }, py: null, audit: null, hasPY: false, hasAudit: false },
    unmapped: [],
    validation: { balanced: true, totalDebits: 0, totalCredits: 0, difference: 0, issues: [] },
    meta: { engineVersion: 't', mappingVersion: 't', standardChartVersion: 't' },
  }
}

const PERIOD_END = new Date('2026-06-30T00:00:00.000Z')

/** Build a mock prisma whose plan has ONE metric goal (operating_margin). */
function makeService(opts: {
  baselineValue: number | null
  hasSnapshot: boolean
  goalUpdate?: ReturnType<typeof vi.fn>
}) {
  const goal = {
    id: 'goal-1',
    schoolId: 'school-1',
    pillarId: 'pillar-1',
    title: 'Reach 10% operating margin',
    description: null,
    goalType: 'metric',
    orderIndex: 0,
    ownerUserId: null,
    owner: null,
    metricKey: 'operating_margin',
    targetValue: new Prisma.Decimal(0.1),
    baselineValue: opts.baselineValue === null ? null : new Prisma.Decimal(opts.baselineValue),
    baselineDate: null,
    baselineMetricPeriodId: null,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    targetDate: new Date('2027-01-01T00:00:00.000Z'),
    manualProgressPct: null,
    milestones: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    initiatives: [],
  }
  const plan = {
    id: 'plan-1',
    schoolId: 'school-1',
    name: 'Plan',
    mission: null,
    status: 'adopted',
    fyStartYear: 2026,
    fyEndYear: 2027,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2027-06-30T00:00:00.000Z'),
    adoptedAt: new Date('2026-01-01T00:00:00.000Z'),
    nextReviewDate: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    pillars: [
      { id: 'pillar-1', name: 'Sustainability', description: null, orderIndex: 0, createdAt: new Date(), updatedAt: new Date(), goals: [goal] },
    ],
  }
  const goalUpdate = opts.goalUpdate ?? vi.fn().mockResolvedValue(goal)
  const prisma = {
    strategicPlan: { findFirst: async () => plan },
    fiscalPeriod: {
      findFirst: async () => (opts.hasSnapshot ? { id: 'period-1', periodEndDate: PERIOD_END } : null),
    },
    statementSnapshot: {
      findFirst: async () =>
        opts.hasSnapshot
          ? { createdAt: new Date('2026-06-30T12:00:00.000Z'), payload: bundle({ totalRev: 1_000_000, totalExp: 980_000, netChange: 20_000 }) }
          : null,
    },
    periodOperationalData: { findUnique: async () => null },
    task: { groupBy: async () => [] },
    strategyGoal: { update: goalUpdate },
  } as unknown as PrismaService
  return { svc: new StrategyProgressService(prisma), goalUpdate }
}

const AS_OF = new Date('2026-07-02T00:00:00.000Z')

describe('StrategyProgressService — baseline freeze', () => {
  it('frozen baseline is used VERBATIM and NEVER overwritten on read', async () => {
    const { svc, goalUpdate } = makeService({ baselineValue: 0.05, hasSnapshot: true })
    const res = await svc.computeForPlan('school-1', 'plan-1', AS_OF)
    expect(res.hasPlan).toBe(true)
    if (!res.hasPlan) return
    const g = res.pillars[0].goals[0]
    expect(g.baseline).toBe(0.05) // frozen value, NOT recomputed to current
    expect(g.current).toBeCloseTo(0.02, 6) // operating_margin = 20000/1000000
    expect(goalUpdate).not.toHaveBeenCalled() // no backfill when already frozen
  })

  it('null baseline is BACKFILLED from the current reading (persist-on-first-read)', async () => {
    const { svc, goalUpdate } = makeService({ baselineValue: null, hasSnapshot: true })
    const res = await svc.computeForPlan('school-1', 'plan-1', AS_OF)
    if (!res.hasPlan) throw new Error('expected a plan')
    const g = res.pillars[0].goals[0]
    expect(g.baseline).toBeCloseTo(0.02, 6) // frozen to the first-read current value
    expect(goalUpdate).toHaveBeenCalledTimes(1)
    const arg = goalUpdate.mock.calls[0][0] as { data: { baselineValue: Prisma.Decimal; baselineMetricPeriodId: string } }
    expect(Number(arg.data.baselineValue)).toBeCloseTo(0.02, 6)
    expect(arg.data.baselineMetricPeriodId).toBe('period-1')
  })

  it('no snapshot → NO fabrication: baseline stays null, goal reads no_data', async () => {
    const { svc, goalUpdate } = makeService({ baselineValue: null, hasSnapshot: false })
    const res = await svc.computeForPlan('school-1', 'plan-1', AS_OF)
    if (!res.hasPlan) throw new Error('expected a plan')
    const g = res.pillars[0].goals[0]
    expect(g.baseline).toBeNull()
    expect(g.current).toBeNull()
    expect(g.paceStatus).toBe('no_data')
    expect(goalUpdate).not.toHaveBeenCalled()
  })

  it('missing plan → { hasPlan:false } (never throws)', async () => {
    const prisma = { strategicPlan: { findFirst: async () => null } } as unknown as PrismaService
    const svc = new StrategyProgressService(prisma)
    await expect(svc.computeForPlan('school-1', 'nope')).resolves.toEqual({ hasPlan: false })
  })
})

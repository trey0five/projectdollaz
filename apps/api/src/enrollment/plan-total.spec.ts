import { describe, expect, it, vi } from 'vitest'
import { EnrollmentService } from './enrollment.service.js'
import { EnrollmentPlanService } from '../analytics/enrollment-plan.js'

// ─────────────────────────────────────────────────────────────────────────────
// THE OVERVIEW BAND READS THE SAME PLAN AS EVERY OTHER SURFACE.
//
// Live miss (Bayview demo, e7): St. Aurelia's FY27 driver budget was saved and
// the analytics tab showed its plan, but the overview band said "No plan set".
// EnrollmentService.planTotalFor was a local copy of the plan ladder that read
// `lines.assumptions` / `lines.enrollmentByGrade` — and the driver budget is
// stored at `lines.driverModel.assumptions.enrollmentByGrade` (budget.service
// saveDriverBudget). The fixture below is that stored shape, not a guess.
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL = 'school-A'
const PERIOD = 'fp-27'

const DRIVER_BUDGET = {
  lines: {
    revenue: { tuition: 2_000_000 },
    expense: {},
    driverModel: {
      assumptions: { enrollmentByGrade: { K: 20, '1': 22, '2': 24 } },
      computedAt: '2026-10-01T00:00:00.000Z',
      kpis: { netTuitionPerStudent: 9_000 },
    },
  },
}

function makeService(over: { budget?: unknown; op?: unknown; budgetThrows?: boolean } = {}) {
  const prisma = {
    student: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    enrollmentSource: { findUnique: vi.fn(async () => null) },
    enrollmentSnapshot: {
      findFirst: vi.fn(async () => ({
        id: 'snap-1',
        observedOn: new Date('2026-10-01'),
        totalEnrolled: 60,
        byGrade: { K: 18, '1': 20, '2': 22 },
        byDemographics: {},
        provider: 'manual',
        fiscalPeriodId: PERIOD,
      })),
    },
    periodOperationalData: { findUnique: vi.fn(async () => over.op ?? null) },
    periodBudget: {
      findUnique: vi.fn(async () => {
        if (over.budgetThrows) throw new Error('db down')
        return over.budget ?? null
      }),
    },
  }
  const periods = {
    resolveForImport: vi.fn(async () => ({ period: { id: PERIOD }, created: false })),
    resolveExistingForImport: vi.fn(async () => ({ id: PERIOD })),
  }
  const svc = new EnrollmentService(
    prisma as never,
    {} as never,
    { isConfigured: () => false } as never,
    periods as never,
    { write: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { svc, prisma }
}

describe('EnrollmentService.summary — the plan behind "Gap to plan"', () => {
  it('a driver-model budget IS a plan (lines.driverModel.assumptions.enrollmentByGrade)', async () => {
    const { svc } = makeService({ budget: DRIVER_BUDGET })
    const res = await svc.summary(SCHOOL, PERIOD)
    expect(res.vsPlan).toEqual({ planTotal: 66, gap: -6, gapPct: -6 / 66 })
  })

  it('agrees with the canonical resolver analytics and the briefing read', async () => {
    const { svc, prisma } = makeService({ budget: DRIVER_BUDGET })
    const res = await svc.summary(SCHOOL, PERIOD)
    const canonical = await new EnrollmentPlanService(prisma as never).resolve(SCHOOL, PERIOD)
    expect(res.vsPlan?.planTotal).toBe(canonical?.planTotal)
  })

  it('the driver budget wins over the plan form; the plan form still answers alone', async () => {
    const op = { plannedEnrollmentByGrade: { K: 30, '1': 30 }, enrollmentSupersededAt: null }
    const both = await makeService({ budget: DRIVER_BUDGET, op }).svc.summary(SCHOOL, PERIOD)
    expect(both.vsPlan?.planTotal).toBe(66)
    const formOnly = await makeService({ op }).svc.summary(SCHOOL, PERIOD)
    expect(formOnly.vsPlan?.planTotal).toBe(60)
  })

  it('no plan anywhere is "no plan" — vsPlan null', async () => {
    const res = await makeService().svc.summary(SCHOOL, PERIOD)
    expect(res.vsPlan).toBeNull()
  })

  it('a FAILED plan read is never shown as "No plan set"', async () => {
    await expect(makeService({ budgetThrows: true }).svc.summary(SCHOOL, PERIOD)).rejects.toThrow()
  })
})

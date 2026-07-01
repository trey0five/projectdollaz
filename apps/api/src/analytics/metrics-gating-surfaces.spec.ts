import { describe, expect, it } from 'vitest'
import { computeMetricsForPeriod } from '@finrep/analytics'
import { AnalyticsService } from './analytics.service.js'
import { BriefingService } from './briefing.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { PeriodsService } from '../periods/periods.service.js'
import type { OperationalService } from './operational.service.js'
import type { BillingService } from '../billing/billing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-SCOPED METRIC GATING — the 3 surfaces AGREE. Proves that a metric hidden
// from /metrics (AnalyticsService.computeMetricsResponse) is ALSO absent from the
// briefing STEP 1 (which consumes that same response). Framework-free: hand-mock
// every dep. A minimal ReportBundle + operational row light up the enrollment + hr
// metrics so the gate has something to hide.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'p1', label: 'FY 2026', periodEndDate: new Date('2026-06-30T00:00:00.000Z') }

// A minimal ReportBundle fromBundle can read (no SFP; enough for the operational
// Tier-2 + enrollment/hr metrics to be available).
function bundle(): unknown {
  const soa = {
    tuition: 700, dev: 0, studAct: 0, textbook: 0, other: 0,
    support: 0, intlRev: 0, investments: 0, interest: 0, totalRev: 1000,
    instructional: 900, facilities: 0, fixedOther: 0, intlExp: 0, bus: 0,
    food: 0, studActExp: 0, athletics: 0, admin: 0, restricted: 0,
    totalExp: 900, netChange: 100,
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

// current + prior operational so BOTH enrollment_change_yoy (needs prior) and
// student_teacher_ratio (needs teachingFte) are available and BANDED (risk/watch)
// → so, when licensed, they DO appear as briefing STEP-1 items.
const CUR_OP = { enrollment: 90, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: 100, teachingFte: 5, totalStaffFte: 8 }
const PRIOR_OP = { enrollment: 100, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: 100, teachingFte: 5, totalStaffFte: 8 }

function buildAnalytics(billing: BillingService): AnalyticsService {
  const prisma = {
    statementSnapshot: {
      findFirst: async () => ({ payload: bundle(), createdAt: new Date('2026-08-01T00:00:00.000Z') }),
    },
    fiscalPeriod: {
      // A nearest-prior period WITH a snapshot, so enrollment_change_yoy is available.
      findFirst: async () => ({ id: 'p0' }),
    },
  } as unknown as PrismaService
  const periods = { getOwnedPeriod: async () => PERIOD } as unknown as PeriodsService
  const operational = {
    operationalFor: async (_schoolId: string, periodId: string) =>
      periodId === PERIOD.id ? CUR_OP : PRIOR_OP,
  } as unknown as OperationalService
  return new AnalyticsService(prisma, periods, operational, billing)
}

function billingMock(entitled: string[], trial = false): BillingService {
  return {
    isEntitledForModule: async (_s: string, key: string) =>
      trial ? true : entitled.includes(key),
  } as unknown as BillingService
}

/** A BriefingService whose analytics is the REAL gated AnalyticsService, and every
 *  other dep null-ish so only STEP-1 metric items appear. */
function buildBriefing(analytics: AnalyticsService, billing: BillingService): BriefingService {
  const periods = { getOwnedPeriod: async () => PERIOD }
  const nullSvc = { evaluateForPeriod: async () => null }
  const recon = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }
  const policies = { list: async () => ({ policies: [] }) }
  const tasks = { listOpenForBriefing: async () => [] }
  const accreditation = { listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }) }
  const facilities = { listMaintenance: async () => ({ items: [], summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 } }) }
  const advancement = { listCampaigns: async () => ({ campaigns: [], summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 } }) }
  return new BriefingService(
    periods as never, analytics, nullSvc as never, checklist as never,
    recon as never, corrective as never, billing, policies as never,
    tasks as never, accreditation as never, facilities as never, advancement as never,
  )
}

describe('module-scoped gating — /metrics surface', () => {
  it('FINANCE-ONLY excludes enrollment + hr; keeps finance', async () => {
    const svc = buildAnalytics(billingMock([]))
    const res = await svc.computeMetricsResponse('s1', PERIOD.id)
    const keys = res.metrics.map((m) => m.key)
    expect(keys).toContain('operating_margin')
    expect(keys).not.toContain('enrollment_change_yoy')
    expect(keys).not.toContain('student_teacher_ratio')
  })

  it('TRIAL shows both enrollment + hr', async () => {
    const svc = buildAnalytics(billingMock([], true))
    const res = await svc.computeMetricsResponse('s1', PERIOD.id)
    const keys = res.metrics.map((m) => m.key)
    expect(keys).toContain('enrollment_change_yoy')
    expect(keys).toContain('student_teacher_ratio')
  })

  it('ENROLLMENT-licensed (no hr) shows enrollment, hides hr', async () => {
    const svc = buildAnalytics(billingMock(['enrollment']))
    const res = await svc.computeMetricsResponse('s1', PERIOD.id)
    const keys = res.metrics.map((m) => m.key)
    expect(keys).toContain('enrollment_change_yoy')
    expect(keys).not.toContain('student_teacher_ratio')
  })
})

describe('module-scoped gating — 3 surfaces AGREE (metrics ⇒ briefing)', () => {
  it('HR-licensed: student_teacher_ratio present in /metrics AND a briefing STEP-1 item', async () => {
    const billing = billingMock(['hr'])
    const analytics = buildAnalytics(billing)
    const metricKeys = (await analytics.computeMetricsResponse('s1', PERIOD.id)).metrics.map((m) => m.key)
    expect(metricKeys).toContain('student_teacher_ratio')

    const briefing = buildBriefing(analytics, billing)
    const res = await briefing.getBriefing('s1', PERIOD.id, 'owner')
    // student_teacher_ratio at 90/5 = 18 (> 16 risk) → a metric item is emitted.
    expect(res.items.some((i) => i.metricKey === 'student_teacher_ratio')).toBe(true)
    // enrollment_change_yoy is NOT licensed here → absent from BOTH surfaces.
    expect(metricKeys).not.toContain('enrollment_change_yoy')
    expect(res.items.some((i) => i.metricKey === 'enrollment_change_yoy')).toBe(false)
  })

  it('FINANCE-ONLY: neither enrollment nor hr appears in /metrics OR the briefing', async () => {
    const billing = billingMock([])
    const analytics = buildAnalytics(billing)
    const metricKeys = (await analytics.computeMetricsResponse('s1', PERIOD.id)).metrics.map((m) => m.key)
    const briefing = buildBriefing(analytics, billing)
    const res = await briefing.getBriefing('s1', PERIOD.id, 'owner')

    for (const gated of ['enrollment_change_yoy', 'student_teacher_ratio']) {
      expect(metricKeys).not.toContain(gated)
      expect(res.items.some((i) => i.metricKey === gated)).toBe(false)
    }
  })
})

// Sanity: the metrics are genuinely BANDED off-band for this fixture, so absence in
// the briefing is due to GATING, not a "not off-band" no-op. (Ungated compute shows
// both would surface.)
describe('gating fixture sanity', () => {
  it('ungated compute makes both enrollment + hr off-band (so gating is what hides them)', () => {
    const metrics = computeMetricsForPeriod({
      current: bundle() as never,
      prior: bundle() as never,
      currentOperational: CUR_OP,
      priorOperational: PRIOR_OP,
    })
    const enr = metrics.find((m) => m.key === 'enrollment_change_yoy')!
    const str = metrics.find((m) => m.key === 'student_teacher_ratio')!
    expect(enr.available).toBe(true)
    expect(['risk', 'watch']).toContain(enr.status) // 90/100 = -10% → risk
    expect(str.available).toBe(true)
    expect(['risk', 'watch']).toContain(str.status) // 90/5 = 18 → risk
  })
})

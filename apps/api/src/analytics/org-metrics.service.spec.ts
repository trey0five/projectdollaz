import { describe, expect, it } from 'vitest'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { computeMetricsRecord } from '@finrep/analytics'
import { OrgMetricsService } from './org-metrics.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { OperationalService } from './operational.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// OrgMetricsService unit spec — framework-free (no Nest boot, no real Prisma).
// We hand-build a tiny in-memory fixture (memberships + snapshots + operational
// rows) and assert: (a) the endpoint adds NO math — its metrics equal
// computeOrgMetrics over the same contributors, proved via the per-school path for
// org-of-one; (b) FY selection picks the latest snapshot per school; (c) isolation
// (no membership → NotFound, cross-org → Forbidden); (d) notReported handling.
// ─────────────────────────────────────────────────────────────────────────────

const USER: User = { id: 'u1' } as User

// A minimal ReportBundle the adapter (fromBundle) can read.
function bundle(over: {
  totalRev: number
  totalExp: number
  netChange: number
  tuition: number
  cash?: number | null
  naWithout?: number | null
}): unknown {
  const soa = {
    tuition: over.tuition, dev: 0, studAct: 0, textbook: 0, other: 0,
    support: 0, intlRev: 0, investments: 0, interest: 0,
    totalRev: over.totalRev,
    instructional: over.totalExp, facilities: 0, fixedOther: 0, intlExp: 0,
    bus: 0, food: 0, studActExp: 0, athletics: 0, admin: 0, restricted: 0,
    totalExp: over.totalExp, netChange: over.netChange,
  }
  const hasSFP = over.cash != null
  const sfp = hasSFP
    ? {
        cash: over.cash, restrictedCash: 0, tuitionRec: 0, prepaid: 0, totalCurrentA: 0,
        ppNet: 0, rouAsset: 0, restrictInvst: 0, totalAssets: 0, apAccrued: 0, leaseCurr: 0,
        studentClubs: 0, deferredIntl: 0, totalCurrL: 0, leaseNonCurr: 0, totalLiab: 0,
        naWithout: over.naWithout ?? 0, naWith: 0, totalNA: 0, totalLiabNA: 0,
      }
    : null
  return {
    soaResults: { cy: soa, py: null, audit: null, hasPY: false, hasAudit: false, cyNABegin: 0, cyNAEnd: 0, pyNABegin: 0, pyNAEnd: null, auditNABegin: 0, auditNAEnd: null },
    sfpResults: { cy: sfp, py: null, audit: null, hasPY: false, hasAudit: false },
    scf: null,
    netAssets: { cy: { begin: 0, change: 0, end: 0, withoutDonor: 0, withDonor: 0 }, py: null, audit: null, hasPY: false, hasAudit: false },
    unmapped: [],
    validation: { balanced: true, totalDebits: 0, totalCredits: 0, difference: 0, issues: [] },
    meta: { engineVersion: 't', mappingVersion: 't', standardChartVersion: 't' },
  }
}

function makeDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

interface Fixture {
  memberships: { userId: string; status: string; role: string; school: { id: string; name: string; organizationId: string } }[]
  organizations: { id: string }[]
  snapshots: { schoolId: string; fiscalPeriodId: string; createdAt: Date; payload: unknown; fiscalPeriod: { periodEndDate: Date } }[]
  operational: Record<string, { enrollment: number | null; enrollmentFte: number | null; studentsOnAid: number | null; financialAidTotal: number | null; teachingFte?: number | null; totalStaffFte?: number | null }>
}

function buildService(fx: Fixture) {
  const prisma = {
    membership: {
      findMany: async ({ where }: { where: { userId: string; status: string } }) =>
        fx.memberships.filter((m) => m.userId === where.userId && m.status === where.status),
    },
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        fx.organizations.find((o) => o.id === where.id) ?? null,
    },
    statementSnapshot: {
      findMany: async ({ where }: { where: { schoolId: { in: string[] } } }) =>
        fx.snapshots
          .filter((s) => where.schoolId.in.includes(s.schoolId))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      // For nearestPriorBundle: the latest snapshot of a resolved prior period.
      findFirst: async ({
        where,
      }: {
        where: { schoolId: string; fiscalPeriodId: string }
      }) =>
        fx.snapshots
          .filter((s) => s.schoolId === where.schoolId && s.fiscalPeriodId === where.fiscalPeriodId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    },
    // For nearestPriorBundle: newest prior fiscal period (by periodEndDate) that
    // has at least one snapshot, strictly before the chosen period end.
    fiscalPeriod: {
      findFirst: async ({
        where,
      }: {
        where: { schoolId: string; periodEndDate: { lt: Date } }
      }) => {
        const candidates = fx.snapshots
          .filter(
            (s) =>
              s.schoolId === where.schoolId &&
              s.fiscalPeriod.periodEndDate.getTime() < where.periodEndDate.lt.getTime(),
          )
          .sort(
            (a, b) => b.fiscalPeriod.periodEndDate.getTime() - a.fiscalPeriod.periodEndDate.getTime(),
          )
        const top = candidates[0]
        return top ? { id: top.fiscalPeriodId } : null
      },
    },
  } as unknown as PrismaService

  const operational = {
    operationalFor: async (schoolId: string, periodId: string) => {
      const row = fx.operational[`${schoolId}:${periodId}`]
      if (!row) return null
      // Normalize to the full PeriodOperational shape (staff FTEs default to null).
      return { teachingFte: null, totalStaffFte: null, ...row }
    },
  } as unknown as OperationalService

  // All-access billing (mirrors a trial): every module entitled, so NO metric is
  // gated and the rollup assertions below are unaffected by module gating. The
  // gating-specific behavior is covered in metric-gating.spec.ts.
  const billing = {
    isEntitledForModule: async () => true,
  } as unknown as import('../billing/billing.service.js').BillingService

  return new OrgMetricsService(prisma, operational, billing)
}

const baseSchool = (id: string, org: string) => ({ id, name: `School ${id}`, organizationId: org })

describe('OrgMetricsService isolation', () => {
  it('throws NotFound when the caller has no active membership', async () => {
    const svc = buildService({ memberships: [], organizations: [{ id: 'org1' }], snapshots: [], operational: {} })
    await expect(svc.getMetrics(USER, 'org1', null)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('throws Forbidden for an org the caller does not belong to', async () => {
    const svc = buildService({
      memberships: [{ userId: 'u1', status: 'active', role: 'owner', school: baseSchool('s1', 'org1') }],
      organizations: [{ id: 'org1' }, { id: 'org2' }],
      snapshots: [],
      operational: {},
    })
    await expect(svc.getMetrics(USER, 'org2', null)).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('OrgMetricsService rollup', () => {
  // Two in-org schools (s1, s2) + a cross-org school (s9) the caller can also see
  // in a DIFFERENT org — it must never be summed into org1.
  const fx: Fixture = {
    memberships: [
      { userId: 'u1', status: 'active', role: 'owner', school: baseSchool('s1', 'org1') },
      { userId: 'u1', status: 'active', role: 'accountant', school: baseSchool('s2', 'org1') },
      { userId: 'u1', status: 'active', role: 'owner', school: baseSchool('s9', 'org2') },
    ],
    organizations: [{ id: 'org1' }, { id: 'org2' }],
    snapshots: [
      // s1: an OLD FY25 snapshot + a NEWER FY26 snapshot — latest-for-FY must pick.
      { schoolId: 's1', fiscalPeriodId: 'p1-25', createdAt: makeDate('2025-08-01'), fiscalPeriod: { periodEndDate: makeDate('2025-06-30') }, payload: bundle({ totalRev: 1000, totalExp: 800, netChange: 200, tuition: 700, cash: 3000, naWithout: 2000 }) },
      { schoolId: 's1', fiscalPeriodId: 'p1-26', createdAt: makeDate('2026-08-01'), fiscalPeriod: { periodEndDate: makeDate('2026-06-30') }, payload: bundle({ totalRev: 1100, totalExp: 900, netChange: 200, tuition: 770, cash: 3300, naWithout: 2200 }) },
      // s2: only an FY26 snapshot.
      { schoolId: 's2', fiscalPeriodId: 'p2-26', createdAt: makeDate('2026-08-02'), fiscalPeriod: { periodEndDate: makeDate('2026-06-30') }, payload: bundle({ totalRev: 100, totalExp: 120, netChange: -20, tuition: 80, cash: 60, naWithout: 30 }) },
      // s9 (cross-org) — must be ignored for org1.
      { schoolId: 's9', fiscalPeriodId: 'p9-26', createdAt: makeDate('2026-08-03'), fiscalPeriod: { periodEndDate: makeDate('2026-06-30') }, payload: bundle({ totalRev: 99999, totalExp: 1, netChange: 99998, tuition: 99999, cash: 1, naWithout: 1 }) },
    ],
    operational: {
      's1:p1-26': { enrollment: 100, enrollmentFte: null, studentsOnAid: 40, financialAidTotal: 90 },
      's2:p2-26': { enrollment: 20, enrollmentFte: null, studentsOnAid: 15, financialAidTotal: 30 },
    },
  }

  it('FY filter picks the latest snapshot per school + excludes cross-org schools', async () => {
    const svc = buildService(fx)
    const res = await svc.getMetrics(USER, 'org1', '2025-07')
    expect(res.reportedCount).toBe(2)
    expect(res.schoolCount).toBe(2)
    expect(res.contributingSchools.map((c) => c.schoolId).sort()).toEqual(['s1', 's2'])
    // Org operating_margin = Σnet/Σrev over the FY26 snapshots (s1 200, s2 -20)
    // / (1100 + 100) = 180/1200. Cross-org s9 (which would skew it) is excluded.
    const om = res.metrics.find((m) => m.key === 'operating_margin')!
    expect(om.value).toBeCloseTo(180 / 1200, 12)
    expect(om.scope).toBe('org')
  })

  it('the endpoint adds NO math: org-of-one === the per-school compute path', async () => {
    // Restrict the fixture to a single school so the org rollup collapses onto the
    // per-school path; assert every metric value/availability/status matches.
    const single: Fixture = {
      ...fx,
      memberships: [{ userId: 'u1', status: 'active', role: 'owner', school: baseSchool('s1', 'org1') }],
    }
    const svc = buildService(single)
    const res = await svc.getMetrics(USER, 'org1', '2025-07')

    const perSchool = computeMetricsRecord({
      current: fx.snapshots.find((s) => s.fiscalPeriodId === 'p1-26')!.payload as never,
      currentOperational: { teachingFte: null, totalStaffFte: null, ...fx.operational['s1:p1-26'] },
    })
    for (const m of res.metrics) {
      expect(m.value).toBe(perSchool[m.key].value)
      expect(m.available).toBe(perSchool[m.key].available)
      expect(m.status).toBe(perSchool[m.key].status)
    }
  })

  it('surfaces notReported schools (no FY snapshot) without zero-filling sums', async () => {
    const svc = buildService(fx)
    // FY that only s1 has a snapshot for is none here; use an FY with no snapshots.
    const res = await svc.getMetrics(USER, 'org1', '2030-07')
    expect(res.reportedCount).toBe(0)
    expect(res.notReported.map((n) => n.schoolId).sort()).toEqual(['s1', 's2'])
    // No reporters → ratio metrics unavailable (totalRev 0 guard), never fabricated.
    const om = res.metrics.find((m) => m.key === 'operating_margin')!
    expect(om.available).toBe(false)
  })

  it('marks hasSFP / hasOperational per contributor', async () => {
    const svc = buildService(fx)
    const res = await svc.getMetrics(USER, 'org1', '2025-07')
    const s1 = res.contributingSchools.find((c) => c.schoolId === 's1')!
    expect(s1.hasSFP).toBe(true)
    expect(s1.hasOperational).toBe(true)
  })

  it('resolves each school nearest-prior snapshot → org PoP delta populated', async () => {
    // FY '2025-07' (Jul-2025→Jun-2026): s1 chosen = p1-26 (ends 2026-06-30, rev
    // 1100), whose nearest prior is p1-25 (ends 2025-06-30, rev 1000). s2 chosen =
    // p2-26 (rev 100) with NO prior (its only snapshot). So the org prior sums over
    // s1 alone → operating_margin gets a non-null delta.
    const svc = buildService(fx)
    const res = await svc.getMetrics(USER, 'org1', '2025-07')
    expect(res.reportedCount).toBe(2)
    const om = res.metrics.find((m) => m.key === 'operating_margin')!
    // cur: Σnet=(200 + −20)=180, Σrev=(1100+100)=1200 → 180/1200.
    // prior: s1 only → 200/1000. delta = 180/1200 − 200/1000.
    expect(om.value).toBeCloseTo(180 / 1200, 12)
    expect(om.periodOverPeriodDelta).toBeCloseTo(180 / 1200 - 200 / 1000, 12)
  })

  it('no school has a prior snapshot → deltas stay null (back-compat)', async () => {
    // FY '2024-07' (Jul-2024→Jun-2025): only s1's OLDEST snapshot p1-25 (ends
    // 2025-06-30) matches; it has NO prior period. s2 has no snapshot for that FY,
    // so it does not report. No priors anywhere → every delta null.
    const svc = buildService(fx)
    const res = await svc.getMetrics(USER, 'org1', '2024-07')
    expect(res.reportedCount).toBe(1)
    for (const m of res.metrics) {
      expect(m.periodOverPeriodDelta).toBeNull()
    }
  })
})

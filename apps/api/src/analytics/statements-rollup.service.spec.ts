import { describe, expect, it } from 'vitest'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { StatementsRollupService } from './statements-rollup.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// StatementsRollupService unit spec — framework-free (no Nest boot, no real
// Prisma). We hand-build a tiny in-memory fixture (memberships + snapshots) and
// assert the CONSOLIDATED SCF + Changes-in-Net-Assets folds obey the same
// discipline as the existing SOA/SFP fold:
//   (a) consolidated SCF/netAssets = exact field-by-field Σ of REPORTING schools;
//   (b) a school with scf===null is EXCLUDED (scfReportedCount excludes it, but the
//       school is still SOA/reportedCount-counted) and never poisons the sum;
//   (c) a school whose payload lacks netAssets is EXCLUDED (naReported:false);
//   (d) zero reporters → {}/{} accumulators + all counts 0, no throw;
//   (e) NO REGRESSION — consolidated.soa/sfp + per-school soa/sfp byte-identical;
//   (f) isolation — no membership → NotFound, cross-org → Forbidden.
// This lives under src/analytics/ but is an API Nest-service spec run by the api
// vitest project (NOT the @finrep/analytics suite), so that suite's count is
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const USER: User = { id: 'u1' } as User

interface BundleOver {
  totalRev: number
  totalExp: number
  netChange: number
  // SFP present unless withSfp===false
  withSfp?: boolean
  totalAssets?: number
  totalLiab?: number
  totalNA?: number
  // SCF present unless withScf===false (bundle.scf===null)
  withScf?: boolean
  operatingCash?: number
  netCashChange?: number
  cashEnd?: number
  // NetAssets present unless withNa===false (payload omits netAssets entirely)
  withNa?: boolean
  naBegin?: number
  naChange?: number
  naEnd?: number
  naWithoutDonor?: number
  naWithDonor?: number
}

// Build a payload the service reads as a ReportBundle. When withScf/withNa are
// false we deliberately produce a payload that has scf===null / no netAssets key,
// mirroring older or TB-only snapshots.
function bundle(o: BundleOver): unknown {
  const soa = {
    tuition: o.totalRev, dev: 0, studAct: 0, textbook: 0, other: 0,
    support: 0, intlRev: 0, investments: 0, interest: 0,
    totalRev: o.totalRev,
    instructional: o.totalExp, facilities: 0, fixedOther: 0, intlExp: 0,
    bus: 0, food: 0, studActExp: 0, athletics: 0, admin: 0, restricted: 0,
    totalExp: o.totalExp, netChange: o.netChange,
  }
  const hasSfp = o.withSfp !== false
  const sfp = hasSfp
    ? {
        cash: 0, restrictedCash: 0, tuitionRec: 0, prepaid: 0, totalCurrentA: 0,
        ppNet: 0, rouAsset: 0, restrictInvst: 0, totalAssets: o.totalAssets ?? 0,
        apAccrued: 0, leaseCurr: 0, studentClubs: 0, deferredIntl: 0, totalCurrL: 0,
        leaseNonCurr: 0, totalLiab: o.totalLiab ?? 0,
        naWithout: 0, naWith: 0, totalNA: o.totalNA ?? 0, totalLiabNA: 0,
      }
    : null
  const hasScf = o.withScf !== false
  const scf = hasScf
    ? {
        netChange: o.netChange, depr: 0, arAdj: 0, prepaidAdj: 0, apAdj: 0,
        deferredAdj: 0, clubsAdj: 0, operatingCash: o.operatingCash ?? 0,
        ppePurchases: 0, investmentsCash: 0, investingCash: 0, leasePayments: 0,
        financingCash: 0, netCashChange: o.netCashChange ?? 0, cashBegin: 0,
        cashEnd: o.cashEnd ?? 0, cashUnrestricted: 0, cashRestricted: 0,
      }
    : null
  const payload: Record<string, unknown> = {
    soaResults: { cy: soa, py: null, audit: null, hasPY: false, hasAudit: false, cyNABegin: 0, cyNAEnd: 0, pyNABegin: 0, pyNAEnd: null, auditNABegin: 0, auditNAEnd: null },
    sfpResults: { cy: sfp, py: null, audit: null, hasPY: false, hasAudit: false },
    scf,
    unmapped: [],
    validation: { balanced: true, totalDebits: 0, totalCredits: 0, difference: 0, issues: [] },
    meta: { engineVersion: 't', mappingVersion: 't', standardChartVersion: 't' },
  }
  if (o.withNa !== false) {
    payload.netAssets = {
      cy: {
        begin: o.naBegin ?? 0, change: o.naChange ?? 0, end: o.naEnd ?? 0,
        withoutDonor: o.naWithoutDonor ?? 0, withDonor: o.naWithDonor ?? 0,
      },
      py: null, audit: null, hasPY: false, hasAudit: false,
    }
  }
  // withNa===false → the netAssets key is simply absent (legacy payload).
  return payload
}

function makeDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

interface Fixture {
  memberships: { userId: string; status: string; school: { id: string; name: string; organizationId: string } }[]
  organizations: { id: string }[]
  snapshots: { schoolId: string; createdAt: Date; payload: unknown; fiscalPeriod: { periodEndDate: Date } }[]
}

function buildService(fx: Fixture): StatementsRollupService {
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
    },
  } as unknown as PrismaService
  return new StatementsRollupService(prisma)
}

// A standard two-school org. School A: SOA + SFP + SCF + NetAssets (fully reporting).
// School B: SOA + SFP + NetAssets, but scf===null (TB-only, no cash-flow statement).
function twoSchoolOrg(): Fixture {
  return {
    memberships: [
      { userId: 'u1', status: 'active', school: { id: 'sA', name: 'School A', organizationId: 'org1' } },
      { userId: 'u1', status: 'active', school: { id: 'sB', name: 'School B', organizationId: 'org1' } },
    ],
    organizations: [{ id: 'org1' }],
    snapshots: [
      {
        schoolId: 'sA',
        createdAt: makeDate('2026-01-10'),
        fiscalPeriod: { periodEndDate: makeDate('2026-06-30') },
        payload: bundle({
          totalRev: 1000, totalExp: 600, netChange: 400,
          totalAssets: 5000, totalLiab: 1200, totalNA: 3800,
          operatingCash: 350, netCashChange: 200, cashEnd: 900,
          naBegin: 3400, naChange: 400, naEnd: 3800, naWithoutDonor: 3000, naWithDonor: 800,
        }),
      },
      {
        schoolId: 'sB',
        createdAt: makeDate('2026-01-10'),
        fiscalPeriod: { periodEndDate: makeDate('2026-06-30') },
        payload: bundle({
          totalRev: 500, totalExp: 300, netChange: 200,
          totalAssets: 2000, totalLiab: 800, totalNA: 1200,
          withScf: false, // no cash-flow statement
          naBegin: 1000, naChange: 200, naEnd: 1200, naWithoutDonor: 900, naWithDonor: 300,
        }),
      },
    ],
  }
}

describe('StatementsRollupService — SCF + net-assets consolidation', () => {
  it('folds SCF field-by-field over reporting schools; scf===null school EXCLUDED but still SOA-counted', async () => {
    const svc = buildService(twoSchoolOrg())
    const out = await svc.getRollup(USER, 'org1', '2025-07')

    // Both schools SOA-reported.
    expect(out.consolidated.reportedCount).toBe(2)
    // Only School A has a cash-flow statement.
    expect(out.consolidated.scfReportedCount).toBe(1)
    // Consolidated SCF == School A only (School B's null scf never poisoned it).
    expect(out.consolidated.scf.operatingCash).toBe(350)
    expect(out.consolidated.scf.netCashChange).toBe(200)
    expect(out.consolidated.scf.cashEnd).toBe(900)
    expect(out.consolidated.scf.netChange).toBe(400)

    const a = out.schools.find((s) => s.schoolId === 'sA')!
    const b = out.schools.find((s) => s.schoolId === 'sB')!
    expect(a.scfReported).toBe(true)
    expect(a.scf).toEqual({ operatingCash: 350, netCashChange: 200, cashEnd: 900 })
    expect(b.scfReported).toBe(false)
    expect(b.scf).toBeNull()
    // B is still SOA-reported.
    expect(b.reported).toBe(true)
  })

  it('folds net-assets CY column (begin/change/end/withoutDonor/withDonor) across both schools', async () => {
    const svc = buildService(twoSchoolOrg())
    const out = await svc.getRollup(USER, 'org1', '2025-07')

    expect(out.consolidated.naReportedCount).toBe(2)
    // Σ begin, Σ change, Σ end — extensive, so the roll-forward identity holds.
    expect(out.consolidated.netAssets.begin).toBe(4400)
    expect(out.consolidated.netAssets.change).toBe(600)
    expect(out.consolidated.netAssets.end).toBe(5000)
    expect(out.consolidated.netAssets.begin + out.consolidated.netAssets.change).toBe(
      out.consolidated.netAssets.end,
    )
    expect(out.consolidated.netAssets.withoutDonor).toBe(3900)
    expect(out.consolidated.netAssets.withDonor).toBe(1100)

    const a = out.schools.find((s) => s.schoolId === 'sA')!
    expect(a.naReported).toBe(true)
    expect(a.netAssets).toEqual({ begin: 3400, change: 400, end: 3800 })
  })

  it('EXCLUDES a school whose payload lacks netAssets (naReported:false, sum unpoisoned, no throw)', async () => {
    const fx = twoSchoolOrg()
    // Rewrite School B to omit the netAssets block entirely (legacy payload).
    fx.snapshots[1].payload = bundle({
      totalRev: 500, totalExp: 300, netChange: 200,
      totalAssets: 2000, totalLiab: 800, totalNA: 1200,
      withScf: false, withNa: false,
    })
    const svc = buildService(fx)
    const out = await svc.getRollup(USER, 'org1', '2025-07')

    expect(out.consolidated.naReportedCount).toBe(1)
    // Only School A contributes.
    expect(out.consolidated.netAssets.begin).toBe(3400)
    expect(out.consolidated.netAssets.change).toBe(400)
    expect(out.consolidated.netAssets.end).toBe(3800)
    const b = out.schools.find((s) => s.schoolId === 'sB')!
    expect(b.naReported).toBe(false)
    expect(b.netAssets).toBeNull()
  })

  it('zero reporters → empty-but-valid consolidation ({}/{} + all counts 0), never throws', async () => {
    const fx: Fixture = {
      memberships: [
        { userId: 'u1', status: 'active', school: { id: 'sA', name: 'School A', organizationId: 'org1' } },
      ],
      organizations: [{ id: 'org1' }],
      snapshots: [], // nobody reported
    }
    const svc = buildService(fx)
    const out = await svc.getRollup(USER, 'org1', null)

    expect(out.consolidated.reportedCount).toBe(0)
    expect(out.consolidated.scfReportedCount).toBe(0)
    expect(out.consolidated.naReportedCount).toBe(0)
    expect(out.consolidated.sfpReportedCount).toBe(0)
    expect(out.consolidated.scf).toEqual({})
    expect(out.consolidated.netAssets).toEqual({})
    expect(out.consolidated.soa).toEqual({})
    expect(out.consolidated.sfp).toEqual({})
    expect(out.schools).toHaveLength(1)
    expect(out.schools[0].reported).toBe(false)
    expect(out.notReported).toHaveLength(1)
  })

  it('NO REGRESSION — consolidated.soa/sfp + per-school soa/sfp unchanged by the additive fold', async () => {
    const svc = buildService(twoSchoolOrg())
    const out = await svc.getRollup(USER, 'org1', '2025-07')

    // Consolidated SOA is the exact Σ of both schools (additive fold untouched).
    expect(out.consolidated.soa.totalRev).toBe(1500)
    expect(out.consolidated.soa.totalExp).toBe(900)
    expect(out.consolidated.soa.netChange).toBe(600)
    // Consolidated SFP is the exact Σ of both schools.
    expect(out.consolidated.sfp.totalAssets).toBe(7000)
    expect(out.consolidated.sfp.totalLiab).toBe(2000)
    expect(out.consolidated.sfp.totalNA).toBe(5000)
    expect(out.consolidated.sfpReportedCount).toBe(2)

    const a = out.schools.find((s) => s.schoolId === 'sA')!
    expect(a.soa).toEqual({ totalRev: 1000, totalExp: 600, netChange: 400 })
    expect(a.sfp).toEqual({ totalAssets: 5000, totalLiab: 1200, totalNA: 3800 })
    expect(a.sfpReported).toBe(true)
  })

  it('isolation — no membership → NotFound, cross-org → Forbidden', async () => {
    const noMember = buildService({ memberships: [], organizations: [{ id: 'org1' }], snapshots: [] })
    await expect(noMember.getRollup(USER, 'org1', null)).rejects.toBeInstanceOf(NotFoundException)

    const otherOrg = buildService({
      memberships: [
        { userId: 'u1', status: 'active', school: { id: 'sX', name: 'X', organizationId: 'orgOTHER' } },
      ],
      organizations: [{ id: 'org1' }, { id: 'orgOTHER' }],
      snapshots: [],
    })
    await expect(otherOrg.getRollup(USER, 'org1', null)).rejects.toBeInstanceOf(ForbiddenException)
  })
})

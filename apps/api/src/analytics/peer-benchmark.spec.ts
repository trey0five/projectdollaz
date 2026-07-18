import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { formatMetricValue, resolveDisplayUnit, type MetricKey } from '@finrep/analytics'
import { OrgMetricsService } from './org-metrics.service.js'
import type { CompareSchool, CompareMetricsResponse } from './org-metrics.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { OperationalService } from './operational.service.js'
import type { BillingService } from '../billing/billing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// getPeerBenchmark shaping spec — getMetricsBySchool is STUBBED so we test the
// peer-group + stats + insight shaping in isolation (no DB, no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

const USER: User = { id: 'u1' } as User

function metric(key: MetricKey, unit: 'currency' | 'days' | 'percent', value: number | null, dir: 'higher' | 'lower') {
  const displayUnit = resolveDisplayUnit(key, unit)
  return {
    key,
    label: key.replace(/_/g, ' '),
    unit,
    value,
    formatted: formatMetricValue(value, displayUnit),
    status: 'good' as const,
    bands: undefined,
    available: value != null,
    periodOverPeriodDelta: null,
    formattedDelta: null,
    goodDirection: dir,
  }
}

function school(
  id: string,
  name: string,
  over: {
    enrollment?: number | null
    county?: string | null
    schoolType?: string | null
    gradeLow?: string | null
    gradeHigh?: string | null
    daysCash?: number | null
    complete?: boolean
  } = {},
): CompareSchool {
  const enrollment = over.enrollment ?? null
  const sizeBand =
    enrollment == null ? null : enrollment < 200 ? 'xs' : enrollment < 500 ? 'sm' : enrollment < 1000 ? 'md' : 'lg'
  const sizeBandLabel =
    sizeBand === 'sm' ? '200–500' : sizeBand === 'md' ? '500–1,000' : sizeBand === 'xs' ? '< 200' : sizeBand === 'lg' ? '1,000+' : null
  return {
    schoolId: id,
    schoolName: name,
    periodEndDate: '2025-06-30',
    hasSFP: true,
    hasOperational: true,
    profileComplete: over.complete ?? true,
    profile: {
      county: over.county ?? 'Alpha',
      district: 'D1',
      schoolType: over.schoolType ?? 'K-8',
      gradeLow: over.gradeLow ?? 'PK3',
      gradeHigh: over.gradeHigh ?? '8',
      enrollment,
      sizeBand: sizeBand as never,
      sizeBandLabel,
    },
    metrics: {
      days_cash_on_hand: metric('days_cash_on_hand', 'days', over.daysCash ?? 50, 'higher'),
    },
  }
}

function buildService(): OrgMetricsService {
  const prisma = {
    school: { findUnique: async () => null },
  } as unknown as PrismaService
  const operational = {} as unknown as OperationalService
  const billing = {} as unknown as BillingService
  return new OrgMetricsService(prisma, operational, billing)
}

function stub(svc: OrgMetricsService, resp: Partial<CompareMetricsResponse>): void {
  vi.spyOn(svc, 'getMetricsBySchool').mockResolvedValue({
    orgId: 'org1',
    fiscalYearStart: '2024-07',
    generatedAt: new Date().toISOString(),
    schools: [],
    notReported: [],
    metricOrder: [],
    ...resp,
  } as CompareMetricsResponse)
}

describe('getPeerBenchmark', () => {
  it('shapes focus / group / peers / stats / insights for a rich group', async () => {
    const svc = buildService()
    const focus = school('f', 'Focus', { enrollment: 300, daysCash: 80 })
    const peers = [
      school('a', 'Alpha', { enrollment: 320, daysCash: 40 }),
      school('b', 'Bravo', { enrollment: 280, daysCash: 60 }),
      school('c', 'Charlie', { enrollment: 350, daysCash: 20 }),
    ]
    stub(svc, { schools: [focus, ...peers] })

    const r = await svc.getPeerBenchmark(USER, 'org1', 'f', { dims: ['size', 'type'] })

    expect(r.focus.schoolName).toBe('Focus')
    expect(r.group.matchTier).toBe('exact')
    expect(r.group.peerCount).toBe(3)
    expect(r.peers.map((p) => p.schoolId).sort()).toEqual(['a', 'b', 'c'])
    // Each peer carries match reasons.
    expect(r.peers[0].matchReasons).toContain('same size band')
    // days_cash: focus 80 is best of {80,40,60,20} → rank 1, top quartile.
    expect(r.stats.days_cash_on_hand.rank).toBe(1)
    expect(r.stats.days_cash_on_hand.focusFormatted).toBe('80')
    // synthetic enrollment stat present.
    expect(r.stats.enrollment).toBeDefined()
    expect(r.insights.some((s) => s.includes('largest'))).toBe(true)
    expect(r.emptyState).toBeNull()
  })

  it('403s a school outside the caller in-org set', async () => {
    const svc = buildService()
    stub(svc, { schools: [school('f', 'Focus')], notReported: [] })
    await expect(svc.getPeerBenchmark(USER, 'org1', 'ghost', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('single-school org → matchTier none + emptyState single_school', async () => {
    const svc = buildService()
    stub(svc, { schools: [school('f', 'Focus')], notReported: [] })
    const r = await svc.getPeerBenchmark(USER, 'org1', 'f', {})
    expect(r.group.matchTier).toBe('none')
    expect(r.peers).toEqual([])
    expect(r.stats).toEqual({})
    expect(r.emptyState?.reason).toBe('single_school')
  })

  it('all peers not-reported this FY → emptyState no_peers', async () => {
    const svc = buildService()
    stub(svc, {
      schools: [school('f', 'Focus')],
      notReported: [{ schoolId: 'x', name: 'Xray' }, { schoolId: 'y', name: 'Yankee' }],
    })
    const r = await svc.getPeerBenchmark(USER, 'org1', 'f', {})
    expect(r.group.matchTier).toBe('none')
    expect(r.emptyState?.reason).toBe('no_peers')
  })

  it('relaxes dims to reach minPeers and reports relaxedDims', async () => {
    const svc = buildService()
    const focus = school('f', 'Focus', { enrollment: 300, county: 'Alpha' })
    // Peers share size+type but DIFFERENT county → county must be relaxed.
    const peers = [
      school('a', 'A', { enrollment: 320, county: 'Beta' }),
      school('b', 'B', { enrollment: 280, county: 'Gamma' }),
      school('c', 'C', { enrollment: 460, county: 'Delta' }),
    ]
    stub(svc, { schools: [focus, ...peers] })
    const r = await svc.getPeerBenchmark(USER, 'org1', 'f', { dims: ['size', 'county'], minPeers: 3 })
    expect(r.group.matchTier).toBe('relaxed')
    expect(r.group.relaxedDims).toContain('county')
    expect(r.group.peerCount).toBe(3)
  })
})

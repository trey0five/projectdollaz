import { describe, expect, it } from 'vitest'
import { summarizeRatings } from '@finrep/compliance'
import { BriefingService } from './briefing.service.js'
import type { StandardPublic, StandardListResponse } from '../accreditation/accreditation.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Accreditation v1 — the 'accreditation' briefing STEP. Verifies the module
// gate, the coverage-gap / review-approaching aggregate items, deterministic
// ranking, viewer-KEPT, and fail-soft — all WITHOUT booting Nest or Prisma.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2025' }
const CLEAN_METRICS = { metrics: [] as unknown[] }

function standard(over: Partial<StandardPublic>): StandardPublic {
  const rating = over.rating ?? 'not_started'
  return {
    id: over.id ?? 's1',
    code: over.code ?? 'MSA-1',
    title: over.title ?? 'Test Standard',
    category: over.category ?? null,
    parentId: over.parentId ?? null,
    rating,
    reviewDate: over.reviewDate ?? null,
    owner: over.owner ?? null,
    notes: over.notes ?? null,
    evidenceCount: over.evidenceCount ?? 0,
    coverage: over.coverage ?? 'no-evidence',
    reviewStatus: over.reviewStatus ?? 'unknown',
    daysUntilReview: over.daysUntilReview ?? null,
    depth: over.depth ?? 0,
    isLeaf: over.isLeaf ?? true,
    leafSummary: over.leafSummary ?? summarizeRatings([{ rating }]),
    createdAt: over.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2025-01-01T00:00:00.000Z',
  }
}

function register(standards: StandardPublic[]): StandardListResponse {
  const total = standards.length
  const withEvidence = standards.filter((s) => s.coverage === 'covered').length
  const gaps = total - withEvidence
  const pctCovered = total === 0 ? 0 : Math.round((withEvidence / total) * 100)
  const ratingSummary = summarizeRatings(
    standards.filter((s) => s.isLeaf).map((s) => ({ rating: s.rating })),
  )
  return { standards, summary: { total, withEvidence, gaps, pctCovered }, ratingSummary }
}

/** Build a BriefingService. `over` swaps in the accreditation gate + register. The
 *  governance gate stays false (module key aware) so no governance item leaks. */
function makeService(over: {
  accreditationLicensed?: boolean | (() => Promise<boolean>)
  standards?: StandardPublic[] | (() => Promise<StandardListResponse>)
  metrics?: unknown
}) {
  const billing = {
    isEntitledForModule: async (_schoolId: string, moduleKey: string) => {
      if (moduleKey === 'accreditation') {
        return typeof over.accreditationLicensed === 'function'
          ? over.accreditationLicensed()
          : (over.accreditationLicensed ?? false)
      }
      return false // governance not licensed → isolates the assertion
    },
  }
  const accreditationSvc = {
    listStandards: async () => {
      if (typeof over.standards === 'function') return over.standards()
      return register(over.standards ?? [])
    },
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const analytics = { computeMetricsResponse: async () => over.metrics ?? CLEAN_METRICS }
  const compliance = { evaluateForPeriod: async () => null }
  const reconciliation = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }
  const policiesSvc = { list: async () => ({ policies: [] }) }
  const meetingsSvc = { listMeetings: async () => ({ meetings: [], summary: { total: 0, upcomingCount: 0, agendaMissingSoonCount: 0, minutesPendingCount: 0, minutesOverdueCount: 0, nextMeetingAt: null, earliestMinutesPendingHeldAt: null } }) }
  const tasks = { listOpenForBriefing: async () => [] }
  // Facilities not licensed here (billing returns false for non-accreditation) → no
  // facilities item; the service returns an empty register if ever called.
  const facilities = {
    listMaintenance: async () => ({
      items: [],
      summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 },
    }),
  }

  return new BriefingService(
    periods as never,
    analytics as never,
    compliance as never,
    checklist as never,
    reconciliation as never,
    corrective as never,
    billing as never,
    policiesSvc as never,
    meetingsSvc as never,
    tasks as never,
    accreditationSvc as never,
    facilities as never,
    {
      listCampaigns: async () => ({
        campaigns: [],
        summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 },
      }),
    } as never,
    { getActivePlanComputed: async () => ({ hasPlan: false }) } as never, // strategy
    { arApAgingSnapshot: { findFirst: async () => null } } as never, // prisma (LAST)
  )
}

describe('briefing — accreditation STEP', () => {
  it('MODULE GATE: not licensed → ZERO accreditation items', async () => {
    const svc = makeService({
      accreditationLicensed: false,
      standards: [standard({ id: 's1', coverage: 'no-evidence' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'accreditation')).toHaveLength(0)
  })

  it('licensed + gaps, no approaching review → one WARN coverage-gap to /accreditation', async () => {
    const svc = makeService({
      accreditationLicensed: true,
      standards: [
        standard({ id: 's1', coverage: 'no-evidence' }),
        standard({ id: 's2', coverage: 'covered', evidenceCount: 2 }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const acc = res.items.find((i) => i.id === 'accreditation:coverage-gap')
    expect(acc).toBeDefined()
    expect(acc!.severity).toBe('warn')
    expect(acc!.source).toBe('accreditation')
    expect(acc!.link).toBe('/accreditation')
    expect(acc!.title).toBe('1 of 2 standards still need evidence')
  })

  it('gaps AND an approaching review → coverage-gap escalates to CRITICAL, carries earliest reviewDate', async () => {
    const svc = makeService({
      accreditationLicensed: true,
      standards: [
        standard({ id: 's1', coverage: 'no-evidence', reviewStatus: 'due-soon', reviewDate: '2026-09-01' }),
        standard({ id: 's2', coverage: 'no-evidence', reviewStatus: 'overdue', reviewDate: '2026-06-01' }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const acc = res.items.find((i) => i.id === 'accreditation:coverage-gap')
    expect(acc!.severity).toBe('critical')
    expect(acc!.dueDate).toBe('2026-06-01')
    // review-approaching is NOT emitted separately when gaps > 0 (no double-count)
    expect(res.items.some((i) => i.id === 'accreditation:review-approaching')).toBe(false)
  })

  it('no gaps but a review approaching → info review-approaching item', async () => {
    const svc = makeService({
      accreditationLicensed: true,
      standards: [
        standard({ id: 's1', coverage: 'covered', evidenceCount: 1, reviewStatus: 'due-soon', reviewDate: '2026-10-01' }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const acc = res.items.find((i) => i.id === 'accreditation:review-approaching')
    expect(acc).toBeDefined()
    expect(acc!.severity).toBe('info')
    expect(res.items.some((i) => i.id === 'accreditation:coverage-gap')).toBe(false)
  })

  it('total===0 → NO accreditation item (honest non-signal)', async () => {
    const svc = makeService({ accreditationLicensed: true, standards: [] })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'accreditation')).toHaveLength(0)
  })

  it('fully covered, no approaching review → emits nothing', async () => {
    const svc = makeService({
      accreditationLicensed: true,
      standards: [standard({ id: 's1', coverage: 'covered', evidenceCount: 3, reviewStatus: 'current' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'accreditation')).toHaveLength(0)
  })

  it('FAIL-SOFT: listStandards throws → briefing still 200s with no accreditation item', async () => {
    const svc = makeService({
      accreditationLicensed: true,
      standards: () => Promise.reject(new Error('db down')),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'accreditation')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('FAIL-CLOSED: isEntitledForModule throws → treated as not-licensed, no 500', async () => {
    const svc = makeService({
      accreditationLicensed: () => Promise.reject(new Error('billing down')),
      standards: [standard({ id: 's1', coverage: 'no-evidence' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'accreditation')).toHaveLength(0)
  })

  it('finance-only briefing INTACT: an off-band metric still surfaces when accreditation is unlicensed', async () => {
    const metrics = {
      metrics: [
        {
          available: true,
          status: 'risk',
          key: 'operating_margin',
          label: 'Operating Margin',
          value: -0.02,
          unit: 'percent',
          bands: { good: 0.03, risk: 0, goodDirection: 'higher' },
        },
      ],
    }
    const svc = makeService({ accreditationLicensed: false, standards: [], metrics })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.some((i) => i.id === 'metric:operating_margin')).toBe(true)
    expect(res.items.filter((i) => i.source === 'accreditation')).toHaveLength(0)
  })

  it('VIEWER (board) lens KEEPS the accreditation coverage-gap item', async () => {
    const svc = makeService({
      accreditationLicensed: true,
      standards: [standard({ id: 's1', coverage: 'no-evidence' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.some((i) => i.id === 'accreditation:coverage-gap')).toBe(true)
  })
})

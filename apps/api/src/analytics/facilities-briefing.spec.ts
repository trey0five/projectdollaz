import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type {
  MaintenanceItemPublic,
  MaintenanceListResponse,
} from '../facilities/facilities.service.js'
import { summarizeBacklog } from '@finrep/compliance'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Facilities v1 — the 'facilities' briefing STEP. Verifies the module gate,
// the deferred-maintenance backlog aggregate item, critical escalation,
// deterministic ranking, viewer-KEPT, and fail-soft — all WITHOUT booting Nest or
// Prisma (every injected service is a hand-mock).
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2025' }
const CLEAN_METRICS = { metrics: [] as unknown[] }

function mItem(over: Partial<MaintenanceItemPublic>): MaintenanceItemPublic {
  return {
    id: over.id ?? 'm1',
    title: over.title ?? 'Boiler repair',
    location: over.location ?? null,
    category: over.category ?? null,
    priority: over.priority ?? 'medium',
    status: over.status ?? 'open',
    estimatedCost: over.estimatedCost ?? null,
    actualCost: over.actualCost ?? null,
    variance: over.variance ?? null,
    vendor: over.vendor ?? null,
    targetDate: over.targetDate ?? null,
    recurrence: over.recurrence ?? 'none',
    recurrenceUntil: over.recurrenceUntil ?? null,
    seriesId: over.seriesId ?? null,
    notes: over.notes ?? null,
    createdByUserId: over.createdByUserId ?? null,
    urgency: over.urgency ?? 'none',
    daysUntilTarget: over.daysUntilTarget ?? null,
    createdAt: over.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2025-01-01T00:00:00.000Z',
  }
}

function register(items: MaintenanceItemPublic[]): MaintenanceListResponse {
  const summary = summarizeBacklog(
    items.map((i) => ({
      priority: i.priority,
      status: i.status,
      estimatedCost: i.estimatedCost,
      urgency: i.urgency,
    })),
  )
  return { items, summary }
}

/** Build a BriefingService. `over` swaps in the facilities gate + register. Every
 *  other module gate stays false so no other module item leaks into the assertion. */
function makeService(over: {
  facilitiesLicensed?: boolean | (() => Promise<boolean>)
  items?: MaintenanceItemPublic[] | (() => Promise<MaintenanceListResponse>)
  metrics?: unknown
}) {
  const billing = {
    isEntitledForModule: async (_schoolId: string, moduleKey: string) => {
      if (moduleKey === 'facilities') {
        return typeof over.facilitiesLicensed === 'function'
          ? over.facilitiesLicensed()
          : (over.facilitiesLicensed ?? false)
      }
      return false // governance/accreditation not licensed → isolates the assertion
    },
  }
  const facilitiesSvc = {
    listMaintenance: async () => {
      if (typeof over.items === 'function') return over.items()
      return register(over.items ?? [])
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
  const accreditation = {
    listStandards: async () => ({
      standards: [],
      summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 },
    }),
  }

  const advancement = {
    listCampaigns: async () => ({
      campaigns: [],
      summary: { total: 0, activeCount: 0, totalGoal: 0, totalRaised: 0, overallPctOfGoal: null, behindGoalActiveCount: 0, closingSoonActiveCount: 0, overdueActiveCount: 0 },
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
    accreditation as never,
    facilitiesSvc as never,
    advancement as never,
    { arApAgingSnapshot: { findFirst: async () => null } } as never, // prisma (LAST)
  )
}

describe('briefing — facilities STEP', () => {
  it('MODULE GATE: not licensed → ZERO facilities items', async () => {
    const svc = makeService({
      facilitiesLicensed: false,
      items: [mItem({ id: 'm1', priority: 'high', status: 'open' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'facilities')).toHaveLength(0)
  })

  it('licensed + high-priority open item → one warn "maintenance-backlog" item to /facilities', async () => {
    const svc = makeService({
      facilitiesLicensed: true,
      items: [
        mItem({ id: 'm1', priority: 'high', status: 'open', estimatedCost: 50000, targetDate: '2027-01-01', urgency: 'on-track' }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const fac = res.items.find((i) => i.id === 'facilities:maintenance-backlog')
    expect(fac).toBeDefined()
    expect(fac!.severity).toBe('warn')
    expect(fac!.source).toBe('facilities')
    expect(fac!.link).toBe('/facilities')
    expect(fac!.dueDate).toBe('2027-01-01')
  })

  it('critical-priority open item escalates the backlog item to critical', async () => {
    const svc = makeService({
      facilitiesLicensed: true,
      items: [mItem({ id: 'm1', priority: 'critical', status: 'open', urgency: 'on-track' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const fac = res.items.find((i) => i.id === 'facilities:maintenance-backlog')
    expect(fac!.severity).toBe('critical')
  })

  it('overdue open high-priority item escalates to critical (even without critical priority)', async () => {
    const svc = makeService({
      facilitiesLicensed: true,
      items: [mItem({ id: 'm1', priority: 'high', status: 'open', urgency: 'overdue', targetDate: '2026-01-01' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const fac = res.items.find((i) => i.id === 'facilities:maintenance-backlog')
    expect(fac!.severity).toBe('critical')
  })

  it('low/medium-only backlog emits NO item (highPriorityOpenCount === 0)', async () => {
    const svc = makeService({
      facilitiesLicensed: true,
      items: [
        mItem({ id: 'm1', priority: 'medium', status: 'open', urgency: 'overdue', targetDate: '2026-01-01' }),
        mItem({ id: 'm2', priority: 'low', status: 'open' }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'facilities')).toHaveLength(0)
  })

  it('resolved high-priority item does NOT count (no backlog item)', async () => {
    const svc = makeService({
      facilitiesLicensed: true,
      items: [mItem({ id: 'm1', priority: 'critical', status: 'resolved' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'facilities')).toHaveLength(0)
  })

  it('FAIL-SOFT: listMaintenance throws → briefing still 200s with no facilities item', async () => {
    const svc = makeService({
      facilitiesLicensed: true,
      items: () => Promise.reject(new Error('db down')),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'facilities')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('FAIL-SOFT: isEntitledForModule throws → treated as not-licensed, no 500', async () => {
    const svc = makeService({
      facilitiesLicensed: () => Promise.reject(new Error('billing down')),
      items: [mItem({ id: 'm1', priority: 'high', status: 'open' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'facilities')).toHaveLength(0)
  })

  it('VIEWER (board) lens KEEPS the facilities item, values untouched', async () => {
    const svc = makeService({
      facilitiesLicensed: true,
      items: [mItem({ id: 'm1', priority: 'high', status: 'open', targetDate: '2027-01-01' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    const fac = res.items.find((i) => i.id === 'facilities:maintenance-backlog')
    expect(fac).toBeDefined()
    expect(fac!.severity).toBe('warn')
    expect(fac!.link).toBe('/facilities')
    expect(fac!.value).toBeNull()
  })
})

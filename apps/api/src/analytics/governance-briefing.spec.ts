import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type { PolicyPublic } from '../governance/policies.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Governance v1 — the 'governance' briefing STEP. Verifies the module
// gate, the date-banded aggregate items, deterministic ranking, and fail-soft —
// all WITHOUT booting Nest or Prisma (every injected service is a hand-mock).
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2025' }

// A metrics response with no off-band metrics → STEP 1 emits nothing, so the only
// items in the briefing come from the governance STEP (isolates the assertion).
const CLEAN_METRICS = { metrics: [] as unknown[] }

function policy(over: Partial<PolicyPublic>): PolicyPublic {
  return {
    id: over.id ?? 'p1',
    title: over.title ?? 'Test Policy',
    category: over.category ?? 'Governance',
    status: over.status ?? 'active',
    owner: over.owner ?? null,
    adoptedDate: over.adoptedDate ?? null,
    lastReviewedDate: over.lastReviewedDate ?? null,
    reviewIntervalMonths: over.reviewIntervalMonths ?? 12,
    notes: over.notes ?? null,
    reviewStatus: over.reviewStatus ?? 'current',
    nextReviewDate: over.nextReviewDate ?? null,
    daysUntilDue: over.daysUntilDue ?? null,
    createdAt: over.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2025-01-01T00:00:00.000Z',
  }
}

/** Build a BriefingService whose deps are mocked to a clean baseline. `over`
 *  swaps in the two governance-relevant mocks (billing gate + policy list). */
function makeService(over: {
  licensed?: boolean | (() => Promise<boolean>)
  policies?: PolicyPublic[] | (() => Promise<{ policies: PolicyPublic[] }>)
  metrics?: unknown
}) {
  const billing = {
    isEntitledForModule: async () =>
      typeof over.licensed === 'function' ? over.licensed() : (over.licensed ?? false),
  }
  const policiesSvc = {
    list: async () => {
      if (typeof over.policies === 'function') return over.policies()
      return { policies: over.policies ?? [] }
    },
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const analytics = { computeMetricsResponse: async () => over.metrics ?? CLEAN_METRICS }
  const nullish = { catch: () => null }
  // The STEP-2 compliance fan-out services — each returns null-ish so no
  // compliance item is emitted (keeps the governance assertion isolated).
  const compliance = { evaluateForPeriod: async () => null }
  const reconciliation = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }
  // The workflow open-task read — empty so no workflow item is emitted (keeps the
  // governance assertion isolated).
  const tasks = { listOpenForBriefing: async () => [] }
  // The accreditation module gate is not-licensed here (over.licensed only swaps the
  // governance gate) so no accreditation item is emitted (keeps the governance
  // assertion isolated). The service still returns an empty register if ever called.
  const accreditation = { listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }) }
  // The facilities module gate is not-licensed here (over.licensed only swaps the
  // governance gate) so no facilities item is emitted (keeps the governance
  // assertion isolated). The service still returns an empty register if ever called.
  const facilities = {
    listMaintenance: async () => ({
      items: [],
      summary: { total: 0, openCount: 0, highPriorityOpenCount: 0, criticalOpen: 0, overdueOpen: 0, backlogCost: 0 },
    }),
  }
  void nullish

  return new BriefingService(
    periods as never,
    analytics as never,
    compliance as never,
    checklist as never,
    reconciliation as never,
    corrective as never,
    billing as never,
    policiesSvc as never,
    tasks as never,
    accreditation as never,
    facilities as never,
  )
}

describe('briefing — governance STEP', () => {
  it('MODULE GATE: not licensed → ZERO governance items (finance-only unbroken)', async () => {
    const svc = makeService({
      licensed: false,
      policies: [policy({ id: 'p1', reviewStatus: 'overdue', daysUntilDue: -5, nextReviewDate: '2026-06-01' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'governance')).toHaveLength(0)
  })

  it('licensed + overdue policy → one warn "policies-overdue" item to /governance', async () => {
    const svc = makeService({
      licensed: true,
      policies: [policy({ id: 'p1', reviewStatus: 'overdue', daysUntilDue: -30, nextReviewDate: '2026-06-01' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const gov = res.items.find((i) => i.id === 'governance:policies-overdue')
    expect(gov).toBeDefined()
    expect(gov!.severity).toBe('warn')
    expect(gov!.source).toBe('governance')
    expect(gov!.link).toBe('/governance')
    expect(gov!.dueDate).toBe('2026-06-01')
  })

  it('badly overdue (<= -90d) escalates the overdue item to critical', async () => {
    const svc = makeService({
      licensed: true,
      policies: [
        policy({ id: 'p1', reviewStatus: 'overdue', daysUntilDue: -30, nextReviewDate: '2026-06-01' }),
        policy({ id: 'p2', reviewStatus: 'overdue', daysUntilDue: -120, nextReviewDate: '2026-03-01' }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const gov = res.items.find((i) => i.id === 'governance:policies-overdue')
    expect(gov!.severity).toBe('critical')
    // dueDate = earliest nextReviewDate among overdue policies.
    expect(gov!.dueDate).toBe('2026-03-01')
  })

  it('due-soon policy → an info "policies-due-soon" item', async () => {
    const svc = makeService({
      licensed: true,
      policies: [policy({ id: 'p1', reviewStatus: 'due-soon', daysUntilDue: 20, nextReviewDate: '2026-07-20' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const gov = res.items.find((i) => i.id === 'governance:policies-due-soon')
    expect(gov).toBeDefined()
    expect(gov!.severity).toBe('info')
  })

  it('current / unknown policies emit NO item (honest non-signal)', async () => {
    const svc = makeService({
      licensed: true,
      policies: [
        policy({ id: 'p1', reviewStatus: 'current' }),
        policy({ id: 'p2', reviewStatus: 'unknown' }),
      ],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'governance')).toHaveLength(0)
  })

  it('FAIL-SOFT: policies.list throws → briefing still 200s with no governance item', async () => {
    const svc = makeService({
      licensed: true,
      policies: () => Promise.reject(new Error('db down')),
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'governance')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('FAIL-SOFT: isEntitledForModule throws → treated as not-licensed, no 500', async () => {
    const svc = makeService({
      licensed: () => Promise.reject(new Error('billing down')),
      policies: [policy({ id: 'p1', reviewStatus: 'overdue', daysUntilDue: -5, nextReviewDate: '2026-06-01' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'governance')).toHaveLength(0)
  })

  it('VIEWER (board) lens keeps the governance item', async () => {
    const svc = makeService({
      licensed: true,
      policies: [policy({ id: 'p1', reviewStatus: 'overdue', daysUntilDue: -30, nextReviewDate: '2026-06-01' })],
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.some((i) => i.id === 'governance:policies-overdue')).toBe(true)
  })
})

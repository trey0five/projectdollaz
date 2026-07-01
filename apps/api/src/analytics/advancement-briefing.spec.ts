import { describe, expect, it } from 'vitest'
import { BriefingService } from './briefing.service.js'
import type { CampaignListResponse } from '../advancement/advancement.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Advancement v1 — the 'advancement' briefing STEP (2.9). Verifies the
// module gate, the aggregate giving-progress item, severity escalation, fail-soft,
// and the board (viewer) lens — all WITHOUT booting Nest or Prisma (every injected
// service is a hand-mock).
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = { id: 'period-1', label: 'FY 2025' }
const CLEAN_METRICS = { metrics: [] as unknown[] }

const EMPTY_SUMMARY = {
  total: 0,
  activeCount: 0,
  totalGoal: 0,
  totalRaised: 0,
  overallPctOfGoal: null as number | null,
  behindGoalActiveCount: 0,
  closingSoonActiveCount: 0,
  overdueActiveCount: 0,
}

function makeService(over: {
  licensed?: boolean | (() => Promise<boolean>)
  register?: CampaignListResponse | (() => Promise<CampaignListResponse>)
}) {
  const billing = {
    isEntitledForModule: async (_schoolId: string, module: string) => {
      // Only the 'advancement' gate is swapped; every other module is not-licensed
      // so no other module STEP emits an item (isolates the advancement assertion).
      if (module !== 'advancement') return false
      return typeof over.licensed === 'function' ? over.licensed() : (over.licensed ?? false)
    },
  }
  const advancement = {
    listCampaigns: async () => {
      if (typeof over.register === 'function') return over.register()
      return over.register ?? { campaigns: [], summary: EMPTY_SUMMARY }
    },
  }
  const periods = { getOwnedPeriod: async () => PERIOD }
  const analytics = { computeMetricsResponse: async () => CLEAN_METRICS }
  const compliance = { evaluateForPeriod: async () => null }
  const reconciliation = { reconcileForPeriod: async () => null }
  const checklist = { getChecklist: async () => null }
  const corrective = { getPlan: async () => null }
  const policiesSvc = { list: async () => ({ policies: [] }) }
  const tasks = { listOpenForBriefing: async () => [] }
  const accreditation = {
    listStandards: async () => ({ standards: [], summary: { total: 0, withEvidence: 0, gaps: 0, pctCovered: 0 } }),
  }
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
    tasks as never,
    accreditation as never,
    facilities as never,
    advancement as never,
  )
}

const behindReg: CampaignListResponse = {
  campaigns: [
    {
      id: 'c1',
      name: 'Annual Fund',
      campaignType: 'annual_fund',
      goalAmount: 1000,
      raisedAmount: 400,
      fiscalYear: 2026,
      startDate: null,
      closeDate: '2026-09-01',
      status: 'active',
      notes: null,
      createdByUserId: null,
      pctOfGoal: 0.4,
      gapToGoal: 600,
      urgency: 'on-track',
      daysUntilClose: 62,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  summary: { ...EMPTY_SUMMARY, total: 1, activeCount: 1, totalGoal: 1000, totalRaised: 400, overallPctOfGoal: 0.4, behindGoalActiveCount: 1 },
}

describe('briefing — advancement STEP', () => {
  it('MODULE GATE: not licensed → ZERO advancement items (finance-only unbroken)', async () => {
    const svc = makeService({ licensed: false, register: behindReg })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'advancement')).toHaveLength(0)
  })

  it('licensed + behind goal → one warn "giving-progress" item to /advancement', async () => {
    const svc = makeService({ licensed: true, register: behindReg })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const adv = res.items.find((i) => i.id === 'advancement:giving-progress')
    expect(adv).toBeDefined()
    expect(adv!.severity).toBe('warn')
    expect(adv!.source).toBe('advancement')
    expect(adv!.link).toBe('/advancement')
    expect(adv!.dueDate).toBe('2026-09-01')
  })

  it('overdue active campaign escalates the item to critical', async () => {
    const reg: CampaignListResponse = {
      campaigns: [{ ...behindReg.campaigns[0], id: 'c2', closeDate: '2026-06-01', urgency: 'overdue', daysUntilClose: -30 }],
      summary: { ...behindReg.summary, overdueActiveCount: 1 },
    }
    const svc = makeService({ licensed: true, register: reg })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    const adv = res.items.find((i) => i.id === 'advancement:giving-progress')
    expect(adv!.severity).toBe('critical')
    expect(adv!.dueDate).toBe('2026-06-01')
  })

  it('no attention counts → NO item (honest non-signal)', async () => {
    const svc = makeService({
      licensed: true,
      register: { campaigns: [], summary: { ...EMPTY_SUMMARY, total: 1, activeCount: 1, totalGoal: 1000, totalRaised: 900, overallPctOfGoal: 0.9 } },
    })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'advancement')).toHaveLength(0)
  })

  it('FAIL-SOFT: listCampaigns throws → briefing still 200s with no advancement item', async () => {
    const svc = makeService({ licensed: true, register: () => Promise.reject(new Error('db down')) })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'advancement')).toHaveLength(0)
    expect(res.periodId).toBe(PERIOD.id)
  })

  it('FAIL-SOFT: isEntitledForModule throws → treated as not-licensed, no 500', async () => {
    const svc = makeService({ licensed: () => Promise.reject(new Error('billing down')), register: behindReg })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'owner')
    expect(res.items.filter((i) => i.source === 'advancement')).toHaveLength(0)
  })

  it('VIEWER (board) lens keeps the advancement item', async () => {
    const svc = makeService({ licensed: true, register: behindReg })
    const res = await svc.getBriefing('school-1', PERIOD.id, 'viewer')
    expect(res.lens).toBe('viewer')
    expect(res.items.some((i) => i.id === 'advancement:giving-progress')).toBe(true)
  })
})

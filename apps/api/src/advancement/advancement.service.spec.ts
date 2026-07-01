import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { AdvancementService } from './advancement.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AdvancementService — TENANT ISOLATION + computed progress + Decimal→number +
// deterministic ordering + giving summary. Prisma + Audit are hand-mocked (no DB,
// no Nest boot).
// ─────────────────────────────────────────────────────────────────────────────

/** A Prisma.Decimal stand-in: Number(obj) === value (exactly how the service coerces). */
function decimal(value: number) {
  return { toString: () => String(value), valueOf: () => value }
}

function campaignRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    schoolId: 'school-A',
    name: 'Annual Fund',
    campaignType: null,
    goalAmount: null,
    raisedAmount: null,
    fiscalYear: null,
    startDate: null,
    closeDate: null,
    status: 'active',
    notes: null,
    createdByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

function makeService(over: { campaign?: Record<string, unknown> } = {}) {
  const advancementCampaign = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => campaignRow(data)),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => campaignRow(data)),
    delete: vi.fn(async () => campaignRow()),
    ...over.campaign,
  }
  const prisma = { advancementCampaign }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new AdvancementService(prisma as never, audit as never)
  return { svc, advancementCampaign, audit }
}

const NOW = new Date('2026-07-01T12:00:00.000Z')

describe('AdvancementService — list + enrichment', () => {
  it('listCampaigns filters by schoolId, deterministic order + giving summary', async () => {
    const { svc, advancementCampaign } = makeService({
      campaign: {
        findMany: vi.fn(async () => [
          campaignRow({ id: 'closed1', name: 'Old', status: 'closed', goalAmount: decimal(1000), raisedAmount: decimal(1000) }),
          // active + overdue (past close), behind goal.
          campaignRow({ id: 'over1', name: 'Capital', status: 'active', goalAmount: decimal(1000), raisedAmount: decimal(100), closeDate: new Date('2026-06-01T00:00:00.000Z') }),
          // active + closing-soon.
          campaignRow({ id: 'soon1', name: 'Gala', status: 'active', goalAmount: decimal(1000), raisedAmount: decimal(900), closeDate: new Date('2026-07-15T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.listCampaigns('school-A', NOW)
    expect(advancementCampaign.findMany).toHaveBeenCalledWith({ where: { schoolId: 'school-A' } })
    // active first (overdue<closing-soon), then closed: over1, soon1, closed1.
    expect(res.campaigns.map((c) => c.id)).toEqual(['over1', 'soon1', 'closed1'])
    expect(res.campaigns[0].urgency).toBe('overdue')
    expect(res.campaigns[1].urgency).toBe('closing-soon')
    // summary: 2 active, 1 behind goal (over1 at 10%), 1 closing-soon, 1 overdue.
    expect(res.summary.activeCount).toBe(2)
    expect(res.summary.behindGoalActiveCount).toBe(1)
    expect(res.summary.closingSoonActiveCount).toBe(1)
    expect(res.summary.overdueActiveCount).toBe(1)
    // totals include the closed campaign; overall pct = 2000/3000.
    expect(res.summary.totalGoal).toBe(3000)
    expect(res.summary.totalRaised).toBe(2000)
    expect(res.summary.overallPctOfGoal).toBeCloseTo(2000 / 3000, 10)
  })

  it('toPublic coerces Prisma.Decimal goal/raised to JS numbers; null passes; pct computed', async () => {
    const { svc } = makeService({
      campaign: {
        findMany: vi.fn(async () => [
          campaignRow({ id: 'a', goalAmount: decimal(125000.5), raisedAmount: decimal(60000.25) }),
          campaignRow({ id: 'b', goalAmount: null, raisedAmount: null }),
        ]),
      },
    })
    const res = await svc.listCampaigns('school-A', NOW)
    const a = res.campaigns.find((c) => c.id === 'a')!
    const b = res.campaigns.find((c) => c.id === 'b')!
    expect(a.goalAmount).toBe(125000.5)
    expect(typeof a.goalAmount).toBe('number')
    expect(a.pctOfGoal).toBeCloseTo(60000.25 / 125000.5, 10)
    expect(b.goalAmount).toBeNull()
    // no goal → pctOfGoal null (never NaN/Infinity).
    expect(b.pctOfGoal).toBeNull()
  })

  it('startDate/closeDate round-trip to yyyy-mm-dd with no tz drift', async () => {
    const { svc } = makeService({
      campaign: {
        findMany: vi.fn(async () => [
          campaignRow({ startDate: new Date('2026-01-01T00:00:00.000Z'), closeDate: new Date('2026-06-30T00:00:00.000Z') }),
        ]),
      },
    })
    const res = await svc.listCampaigns('school-A', NOW)
    expect(res.campaigns[0].startDate).toBe('2026-01-01')
    expect(res.campaigns[0].closeDate).toBe('2026-06-30')
  })
})

describe('AdvancementService — tenant isolation (findFirst {id, schoolId})', () => {
  it('update: a campaignId owned by ANOTHER school → NotFoundException, never mutates', async () => {
    const { svc, advancementCampaign } = makeService({ campaign: { findFirst: vi.fn(async () => null) } })
    await expect(
      svc.updateCampaign('school-B', 'campaign-of-A', { name: 'hijack' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(advancementCampaign.update).not.toHaveBeenCalled()
  })

  it('remove: foreign id → NotFoundException, never deletes', async () => {
    const { svc, advancementCampaign } = makeService({ campaign: { findFirst: vi.fn(async () => null) } })
    await expect(svc.removeCampaign('school-B', 'campaign-of-A', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(advancementCampaign.delete).not.toHaveBeenCalled()
  })

  it('resolveCampaign uses the compound {id, schoolId} filter', async () => {
    const { svc, advancementCampaign } = makeService({
      campaign: { findFirst: vi.fn(async () => campaignRow({ id: 'c1', schoolId: 'school-A' })) },
    })
    await svc.updateCampaign('school-A', 'c1', { status: 'closed' }, 'user-1')
    expect(advancementCampaign.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', schoolId: 'school-A' } })
  })
})

describe('AdvancementService — create + update + audit', () => {
  it('create scopes schoolId, sets createdByUserId, defaults status active + raised 0, audits', async () => {
    const { svc, advancementCampaign, audit } = makeService()
    await svc.createCampaign('school-A', { name: 'Annual Fund' }, 'user-1')
    const data = advancementCampaign.create.mock.calls[0][0].data
    expect(data.schoolId).toBe('school-A')
    expect(data.createdByUserId).toBe('user-1')
    expect(data.status).toBe('active')
    expect(data.raisedAmount).toBe(0)
    expect(data.goalAmount).toBeNull()
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'advancement.campaign.created',
        targetType: 'advancement_campaigns',
        schoolId: 'school-A',
      }),
    )
  })

  it('update merge-pick: explicit null clears, omitted keeps; never overwrites createdByUserId', async () => {
    const { svc, advancementCampaign } = makeService({
      campaign: {
        findFirst: vi.fn(async () =>
          campaignRow({ campaignType: 'annual_fund', notes: 'keep me', goalAmount: decimal(5000), createdByUserId: 'orig-user' }),
        ),
      },
    })
    await svc.updateCampaign('school-A', 'c1', { campaignType: null }, 'user-2')
    const data = advancementCampaign.update.mock.calls[0][0].data
    expect(data.campaignType).toBeNull()
    expect(data.notes).toBe('keep me')
    expect(data.goalAmount).toBe(5000) // decimal coerced to number, kept
    expect(data.createdByUserId).toBeUndefined() // not in the update payload
  })
})

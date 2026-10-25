import { describe, expect, it, vi } from 'vitest'
import { QboService } from './qbo.service.js'

/**
 * Disconnect-with-remove-data drops a QuickBooks-created year only when nothing
 * the person owns is left in it. A "Recently removed" entry counts: the bin rows
 * cascade with the period, so deleting it would break the 30-day undo promise.
 */
function build(removalsKept: number) {
  const prisma = {
    import: {
      findMany: vi.fn(async () => [{ id: 'imp-1', fiscalPeriodId: 'p-fy24' }]),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 0),
    },
    monthlySnapshot: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(),
      count: vi.fn(async () => 0),
    },
    periodBudget: { count: vi.fn(async () => 0) },
    statementSnapshot: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    periodInsight: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    dataRemoval: { count: vi.fn(async () => removalsKept) },
    fiscalPeriod: { delete: vi.fn(async () => ({})) },
  }
  const svc = new QboService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { generate: vi.fn() } as never,
    {} as never,
    {} as never,
    { write: vi.fn() } as never,
    {} as never,
    { get: vi.fn() } as never,
  )
  const run = (svc as unknown as {
    removeQboData: (a: unknown, s: string) => Promise<{ periods: number }>
  }).removeQboData.bind(svc)
  return { prisma, run }
}

describe('QboService.removeQboData keeps years with Recently removed data', () => {
  it('drops an empty QuickBooks-created year', async () => {
    const { prisma, run } = build(0)
    const r = await run({ id: 'u1' }, 's1')
    expect(prisma.fiscalPeriod.delete).toHaveBeenCalledWith({ where: { id: 'p-fy24' } })
    expect(r.periods).toBe(1)
  })

  it('keeps the year while a restorable removal still points at it', async () => {
    const { prisma, run } = build(1)
    const r = await run({ id: 'u1' }, 's1')
    expect(prisma.dataRemoval.count).toHaveBeenCalledWith({
      where: { fiscalPeriodId: 'p-fy24', expiresAt: { gt: expect.any(Date) } },
    })
    expect(prisma.fiscalPeriod.delete).not.toHaveBeenCalled()
    expect(r.periods).toBe(0)
  })
})

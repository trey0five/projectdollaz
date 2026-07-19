import { describe, expect, it, vi } from 'vitest'
import type { NormalizedEnrollmentSnapshot, User } from '@finrep/db'
import { EnrollmentService } from './enrollment.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentService.promote() / revertManual() — the Decision C manual-supersede
// contract, over a fully mocked prisma (no DB boot). promote() is exercised through
// the public intakeNormalized() fan-out (the org diocesan path); revertManual() is
// public. We assert on the captured periodOperationalData upsert/update args.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'u1', email: 'head@diocese.test' } as unknown as User
const FP = 'fp-1'

function normalized(total: number): NormalizedEnrollmentSnapshot {
  return {
    observedOn: '2025-10-01',
    provider: 'diocesan_csv',
    totalEnrolled: total,
    byGrade: { K: total },
    byStatus: undefined,
    byDemographics: null,
    warnings: [],
  } as unknown as NormalizedEnrollmentSnapshot
}

/** Build the service with a mocked prisma whose operational row is `op` (or null). */
function makeService(op: Record<string, unknown> | null) {
  const opUpsert = vi.fn(async (_args: { update: Record<string, unknown>; create: Record<string, unknown> }) => ({}))
  const opUpdate = vi.fn(async (_args: { data: Record<string, unknown> }) => ({}))
  const snapUpdateMany = vi.fn(async () => ({ count: 1 }))
  const prisma = {
    enrollmentSnapshot: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'snap-1' })),
      update: vi.fn(async () => ({ id: 'snap-1' })),
      updateMany: snapUpdateMany,
    },
    periodOperationalData: {
      findUnique: vi.fn(async () => op),
      upsert: opUpsert,
      update: opUpdate,
    },
  }
  const periods = { resolveForImport: vi.fn(async () => ({ period: { id: FP }, created: false })) }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new EnrollmentService(
    prisma as never,
    {} as never, // config
    {} as never, // client
    periods as never,
    audit as never,
    {} as never, // onerosterCsv
    {} as never, // blackbaud
    {} as never, // onerosterApi
    {} as never, // facts
    {} as never, // veracross
  )
  return { svc, opUpsert, opUpdate, snapUpdateMany }
}

describe('EnrollmentService.promote (via intakeNormalized) — manual supersede', () => {
  it('(a) leaves a manual entry untouched when supersedeManual is false', async () => {
    const { svc, opUpsert } = makeService({
      id: 'op-1',
      enrollment: 150,
      enrollmentFte: null,
      enrollmentSourceProvider: null, // hand-entered (manual)
      enrollmentSupersededAt: null,
      enrollmentSupersededManual: null,
    })
    const res = await svc.intakeNormalized(USER, 'sch-1', normalized(210), { sourceId: 'src-1' })
    expect(res.promoted).toBe(false)
    expect(res.superseded).toBe(false)
    expect(opUpsert).not.toHaveBeenCalled() // never overwrites the manual value
  })

  it('(b) backs up the original manual value+fte and flags the manual snapshot', async () => {
    const { svc, opUpsert, snapUpdateMany } = makeService({
      id: 'op-1',
      enrollment: 180,
      enrollmentFte: 175.5,
      enrollmentSourceProvider: null,
      enrollmentSupersededAt: null,
      enrollmentSupersededManual: null,
    })
    const res = await svc.intakeNormalized(USER, 'sch-1', normalized(210), {
      sourceId: 'src-diocesan',
      supersedeManual: true,
    })
    expect(res.superseded).toBe(true)
    expect(res.supersededManual).toBe(180)
    const update = opUpsert.mock.calls[0]![0].update
    expect(update.enrollment).toBe(210)
    expect(update.enrollmentSourceProvider).toBe('diocesan_csv')
    expect(update.enrollmentSupersededManual).toBe(180)
    expect(update.enrollmentSupersededManualFte).toBe(175.5)
    expect(update.enrollmentSupersededAt).toBeInstanceOf(Date)
    // The school's manual snapshot rows for this period are flagged superseded.
    expect(snapUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: 'manual', supersededByImport: false }),
        data: expect.objectContaining({ supersededByImport: true }),
      }),
    )
  })

  it('(c) a repeat import preserves the ORIGINAL backup value + supersededAt', async () => {
    // The row now already carries the first import's stamp + backup (isManual is false).
    const firstBackupAt = new Date('2025-10-01T12:00:00Z')
    const { svc, opUpsert } = makeService({
      id: 'op-1',
      enrollment: 210, // the previously-imported value
      enrollmentFte: null,
      enrollmentSourceProvider: 'diocesan_csv', // no longer a manual entry
      enrollmentSupersededAt: firstBackupAt,
      enrollmentSupersededManual: 180, // the ORIGINAL manual figure
    })
    const res = await svc.intakeNormalized(USER, 'sch-1', normalized(225), {
      sourceId: 'src-diocesan',
      supersedeManual: true,
    })
    // A re-import just refreshes the value; it must NOT re-touch the backup columns.
    const update = opUpsert.mock.calls[0]![0].update
    expect(update.enrollment).toBe(225)
    expect(update).not.toHaveProperty('enrollmentSupersededManual')
    expect(update).not.toHaveProperty('enrollmentSupersededAt')
    expect(res.superseded).toBe(false) // already superseded earlier, not re-flagged
  })

  it('(d) revertManual restores the manual value and clears the flags', async () => {
    const { svc, opUpdate, snapUpdateMany } = makeService({
      id: 'op-1',
      enrollment: 225,
      enrollmentFte: null,
      enrollmentSourceProvider: 'diocesan_csv',
      enrollmentSupersededAt: new Date('2025-10-01T12:00:00Z'),
      enrollmentSupersededManual: 180,
      enrollmentSupersededManualFte: 175.5,
    })
    const res = await svc.revertManual(USER, 'sch-1', FP)
    expect(res.reverted).toBe(true)
    expect(res.enrollment).toBe(180)
    const data = opUpdate.mock.calls[0]![0].data
    expect(data.enrollment).toBe(180)
    expect(data.enrollmentFte).toBe(175.5)
    expect(data.enrollmentSourceProvider).toBeNull() // back to hand-entered
    expect(data.enrollmentSupersededManual).toBeNull()
    expect(data.enrollmentSupersededAt).toBeNull()
    // The manual snapshot rows are un-flagged.
    expect(snapUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: 'manual', supersededByImport: true }),
        data: expect.objectContaining({ supersededByImport: false }),
      }),
    )
  })

  it('revertManual is a no-op when nothing was superseded', async () => {
    const { svc, opUpdate } = makeService({
      id: 'op-1',
      enrollment: 150,
      enrollmentSourceProvider: null,
      enrollmentSupersededAt: null,
      enrollmentSupersededManual: null,
    })
    const res = await svc.revertManual(USER, 'sch-1', FP)
    expect(res.reverted).toBe(false)
    expect(opUpdate).not.toHaveBeenCalled()
  })
})

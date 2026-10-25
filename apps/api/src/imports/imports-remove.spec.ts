import { describe, it, expect, vi } from 'vitest'
import { ImportsService } from './imports.service.js'

// The legacy DELETE /imports/:importId (and KYRO's undo) route through the
// restorable bin when FinanceRemovalsService is wired; the response keeps its
// DeleteImportResult shape and gains removalId / expiresAt.
describe('ImportsService.remove — delegates to the restorable bin', () => {
  function make(statements: 'cleared' | 'rebuilt' | 'unchanged') {
    const prisma = {
      import: {
        findUnique: vi.fn(async () => ({ id: 'i1', schoolId: 's1', fiscalPeriodId: 'p1', role: 'cy', rowCount: 3, sourceName: 'TB.xlsx' })),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      statementSnapshot: { deleteMany: vi.fn() },
    }
    const audit = { write: vi.fn(async () => undefined) }
    const periods = { getOwnedPeriod: vi.fn(async () => ({ id: 'p1', periodEndDate: new Date('2025-06-30') })) }
    const removals = {
      removeTrialBalance: vi.fn(async () => ({
        removal: { id: 'r1', expiresAt: '2025-11-24T00:00:00.000Z', files: [{}, {}] },
        effects: { statements, rebuilt: [], failed: [] },
      })),
    }
    const svc = new ImportsService(
      prisma as never,
      audit as never,
      periods as never,
      {} as never,
      undefined,
      removals as never,
    )
    return { svc, prisma, audit, removals }
  }

  it('maps the removal to DeleteImportResult + removalId, and never hard-deletes', async () => {
    const { svc, prisma, removals } = make('cleared')
    const out = await svc.remove({ id: 'u1' } as never, 's1', 'i1')
    expect(removals.removeTrialBalance).toHaveBeenCalledWith({ id: 'u1' }, 's1', 'i1')
    expect(out).toEqual({
      deleted: 'i1',
      role: 'cy',
      removed: 2,
      periodId: 'p1',
      snapshot: 'cleared',
      removalId: 'r1',
      expiresAt: '2025-11-24T00:00:00.000Z',
    })
    expect(prisma.import.deleteMany).not.toHaveBeenCalled()
    expect(prisma.statementSnapshot.deleteMany).not.toHaveBeenCalled()
  })

  it('maps rebuilt → regenerated and anything else → unchanged', async () => {
    expect((await make('rebuilt').svc.remove({ id: 'u1' } as never, 's1', 'i1')).snapshot).toBe('regenerated')
    expect((await make('unchanged').svc.remove({ id: 'u1' } as never, 's1', 'i1')).snapshot).toBe('unchanged')
  })

  it("keeps the 'import.deleted' audit, now carrying removalId", async () => {
    const { svc, audit } = make('cleared')
    await svc.remove({ id: 'u1' } as never, 's1', 'i1')
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'import.deleted',
        targetId: 'i1',
        metadata: expect.objectContaining({ role: 'cy', periodId: 'p1', removed: 2, removalId: 'r1' }),
      }),
    )
  })

  it('a foreign import still 404s before anything is removed', async () => {
    const { svc, prisma, removals } = make('cleared')
    prisma.import.findUnique.mockResolvedValueOnce({ id: 'i1', schoolId: 'other', fiscalPeriodId: 'p1', role: 'cy', rowCount: 3, sourceName: 'x' })
    await expect(svc.remove({ id: 'u1' } as never, 's1', 'i1')).rejects.toThrow('Import not found.')
    expect(removals.removeTrialBalance).not.toHaveBeenCalled()
  })
})

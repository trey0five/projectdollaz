import { describe, expect, it, vi } from 'vitest'
import type { ModuleKey } from '@finrep/db'
import { TwinPriorFactsService } from './twin-prior-facts.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — WHERE A PREVIOUS OBSERVATION COMES FROM.
//
// Three properties:
//   1. `skip: 1` on BOTH queries — the SECOND-newest row, never the newest one
//      compared against itself.
//   2. AN UNLICENSED MODULE ISSUES NO QUERY. Not "returns nothing" — issues no
//      query at all, which is the same discipline the live collector applies.
//   3. THE PRIOR IS SUPPRESSED EXACTLY LIKE THE LIVE SIGNAL. A raw count below
//      MIN_CELL must not appear anywhere in the serialised priors, because
//      suppressing this year and publishing last year discloses the same child.
// ─────────────────────────────────────────────────────────────────────────────

const ALL: ReadonlySet<ModuleKey> = new Set(['enrollment', 'finance'] as ModuleKey[])

function harness(over: {
  enrollment?: unknown
  aging?: unknown
  enrollmentThrows?: boolean
} = {}) {
  const enrollmentFind = vi.fn(async (_args?: Record<string, unknown>) => {
    if (over.enrollmentThrows) throw new Error('boom')
    return over.enrollment ?? null
  })
  const agingFind = vi.fn(async (_args?: Record<string, unknown>) => over.aging ?? null)
  const prisma = {
    enrollmentSnapshot: { findFirst: enrollmentFind },
    arApAgingSnapshot: { findFirst: agingFind },
  }
  return {
    svc: new TwinPriorFactsService(prisma as never),
    enrollmentFind,
    agingFind,
  }
}

describe('TwinPriorFactsService — the queries', () => {
  it('reads the SECOND-newest row on both registers (skip: 1)', async () => {
    const h = harness({
      enrollment: { observedOn: new Date('2025-09-15T00:00:00Z'), totalEnrolled: 204, byGrade: null },
      aging: { asOfDate: new Date('2026-03-31T00:00:00Z'), ar90Plus: 51400 },
    })
    await h.svc.collect('school-A', ALL)

    expect(h.enrollmentFind).toHaveBeenCalledTimes(1)
    expect(h.enrollmentFind.mock.calls[0][0]).toMatchObject({
      where: { schoolId: 'school-A' },
      orderBy: { observedOn: 'desc' },
      skip: 1,
    })
    expect(h.agingFind.mock.calls[0][0]).toMatchObject({
      where: { schoolId: 'school-A' },
      orderBy: { asOfDate: 'desc' },
      skip: 1,
    })
  })

  it('ISSUES NO QUERY for an unlicensed module', async () => {
    const h = harness({ enrollment: { observedOn: new Date(), totalEnrolled: 1, byGrade: null } })
    const financeOnly: ReadonlySet<ModuleKey> = new Set(['finance'] as ModuleKey[])
    const out = await h.svc.collect('school-A', financeOnly)

    expect(h.enrollmentFind).not.toHaveBeenCalled()
    expect(out['enr.headcount']).toBeUndefined()
    expect(out['enr.feeder_grades']).toBeUndefined()
  })

  it('a failed read costs the comparison rules, not the run', async () => {
    const h = harness({ enrollmentThrows: true, aging: { asOfDate: new Date('2026-03-31T00:00:00Z'), ar90Plus: 10 } })
    const out = await h.svc.collect('school-A', ALL)
    expect(out['enr.headcount']).toBeUndefined()
    expect(out['fin.ar_aging']).toBeDefined()
  })

  it('reads NOTHING beyond the three comparison keys', async () => {
    const h = harness({
      enrollment: { observedOn: new Date('2025-09-15T00:00:00Z'), totalEnrolled: 204, byGrade: { K: 30 } },
      aging: { asOfDate: new Date('2026-03-31T00:00:00Z'), ar90Plus: 51400 },
    })
    const out = await h.svc.collect('school-A', ALL)
    expect(Object.keys(out).sort()).toEqual([
      'enr.feeder_grades',
      'enr.headcount',
      'fin.ar_aging',
    ])
  })
})

describe('TwinPriorFactsService — one observation is not two', () => {
  it('omits a key whose prior date EQUALS the live observation', async () => {
    const h = harness({
      enrollment: { observedOn: new Date('2026-09-15T00:00:00Z'), totalEnrolled: 204, byGrade: null },
      aging: { asOfDate: new Date('2026-06-30T00:00:00Z'), ar90Plus: 51400 },
    })
    const out = await h.svc.collect('school-A', ALL, {
      'enr.headcount': '2026-09-15',
      'fin.ar_aging': '2026-06-30',
    })
    expect(out['enr.headcount']).toBeUndefined()
    expect(out['fin.ar_aging']).toBeUndefined()
  })

  it('keeps a key whose prior date DIFFERS from the live observation', async () => {
    const h = harness({
      enrollment: { observedOn: new Date('2025-09-15T00:00:00Z'), totalEnrolled: 204, byGrade: null },
    })
    const out = await h.svc.collect('school-A', ALL, { 'enr.headcount': '2026-09-15' })
    expect(out['enr.headcount']).toEqual({
      value: 204,
      observedOn: '2025-09-15',
      cells: null,
    })
  })
})

describe('TwinPriorFactsService — FERPA', () => {
  it('SUPPRESSES the prior per-grade cells exactly as the live signal does', async () => {
    const h = harness({
      enrollment: {
        observedOn: new Date('2025-09-15T00:00:00Z'),
        totalEnrolled: 40,
        // K is 3 — below MIN_CELL. It must not survive into the map in ANY form.
        byGrade: { K: 3, '1': 12, '2': 25 },
      },
    })
    const out = await h.svc.collect('school-A', ALL)
    const cells = out['enr.feeder_grades'].cells!
    const k = cells.find((c) => c.key === 'K')!
    expect(k.suppressed).toBe(true)
    expect(k.value).toBeNull()
    // The scalar is deliberately null: the prior IS the cell set, and a headline
    // derived from the same rows would be a second place a small count leaks.
    expect(out['enr.feeder_grades'].value).toBeNull()
  })

  it('the raw suppressed count appears NOWHERE in the serialised priors', async () => {
    const h = harness({
      enrollment: {
        observedOn: new Date('2025-09-15T00:00:00Z'),
        totalEnrolled: 40,
        byGrade: { K: 3, '1': 12, '2': 25 },
      },
    })
    const out = await h.svc.collect('school-A', ALL)
    const json = JSON.stringify(out['enr.feeder_grades'])
    expect(json).not.toContain(':3')
    expect(json).not.toContain('3,')
  })

  it('a snapshot with no per-grade tally yields no feeder prior at all', async () => {
    const h = harness({
      enrollment: { observedOn: new Date('2025-09-15T00:00:00Z'), totalEnrolled: 40, byGrade: {} },
    })
    const out = await h.svc.collect('school-A', ALL)
    expect(out['enr.feeder_grades']).toBeUndefined()
    expect(out['enr.headcount']).toBeDefined()
  })
})

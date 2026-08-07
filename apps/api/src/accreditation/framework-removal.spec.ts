import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { AccreditationCatalogService } from './catalog.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// A FRAMEWORK YOU ADOPTED BY MISTAKE CAN BE REMOVED — AND YOU ARE TOLD THE COST.
//
// Adopting was always cheap, and until now un-adopting was impossible: the only
// delete was per-standard, so backing out of Cognia meant removing 42 rows one at
// a time. That was survivable while adopting a second framework was pointless.
// Offering seven frameworks and encouraging schools to hold several makes "I
// picked the wrong one" both realistic and expensive.
//
// TWO DECISIONS ARE PINNED HERE, and they are the whole design:
//
//   1. REMOVAL IS ALWAYS PERMITTED. Refusing to remove a framework a school had
//      already scored against would strand precisely the person who needs it —
//      the one who noticed after forty standards, not before the first. What
//      protects the school is the COUNT, not a locked door.
//
//   2. THE COUNT IS A SEPARATE, READ-ONLY CALL. `removalImpact` touches nothing,
//      so the UI can ask "what would this cost?" speculatively and the school
//      reads its own numbers before authorising anything.
//
// And two things are deliberately NOT deleted: the documents behind evidence
// links (they live in the doc store, serve other standards, and are the school's
// records) and improvement initiatives raised from these standards (an
// initiative is a plan the school committed to). The initiatives' soft link back
// does break, which is only honest if it is counted and said.
// ─────────────────────────────────────────────────────────────────────────────

const FW = { id: 'fw-cognia', code: 'cognia_2022', name: 'Cognia Performance Standards' }

interface Row {
  id: string
  rubricScore: number | null
  rating: string
}

function makeService(over: {
  framework?: typeof FW | null
  rows?: Row[]
  evidence?: number
  initiatives?: number
} = {}) {
  const rows = over.rows ?? []
  const deleted = { evidence: [] as string[][], standards: [] as string[][] }

  const tx = {
    accreditationStandard: {
      findMany: vi.fn(async () => rows.map((r) => ({ id: r.id }))),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        deleted.standards.push(where.id.in)
        return { count: where.id.in.length }
      }),
    },
    accreditationEvidence: {
      deleteMany: vi.fn(async ({ where }: { where: { standardId: { in: string[] } } }) => {
        deleted.evidence.push(where.standardId.in)
        return { count: over.evidence ?? 0 }
      }),
    },
  }

  const prisma = {
    accreditationFramework: {
      findFirst: vi.fn(async () => (over.framework === undefined ? FW : over.framework)),
    },
    accreditationStandard: { findMany: vi.fn(async () => rows) },
    accreditationEvidence: { count: vi.fn(async () => over.evidence ?? 0) },
    improvementInitiative: { count: vi.fn(async () => over.initiatives ?? 0) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }

  const audit = { write: vi.fn(async () => undefined) }
  const snapshot = { captureOnEvent: vi.fn() }
  const svc = new AccreditationCatalogService(
    prisma as never,
    audit as never,
    snapshot as never,
  )
  return { svc, prisma, audit, snapshot, tx, deleted }
}

const scored = (n: number, over: Partial<Row> = {}): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s-${i}`,
    rubricScore: null,
    rating: 'not_started',
    ...over,
  }))

describe('removalImpact — counting the cost, and touching nothing', () => {
  it('counts standards, scores, ratings, evidence links and orphaned work', async () => {
    const rows: Row[] = [
      { id: 'a', rubricScore: 3, rating: 'met' },
      { id: 'b', rubricScore: 2, rating: 'not_started' },
      { id: 'c', rubricScore: null, rating: 'partially_met' },
      { id: 'd', rubricScore: null, rating: 'not_started' },
    ]
    const { svc } = makeService({ rows, evidence: 7, initiatives: 2 })
    const impact = await svc.removalImpact('school-A', 'cognia_2022')
    expect(impact).toMatchObject({
      code: 'cognia_2022',
      standards: 4,
      rubricScored: 2, // a, b
      rated: 2, // a (met), c (partially_met) — 'not_started' is untouched
      evidenceLinks: 7,
      initiativesOrphaned: 2,
    })
  })

  it('DELETES NOTHING — a preview that mutates is not a preview', async () => {
    const { svc, prisma } = makeService({ rows: scored(3), evidence: 4 })
    await svc.removalImpact('school-A', 'cognia_2022')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('the default rating is not counted as a loss', async () => {
    // Every adopted standard starts at 'not_started'. Counting those as ratings
    // would tell a school that adopted a framework a minute ago that it is about
    // to lose 42 ratings it never entered.
    const { svc } = makeService({ rows: scored(42) })
    const impact = await svc.removalImpact('school-A', 'cognia_2022')
    expect(impact.standards).toBe(42)
    expect(impact.rated).toBe(0)
    expect(impact.rubricScored).toBe(0)
  })

  it('404s on a framework that does not exist', async () => {
    const { svc } = makeService({ framework: null })
    await expect(svc.removalImpact('school-A', 'nope')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('skips both count queries when the school holds nothing', async () => {
    const { svc, prisma } = makeService({ rows: [] })
    const impact = await svc.removalImpact('school-A', 'cognia_2022')
    expect(impact.standards).toBe(0)
    expect(prisma.accreditationEvidence.count).not.toHaveBeenCalled()
    expect(prisma.improvementInitiative.count).not.toHaveBeenCalled()
  })
})

describe('removeFramework — always permitted, never silent', () => {
  it('REMOVES A FULLY SCORED FRAMEWORK rather than refusing', async () => {
    // The decision this file exists to pin. A school that scored 40 standards
    // against the wrong accreditor must be able to back out; refusing would leave
    // it deleting rows one at a time, which is what this replaces.
    const rows: Row[] = scored(40, { rubricScore: 4, rating: 'met' })
    const { svc } = makeService({ rows, evidence: 12, initiatives: 3 })
    const res = await svc.removeFramework('school-A', 'cognia_2022', 'u-1')
    expect(res.removed).toBe(40)
    expect(res.rubricScored).toBe(40)
  })

  it('reports the SAME figures it deleted against', async () => {
    // The confirmation the school read and the delete it authorised must be one
    // count, not two that can disagree.
    const rows: Row[] = scored(5, { rubricScore: 2 })
    const { svc } = makeService({ rows, evidence: 6, initiatives: 1 })
    const impact = await svc.removalImpact('school-A', 'cognia_2022')
    const res = await svc.removeFramework('school-A', 'cognia_2022', 'u-1')
    expect(res.standards).toBe(impact.standards)
    expect(res.rubricScored).toBe(impact.rubricScored)
    expect(res.evidenceLinks).toBe(impact.evidenceLinks)
    expect(res.removed).toBe(impact.standards)
  })

  it('drops evidence LINKS before the standards they hang on', async () => {
    const { svc, tx, deleted } = makeService({ rows: scored(3), evidence: 4 })
    await svc.removeFramework('school-A', 'cognia_2022', 'u-1')
    expect(tx.accreditationEvidence.deleteMany).toHaveBeenCalled()
    expect(deleted.evidence[0]).toEqual(['s-0', 's-1', 's-2'])
    expect(deleted.standards[0]).toEqual(['s-0', 's-1', 's-2'])
  })

  it('NEVER deletes improvement initiatives — they are the school’s own plan', async () => {
    // An initiative is work the school committed to. Deleting somebody's plan
    // because they changed accreditor would be indefensible; the broken link is
    // reported instead.
    const { svc, prisma } = makeService({ rows: scored(3), initiatives: 5 })
    const res = await svc.removeFramework('school-A', 'cognia_2022', 'u-1')
    expect(res.initiativesOrphaned).toBe(5)
    expect(
      (prisma.improvementInitiative as { deleteMany?: unknown }).deleteMany,
    ).toBeUndefined()
  })

  it('is idempotent — removing what you do not hold is zero, not a throw', async () => {
    const { svc, tx } = makeService({ rows: [] })
    const res = await svc.removeFramework('school-A', 'cognia_2022', 'u-1')
    expect(res.removed).toBe(0)
    expect(tx.accreditationStandard.deleteMany).not.toHaveBeenCalled()
  })

  it('writes an audit row and re-snapshots readiness', async () => {
    // Readiness changed the instant those standards left. Without the capture the
    // hero would show a figure computed over a register that no longer exists.
    const { svc, audit, snapshot } = makeService({ rows: scored(3) })
    await svc.removeFramework('school-A', 'cognia_2022', 'u-1')
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'accreditation.framework.removed',
        targetId: 'fw-cognia',
        userId: 'u-1',
      }),
    )
    expect(snapshot.captureOnEvent).toHaveBeenCalledWith('school-A')
  })
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { AccreditationReadinessService } from './readiness.service.js'
import type { ReadinessResponse } from './readiness.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — BACK-PROPAGATION IS ADVISORY ONLY.
//
//   "In-flight work must NEVER move readinessPct, projectedIndex or band. A
//    projection that quietly becomes the headline number is the single worst
//    thing this phase could ship."
//
// A school walking into an accreditation visit believing a number that described
// its INTENTIONS rather than its evidence is the specific harm. So this is not
// asserted by reading the code and agreeing that it looks right. `getReadiness`
// is run TWICE against the same mocked Prisma — once with zero improvement
// initiatives, once with a set large enough to move the index by ~46 points — and
// the two payloads are compared with `inFlight` and `gaps[].work` stripped out.
// If ANYTHING else moves by one, this goes red.
//
// The mirror assertion matters just as much: (b) proves the projection is REAL,
// so (a) cannot pass because the feature is dead code.
// ─────────────────────────────────────────────────────────────────────────────

const COGNIA = {
  id: 'fw-cognia',
  code: 'cognia_2022',
  name: 'Cognia Performance Standards',
  rubricLabels: ['Insufficient', 'Initiating', 'Improving', 'Impacting'],
  statusBands: [
    { min: 240, label: 'Accredited Needing Improvement' },
    { min: 280, label: 'Accredited' },
    { min: 320, label: 'Accredited with Merit' },
    { min: 360, label: 'Accredited with Distinction' },
  ],
  indexMin: 100,
  indexMax: 400,
  defaultTarget: 280,
}

function stdRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    schoolId: 'school-A',
    parentId: null,
    code: 'COG-1',
    title: 'T',
    rating: 'not_started',
    frameworkId: 'fw-cognia',
    catalogStandardId: null,
    rubricScore: null,
    sortOrder: null,
    ...over,
  }
}

// Four scored leaves at rubric 1 under one domain parent. projectedIndex =
// round(mean(1) × 100) = 100. Lifting all four to 4 gives 400 — a 300-point
// swing, far more than the 40 the contract asks the differential to survive.
const STANDARDS = [
  stdRow({ id: 'dom', code: 'COG-KC1', catalogStandardId: 'c-dom' }),
  stdRow({ id: 'a', code: 'COG-1', parentId: 'dom', catalogStandardId: 'c1', rubricScore: 1 }),
  stdRow({ id: 'b', code: 'COG-2', parentId: 'dom', catalogStandardId: 'c2', rubricScore: 1 }),
  stdRow({ id: 'c', code: 'COG-3', parentId: 'dom', catalogStandardId: 'c3', rubricScore: 2 }),
  stdRow({ id: 'd', code: 'COG-4', parentId: 'dom', catalogStandardId: 'c4', rubricScore: 2 }),
]

const EVIDENCE = [
  { standardId: 'a', sourceType: 'manual', sourceRef: null, tag: null, effectiveDate: null, expiresAt: null },
  { standardId: 'c', sourceType: 'manual', sourceRef: null, tag: null, effectiveDate: null, expiresAt: null },
]

interface InitiativeFixture {
  id: string
  originRef: string | null
  dueDate: Date | null
  targetRubricScore: number | null
  status?: string
}

function makeService(initiatives: InitiativeFixture[]) {
  // The double honours BOTH the status filter and the orderBy, because the
  // service relies on the ordering (initiativeIds come back due-date first) and a
  // double that ignores it would let a real ordering bug pass here.
  const findMany = vi.fn(async (args: { where: { status?: { notIn: string[] } } }) => {
    const closed = args?.where?.status?.notIn ?? []
    return initiatives
      .filter((i) => !closed.includes(i.status ?? 'in_progress'))
      .slice()
      .sort((x, y) => {
        const dx = x.dueDate?.getTime() ?? Number.POSITIVE_INFINITY
        const dy = y.dueDate?.getTime() ?? Number.POSITIVE_INFINITY
        return dx === dy ? x.id.localeCompare(y.id) : dx - dy
      })
      .map((i) => ({
        id: i.id,
        originRef: i.originRef,
        dueDate: i.dueDate,
        targetRubricScore: i.targetRubricScore,
      }))
  })
  const prisma = {
    accreditationStandard: { findMany: vi.fn(async () => STANDARDS) },
    accreditationEvidence: {
      findMany: vi.fn(async () => EVIDENCE),
      groupBy: vi.fn(async () => []),
    },
    accreditationCatalogRequirement: { findMany: vi.fn(async () => []) },
    policy: { findMany: vi.fn(async () => []) },
    strategicPlan: { findMany: vi.fn(async () => []) },
    accreditationFramework: {
      findFirst: vi.fn(async () => COGNIA),
      findMany: vi.fn(async () => [COGNIA]),
    },
    accreditationCatalogStandard: { findMany: vi.fn(async () => []) },
    improvementInitiative: { findMany },
  }
  return { svc: new AccreditationReadinessService(prisma as never), findMany }
}

const NOW = new Date('2026-07-31T00:00:00.000Z')
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/** A full in-flight set: every leaf lifted to 4, each with a target AND a date. */
const FULL_SET: InitiativeFixture[] = [
  { id: 'i-a', originRef: 'a', dueDate: d('2027-01-31'), targetRubricScore: 4 },
  { id: 'i-b', originRef: 'b', dueDate: d('2027-03-31'), targetRubricScore: 4 },
  { id: 'i-c', originRef: 'c', dueDate: d('2026-11-30'), targetRubricScore: 4 },
  { id: 'i-d', originRef: 'd', dueDate: d('2027-06-30'), targetRubricScore: 4 },
]

async function run(initiatives: InitiativeFixture[]): Promise<ReadinessResponse> {
  const { svc } = makeService(initiatives)
  return svc.getReadiness('school-A', {}, NOW)
}

/** Everything the projection is FORBIDDEN to touch. */
function strip(r: ReadinessResponse) {
  return {
    ...r,
    inFlight: undefined,
    gaps: r.gaps.map(({ work: _work, ...g }) => g),
  }
}

describe('(a) THE DIFFERENTIAL — in-flight work moves NOTHING a school reads as a fact', () => {
  it('the payload is identical with and without a full in-flight set', async () => {
    const without = await run([])
    const withWork = await run(FULL_SET)
    expect(strip(withWork)).toEqual(strip(without))
  })

  it('…and the three headline fields say so by name, so a failure names itself', async () => {
    const without = await run([])
    const withWork = await run(FULL_SET)
    expect(withWork.projectedIndex).toBe(without.projectedIndex)
    expect(withWork.band).toBe(without.band)
    expect(withWork.readinessPct).toBe(without.readinessPct)
    expect(withWork.selfScoredPct).toBe(without.selfScoredPct)
    expect(withWork.verifiedPct).toBe(without.verifiedPct)
    expect(withWork.target).toEqual(without.target)
    expect(withWork.domains).toEqual(without.domains)
    expect(withWork.confidence).toEqual(without.confidence)
    expect(withWork.assurances).toEqual(without.assurances)
  })

  it('every gap field OTHER than `work` is unmoved, field by field', async () => {
    const without = await run([])
    const withWork = await run(FULL_SET)
    expect(withWork.gaps).toHaveLength(without.gaps.length)
    for (let i = 0; i < without.gaps.length; i += 1) {
      const { work: _w, ...moved } = withWork.gaps[i]
      const { work: _w2, ...base } = without.gaps[i]
      expect(moved).toEqual(base)
      // …including the lifts, which are the numbers a recommendation quotes.
      expect(moved.nextStepLift).toBe(base.nextStepLift)
      expect(moved.fullLift).toBe(base.fullLift)
    }
  })
})

describe('(b) THE MIRROR — the projection is REAL, so (a) is not passing on dead code', () => {
  it('a full in-flight set projects a materially HIGHER index than the actual one', async () => {
    const r = await run(FULL_SET)
    expect(r.inFlight).not.toBeNull()
    expect(r.inFlight!.counted).toBeGreaterThan(0)
    expect(r.inFlight!.expectedIndexIfDelivered).not.toBeNull()
    expect(r.inFlight!.expectedIndexIfDelivered!).toBeGreaterThan(r.projectedIndex!)
    // The differential above would be trivially true if the two differed by 1.
    expect(r.inFlight!.expectedIndexIfDelivered! - r.projectedIndex!).toBeGreaterThan(40)
  })

  it('the projected BAND is reported separately and is not the school\'s band', async () => {
    const r = await run(FULL_SET)
    expect(r.inFlight!.expectedBandIfDelivered).toBe('Accredited with Distinction')
    expect(r.band).not.toBe(r.inFlight!.expectedBandIfDelivered)
  })

  it('expectedByDate is when the WHOLE set lands, not the first one', async () => {
    const r = await run(FULL_SET)
    expect(r.inFlight!.expectedByDate).toBe('2027-06-30')
  })

  it('`basis` names the count, and says out loud that it is not the index', async () => {
    const r = await run(FULL_SET)
    expect(r.inFlight!.basis).toContain('4 in-flight initiatives')
    expect(r.inFlight!.basis).toContain('It is not your index.')
  })

  it('the projection is MONOTONE — work that targets a level already reached cannot lower it', async () => {
    // Leaf `c` is already at rubric 2. An initiative aiming at 1 is a data-entry
    // mistake, and rendering a ghosted marker BELOW the real index would tell a
    // school that finishing its work makes it worse.
    const r = await run([{ id: 'i-c', originRef: 'c', dueDate: d('2027-01-31'), targetRubricScore: 1 }])
    expect(r.inFlight!.expectedIndexIfDelivered!).toBeGreaterThanOrEqual(r.projectedIndex!)
  })

  it('no in-flight work at all → no projected number, and a sentence that says why', async () => {
    const r = await run([])
    expect(r.inFlight!.counted).toBe(0)
    expect(r.inFlight!.expectedIndexIfDelivered).toBeNull()
    expect(r.inFlight!.expectedBandIfDelivered).toBeNull()
    expect(r.inFlight!.basis).toBe(
      'No in-flight initiative names both a target rubric level and a due date, so nothing is projected.',
    )
  })
})

describe('(c) SOURCE-READING — the projected array can only reach ONE function', () => {
  const src = readFileSync(fileURLToPath(new URL('./readiness.service.ts', import.meta.url)), 'utf8')

  it('schoolReadiness is called EXACTLY twice — the actual leaves, then the projection', () => {
    expect(src.match(/schoolReadiness\(/g)).toHaveLength(2)
  })

  it('projectedLeaves never reaches computeGaps or computeTargetGap', () => {
    // The gaps and the target-gap math describe where a school IS. Handing them
    // the projection would make "3 steps to target" mean "3 steps once you finish
    // the work you have not finished".
    expect(src).not.toMatch(/computeGaps\(\s*projectedLeaves/)
    expect(src).not.toMatch(/computeTargetGap\(\s*projectedLeaves/)
    expect(src).toMatch(/computeGaps\(scoredLeaves/)
    expect(src).toMatch(/computeTargetGap\(scoredLeaves/)
  })

  it('the projected summary is assigned to inFlight and to nothing else', () => {
    // `projected` is the only binding holding the second schoolReadiness result;
    // it must never be read outside the inFlight object literal.
    const uses = src.match(/\bprojected\.[A-Za-z]+/g) ?? []
    expect(uses.length).toBeGreaterThan(0)
    for (const u of uses) {
      expect(['projected.projectedIndex', 'projected.band']).toContain(u)
    }
  })
})

describe('(d) EXCLUSION HONESTY — acceptance 6', () => {
  it('a target with no due date increments noDueDate, is NOT counted, and does not project', async () => {
    const noDate = await run([
      { id: 'i-a', originRef: 'a', dueDate: null, targetRubricScore: 4 },
    ])
    expect(noDate.inFlight!.excluded.noDueDate).toBe(1)
    expect(noDate.inFlight!.excluded.noTargetScore).toBe(0)
    expect(noDate.inFlight!.counted).toBe(0)
    expect(noDate.inFlight!.expectedIndexIfDelivered).toBeNull()
    // …but the work is still VISIBLE on the gap. "Nobody is on this" and
    // "somebody is on this but gave no date" are different sentences.
    const gapA = noDate.gaps.find((g) => g.standardId === 'a')!
    expect(gapA.work.initiativeCount).toBe(1)
    expect(gapA.work.nearestDueDate).toBeNull()
    expect(gapA.work.targetRubricScore).toBe(4)
  })

  it('a due date with no target level increments noTargetScore', async () => {
    const r = await run([{ id: 'i-b', originRef: 'b', dueDate: d('2027-01-31'), targetRubricScore: null }])
    expect(r.inFlight!.excluded.noTargetScore).toBe(1)
    expect(r.inFlight!.excluded.noDueDate).toBe(0)
    expect(r.inFlight!.counted).toBe(0)
  })

  it('a row missing BOTH increments both counters', async () => {
    const r = await run([{ id: 'i-b', originRef: 'b', dueDate: null, targetRubricScore: null }])
    expect(r.inFlight!.excluded).toEqual({ noTargetScore: 1, noDueDate: 1 })
  })

  it('counted + excluded describe the same population the gaps show as worked', async () => {
    const mixed: InitiativeFixture[] = [
      { id: 'i-a', originRef: 'a', dueDate: d('2027-01-31'), targetRubricScore: 4 },
      { id: 'i-b', originRef: 'b', dueDate: null, targetRubricScore: 3 },
      { id: 'i-c', originRef: 'c', dueDate: d('2027-02-28'), targetRubricScore: null },
    ]
    const r = await run(mixed)
    expect(r.inFlight!.counted).toBe(1)
    expect(r.inFlight!.excluded).toEqual({ noTargetScore: 1, noDueDate: 1 })
    const worked = r.gaps.filter((g) => g.work.initiativeCount > 0)
    expect(worked).toHaveLength(3)
  })
})

describe('gaps[].work — always present, and honest about who is on what', () => {
  it('every gap carries a work block, zeroed when nobody is working it', async () => {
    const r = await run([])
    expect(r.gaps.length).toBeGreaterThan(0)
    for (const g of r.gaps) {
      expect(g.work).toEqual({
        initiativeCount: 0,
        initiativeIds: [],
        nearestDueDate: null,
        targetRubricScore: null,
      })
    }
  })

  it('two initiatives on one gap report the NEAREST date and the HIGHEST target', async () => {
    const r = await run([
      { id: 'i-1', originRef: 'a', dueDate: d('2027-05-31'), targetRubricScore: 3 },
      { id: 'i-2', originRef: 'a', dueDate: d('2026-12-31'), targetRubricScore: 4 },
    ])
    const gapA = r.gaps.find((g) => g.standardId === 'a')!
    expect(gapA.work.initiativeCount).toBe(2)
    expect(gapA.work.initiativeIds).toEqual(['i-2', 'i-1']) // due-date order
    expect(gapA.work.nearestDueDate).toBe('2026-12-31')
    expect(gapA.work.targetRubricScore).toBe(4)
  })

  it('a FINDING-derived initiative (originRef is a findingKey) lands on no gap and projects nothing', async () => {
    const r = await run([
      { id: 'i-f', originRef: 'ACC-ASSURANCE-GAP:school', dueDate: d('2027-01-31'), targetRubricScore: 4 },
    ])
    for (const g of r.gaps) expect(g.work.initiativeCount).toBe(0)
    expect(r.inFlight!.counted).toBe(0)
    expect(r.inFlight!.expectedIndexIfDelivered).toBeNull()
  })

  it('CLOSED initiatives are excluded at the query, not filtered in memory', async () => {
    const { svc, findMany } = makeService([])
    await svc.getReadiness('school-A', {}, NOW)
    expect(findMany).toHaveBeenCalledTimes(1)
    const args = findMany.mock.calls[0][0] as { where: { status: { notIn: string[] } } }
    expect(args.where.status.notIn).toEqual(['done', 'cancelled'])
  })
})

describe('deploy-order safety — an unreadable initiative table is not a 500', () => {
  it('the accreditation hero still renders when the Phase G read throws', async () => {
    const prisma = {
      accreditationStandard: { findMany: vi.fn(async () => STANDARDS) },
      accreditationEvidence: { findMany: vi.fn(async () => EVIDENCE), groupBy: vi.fn(async () => []) },
      accreditationCatalogRequirement: { findMany: vi.fn(async () => []) },
      policy: { findMany: vi.fn(async () => []) },
      strategicPlan: { findMany: vi.fn(async () => []) },
      accreditationFramework: { findFirst: vi.fn(async () => COGNIA), findMany: vi.fn(async () => [COGNIA]) },
      accreditationCatalogStandard: { findMany: vi.fn(async () => []) },
      improvementInitiative: {
        findMany: vi.fn(async () => {
          throw new Error('relation "strategy_initiatives" does not exist')
        }),
      },
    }
    const svc = new AccreditationReadinessService(prisma as never)
    const r = await svc.getReadiness('school-A', {}, NOW)
    // The headline is unaffected — it never depended on this read.
    const clean = await run([])
    expect(r.projectedIndex).toBe(clean.projectedIndex)
    expect(r.inFlight!.counted).toBe(0)
    for (const g of r.gaps) expect(g.work.initiativeCount).toBe(0)
  })
})

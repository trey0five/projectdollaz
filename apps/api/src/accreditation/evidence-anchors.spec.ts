import { describe, expect, it, vi } from 'vitest'
import type { RequirementInput } from '@finrep/compliance'
import {
  REGISTER_DOMAIN_LABEL,
  autoLinkedNote,
  computeEvidenceCounts,
  createAnchorResolver,
  fixedWindowsFrom,
  type AnchorPrisma,
} from './evidence-anchors.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — AUTO-SATISFACTION. Prisma is hand-mocked (no DB, no Nest boot).
//
// The four things this file exists to PIN:
//   • the knowledge-document resolver NEVER returns a date (createdAt is an
//     UPLOAD date; reading it as a document date is the guess this phase bans),
//   • the policy aggregate is only as current as its most OVERDUE member,
//   • the FORWARD-DECLARED registers issue NO QUERY AT ALL (AIC Phase F took two
//     off that list by giving them resolvers; the other four must stay on it), and
//   • every read is schoolId-scoped.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-01T00:00:00.000Z')
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function req(over: Partial<RequirementInput> = {}): RequirementInput {
  return {
    tag: 'policy_manual',
    label: 'Board policy manual',
    windowMonths: null,
    windowKind: 'source_interval',
    dataAvailability: 'platform',
    sourceRegister: 'policy',
    ...over,
  }
}

function policy(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    title: 'Board Policy Manual',
    category: 'Governance',
    status: 'active',
    adoptedDate: day('2025-08-01'),
    lastReviewedDate: day('2025-08-01'),
    reviewIntervalMonths: 60,
    ...over,
  }
}

function makePrisma(over: Record<string, unknown[]> = {}) {
  const seen: Record<string, unknown[]> = {}
  const spy = (name: string, rows: unknown[], single: boolean) =>
    vi.fn(async (args: { where?: Record<string, unknown> }) => {
      seen[name] = [...(seen[name] ?? []), args]
      return single ? (rows[0] ?? null) : rows
    })
  const prisma = {
    policy: { findMany: spy('policy', over.policies ?? [], false) },
    meeting: { findFirst: spy('meeting', over.meetings ?? [], true) },
    strategicPlan: { findMany: spy('strategicPlan', over.plans ?? [], false) },
    periodBudget: { findFirst: spy('periodBudget', over.budgets ?? [], true) },
    enrollmentSnapshot: { findFirst: spy('enrollmentSnapshot', over.enrollment ?? [], true) },
    knowledgeDocument: { findMany: spy('knowledgeDocument', over.documents ?? [], false) },
    boardReport: { findFirst: spy('boardReport', over.reports ?? [], true) },
    // ── AIC Phase F ──
    maintenanceItem: { findFirst: spy('maintenanceItem', over.maintenance ?? [], true) },
    staffEvaluation: { findFirst: spy('staffEvaluation', over.evaluations ?? [], true) },
  }
  return { prisma: prisma as unknown as AnchorPrisma, raw: prisma, seen }
}

describe('the seven resolvers', () => {
  it('policy: worst-status wins, cycle delegates, counts are reported', async () => {
    const { prisma } = makePrisma({
      policies: [
        policy({ id: 'fine', title: 'Zebra Policy', reviewIntervalMonths: 60 }),
        policy({ id: 'late', title: 'Alpha Policy', reviewIntervalMonths: 6 }),
        policy({ id: 'undated', title: 'Mystery Policy', adoptedDate: null, lastReviewedDate: null }),
      ],
    })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    const art = (await r.resolve(req()))!
    // 'late' is overdue → rank 0, ahead of the current one and the unknown one.
    expect(art.sourceRef).toBe('late')
    expect(art.key).toBe('policy:late')
    expect(art.cycle).toEqual({
      kind: 'policy_review',
      adoptedDate: '2025-08-01',
      lastReviewedDate: '2025-08-01',
      reviewIntervalMonths: 6,
      status: 'active',
    })
    expect(art.effectiveDate).toBe('2025-08-01')
    expect(art.sourceCount).toBe(3)
    expect(art.undatedSourceCount).toBe(1)
    expect(art.origin).toBe('auto')
  })

  it('curriculum_review filters to a category containing "curric" (case-insensitively)', async () => {
    const curriculumReq = req({ tag: 'curriculum_review', label: 'Curriculum review record' })
    const hit = createAnchorResolver(
      makePrisma({ policies: [policy({ id: 'c', category: 'CURRICULUM & Instruction' })] }).prisma,
      'school-A',
      NOW,
    )
    expect((await hit.resolve(curriculumReq))!.sourceRef).toBe('c')

    // No such policy → nothing resolves → the requirement reads `missing`, and
    // the CTA tells the school the convention rather than pretending we can see
    // their curriculum.
    const miss = createAnchorResolver(
      makePrisma({ policies: [policy({ id: 'g', category: 'Governance' })] }).prisma,
      'school-A',
      NOW,
    )
    expect(await miss.resolve(curriculumReq)).toBeNull()
  })

  it('meeting / period_budget / enrollment_snapshot / board_report carry their own dates', async () => {
    const { prisma } = makePrisma({
      meetings: [{ id: 'm1', title: 'Board meeting', scheduledAt: day('2026-06-10') }],
      budgets: [{ id: 'b1', fiscalPeriod: { label: 'FY26', periodEndDate: day('2026-06-30') } }],
      enrollment: [{ id: 'e1', observedOn: day('2026-05-01'), totalEnrolled: 300, provider: 'manual' }],
      reports: [{ id: 'r1', reportTitle: 'Packet', generatedAt: day('2026-07-01'), createdAt: day('2026-07-02') }],
    })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    expect((await r.resolve(req({ tag: 'board_minutes', windowKind: 'fixed', windowMonths: 6, sourceRegister: 'meeting' })))!)
      .toMatchObject({ effectiveDate: '2026-06-10', cycle: null, sourceType: 'meeting' })
    expect((await r.resolve(req({ tag: 'budget', windowKind: 'fixed', windowMonths: 12, sourceRegister: 'period_budget' })))!)
      .toMatchObject({ effectiveDate: '2026-06-30' })
    expect((await r.resolve(req({ tag: 'enrollment_data', windowKind: 'fixed', windowMonths: 12, sourceRegister: 'enrollment_snapshot' })))!)
      .toMatchObject({ effectiveDate: '2026-05-01' })
    expect((await r.resolve(req({ tag: 'governance', windowKind: 'fixed', windowMonths: 12, sourceRegister: 'board_report' })))!)
      .toMatchObject({ effectiveDate: '2026-07-01' })
  })

  it('strategic_plan prefers a CURRENT adopted plan, then the latest adopted, then anything', async () => {
    const plans = [
      { id: 'expired', name: 'Plan 2020-25', status: 'adopted', fyEndYear: 2025, startDate: day('2020-07-01'), endDate: day('2025-06-30'), adoptedAt: day('2020-01-01'), createdAt: day('2020-01-01') },
      { id: 'live', name: 'Plan 2026-31', status: 'adopted', fyEndYear: 2031, startDate: day('2026-07-01'), endDate: day('2031-06-30'), adoptedAt: day('2026-01-01'), createdAt: day('2026-01-01') },
      { id: 'draft', name: 'Draft', status: 'draft', fyEndYear: 2035, startDate: null, endDate: null, adoptedAt: null, createdAt: day('2026-05-01') },
    ]
    const planReq = req({ tag: 'strategic_plan', label: 'Current strategic plan', sourceRegister: 'strategic_plan' })
    const live = createAnchorResolver(makePrisma({ plans }).prisma, 'school-A', NOW)
    expect((await live.resolve(planReq))!).toMatchObject({
      sourceRef: 'live',
      effectiveDate: '2026-07-01',
      cycle: { kind: 'plan_term', endDate: '2031-06-30' },
    })

    // Only an EXPIRED adopted plan: it still resolves, so the row reads `stale`
    // rather than vanishing into `missing`.
    const expired = createAnchorResolver(makePrisma({ plans: [plans[0], plans[2]] }).prisma, 'school-A', NOW)
    expect((await expired.resolve(planReq))!).toMatchObject({ sourceRef: 'expired' })

    // No adopted plan at all → the draft, so the school still sees what we found.
    const draftOnly = createAnchorResolver(makePrisma({ plans: [plans[2]] }).prisma, 'school-A', NOW)
    expect((await draftOnly.resolve(planReq))!).toMatchObject({ sourceRef: 'draft' })
  })

  it('THE NO-GUESS ASSERTION: knowledge_document resolves the file and returns NO date', async () => {
    const { prisma, raw } = makePrisma({
      documents: [{ id: 'd1', title: 'FY27 Audit', createdAt: day('2026-07-15') }],
    })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    const art = (await r.resolve(
      req({ tag: 'financial_audit', label: 'Annual external financial audit', windowKind: 'fixed', windowMonths: 18, sourceRegister: 'knowledge_document' }),
    ))!
    expect(art.label).toBe('FY27 Audit')
    // createdAt is an UPLOAD date. It is never an effectiveDate.
    expect(art.effectiveDate).toBeNull()
    expect(art.autoLinkedNote).toBe('Auto-linked from your document store — you never entered this.')
    const call = raw.knowledgeDocument.findMany.mock.calls[0][0] as {
      where: { OR: { title: { contains: string } }[] }
    }
    expect(call.where.OR.map((o) => o.title.contains)).toEqual(['audit'])
  })

  it('a tag with no document pattern issues no document query', async () => {
    const { prisma, raw } = makePrisma({})
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    expect(await r.resolve(req({ tag: 'governance', windowKind: 'fixed', windowMonths: 12, sourceRegister: 'knowledge_document' }))).toBeNull()
    expect(raw.knowledgeDocument.findMany).not.toHaveBeenCalled()
  })
})

describe('what does NOT run', () => {
  it('the FORWARD-DECLARED registers issue no query at all', async () => {
    // AIC Phase F removed `maintenance_item` and `staff_evaluation_register` from
    // this list — they have resolvers now. The rest MUST stay: PD and clearances
    // are Phase K, `lms` needs an integration KYRO does not have, and `portal` is
    // the accreditor's own repository. Adding one here without a resolver would let
    // a row claim a currency state nothing can compute.
    const { prisma, raw } = makePrisma({})
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    for (const register of [
      'professional_development',
      'clearance_register',
      'lms',
    ]) {
      expect(await r.resolve(req({ dataAvailability: 'intake', sourceRegister: register }))).toBeNull()
    }
    expect(await r.resolve(req({ dataAvailability: 'external', sourceRegister: 'portal' }))).toBeNull()
    expect(r.queryCount).toBe(0)
    for (const delegate of Object.values(raw)) {
      for (const fn of Object.values(delegate)) expect(fn).not.toHaveBeenCalled()
    }
  })

  it('a NON-platform requirement never reaches a resolver, even on a resolvable register', async () => {
    const { prisma, raw } = makePrisma({ policies: [policy()] })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    expect(await r.resolve(req({ dataAvailability: 'external' }))).toBeNull()
    expect(raw.policy.findMany).not.toHaveBeenCalled()
  })

  it('memoises: N requirements on one register cost ONE read', async () => {
    const { prisma, raw } = makePrisma({ policies: [policy()] })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    await r.resolve(req())
    await r.resolve(req({ tag: 'curriculum_review' }))
    await r.resolve(req())
    expect(raw.policy.findMany).toHaveBeenCalledTimes(1)
    expect(r.queryCount).toBe(1)
  })

  it('a register that THROWS degrades that row to null — never a 500', async () => {
    const prisma = {
      policy: { findMany: vi.fn(async () => { throw new Error('db down') }) },
      meeting: { findFirst: vi.fn(async () => null) },
      strategicPlan: { findMany: vi.fn(async () => []) },
      periodBudget: { findFirst: vi.fn(async () => null) },
      enrollmentSnapshot: { findFirst: vi.fn(async () => null) },
      knowledgeDocument: { findMany: vi.fn(async () => []) },
      boardReport: { findFirst: vi.fn(async () => null) },
    } as unknown as AnchorPrisma
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    await expect(r.resolve(req())).resolves.toBeNull()
  })
})

describe('enrichAttached — attaching a copy never destroys the register clock', () => {
  const attached = (over: Record<string, unknown> = {}) => ({
    key: 'policy:p1',
    origin: 'attached' as const,
    sourceType: 'policy',
    sourceRef: 'p1',
    label: 'Board Policy Manual',
    effectiveDate: null,
    expiresAt: null,
    cycle: null,
    alsoInPortal: null,
    link: '/governance',
    autoLinkedNote: null,
    ...over,
  })

  it('hands a LINKED policy row back the live review cycle it never stored', async () => {
    const { prisma, raw } = makePrisma({ policies: [policy({ reviewIntervalMonths: 6 })] })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    const out = await r.enrichAttached(attached())
    expect(out.cycle).toEqual({
      kind: 'policy_review',
      adoptedDate: '2025-08-01',
      lastReviewedDate: '2025-08-01',
      reviewIntervalMonths: 6,
      status: 'active',
    })
    expect(out.effectiveDate).toBe('2025-08-01')
    // And it rides the SAME memoised read the resolver uses.
    await r.resolve(req())
    expect(raw.policy.findMany).toHaveBeenCalledTimes(1)
  })

  it('a school-set date is never overwritten, and an unlinked/manual row is untouched', async () => {
    const { prisma } = makePrisma({ policies: [policy()] })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    const dated = await r.enrichAttached(attached({ effectiveDate: '2026-01-01' }))
    expect(dated.effectiveDate).toBe('2026-01-01')

    const manual = await r.enrichAttached(
      attached({ key: 'evidence:e1', sourceType: 'manual', sourceRef: null }),
    )
    expect(manual.cycle).toBeNull()
  })

  it('a LINKED strategic plan inherits its own term, not the resolver’s pick', async () => {
    const { prisma } = makePrisma({
      plans: [
        { id: 'live', name: 'Plan 2026-31', status: 'adopted', fyEndYear: 2031, startDate: day('2026-07-01'), endDate: day('2031-06-30'), adoptedAt: day('2026-01-01'), createdAt: day('2026-01-01') },
        { id: 'old', name: 'Plan 2020-25', status: 'adopted', fyEndYear: 2025, startDate: day('2020-07-01'), endDate: day('2025-06-30'), adoptedAt: day('2020-01-01'), createdAt: day('2020-01-01') },
      ],
    })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    const out = await r.enrichAttached(
      attached({ key: 'strategic_plan:old', sourceType: 'strategic_plan', sourceRef: 'old', label: 'Plan 2020-25' }),
    )
    expect(out.cycle).toEqual({ kind: 'plan_term', endDate: '2025-06-30' })

    // A dangling link proves nothing and invents nothing.
    const gone = await r.enrichAttached(
      attached({ key: 'strategic_plan:x', sourceType: 'strategic_plan', sourceRef: 'x' }),
    )
    expect(gone.cycle).toBeNull()
  })
})

describe('tenancy + frozen copy', () => {
  it('every read is schoolId-scoped', async () => {
    const { prisma, raw } = makePrisma({
      policies: [policy()],
      meetings: [{ id: 'm', title: 'M', scheduledAt: day('2026-01-01') }],
      plans: [{ id: 'p', name: 'P', status: 'adopted', fyEndYear: 2030, startDate: null, endDate: null, adoptedAt: null, createdAt: day('2026-01-01') }],
      budgets: [{ id: 'b', fiscalPeriod: { label: 'FY26', periodEndDate: day('2026-06-30') } }],
      enrollment: [{ id: 'e', observedOn: day('2026-01-01'), totalEnrolled: 1, provider: 'manual' }],
      documents: [{ id: 'd', title: 'audit', createdAt: day('2026-01-01') }],
      reports: [{ id: 'r', reportTitle: 'R', generatedAt: null, createdAt: day('2026-01-01') }],
    })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    await r.resolve(req())
    await r.resolve(req({ tag: 'board_minutes', windowKind: 'fixed', windowMonths: 6, sourceRegister: 'meeting' }))
    await r.resolve(req({ tag: 'strategic_plan', sourceRegister: 'strategic_plan' }))
    await r.resolve(req({ tag: 'budget', windowKind: 'fixed', windowMonths: 12, sourceRegister: 'period_budget' }))
    await r.resolve(req({ tag: 'enrollment_data', windowKind: 'fixed', windowMonths: 12, sourceRegister: 'enrollment_snapshot' }))
    await r.resolve(req({ tag: 'financial_audit', windowKind: 'fixed', windowMonths: 18, sourceRegister: 'knowledge_document' }))
    await r.resolve(req({ tag: 'governance', windowKind: 'fixed', windowMonths: 12, sourceRegister: 'board_report' }))

    for (const delegate of Object.values(raw)) {
      for (const fn of Object.values(delegate)) {
        const calls = (fn as unknown as { mock: { calls: [{ where: { schoolId: string } }][] } })
          .mock.calls
        for (const [args] of calls) expect(args.where.schoolId).toBe('school-A')
      }
    }
  })

  it('the auto-link note for policy is byte-equal to the frozen sentence', () => {
    expect(autoLinkedNote('policy')).toBe('Auto-linked from Governance — you never entered this.')
    expect(REGISTER_DOMAIN_LABEL.knowledge_document).toBe('your document store')
    expect(REGISTER_DOMAIN_LABEL.portal).toBe('your accreditor portal')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The DEFENSIBLE count — what we will and will not call stale.
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEvidenceCounts', () => {
  const countsPrisma = (policies: unknown[] = [], plans: unknown[] = []) =>
    ({
      policy: { findMany: vi.fn(async () => policies) },
      strategicPlan: { findMany: vi.fn(async () => plans) },
    }) as never

  const row = (over: Record<string, unknown> = {}) => ({
    standardId: 's1',
    sourceType: 'manual',
    sourceRef: null,
    tag: null,
    effectiveDate: null,
    expiresAt: null,
    ...over,
  })

  it('undated, unlinked evidence is NOT provably stale — it counts', async () => {
    const p = countsPrisma()
    const out = await computeEvidenceCounts(p, 'school-A', [row(), row()], new Map(), new Map(), NOW)
    expect(out.evidenceCount.get('s1')).toBe(2)
    expect(out.currentEvidenceCount.get('s1')).toBe(2)
  })

  it('the Policy / StrategicPlan reads are SKIPPED when nothing links one', async () => {
    const policies = vi.fn(async () => [])
    const plans = vi.fn(async () => [])
    await computeEvidenceCounts(
      { policy: { findMany: policies }, strategicPlan: { findMany: plans } } as never,
      'school-A',
      [row()],
      new Map(),
      new Map(),
      NOW,
    )
    expect(policies).not.toHaveBeenCalled()
    expect(plans).not.toHaveBeenCalled()
  })

  it('an OVERDUE linked policy is stale; a current one is not; a MISSING one is not', async () => {
    const overdue = await computeEvidenceCounts(
      countsPrisma([policy({ reviewIntervalMonths: 6 })]),
      'school-A',
      [row({ sourceType: 'policy', sourceRef: 'p1' })],
      new Map(),
      new Map(),
      NOW,
    )
    expect(overdue.currentEvidenceCount.get('s1') ?? 0).toBe(0)

    const fine = await computeEvidenceCounts(
      countsPrisma([policy({ reviewIntervalMonths: 60 })]),
      'school-A',
      [row({ sourceType: 'policy', sourceRef: 'p1' })],
      new Map(),
      new Map(),
      NOW,
    )
    expect(fine.currentEvidenceCount.get('s1')).toBe(1)

    // A dangling link proves nothing, so it counts.
    const dangling = await computeEvidenceCounts(
      countsPrisma([]),
      'school-A',
      [row({ sourceType: 'policy', sourceRef: 'gone' })],
      new Map(),
      new Map(),
      NOW,
    )
    expect(dangling.currentEvidenceCount.get('s1')).toBe(1)
  })

  it('an ENDED strategic plan is stale; an open-ended one is not', async () => {
    const ended = await computeEvidenceCounts(
      countsPrisma([], [{ id: 'pl1', endDate: day('2025-06-30') }]),
      'school-A',
      [row({ sourceType: 'strategic_plan', sourceRef: 'pl1' })],
      new Map(),
      new Map(),
      NOW,
    )
    expect(ended.currentEvidenceCount.get('s1') ?? 0).toBe(0)

    const open = await computeEvidenceCounts(
      countsPrisma([], [{ id: 'pl1', endDate: null }]),
      'school-A',
      [row({ sourceType: 'strategic_plan', sourceRef: 'pl1' })],
      new Map(),
      new Map(),
      NOW,
    )
    expect(open.currentEvidenceCount.get('s1')).toBe(1)
  })

  it('a fixed window only bites when the catalog actually ASKS for that tag', async () => {
    const dated = [row({ tag: 'financial_audit', effectiveDate: day('2019-06-30') })]
    const catalogOf = new Map([['s1', 'cat-1']])
    const asks = fixedWindowsFrom([
      { catalogStandardId: 'cat-1', tag: 'financial_audit', windowKind: 'fixed', windowMonths: 18, dataAvailability: 'platform' },
    ])
    const withAsk = await computeEvidenceCounts(countsPrisma(), 'school-A', dated, catalogOf, asks, NOW)
    expect(withAsk.currentEvidenceCount.get('s1') ?? 0).toBe(0)

    // SPARSENESS: no requirement row for that tag ⇒ nothing to measure against
    // ⇒ nothing is subtracted, and verifiedPct keeps its pre-Phase-C value.
    const withoutAsk = await computeEvidenceCounts(countsPrisma(), 'school-A', dated, catalogOf, new Map(), NOW)
    expect(withoutAsk.currentEvidenceCount.get('s1')).toBe(1)

    // A source_interval row is not a fixed window and never contributes one.
    expect(
      fixedWindowsFrom([
        { catalogStandardId: 'cat-1', tag: 'policy_manual', windowKind: 'source_interval', windowMonths: null, dataAvailability: 'platform' },
      ]).size,
    ).toBe(0)
  })

  it('a NON-platform requirement contributes NO window — a hole we chose not to dig never deducts', async () => {
    const dated = [row({ tag: 'self_study', effectiveDate: day('2019-06-30') })]
    const catalogOf = new Map([['s1', 'cat-1']])
    // The same 60-month ask, once as an external row and once as a platform row.
    const external = fixedWindowsFrom([
      { catalogStandardId: 'cat-1', tag: 'self_study', windowKind: 'fixed', windowMonths: 60, dataAvailability: 'external' },
    ])
    expect(external.size).toBe(0)
    const outExternal = await computeEvidenceCounts(countsPrisma(), 'school-A', dated, catalogOf, external, NOW)
    expect(outExternal.currentEvidenceCount.get('s1')).toBe(1)

    // …and intake / integration are excluded on exactly the same rule.
    for (const availability of ['intake', 'integration']) {
      expect(
        fixedWindowsFrom([
          { catalogStandardId: 'cat-1', tag: 'self_study', windowKind: 'fixed', windowMonths: 60, dataAvailability: availability },
        ]).size,
      ).toBe(0)
    }

    // The platform row DOES bite — proof the exclusion is the availability flag
    // and not the window.
    const platform = fixedWindowsFrom([
      { catalogStandardId: 'cat-1', tag: 'self_study', windowKind: 'fixed', windowMonths: 60, dataAvailability: 'platform' },
    ])
    const outPlatform = await computeEvidenceCounts(countsPrisma(), 'school-A', dated, catalogOf, platform, NOW)
    expect(outPlatform.currentEvidenceCount.get('s1') ?? 0).toBe(0)
  })

  it('an explicit expiry in the past is proof, and needs no requirement row', async () => {
    const out = await computeEvidenceCounts(
      countsPrisma(),
      'school-A',
      [row({ expiresAt: day('2025-01-01') }), row({ expiresAt: day('2030-01-01') })],
      new Map(),
      new Map(),
      NOW,
    )
    expect(out.evidenceCount.get('s1')).toBe(2)
    expect(out.currentEvidenceCount.get('s1')).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — the two registers that stopped being forward declarations.
//
// Both are AUTO-SATISFACTION in the Phase-C sense: a live read of the register
// that already owns the artifact, and NOTHING is ever written to
// AccreditationEvidence. What is new is that both anchors are REAL DATES (a
// completion, a resolution), so unlike the knowledge-document resolver these rows
// can honestly go stale.
// ─────────────────────────────────────────────────────────────────────────────

describe('AIC Phase F — the staff-evaluation resolver', () => {
  const evalReq = () =>
    req({
      tag: 'staff_evaluation',
      label: 'Staff evaluation cycle records',
      windowKind: 'fixed',
      windowMonths: 12,
      sourceRegister: 'staff_evaluation_register',
    })

  it('the most recently COMPLETED evaluation is the artifact, dated and labelled by CYCLE', async () => {
    const { prisma, raw } = makePrisma({
      evaluations: [{ id: 'e1', cycleLabel: '2025-26 annual cycle', completedDate: day('2026-05-04') }],
    })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    const art = (await r.resolve(evalReq()))!
    expect(art.sourceRef).toBe('e1')
    expect(art.label).toBe('Evaluation cycle — 2025-26 annual cycle')
    expect(art.effectiveDate).toBe('2026-05-04')
    expect(art.link).toBe('/hr')
    expect(art.autoLinkedNote).toBe('Auto-linked from HR — you never entered this.')
    // NO PERSON. The Evidence Index is visible to viewers; the register is not.
    const call = raw.staffEvaluation.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>
      select: Record<string, unknown>
      orderBy: unknown
    }
    expect(call.where.schoolId).toBe('school-A')
    expect(call.where.completedDate).toEqual({ not: null })
    expect(Object.keys(call.select).sort()).toEqual(['completedDate', 'cycleLabel', 'id'])
    expect(call.orderBy).toEqual({ completedDate: 'desc' })
  })

  it('an empty register resolves to null — never to an undated placeholder', async () => {
    const { prisma } = makePrisma({})
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    expect(await r.resolve(evalReq())).toBeNull()
  })
})

describe('AIC Phase F — the compliance-inspection resolver', () => {
  const inspectionReq = () =>
    req({
      tag: 'inspection',
      label: 'Fire / life-safety inspection record',
      windowKind: 'fixed',
      windowMonths: 12,
      sourceRegister: 'maintenance_item',
    })

  it('the newest RESOLVED kinded item is the artifact, labelled by its kind', async () => {
    const { prisma, raw } = makePrisma({
      maintenance: [
        { id: 'm1', title: 'Annual fire marshal visit', complianceKind: 'fire_life_safety', resolvedAt: day('2026-02-10') },
      ],
    })
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    const art = (await r.resolve(inspectionReq()))!
    expect(art.sourceRef).toBe('m1')
    expect(art.label).toBe('Fire / life-safety inspection — Annual fire marshal visit')
    expect(art.effectiveDate).toBe('2026-02-10')
    expect(art.link).toBe('/facilities')
    // The FILTER is the declared kind — never a match against free text.
    const call = raw.maintenanceItem.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>
    }
    expect(call.where.schoolId).toBe('school-A')
    expect(call.where.complianceKind).toEqual({ not: null })
    expect(call.where.status).toBe('resolved')
    expect(JSON.stringify(call.where)).not.toContain('title')
    expect(JSON.stringify(call.where)).not.toContain('category')
  })

  it('no kinded item resolves to null — an ordinary maintenance register is not an inspection record', async () => {
    const { prisma } = makePrisma({})
    const r = createAnchorResolver(prisma, 'school-A', NOW)
    expect(await r.resolve(inspectionReq())).toBeNull()
  })
})

describe('AIC Phase F — fixedWindowsFrom skips the MODULE-GATED rows', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    catalogStandardId: 'c1',
    tag: 'financial_audit',
    windowKind: 'fixed',
    windowMonths: 18,
    dataAvailability: 'platform',
    ...over,
  })

  it('a staff_evaluation / inspection window never enters the verifiedPct arithmetic', () => {
    // If it did, an attached DATED artifact older than twelve months would become
    // provably stale for the first time and verifiedPct would DROP for schools that
    // changed nothing and were warned of nothing. Conservative on purpose.
    const out = fixedWindowsFrom([
      row(),
      row({ tag: 'staff_evaluation', windowMonths: 12 }),
      row({ tag: 'inspection', windowMonths: 12 }),
    ])
    expect([...(out.get('c1') ?? new Map()).keys()]).toEqual(['financial_audit'])
  })

  it('recognises the gated rows by sourceRegister when the caller selects it', () => {
    const out = fixedWindowsFrom([
      row({ tag: 'safety_plan', windowMonths: 12, sourceRegister: 'knowledge_document' }),
      row({ tag: 'safety_plan', windowMonths: 12, sourceRegister: 'maintenance_item' }),
    ])
    // The knowledge-document row survives; the module-gated one does not, even
    // though they share a tag.
    expect((out.get('c1') as Map<string, number>).get('safety_plan')).toBe(12)
    const gatedOnly = fixedWindowsFrom([
      row({ tag: 'safety_plan', windowMonths: 12, sourceRegister: 'staff_evaluation_register' }),
    ])
    expect(gatedOnly.size).toBe(0)
  })

  it('every OTHER platform fixed row is unchanged', () => {
    const out = fixedWindowsFrom([
      row({ tag: 'budget', windowMonths: 12 }),
      row({ tag: 'enrollment_data', windowMonths: 12 }),
      row({ tag: 'marketing', windowMonths: 24 }),
    ])
    expect([...(out.get('c1') as Map<string, number>).entries()].sort()).toEqual([
      ['budget', 12],
      ['enrollment_data', 12],
      ['marketing', 24],
    ])
  })
})

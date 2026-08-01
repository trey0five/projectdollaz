import { describe, expect, it, vi } from 'vitest'
import { AccreditationEvidenceReadinessService } from './evidence-readiness.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — THE EVIDENCE INDEX. Prisma hand-mocked (no DB, no Nest boot).
//
// The promises pinned here are the ones a school would notice being broken:
//   • uploading a document to Knowledge moves this page with ZERO accreditation
//     interaction, and NOTHING is written to do it (acceptance 4),
//   • `not_tracked` carries a Start-tracking CTA and is excluded from both
//     `requiredTracked` and `health.rated` (acceptance 5),
//   • one artifact serving two standards is ONE group with two servesStandards,
//   • the worst gap sorts first and an honest hole sorts last,
//   • every degraded state is a complete 200 payload,
//   • query count is CONSTANT in the number of standards (no N+1).
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-01T00:00:00.000Z')
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const COGNIA = { id: 'fw-cognia', code: 'cognia_2022', name: 'Cognia Performance Standards' }

function stdRow(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    schoolId: 'school-A',
    parentId: null,
    code: 'COG-15',
    title: 'Equitable allocation of resources',
    frameworkId: 'fw-cognia',
    catalogStandardId: 'c15',
    rubricScore: null,
    ...over,
  }
}

function reqRow(over: Record<string, unknown> = {}) {
  return {
    catalogStandardId: 'c15',
    tag: 'financial_audit',
    label: 'Annual external financial audit',
    windowMonths: 18,
    windowKind: 'fixed',
    dataAvailability: 'platform',
    sourceRegister: 'knowledge_document',
    notTrackedReason: null,
    orderIndex: 0,
    ...over,
  }
}

function makeService(over: {
  standards?: unknown[]
  requirements?: unknown[]
  evidence?: unknown[]
  frameworks?: unknown[]
  documents?: unknown[]
  policies?: unknown[]
  meetings?: unknown[]
  plans?: unknown[]
  budgets?: unknown[]
  enrollment?: unknown[]
  reports?: unknown[]
  demo?: boolean
} = {}) {
  const frameworks = over.frameworks ?? [COGNIA]
  const prisma = {
    accreditationStandard: { findMany: vi.fn(async () => over.standards ?? []) },
    accreditationCatalogRequirement: { findMany: vi.fn(async () => over.requirements ?? []) },
    accreditationEvidence: {
      findMany: vi.fn(async () => over.evidence ?? []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    accreditationReadinessSnapshot: {
      findFirst: vi.fn(async () => (over.demo ? { isDemo: true } : null)),
    },
    accreditationFramework: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        (frameworks as { id: string }[]).find((f) => f.id === where.id) ?? null,
      ),
      findMany: vi.fn(async () => frameworks),
    },
    policy: { findMany: vi.fn(async () => over.policies ?? []) },
    meeting: { findFirst: vi.fn(async () => (over.meetings ?? [])[0] ?? null) },
    strategicPlan: { findMany: vi.fn(async () => over.plans ?? []) },
    periodBudget: { findFirst: vi.fn(async () => (over.budgets ?? [])[0] ?? null) },
    enrollmentSnapshot: { findFirst: vi.fn(async () => (over.enrollment ?? [])[0] ?? null) },
    knowledgeDocument: {
      // Honours the OR/contains filter, so a "Marketing plan" can never satisfy
      // the audit ask just because the mock was lazy.
      findMany: vi.fn(async (args: { where: { OR?: { title: { contains: string } }[] } }) => {
        const patterns = (args.where.OR ?? []).map((o) => o.title.contains.toLowerCase())
        const docs = (over.documents ?? []) as { title: string }[]
        return patterns.length === 0
          ? docs
          : docs.filter((d) => patterns.some((p) => d.title.toLowerCase().includes(p)))
      }),
    },
    boardReport: { findFirst: vi.fn(async () => (over.reports ?? [])[0] ?? null) },
  }
  const svc = new AccreditationEvidenceReadinessService(prisma as never)
  const callCount = () =>
    Object.values(prisma).reduce(
      (n, delegate) =>
        n +
        Object.values(delegate).reduce(
          (m, fn) => m + (fn as { mock?: { calls: unknown[] } }).mock!.calls.length,
          0,
        ),
      0,
    )
  return { svc, prisma, callCount }
}

// ── ACCEPTANCE 4 — enter data once ───────────────────────────────────────────

describe('auto-satisfaction writes NOTHING', () => {
  const base = { standards: [stdRow()], requirements: [reqRow()] }

  it('with no artifacts the group reads "No … on file." and is MISSING', async () => {
    const { svc } = makeService(base)
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups).toHaveLength(1)
    expect(res.groups[0].state).toBe('missing')
    expect(res.groups[0].message).toBe('No Annual external financial audit on file.')
    expect(res.groups[0].cta).toEqual({
      kind: 'upload',
      label: 'Upload to your document store',
      link: '/knowledge',
    })
  })

  it('uploading FY27 Audit to Knowledge moves the group missing → unknown and NAMES the file', async () => {
    const { svc, prisma } = makeService({
      ...base,
      documents: [{ id: 'd1', title: 'FY27 Audit', createdAt: day('2026-07-15') }],
    })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    const g = res.groups[0]
    expect(g.state).toBe('unknown')
    expect(g.autoSatisfied).toBe(true)
    expect(g.message).toContain('We found FY27 Audit')
    expect(g.artifacts[0].autoLinkedNote).toBe(
      'Auto-linked from your document store — you never entered this.',
    )
    expect(g.cta).toEqual({ kind: 'add_date', label: 'Which period does this cover?', link: null })
    // NOT ONE WRITE. This is the whole design.
    expect(prisma.accreditationEvidence.create).not.toHaveBeenCalled()
    expect(prisma.accreditationEvidence.update).not.toHaveBeenCalled()
  })

  it('attaching that document WITH a date flips the group to current; attached wins on collision', async () => {
    const { svc } = makeService({
      ...base,
      documents: [{ id: 'd1', title: 'FY27 Audit', createdAt: day('2026-07-15') }],
      evidence: [
        {
          id: 'e1',
          standardId: 's1',
          title: 'FY27 Audit',
          sourceType: 'knowledge_document',
          sourceRef: 'd1',
          reference: '/knowledge',
          tag: 'financial_audit',
          effectiveDate: day('2026-06-30'),
          expiresAt: null,
          alsoInPortal: null,
        },
      ],
    })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    const g = res.groups[0]
    expect(g.state).toBe('current')
    expect(g.expiresOn).toBe('2027-12-30')
    expect(g.autoSatisfied).toBe(false)
    // The auto twin was deduped away by key — one artifact, not two.
    expect(g.artifacts).toHaveLength(1)
    expect(g.artifacts[0].origin).toBe('attached')
    expect(res.health.evidenceHealthPct).toBe(100)
  })
})

// ── ACCEPTANCE 5 — honest holes ──────────────────────────────────────────────

describe('not_tracked is excluded from every denominator', () => {
  const standards = [stdRow({ id: 's1', code: 'COG-10', catalogStandardId: 'c10' })]
  const requirements = [
    reqRow({
      catalogStandardId: 'c10',
      tag: 'staff_evaluation',
      label: 'Staff evaluation cycle records',
      windowMonths: 12,
      dataAvailability: 'intake',
      sourceRegister: 'staff_evaluation_register',
      notTrackedReason: 'A four-field staff-evaluation register unlocks this.',
      orderIndex: 0,
    }),
    reqRow({ catalogStandardId: 'c10', orderIndex: 1 }),
  ]

  it('carries a Start-tracking CTA, sits LAST, and is out of requiredTracked and health.rated', async () => {
    const { svc } = makeService({ standards, requirements })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)

    const tracked = res.groups.find((g) => g.tag === 'staff_evaluation')!
    expect(tracked.state).toBe('not_tracked')
    expect(tracked.message).toBe(
      "Staff evaluation cycle records isn't tracked yet. A four-field staff-evaluation register unlocks this.",
    )
    expect(tracked.cta).toEqual({ kind: 'start_tracking', label: 'Start tracking', link: null })
    // An honest hole never buries a real gap.
    expect(res.groups[res.groups.length - 1].tag).toBe('staff_evaluation')

    expect(res.counts.requirements).toBe(2)
    expect(res.counts.requiredTracked).toBe(1)
    expect(res.health.rated).toBe(1)
    expect(res.health.notTracked).toBe(1)
    expect(res.health.basis).toBe(
      'Based on 1 of 2 required artifacts. 1 not tracked in KYRO excluded.',
    )
  })

  it('external / integration get their own CTA labels and never a fake link', async () => {
    const { svc } = makeService({
      standards,
      requirements: [
        reqRow({ catalogStandardId: 'c10', tag: 'self_study', label: 'Self-study', dataAvailability: 'external', sourceRegister: 'portal', notTrackedReason: 'The portal owns it.', orderIndex: 0 }),
        reqRow({ catalogStandardId: 'c10', tag: 'assessment_results', label: 'Assessment results', dataAvailability: 'integration', sourceRegister: 'lms', notTrackedReason: 'Needs an LMS.', orderIndex: 1 }),
      ],
    })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    const byTag = Object.fromEntries(res.groups.map((g) => [g.tag, g]))
    expect(byTag.self_study.cta).toEqual({ kind: 'start_tracking', label: 'Where this lives', link: null })
    expect(byTag.self_study.message).toContain('tracked in your accreditor portal')
    expect(byTag.assessment_results.cta).toEqual({
      kind: 'start_tracking',
      label: 'See what this needs',
      link: null,
    })
    expect(res.health.evidenceHealthPct).toBeNull() // rated === 0 → no number, a sentence
  })
})

// ── Grouping, ordering, nudges ───────────────────────────────────────────────

describe('grouped by tag, across standards', () => {
  it('one audit serving two standards is ONE group with two servesStandards', async () => {
    const { svc } = makeService({
      standards: [
        stdRow({ id: 's1', code: 'COG-15', catalogStandardId: 'c15' }),
        stdRow({ id: 's2', code: 'COG-A2', title: 'Annual external financial audit', catalogStandardId: 'cA2' }),
      ],
      requirements: [reqRow({ catalogStandardId: 'c15' }), reqRow({ catalogStandardId: 'cA2' })],
    })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups).toHaveLength(1)
    expect(res.groups[0].servesStandards.map((s) => s.code)).toEqual(['COG-15', 'COG-A2'])
    expect(res.counts.requirements).toBe(2)
    expect(res.counts.standardsWithRequirements).toBe(2)
    expect(res.counts.standardsLegacy).toBe(0)
    // …and it is rated ONCE, not twice.
    expect(res.health.rated).toBe(1)
    // ONE DENOMINATOR: the artifact counts describe the same population
    // health.basis describes, so the card can never print two totals for one
    // quantity (2 standard-level asks → 1 artifact).
    expect(res.counts.artifacts).toBe(1)
    expect(res.counts.artifactsTracked).toBe(1)
    expect(res.health.basis).toBe('Based on 1 of 1 required artifacts.')
  })

  it('worst first, then tag asc, with not_tracked always last', async () => {
    const { svc } = makeService({
      standards: [stdRow({ catalogStandardId: 'cX' })],
      requirements: [
        // missing (no document)
        reqRow({ catalogStandardId: 'cX', tag: 'financial_audit', orderIndex: 0 }),
        // current
        reqRow({ catalogStandardId: 'cX', tag: 'board_minutes', label: 'Approved board minutes', windowMonths: 6, sourceRegister: 'meeting', orderIndex: 1 }),
        // unknown (a document with no date)
        reqRow({ catalogStandardId: 'cX', tag: 'marketing', label: 'Marketing materials', windowMonths: 24, orderIndex: 2 }),
        // not_tracked
        reqRow({ catalogStandardId: 'cX', tag: 'inspection', label: 'Inspection record', windowMonths: 12, dataAvailability: 'intake', sourceRegister: 'maintenance_item', notTrackedReason: 'One field unlocks this.', orderIndex: 3 }),
      ],
      meetings: [{ id: 'm1', title: 'Board meeting', scheduledAt: day('2026-07-01') }],
      documents: [{ id: 'd1', title: 'Marketing plan', createdAt: day('2026-01-01') }],
    })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups.map((g) => `${g.tag}:${g.state}`)).toEqual([
      'financial_audit:missing',
      'marketing:unknown',
      'board_minutes:current',
      'inspection:not_tracked',
    ])
  })

  it('nudges: one per group, capped at 8, warn only for real gaps', async () => {
    const requirements = Array.from({ length: 10 }, (_, i) =>
      reqRow({ catalogStandardId: 'cX', tag: `tag_${i}`, label: `Artifact ${i}`, orderIndex: i }),
    )
    const { svc } = makeService({ standards: [stdRow({ catalogStandardId: 'cX' })], requirements })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups).toHaveLength(10)
    expect(res.nudges).toHaveLength(8)
    expect(new Set(res.nudges.map((n) => n.tag)).size).toBe(8)
    for (const n of res.nudges) {
      expect(n.kind).toBe('missing')
      expect(n.severity).toBe('warn')
    }

    // WORST FIRST, like the list underneath: a `warn` gap is never truncated by
    // the cap while an `info` "date unknown" prompt survives.
    const mixed = await makeService({
      standards: [stdRow({ catalogStandardId: 'cX' })],
      requirements: [
        // 8 undated artifacts (info) …
        ...Array.from({ length: 8 }, (_, i) =>
          reqRow({ catalogStandardId: 'cX', tag: `undated_${i}`, label: `Artifact ${i}`, windowMonths: 24, orderIndex: i }),
        ),
        // … plus one real gap (warn), alphabetically last so only the sort can
        // rescue it.
        reqRow({ catalogStandardId: 'cX', tag: 'zz_audit', orderIndex: 9 }),
      ],
      evidence: Array.from({ length: 8 }, (_, i) => ({
        id: `e${i}`,
        standardId: 's1',
        title: `Artifact ${i}`,
        sourceType: 'manual',
        sourceRef: null,
        reference: null,
        tag: `undated_${i}`,
        effectiveDate: null,
        expiresAt: null,
        alsoInPortal: null,
      })),
    }).svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(mixed.nudges).toHaveLength(8)
    expect(mixed.nudges[0]).toEqual(
      expect.objectContaining({ kind: 'missing', severity: 'warn', tag: 'zz_audit' }),
    )
    // The real gap survives the cap; the seven undated prompts fill what is left.
    expect(mixed.nudges.filter((n) => n.severity === 'warn')).toHaveLength(1)

    const info = await makeService({
      standards: [stdRow({ catalogStandardId: 'cX' })],
      requirements: [
        reqRow({ catalogStandardId: 'cX', tag: 'staff_evaluation', label: 'Evals', dataAvailability: 'intake', sourceRegister: 'staff_evaluation_register', notTrackedReason: 'x' }),
      ],
    }).svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(info.nudges).toEqual([
      expect.objectContaining({ kind: 'not_tracked', severity: 'info', tag: 'staff_evaluation' }),
    ])
  })
})

// ── The policy aggregate + the curriculum convention ─────────────────────────

describe('the frozen sub-lines', () => {
  it('the policy aggregate names its most overdue member and reports the counts', async () => {
    const { svc } = makeService({
      standards: [stdRow({ catalogStandardId: 'cP' })],
      requirements: [
        reqRow({
          catalogStandardId: 'cP',
          tag: 'policy_manual',
          label: 'Board policy manual',
          windowKind: 'source_interval',
          windowMonths: null,
          sourceRegister: 'policy',
        }),
      ],
      policies: [
        { id: 'p1', title: 'Late Policy', category: 'Governance', status: 'active', adoptedDate: day('2020-01-01'), lastReviewedDate: day('2020-01-01'), reviewIntervalMonths: 12 },
        { id: 'p2', title: 'Fine Policy', category: 'Governance', status: 'active', adoptedDate: day('2026-01-01'), lastReviewedDate: day('2026-01-01'), reviewIntervalMonths: 60 },
        { id: 'p3', title: 'Undated', category: 'HR', status: 'active', adoptedDate: null, lastReviewedDate: null, reviewIntervalMonths: 12 },
      ],
    })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    const g = res.groups[0]
    expect(g.state).toBe('stale')
    expect(g.artifacts[0].label).toBe('Late Policy (Governance)')
    expect(g.sourceCount).toBe(3)
    expect(g.undatedSourceCount).toBe(1)
    expect(g.note).toBe(
      'Your policy register is only as current as its most overdue policy. 3 active policies · 1 with no review date',
    )
    expect(g.cta).toEqual({ kind: 'review', label: 'Renew in Governance', link: '/governance' })
  })

  // ── ACCEPTANCE 3 — attaching a copy never destroys the register's clock ────
  //
  // The suggestion drawer attaches policies with sourceType 'policy' + the tag,
  // and (today) no effectiveDate. If that row erased the live review cycle, an
  // OVERDUE policy register would read "we don't know which period it covers",
  // the group would leave the health denominator, and evidenceHealthPct would go
  // UP for attaching a copy of an out-of-date document. It must not.
  describe('an attached policy cannot mask an overdue register', () => {
    const overdue = {
      id: 'p1',
      title: 'Late Policy',
      category: 'Governance',
      status: 'active',
      adoptedDate: day('2020-01-01'),
      lastReviewedDate: day('2020-01-01'),
      reviewIntervalMonths: 12,
    }
    const current = {
      id: 'p2',
      title: 'Fine Policy',
      category: 'Governance',
      status: 'active',
      adoptedDate: day('2026-01-01'),
      lastReviewedDate: day('2026-01-01'),
      reviewIntervalMonths: 60,
    }
    const policyReq = {
      standards: [stdRow({ catalogStandardId: 'cP' })],
      requirements: [
        reqRow({
          catalogStandardId: 'cP',
          tag: 'policy_manual',
          label: 'Board policy manual',
          windowKind: 'source_interval',
          windowMonths: null,
          sourceRegister: 'policy',
        }),
      ],
    }
    const attachedPolicy = (id: string) => ({
      id: `e-${id}`,
      standardId: 's1',
      title: 'Policy',
      sourceType: 'policy',
      sourceRef: id,
      reference: '/governance',
      tag: 'policy_manual',
      effectiveDate: null,
      expiresAt: null,
      alsoInPortal: null,
    })

    it('attaching the WORST policy keeps the live review status (never "date unknown")', async () => {
      const { svc } = makeService({
        ...policyReq,
        policies: [overdue, current],
        evidence: [attachedPolicy('p1')],
      })
      const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
      const g = res.groups[0]
      expect(g.state).toBe('stale')
      expect(g.basis).toBe('source_interval')
      expect(g.message).toContain('Out of date by')
      // The school's row won the identity; the register kept the clock.
      expect(g.artifacts).toHaveLength(1)
      expect(g.artifacts[0].origin).toBe('attached')
    })

    it('attaching a DIFFERENT, current policy does not hide the overdue aggregate', async () => {
      const { svc } = makeService({
        ...policyReq,
        policies: [overdue, current],
        evidence: [attachedPolicy('p2')],
      })
      const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
      // The register is ONE artifact — "only as current as its most overdue
      // policy" — so a single linked member never outranks it.
      expect(res.groups[0].state).toBe('stale')
      expect(res.groups[0].note).toContain(
        'Your policy register is only as current as its most overdue policy.',
      )
      // …and the rated row is still IN the denominator, so attaching a copy of a
      // document cannot lift evidenceHealthPct.
      expect(res.health.rated).toBe(1)
      expect(res.health.unknown).toBe(0)
      expect(res.health.evidenceHealthPct).toBe(0)
    })

    it('a linked artifact with a date still wins: the school outranks us on its own assertions', async () => {
      const { svc } = makeService({
        ...policyReq,
        policies: [overdue],
        evidence: [{ ...attachedPolicy('p1'), expiresAt: day('2030-01-01') }],
      })
      const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
      expect(res.groups[0].state).toBe('current')
      expect(res.groups[0].basis).toBe('explicit_expiry')
    })
  })

  it('curriculum_review with no Curriculum policy is MISSING and states the convention', async () => {
    const { svc } = makeService({
      standards: [stdRow({ catalogStandardId: 'cC' })],
      requirements: [
        reqRow({
          catalogStandardId: 'cC',
          tag: 'curriculum_review',
          label: 'Curriculum review record',
          windowKind: 'source_interval',
          windowMonths: null,
          sourceRegister: 'policy',
        }),
      ],
      policies: [
        { id: 'p1', title: 'Governance Policy', category: 'Governance', status: 'active', adoptedDate: day('2026-01-01'), lastReviewedDate: day('2026-01-01'), reviewIntervalMonths: 12 },
      ],
    })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups[0].state).toBe('missing')
    expect(res.groups[0].note).toBe(
      'Add a policy in Governance with the category "Curriculum" and a review interval. ' +
        "We can't see your curriculum — we can track when you last reviewed its documentation.",
    )
    expect(res.groups[0].cta).toEqual({
      kind: 'review',
      label: 'Add a Curriculum policy',
      link: '/governance',
    })
  })
})

// ── Degraded states + tenancy + N+1 ──────────────────────────────────────────

describe('every degraded state is a complete 200', () => {
  it('no standards at all', async () => {
    const res = await makeService().svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.framework).toBeNull()
    expect(res.groups).toEqual([])
    expect(res.nudges).toEqual([])
    expect(res.health.evidenceHealthPct).toBeNull()
    expect(res.counts).toEqual({
      artifacts: 0,
      artifactsTracked: 0,
      requirements: 0,
      requiredTracked: 0,
      standardsWithRequirements: 0,
      standardsLegacy: 0,
    })
    expect(res.disclaimer).toContain('Not an accreditation product')
  })

  it('SPARSENESS: standards with ZERO requirement rows are counted as legacy and produce no groups', async () => {
    const { svc } = makeService({ standards: [stdRow(), stdRow({ id: 's2', code: 'COG-1', catalogStandardId: 'c1' })] })
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups).toEqual([])
    expect(res.counts.standardsLegacy).toBe(2)
    expect(res.counts.standardsWithRequirements).toBe(0)
  })

  it('a register that throws degrades to missing, never a 500', async () => {
    const { svc, prisma } = makeService({ standards: [stdRow()], requirements: [reqRow()] })
    prisma.knowledgeDocument.findMany.mockRejectedValue(new Error('db down'))
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups[0].state).toBe('missing')
  })

  it('a pre-migration image (requirement table absent) behaves exactly as sparse', async () => {
    const { svc, prisma } = makeService({ standards: [stdRow()] })
    prisma.accreditationCatalogRequirement.findMany.mockRejectedValue(new Error('relation missing'))
    const res = await svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(res.groups).toEqual([])
    expect(res.counts.requirements).toBe(0)
  })

  it('demoData rides the recorded series flag', async () => {
    expect((await makeService({ demo: true }).svc.getEvidenceReadiness('school-A', {}, NOW)).demoData).toBe(true)
    expect((await makeService({}).svc.getEvidenceReadiness('school-A', {}, NOW)).demoData).toBe(false)
  })
})

describe('tenancy and query shape', () => {
  it('every read is schoolId-scoped', async () => {
    const { svc, prisma } = makeService({
      standards: [stdRow()],
      requirements: [reqRow()],
      documents: [{ id: 'd1', title: 'FY27 Audit', createdAt: day('2026-07-15') }],
    })
    await svc.getEvidenceReadiness('school-A', {}, NOW)
    for (const name of ['accreditationStandard', 'accreditationEvidence', 'knowledgeDocument'] as const) {
      const calls = prisma[name].findMany.mock.calls as unknown as [
        { where: { schoolId: string } },
      ][]
      for (const [args] of calls) expect(args.where.schoolId).toBe('school-A')
    }
    const demoCalls = prisma.accreditationReadinessSnapshot.findFirst.mock.calls as unknown as [
      { where: { schoolId: string } },
    ][]
    expect(demoCalls[0][0].where.schoolId).toBe('school-A')
  })

  it('NO N+1: the query count is CONSTANT in the number of standards', async () => {
    const requirements = [reqRow({ catalogStandardId: 'cA' }), reqRow({ catalogStandardId: 'cB', tag: 'budget', label: 'Budget', windowMonths: 12, sourceRegister: 'period_budget' })]
    const two = makeService({
      standards: [stdRow({ id: 's1', catalogStandardId: 'cA' }), stdRow({ id: 's2', code: 'COG-A2', catalogStandardId: 'cB' })],
      requirements,
    })
    await two.svc.getEvidenceReadiness('school-A', {}, NOW)
    const small = two.callCount()

    const many = makeService({
      standards: Array.from({ length: 40 }, (_, i) =>
        stdRow({ id: `s${i}`, code: `COG-${i}`, catalogStandardId: i % 2 === 0 ? 'cA' : 'cB' }),
      ),
      requirements,
    })
    await many.svc.getEvidenceReadiness('school-A', {}, NOW)
    expect(many.callCount()).toBe(small)
    // And the whole page stays inside a small, bounded budget.
    expect(small).toBeLessThanOrEqual(14)
  })
})

// ── The commendations feed ───────────────────────────────────────────────────

describe('getCurrencyByStandard', () => {
  it('keys the SAME computation by school standard, so the two surfaces cannot drift', async () => {
    const { svc } = makeService({
      standards: [
        stdRow({ id: 's1', code: 'COG-15', catalogStandardId: 'c15' }),
        stdRow({ id: 's2', code: 'COG-A2', catalogStandardId: 'cA2' }),
      ],
      requirements: [reqRow({ catalogStandardId: 'c15' }), reqRow({ catalogStandardId: 'cA2' })],
      documents: [{ id: 'd1', title: 'FY27 Audit', createdAt: day('2026-07-15') }],
      evidence: [
        {
          id: 'e1',
          standardId: 's1',
          title: 'FY27 Audit',
          sourceType: 'knowledge_document',
          sourceRef: 'd1',
          reference: '/knowledge',
          tag: 'financial_audit',
          effectiveDate: day('2026-06-30'),
          expiresAt: null,
          alsoInPortal: null,
        },
      ],
    })
    const { byStandard, framework } = await svc.getCurrencyByStandard('school-A', {}, NOW)
    expect(framework?.code).toBe('cognia_2022')
    expect(byStandard.s1.map((c) => c.state)).toEqual(['current'])
    // The same pooled artifact answers BOTH standards — enter data once.
    expect(byStandard.s2.map((c) => c.state)).toEqual(['current'])
  })
})

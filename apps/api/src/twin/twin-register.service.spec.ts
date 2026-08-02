import { describe, expect, it, vi } from 'vitest'
import { TwinRegisterService } from './twin-register.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — the REGISTER VIEW.
//
// The properties that matter, and the defect each one prevents:
//
//   • FAIL-SOFT PER SOURCE. A degraded evidence read must cost the evidence
//     slice, not the whole view — because a rule handed an empty register reports
//     `no_standards` HONESTLY, whereas a 500 tells a school nothing at all.
//
//   • ASSURANCE SATISFACTION IS NULL WHEN WE CANNOT SAY. `false` would read as
//     "an unmet gate", and ACC-ASSURANCE-GAP is a standing `critical`. Guessing
//     here would manufacture the most severe finding in the catalog out of a
//     degraded read.
//
//   • ONE DOMAIN-WEIGHT AUTHORITY. The weights come from `buildDomainMap`, fed
//     from the catalog columns the standards read ALREADY resolved — no second
//     query, and no second copy of the >= 0.5 rule.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-01T04:00:00.000Z')

function standard(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    code: 'COG-15',
    title: 'Equitable allocation of resources',
    evidenceCount: 2,
    rubricScore: 3,
    isAssurance: false,
    catalogStandardId: 'c15',
    domainKey: 'finance',
    domainWeights: null,
    signalKeys: ['operating_margin'],
    ...over,
  }
}

function harness(over: {
  standards?: Record<string, unknown>[] | null
  assurances?: { standardId: string; satisfied: boolean }[]
  readinessThrows?: boolean
  evidenceThrows?: boolean
  groups?: Record<string, unknown>[]
  byStandard?: Record<string, unknown[]>
  // ── AIC Phase F ──
  staffEvaluations?: Record<string, unknown>[]
  staffThrows?: boolean
  maintenance?: Record<string, unknown>[]
  priorVisit?: Record<string, unknown>[]
  priorVisitThrows?: boolean
} = {}) {
  const accreditation = {
    listStandards: vi.fn(async () => {
      if (over.standards === null) throw new Error('register down')
      return { standards: over.standards ?? [standard()], summary: {}, ratingSummary: null }
    }),
  }
  const readiness = {
    getReadiness: vi.fn(async () => {
      if (over.readinessThrows) throw new Error('readiness down')
      return { framework: { id: 'fw', code: 'cognia_2022', name: 'Cognia' }, assurances: over.assurances ?? [] }
    }),
  }
  const evidenceReadiness = {
    getCurrencyByStandard: vi.fn(async () => ({
      byStandard: over.byStandard ?? {},
      framework: null,
      demoData: false,
    })),
    getEvidenceReadiness: vi.fn(async () => {
      if (over.evidenceThrows) throw new Error('evidence down')
      return {
        framework: { id: 'fw', code: 'cognia_2022', name: 'Cognia' },
        groups: over.groups ?? [],
        demoData: false,
      }
    }),
  }
  const prisma = {
    accreditationReadinessSnapshot: {
      findFirst: vi.fn(async () => ({ snapshotDate: new Date('2026-07-31T00:00:00Z') })),
    },
    staffEvaluation: {
      findMany: vi.fn(async () => {
        if (over.staffThrows) throw new Error('staff register down')
        return over.staffEvaluations ?? []
      }),
    },
    maintenanceItem: { findMany: vi.fn(async () => over.maintenance ?? []) },
    priorVisitFinding: {
      findMany: vi.fn(async () => {
        if (over.priorVisitThrows) throw new Error('prior-visit register down')
        return over.priorVisit ?? []
      }),
    },
  }
  return {
    svc: new TwinRegisterService(
      prisma as never,
      accreditation as never,
      readiness as never,
      evidenceReadiness as never,
    ),
    prisma,
    accreditation,
  }
}

describe('TwinRegisterService — the shape', () => {
  it('projects both axes and stamps the snapshot date it actually has', async () => {
    const h = harness({
      groups: [
        {
          tag: 'financial_audit',
          label: 'Annual external financial audit',
          state: 'stale',
          dataAvailability: 'platform',
          expiresOn: '2025-12-31',
          daysUntilExpiry: -213,
          servesStandards: [{ standardId: 's1', code: 'COG-15', title: 't', state: 'stale', expiresOn: null }],
        },
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.frameworkCode).toBe('cognia_2022')
    expect(register.standards).toHaveLength(1)
    expect(register.evidenceGroups).toHaveLength(1)
    expect(register.snapshotAsOf).toBe('2026-07-31')
    expect(register.evidenceGroups[0].servesStandards).toEqual([{ standardId: 's1', code: 'COG-15' }])
  })

  it('carries the catalog bindings the Standard Drawer already renders', async () => {
    const h = harness()
    const { register, weights } = await h.svc.build('school-A', NOW)
    expect(register.standards[0].boundMetricKeys).toEqual(['operating_margin'])
    expect(register.standards[0].domainKeys).toEqual(['finance'])
    expect(register.standards[0].primaryDomainKey).toBe('finance')
    // Keyed by BOTH id and code, so a rule may tag either way.
    expect(weights['s1']).toBeDefined()
    expect(weights['COG-15']).toBe(weights['s1'])
  })

  it('projects the per-standard requirement currency', async () => {
    const h = harness({
      byStandard: {
        s1: [
          {
            tag: 'financial_audit',
            label: 'Audit',
            state: 'stale',
            dataAvailability: 'platform',
            expiresOn: '2025-12-31',
            daysUntilExpiry: -213,
          },
        ],
      },
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.standards[0].requirements).toEqual([
      {
        tag: 'financial_audit',
        label: 'Audit',
        state: 'stale',
        dataAvailability: 'platform',
        expiresOn: '2025-12-31',
        daysUntilExpiry: -213,
      },
    ])
  })
})

describe('TwinRegisterService — assurance satisfaction is never guessed', () => {
  it('null for a NON-assurance — false would read as an unmet gate', async () => {
    const h = harness({ standards: [standard({ isAssurance: false })] })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.standards[0].isAssurance).toBe(false)
    expect(register.standards[0].assuranceSatisfied).toBeNull()
  })

  it('the computed result for an assurance the readiness read could resolve', async () => {
    const h = harness({
      standards: [standard({ id: 'a1', code: 'COG-A2', isAssurance: true })],
      assurances: [{ standardId: 'a1', satisfied: false }],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.standards[0].assuranceSatisfied).toBe(false)
  })

  it('NULL when the readiness read was degraded — a standing critical is never manufactured', async () => {
    const h = harness({
      standards: [standard({ id: 'a1', code: 'COG-A2', isAssurance: true })],
      readinessThrows: true,
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.standards[0].isAssurance).toBe(true)
    expect(register.standards[0].assuranceSatisfied).toBeNull()
  })
})

describe('TwinRegisterService — fail-soft', () => {
  it('a standards failure yields an EMPTY-but-COMPLETE view, never a throw', async () => {
    const h = harness({ standards: null })
    const { register, weights } = await h.svc.build('school-A', NOW)
    expect(register.standards).toEqual([])
    expect(register.evidenceGroups).toEqual([])
    expect(register.frameworkCode).toBeNull()
    expect(weights).toEqual({})
  })

  it('distinguishes a FAILED standards read from a school that genuinely has none', async () => {
    // Both produce an empty register, and they are not the same fact: the first
    // makes every rule refuse for want of a standard code, which the nightly
    // sweep must never read as "everything stopped firing".
    expect((await harness({ standards: null }).svc.build('school-A', NOW)).registerAvailable).toBe(
      false,
    )
    expect((await harness({ standards: [] }).svc.build('school-A', NOW)).registerAvailable).toBe(
      true,
    )
    expect((await harness().svc.build('school-A', NOW)).registerAvailable).toBe(true)
  })

  it('an EVIDENCE failure costs the evidence slice only', async () => {
    const h = harness({ evidenceThrows: true })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.standards).toHaveLength(1)
    expect(register.evidenceGroups).toEqual([])
    // The framework still resolves from the readiness read.
    expect(register.frameworkCode).toBe('cognia_2022')
  })

  it('a snapshot read failure is a null date, not a failed build', async () => {
    const h = harness()
    h.prisma.accreditationReadinessSnapshot.findFirst = vi.fn(async () => {
      throw new Error('nope')
    }) as never
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.snapshotAsOf).toBeNull()
    expect(register.standards).toHaveLength(1)
  })

  it('a Phase-F register failure is a REFUSAL shape, never a zero', async () => {
    // The distinction the rules turn on: `null` makes HR-EVAL-OVERDUE refuse
    // `value_not_usable`, while `{overdueCount: 0}` would be a silent PASS composed
    // out of a database that did not answer.
    const h = harness({ staffThrows: true, priorVisitThrows: true })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.staffEvaluations).toBeNull()
    expect(register.priorVisitCitations).toEqual([])
    // …and the rest of the view is untouched.
    expect(register.standards).toHaveLength(1)
  })

  it('a framework the rule catalog carries no codes for resolves to null, never to a guess', async () => {
    const h = harness()
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.frameworkCode).toBe('cognia_2022')

    const other = harness()
    other.svc = new TwinRegisterService(
      { accreditationReadinessSnapshot: { findFirst: async () => null } } as never,
      { listStandards: async () => ({ standards: [standard()] }) } as never,
      { getReadiness: async () => ({ framework: { code: 'aisne_2019' }, assurances: [] }) } as never,
      {
        getCurrencyByStandard: async () => ({ byStandard: {}, framework: null, demoData: false }),
        getEvidenceReadiness: async () => ({ framework: null, groups: [], demoData: false }),
      } as never,
    )
    expect((await other.svc.build('school-A', NOW)).register.frameworkCode).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — the three fields the new rules read.
//
// The one that carries the most risk is the CITATION MATCH. `citedStandardCode` is
// free text lifted from a PDF, and the only defensible rule is exact equality after
// trim + uppercase: a citation matched to the WRONG standard is worse than an
// unmatched one, and G3 forbids a finding that cannot name a real code. So an
// unmatched citation never reaches the engine at all — it is returned, marked
// unmatched, by the register endpoint instead (never dropped from the product).
// ─────────────────────────────────────────────────────────────────────────────

const CITED = (over: Record<string, unknown> = {}) => ({
  visitDate: new Date('2021-03-04T00:00:00Z'),
  status: 'open',
  citedStandardCode: 'COG-15',
  ...over,
})

describe('TwinRegisterService — AIC Phase F citation matching', () => {
  it('matches ONLY on exact equality after trim + uppercase', async () => {
    const h = harness({
      priorVisit: [
        CITED({ citedStandardCode: 'COG-15' }),
        CITED({ citedStandardCode: '  cog-15  ' }),
        CITED({ citedStandardCode: 'COG-1' }), // prefix — NOT a match
        CITED({ citedStandardCode: 'COG-155' }), // extension — NOT a match
        CITED({ citedStandardCode: '15' }), // suffix — NOT a match
        CITED({ citedStandardCode: 'COG 15' }), // separator — NOT a match
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.priorVisitCitations).toHaveLength(1)
    expect(register.priorVisitCitations[0]).toEqual({
      // The SCHOOL STANDARD's code, verbatim — not the normalised form.
      code: 'COG-15',
      visitDate: '2021-03-04',
      openCount: 2,
    })
  })

  // ── THE GROUPING KEY IS (code, visit), and the count must never span visits ──
  //
  // The rule this feeds renders "{{openCount}} citations against {{code}} from the
  // visit of {{visitDate}}". Grouping by code alone and keeping the NEWEST date
  // made that sentence false the moment a school was cited on one standard at two
  // visits: the older team's citation was attributed to the newer visit. That is
  // the Phase-E "fell in each of N readings" class, said about the one register
  // that is meant to be ground truth, and it propagates verbatim into the briefing.
  it('a standard cited at TWO visits produces TWO groups — a count never spans visits', async () => {
    const h = harness({
      priorVisit: [
        CITED({ visitDate: new Date('2015-01-01T00:00:00Z') }),
        CITED({ visitDate: new Date('2021-03-04T00:00:00Z') }),
        CITED({ visitDate: new Date('2024-09-09T00:00:00Z'), status: 'closed' }),
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.priorVisitCitations).toEqual([
      { code: 'COG-15', visitDate: '2015-01-01', openCount: 1 },
      { code: 'COG-15', visitDate: '2021-03-04', openCount: 1 },
    ])
    // Every group's count belongs to the ONE visit it names.
    for (const g of register.priorVisitCitations) expect(g.openCount).toBe(1)
  })

  it('CLOSED citations are not open ones, and citations of ONE visit still merge', async () => {
    const h = harness({
      priorVisit: [
        CITED({ visitDate: new Date('2021-03-04T00:00:00Z') }),
        CITED({ visitDate: new Date('2021-03-04T00:00:00Z') }),
        CITED({ visitDate: new Date('2024-09-09T00:00:00Z'), status: 'closed' }),
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.priorVisitCitations).toEqual([
      { code: 'COG-15', visitDate: '2021-03-04', openCount: 2 },
    ])
  })

  it('a school with a visit history and nothing open is a PASS, not a refusal', async () => {
    const h = harness({ priorVisit: [CITED({ status: 'closed' })] })
    const { register } = await h.svc.build('school-A', NOW)
    // Empty, not null: the SIGNAL is what gates the rule, and it will read
    // `available`. An empty array here is "you have a history and nothing is open".
    expect(register.priorVisitCitations).toEqual([])
  })

  it('is sorted by code, because the reconciliation hashes this payload', async () => {
    const h = harness({
      standards: [
        standard({ id: 's1', code: 'COG-15' }),
        standard({ id: 's2', code: 'COG-A3', catalogStandardId: 'cA3' }),
        standard({ id: 's3', code: 'COG-10', catalogStandardId: 'c10' }),
      ],
      priorVisit: [
        CITED({ citedStandardCode: 'COG-A3' }),
        CITED({ citedStandardCode: 'COG-15' }),
        CITED({ citedStandardCode: 'COG-10' }),
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.priorVisitCitations.map((c) => c.code)).toEqual(['COG-10', 'COG-15', 'COG-A3'])
  })

  it('…then by visit date within a code, oldest first', async () => {
    const h = harness({
      priorVisit: [
        CITED({ visitDate: new Date('2021-03-04T00:00:00Z') }),
        CITED({ visitDate: new Date('2015-01-01T00:00:00Z') }),
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.priorVisitCitations.map((c) => c.visitDate)).toEqual(['2015-01-01', '2021-03-04'])
  })
})

describe('TwinRegisterService — AIC Phase F register summaries', () => {
  const evaluation = (over: Record<string, unknown> = {}) => ({
    dueDate: new Date('2026-01-01T00:00:00Z'),
    completedDate: null,
    status: 'scheduled',
    ...over,
  })

  it('the staff summary is THREE INTEGERS, and the oldest is measured from its own due date', async () => {
    const h = harness({
      staffEvaluations: [
        evaluation({ dueDate: new Date('2026-06-01T00:00:00Z') }), // 61 days past
        evaluation({ dueDate: new Date('2026-07-25T00:00:00Z') }), // 7 days past
        evaluation({ dueDate: new Date('2026-12-01T00:00:00Z') }), // not yet due
        evaluation({ completedDate: new Date('2026-05-01T00:00:00Z'), status: 'in_progress' }),
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.staffEvaluations).toEqual({
      registerSize: 4,
      overdueCount: 2,
      oldestOverdueDays: 61,
    })
  })

  it('an EMPTY staff register is null — the rule refuses rather than reading zero', async () => {
    const h = harness({ staffEvaluations: [] })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.staffEvaluations).toBeNull()
  })

  it('overdue KINDS come back in the frozen vocabulary order, never in row order', async () => {
    const item = (over: Record<string, unknown> = {}) => ({
      status: 'open',
      targetDate: new Date('2026-06-01T00:00:00Z'),
      complianceKind: 'health',
      ...over,
    })
    const h = harness({
      maintenance: [
        item({ complianceKind: 'playground' }),
        item({ complianceKind: 'boiler', targetDate: new Date('2026-01-15T00:00:00Z') }),
        item({ complianceKind: 'health' }),
        // Resolved → not overdue, but still TRACKED.
        item({ complianceKind: 'elevator', status: 'resolved' }),
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.complianceInspections).toEqual({
      trackedCount: 4,
      overdueCount: 3,
      oldestOverdueDays: 198,
      // MAINTENANCE_COMPLIANCE_KINDS order: boiler, health, playground.
      overdueKinds: ['boiler', 'health', 'playground'],
      // …and `boiler` is in the life-safety subset, which is the ONLY thing this
      // flag drives (the finding's severity).
      anyLifeSafety: true,
    })
  })

  it('anyLifeSafety is false when nothing overdue is in the subset', async () => {
    const h = harness({
      maintenance: [
        {
          status: 'open',
          targetDate: new Date('2026-06-01T00:00:00Z'),
          complianceKind: 'water_quality',
        },
      ],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.complianceInspections?.anyLifeSafety).toBe(false)
    expect(register.complianceInspections?.overdueKinds).toEqual(['water_quality'])
  })

  it('the summaries SURVIVE an empty standards register, and citations do not', async () => {
    // They describe HR and facilities, not accreditation. Nothing can fire off them
    // without a standard code (G3), but a truthful summary is not thrown away.
    const h = harness({
      standards: [],
      staffEvaluations: [{ dueDate: new Date('2020-01-01T00:00:00Z'), completedDate: null, status: 'scheduled' }],
      priorVisit: [CITED()],
    })
    const { register } = await h.svc.build('school-A', NOW)
    expect(register.staffEvaluations?.overdueCount).toBe(1)
    expect(register.priorVisitCitations).toEqual([])
  })
})

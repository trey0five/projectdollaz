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

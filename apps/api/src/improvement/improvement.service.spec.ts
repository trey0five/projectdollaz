import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@finrep/db'
import { ADOPT_REUSED, ImprovementService } from './improvement.service.js'
import { rollUpInitiatives } from '../strategy/initiative-rollup.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — THE BACK-COMPAT CONTRACT, AND THE THINGS THAT MUST NOT MOVE.
//
// `progressSource = null` reads as "status only". Every initiative that existed
// before this phase has that shape, so this is not a corner case — it is what the
// feature looks like on the day it ships, for every school. The pins here are:
//
//   • a legacy row shows NO percentage, not 0% (a 0 that means "we do not measure
//     this" is a lie a head of school would act on);
//   • `summary.meanProgressPct` is null rather than 0 when nothing is measured;
//   • `counts` is the SHARED `rollUpInitiatives` counter, so an initiative cannot
//     be "blocked" on /strategy and "planned" on /improvement;
//   • adopting the same recommendation twice returns the SAME initiative.
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL = 'school-1'
const ASOF = new Date('2026-07-31T00:00:00.000Z')

interface RowOverrides {
  id: string
  status?: string
  progressSource?: string | null
  manualProgressPct?: number | null
  updatedAt?: Date
  dueDate?: Date | null
  goalId?: string | null
  milestones?: unknown
  ownerUserId?: string | null
  startDate?: Date | null
  originRef?: string | null
}

/** A row shaped exactly like a PRE-Phase-G one: every new column null/default. */
function legacyRow(o: RowOverrides) {
  return {
    id: o.id,
    schoolId: SCHOOL,
    goalId: o.goalId === undefined ? 'goal-1' : o.goalId,
    title: `Initiative ${o.id}`,
    description: null,
    status: o.status ?? 'planned',
    orderIndex: 0,
    ownerUserId: o.ownerUserId ?? null,
    owner: o.ownerUserId ? { id: o.ownerUserId, firstName: 'Jo', lastName: 'Ruiz', email: 'jo@s.test' } : null,
    goal: o.goalId === null ? null : { id: 'goal-1', title: 'A goal', pillar: { name: 'A pillar' } },
    originType: 'manual',
    originRef: o.originRef ?? null,
    findingKey: null,
    startDate: o.startDate ?? null,
    dueDate: o.dueDate ?? null,
    completedAt: null,
    progressSource: o.progressSource ?? null,
    milestones: o.milestones ?? null,
    manualProgressPct:
      o.manualProgressPct == null ? null : new Prisma.Decimal(o.manualProgressPct),
    metricKey: null,
    targetValue: null,
    baselineValue: null,
    baselineDate: null,
    baselineMetricPeriodId: null,
    lastProgressAt: null,
    riskLevel: null,
    riskNote: null,
    targetRubricScore: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: o.updatedAt ?? new Date('2026-07-30T00:00:00.000Z'),
  }
}

function makeService(opts: {
  rows?: ReturnType<typeof legacyRow>[]
  findings?: unknown[]
  /** What `improvementInitiative.findFirst` returns on the adopt dedupe probe. */
  existingAdopted?: unknown
  /** Readiness gaps/assurances/framework, as the accreditation engine would answer. */
  readiness?: Record<string, unknown>
  /** Which module keys this school licenses. DEFAULT: accreditation, as before. */
  licensed?: string[]
  /** Make the billing lookup throw, to pin the fail-CLOSED direction. */
  billingThrows?: boolean
} = {}) {
  const rows = opts.rows ?? []
  const created: unknown[] = []
  const findFirst = vi.fn(async () => opts.existingAdopted ?? null)
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
    const row = { ...legacyRow({ id: `new-${created.length + 1}` }), ...args.data, id: `new-${created.length + 1}` }
    created.push(row)
    return row
  })
  const updateMany = vi.fn(async () => ({ count: 1 }))
  const prisma = {
    improvementInitiative: {
      findMany: vi.fn(async () => rows),
      findFirst,
      create,
      update: vi.fn(async () => rows[0]),
      delete: vi.fn(async () => rows[0]),
    },
    improvementProgressEvent: { findMany: vi.fn(async () => []), upsert: vi.fn() },
    accreditationFinding: { findMany: vi.fn(async () => opts.findings ?? []), updateMany },
    accreditationStandard: { findMany: vi.fn(async () => []) },
    accreditationCatalogStandard: { findMany: vi.fn(async () => []) },
    strategyGoal: { findFirst: vi.fn(async () => ({ id: 'goal-1' })) },
    membership: { findFirst: vi.fn(async () => ({ id: 'm1' })) },
    task: { groupBy: vi.fn(async () => []) },
  }
  const audit = { write: vi.fn(async () => undefined) }
  const progress = {
    resolveCurrentMetrics: vi.fn(async () => null),
    resolveCurrentMetric: vi.fn(async () => null),
  }
  const readiness = {
    getReadiness: vi.fn(async () => opts.readiness ?? { gaps: [], assurances: [], framework: null }),
  }
  const licensed = opts.licensed ?? ['accreditation']
  const isEntitledForModule = vi.fn(async (_schoolId: string, key: string) => {
    if (opts.billingThrows) throw new Error('subscription row unreadable')
    return licensed.includes(key)
  })
  const billing = { isEntitledForModule }
  const svc = new ImprovementService(
    prisma as never,
    audit as never,
    progress as never,
    readiness as never,
    billing as never,
  )
  return { svc, prisma, audit, findFirst, create, updateMany, created, readiness, isEntitledForModule }
}

describe('acceptance 3 — a legacy row reads EXACTLY as it did before Phase G', () => {
  it('no percentage, "Status only", no pace, no projection, no rollup weight', async () => {
    const { svc } = makeService({ rows: [legacyRow({ id: 'i1' })] })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    const v = out.initiatives[0]
    expect(v.progressSource).toBeNull()
    expect(v.progressPct).toBeNull()
    expect(v.progressBasis).toBe('Status only')
    expect(v.paceStatus).toBe('no_data')
    expect(v.projectedCompletionDate).toBeNull()
    expect(v.projectionReason).toBe('This initiative reports status only, so nothing can be projected.')
    expect(v.countsTowardRollup).toBe(false)
    // The HUMAN risk column stays null. It is NOT backfilled from riskSignal.
    expect(v.riskLevel).toBeNull()
    expect(v.riskSignal).toBe('none')
  })

  it('meanProgressPct is NULL when nothing is measured — never 0', async () => {
    const { svc } = makeService({
      rows: [legacyRow({ id: 'i1' }), legacyRow({ id: 'i2', status: 'in_progress' })],
    })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    expect(out.summary.meanProgressPct).toBeNull()
    expect(out.summary.statusOnly).toBe(2)
    expect(out.summary.total).toBe(2)
  })

  it('a HAND-SET percentage still does not move the mean — manual is quarantined', async () => {
    const { svc } = makeService({
      rows: [
        legacyRow({ id: 'i1' }),
        legacyRow({ id: 'i2', progressSource: 'manual', manualProgressPct: 0.8 }),
      ],
    })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    // The row itself reports its 80%…
    expect(out.initiatives.find((v) => v.id === 'i2')?.progressPct).toBeCloseTo(0.8, 9)
    // …and it contributes NOTHING to any aggregate. This is the guarantee Phase I
    // needs in order not to get "manual never feeds an org score" wrong later.
    expect(out.summary.meanProgressPct).toBeNull()
  })

  it('a MEASURED row does move the mean, so the null above is not dead code', async () => {
    const { svc } = makeService({
      rows: [
        legacyRow({ id: 'i1' }),
        legacyRow({
          id: 'i2',
          progressSource: 'milestone',
          milestones: [
            { id: 'm1', label: 'A', done: true },
            { id: 'm2', label: 'B', done: false },
          ],
        }),
      ],
    })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    expect(out.summary.meanProgressPct).toBeCloseTo(0.5, 9)
  })

  it('initiativeStatusCounts is the SHARED counter, not a second implementation', async () => {
    const rows = [
      legacyRow({ id: 'i1', status: 'planned' }),
      legacyRow({ id: 'i2', status: 'in_progress' }),
      legacyRow({ id: 'i3', status: 'blocked' }),
      legacyRow({ id: 'i4', status: 'done' }),
      legacyRow({ id: 'i5', status: 'cancelled' }),
      legacyRow({ id: 'i6', status: 'in_progress' }),
    ]
    const { svc } = makeService({ rows })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    // Asserted against `rollUpInitiatives` DIRECTLY — the same function the plan
    // traversal calls — rather than against a hand-written expectation, so the two
    // surfaces cannot drift apart while both stay green.
    const { initiativeStatusCounts } = rollUpInitiatives(rows, new Map(), ASOF)
    expect(out.counts).toEqual(initiativeStatusCounts)
    expect(out.counts).toEqual({ planned: 1, in_progress: 2, blocked: 1, done: 1, cancelled: 1 })
  })
})

describe('acceptance 2 — the flat read is GOAL-AGNOSTIC', () => {
  it('a goal-less row is returned, with null goal fields rather than a crash', async () => {
    const { svc, prisma } = makeService({
      rows: [legacyRow({ id: 'i1', goalId: null }), legacyRow({ id: 'i2' })],
    })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    expect(out.initiatives).toHaveLength(2)
    const goalless = out.initiatives.find((v) => v.id === 'i1')!
    expect(goalless.goalId).toBeNull()
    expect(goalless.goalTitle).toBeNull()
    expect(goalless.pillarName).toBeNull()
    // The query is school-scoped and names no goal — a goal filter here would
    // silently hide exactly the rows this phase exists to create.
    const where = (prisma.improvementInitiative.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ])[0].where
    expect(where).toEqual({ schoolId: SCHOOL })
  })

  it('the linked-task rollup queries by the FLAT id list, with sourceType strategy', async () => {
    const { svc, prisma } = makeService({ rows: [legacyRow({ id: 'i1', goalId: null })] })
    await svc.getImprovement(SCHOOL, ASOF)
    const args = (prisma.task.groupBy.mock.calls[0] as unknown as [
      { where: Record<string, unknown>; by: string[] },
    ])[0]
    expect(args.by).toEqual(['sourceRef', 'status'])
    // Task.sourceType stays 'strategy' — the table was not renamed, and neither
    // was the task linkage that already points at it.
    expect(args.where).toMatchObject({ schoolId: SCHOOL, sourceType: 'strategy' })
    expect(args.where).not.toHaveProperty('goalId')
  })
})

describe('acceptance 5 — adopting the same recommendation twice returns the SAME initiative', () => {
  it('the second adopt short-circuits on the existing row and writes nothing', async () => {
    const existing = legacyRow({ id: 'already-there' })
    const { svc, create, audit } = makeService({ existingAdopted: existing })
    const out = await svc.adopt(
      SCHOOL,
      { templateId: 'REC-RUBRIC-STEP', originType: 'gap', originRef: 'std-1', title: 'Work it' } as never,
      'user-1',
    )
    expect(out.id).toBe('already-there')
    expect(create).not.toHaveBeenCalled()
    expect(audit.write).not.toHaveBeenCalled()
    // ...and it SAYS so, so the controller can answer 200 instead of Nest's
    // default 201. Verified live before this spec existed: the second adopt
    // returned 201 Created having created nothing, and a client that toasts on a
    // 201 would tell the user it made a second commitment it did not make.
    expect((out as Record<symbol, unknown>)[ADOPT_REUSED]).toBe(true)
  })

  it('the reuse marker is a SYMBOL, so it can never leak into the JSON body', async () => {
    const { svc } = makeService({ existingAdopted: legacyRow({ id: 'already-there' }) })
    const out = await svc.adopt(
      SCHOOL,
      { templateId: 'REC-RUBRIC-STEP', originType: 'gap', originRef: 'std-1', title: 'Work it' } as never,
      'user-1',
    )
    // The response a client actually receives must be byte-identical to a first
    // adopt's — only the status code differs.
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('reused')
    expect(Object.keys(out)).not.toContain('reused')
  })

  it('the FIRST adopt creates, stamps the origin, and links the ledger row back', async () => {
    const { svc, create, updateMany } = makeService()
    const out = await svc.adopt(
      SCHOOL,
      {
        templateId: 'REC-FINDING-WORK',
        originType: 'finding',
        originRef: 'RULE:school',
        findingKey: 'RULE:school',
        title: 'Work the warning',
      } as never,
      'user-1',
    )
    expect(create).toHaveBeenCalledTimes(1)
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data
    expect(data.findingKey).toBe('RULE:school')
    expect(data.originType).toBe('finding')
    // An adopted recommendation carries no goal, by construction.
    expect(data.goalId).toBeNull()
    expect(out.id).toBeTruthy()
    // The finding is the record of the PROBLEM; the initiative is the record of
    // the RESPONSE. The link is written, and neither owns the other.
    expect(updateMany).toHaveBeenCalledTimes(1)
  })

  it('a lost unique-index race still returns the one initiative, not a 500', async () => {
    const { svc, prisma } = makeService()
    prisma.improvementInitiative.create = vi.fn(async () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' })
    }) as never
    prisma.improvementInitiative.findFirst = vi
      .fn()
      // first call: the dedupe probe finds nothing (so we attempt the create)
      .mockResolvedValueOnce(null)
      // second call: the post-P2002 re-read finds the winner's row
      .mockResolvedValueOnce(legacyRow({ id: 'winner' })) as never
    const out = await svc.adopt(
      SCHOOL,
      {
        templateId: 'REC-FINDING-WORK',
        originType: 'finding',
        originRef: 'RULE:school',
        findingKey: 'RULE:school',
        title: 'Work the warning',
      } as never,
      'user-1',
    )
    expect(out.id).toBe('winner')
  })
})

describe('a finding-derived recommendation quotes the sentence THE RULE ACTUALLY COMPOSED', () => {
  // `consequence` does not exist on TwinRuleDef and must not: it lives on the
  // FIRED finding, because several rules carry two frozen template variants for two
  // genuinely different facts and the variant is chosen at fire time. The sentence
  // that fired is copied verbatim into evidencePayload, and that is what is read.
  const finding = (over: Record<string, unknown> = {}) => ({
    id: 'f1',
    ruleId: 'GOV-MINUTES-STALE',
    scopeKey: 'school',
    severity: 'warn',
    standardTags: ['COG-1.1'],
    primaryDomainKey: 'governance',
    evidencePayload: {
      title: 'Board minutes have gone stale',
      consequence: 'Cadence is the first thing a governance reviewer counts.',
    },
    ...over,
  })

  it('reads title and consequence from the stored evidencePayload', async () => {
    const { svc } = makeService({ findings: [finding()] })
    const { recommendations } = await svc.getRecommendations(SCHOOL, {}, ASOF)
    const rec = recommendations.find((r) => r.templateId === 'REC-FINDING-WORK')
    expect(rec).toBeDefined()
    expect(rec!.title).toBe('Board minutes have gone stale')
    expect(rec!.rationale).toBe('Cadence is the first thing a governance reviewer counts.')
    expect(rec!.findingKey).toBe('GOV-MINUTES-STALE:school')
  })

  it('a row with NO stored consequence is SKIPPED, never given an invented one', async () => {
    // The pure module echoes the consequence as the recommendation's ENTIRE
    // rationale, so an empty one is a recommendation that claims nothing — and
    // composing a replacement here is precisely what this phase must not do.
    for (const payload of [{}, { consequence: '' }, { consequence: '   ' }, { consequence: 7 }]) {
      const { svc } = makeService({ findings: [finding({ evidencePayload: payload })] })
      const { recommendations } = await svc.getRecommendations(SCHOOL, {}, ASOF)
      expect(recommendations.filter((r) => r.templateId === 'REC-FINDING-WORK')).toHaveLength(0)
    }
  })

  it('an `info` finding is not offered as work — it is not a problem yet', async () => {
    const { svc } = makeService({ findings: [finding({ severity: 'info' })] })
    const { recommendations } = await svc.getRecommendations(SCHOOL, {}, ASOF)
    expect(recommendations.filter((r) => r.templateId === 'REC-FINDING-WORK')).toHaveLength(0)
  })

  it('an unreadable findings ledger degrades to "no findings", not a 500', async () => {
    const { svc, prisma } = makeService()
    prisma.accreditationFinding.findMany = vi.fn(async () => {
      throw new Error('relation does not exist')
    }) as never
    await expect(svc.getRecommendations(SCHOOL, {}, ASOF)).resolves.toMatchObject({
      recommendations: [],
    })
  })
})

describe('summary.behind counts the PACE VERDICT, not the precedence-ranked signal', () => {
  /** 4 milestones, none done, window 2026-01-01 → 2026-06-30: behind AND late. */
  const behindAndLate = (id: string) =>
    legacyRow({
      id,
      progressSource: 'milestone',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      dueDate: new Date('2026-06-30T00:00:00.000Z'),
      milestones: [
        { id: 'm1', label: 'a', done: false },
        { id: 'm2', label: 'b', done: false },
        { id: 'm3', label: 'c', done: false },
        { id: 'm4', label: 'd', done: false },
      ],
    })

  it('work that is behind pace AND overdue is counted in BOTH KPIs', async () => {
    // THE BUG THIS PINS: `riskSignal` returns 'overdue' before it ever tests
    // pace, so counting signals here rendered the "Behind pace" KPI as 0 with the
    // tone-good sub-line "all measured work on pace" — about an initiative at 0%
    // that is genuinely behind. The two KPIs describe two different questions and
    // one row can honestly answer yes to both.
    const { svc } = makeService({ rows: [behindAndLate('i1')] })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    const v = out.initiatives[0]
    expect(v.paceStatus).toBe('behind')
    expect(v.riskSignal).toBe('overdue')
    expect(out.summary.behind).toBe(1)
    expect(out.summary.overdue).toBe(1)
  })

  it('status-only and unmeasured rows are never counted as behind', async () => {
    const { svc } = makeService({
      rows: [legacyRow({ id: 'i1' }), legacyRow({ id: 'i2', progressSource: 'milestone', milestones: [] })],
    })
    const out = await svc.getImprovement(SCHOOL, ASOF)
    expect(out.summary.behind).toBe(0)
  })
})

describe('the recommendation rail is ACCREDITATION data and needs its own gate', () => {
  const gapReadiness = {
    framework: { id: 'fw-1', code: 'COGNIA' },
    gaps: [
      {
        standardId: 'std-1',
        code: 'COG-1',
        title: 'Purpose and direction',
        rubricScore: 1,
        evidenceGap: false,
        nextStepLift: 50,
        fullLift: 150,
      },
    ],
    assurances: [],
  }
  const finding = {
    id: 'f1',
    ruleId: 'GOV-MINUTES-STALE',
    scopeKey: 'school',
    severity: 'warn',
    standardTags: ['COG-1.1'],
    primaryDomainKey: 'governance',
    evidencePayload: {
      title: 'Board minutes have gone stale',
      consequence: 'Cadence is the first thing a governance reviewer counts.',
    },
  }

  it('a STRATEGY-ONLY school gets no gap lifts and no early-warning sentences', async () => {
    // The controller's @RequiresModule is OR over ('accreditation','strategy'),
    // which is right for the PAGE — a strategy-only school owns improvement work.
    // But every fact below is 402 MODULE_NOT_LICENSED for this school on
    // /accreditation/readiness and /twin: standard codes, rubric ratings, index
    // lifts, and the twin's consequence sentence. The OR gate must not hand them
    // over here.
    const { svc, readiness, prisma } = makeService({
      licensed: ['strategy'],
      readiness: gapReadiness,
      findings: [finding],
    })
    const out = await svc.getRecommendations(SCHOOL, {}, ASOF)
    expect(out.recommendations).toEqual([])
    expect(out.basis).toEqual({ accreditationLicensed: false, frameworkAdopted: false })
    // Not merely filtered on the way out — the accreditation sources are never read.
    expect(readiness.getReadiness).not.toHaveBeenCalled()
    expect(prisma.accreditationFinding.findMany).not.toHaveBeenCalled()
  })

  it('the SAME school with an accreditation licence gets the whole rail', async () => {
    // Without this half, the spec above would pass against a service that always
    // returns an empty rail.
    const { svc } = makeService({
      licensed: ['accreditation'],
      readiness: gapReadiness,
      findings: [finding],
    })
    const out = await svc.getRecommendations(SCHOOL, {}, ASOF)
    expect(out.recommendations.map((r) => r.templateId)).toContain('REC-RUBRIC-STEP')
    expect(out.recommendations.map((r) => r.templateId)).toContain('REC-FINDING-WORK')
    expect(out.recommendations.find((r) => r.templateId === 'REC-RUBRIC-STEP')?.estimatedLift).toEqual({
      points: 50,
      basis: 'nextStepLift',
    })
    expect(out.basis).toEqual({ accreditationLicensed: true, frameworkAdopted: true })
  })

  it('an unreadable entitlement fails CLOSED — no recommendations, not all of them', async () => {
    const { svc } = makeService({ billingThrows: true, readiness: gapReadiness, findings: [finding] })
    const out = await svc.getRecommendations(SCHOOL, {}, ASOF)
    expect(out.recommendations).toEqual([])
    expect(out.basis.accreditationLicensed).toBe(false)
  })

  it('adoptedKeys are the school’s OWN rows, so they are reported whatever it licenses', async () => {
    const own = legacyRow({ id: 'i1', originRef: 'std-1' })
    const { svc } = makeService({ licensed: ['strategy'], rows: [own] })
    const out = await svc.getRecommendations(SCHOOL, {}, ASOF)
    expect(out.adoptedKeys).toEqual(['std-1'])
  })

  it('an accredited school with NO framework says so, rather than "everything is worked"', async () => {
    const { svc } = makeService({
      licensed: ['accreditation'],
      readiness: { framework: null, gaps: [], assurances: [] },
    })
    const out = await svc.getRecommendations(SCHOOL, {}, ASOF)
    expect(out.recommendations).toEqual([])
    expect(out.basis).toEqual({ accreditationLicensed: true, frameworkAdopted: false })
  })
})

describe('an adopted recommendation can be MEASURABLE at birth', () => {
  it('choosing a KPI binds the metric source, so the baseline freezes and pace computes', async () => {
    // Before this, adopt was the ONLY creation path for a recommendation and it
    // could not carry a progressSource — so every adopted item was permanently
    // "Status only" while the drawer displayed the KPI the wizard had collected.
    const { svc, create } = makeService()
    await svc.adopt(
      SCHOOL,
      {
        templateId: 'REC-RUBRIC-STEP',
        originType: 'gap',
        originRef: 'std-1',
        title: 'Raise COG-1 one rubric level',
        metricKey: 'operating_margin',
        targetValue: 0.06,
      } as never,
      'user-1',
    )
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data
    expect(data.progressSource).toBe('metric')
    expect(data.metricKey).toBe('operating_margin')
    expect(String(data.targetValue)).toBe('0.06')
  })

  it('adopting WITHOUT a KPI still stores no source — status only, exactly as before', async () => {
    const { svc, create } = makeService()
    await svc.adopt(
      SCHOOL,
      { templateId: 'REC-EVIDENCE-GAP', originType: 'gap', originRef: 'std-2', title: 'Attach evidence' } as never,
      'user-1',
    )
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data
    expect(data.progressSource).toBeNull()
    expect(data.metricKey).toBeNull()
  })
})

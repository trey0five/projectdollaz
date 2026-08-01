import { describe, expect, it, vi } from 'vitest'
import type { TwinFinding, TwinResult } from '@finrep/compliance'
import { ACK_WINDOW_DAYS, EarlyWarningService } from './early-warning.service.js'
import type { TwinContextRegistry } from './twin-rules.js'
import type { TwinSignalSet } from './twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — THE LIVE/LEDGER MERGE and the four human actions.
//
// The five merge cases, and why each one is the answer it is:
//
//   fires + row              lifecycle from the row
//   fires + NO row           id: null, shown IMMEDIATELY — a school should not wait
//                            until 4AM to see a problem it caused at 2PM
//   row + does not fire      `cleared[]`, and ONLY with includeCleared
//   human-closed             out of findings[] unless includeCleared
//   MUTED                    KEPT in findings[] — hiding it would make an ack look
//                            like a fix
//
// And acceptance 3: a stale-data clear renders its own sentence, and the word
// "resolved" appears nowhere on that row.
// ─────────────────────────────────────────────────────────────────────────────

const AT = new Date('2026-08-01T04:00:00.000Z')
const DAY = 24 * 3600 * 1000

function finding(over: Partial<TwinFinding> = {}): TwinFinding {
  return {
    ruleId: 'GOV-CADENCE-GAP',
    scopeKey: 'school',
    factKey: 'register:board_meetings@trailing12',
    title: 'The board is meeting less often than quarterly',
    rationale: '2 board meetings were held in the last twelve months.',
    evidence: [
      { key: 'meetingsHeld', label: 'Meetings held', value: 2, display: '2', asOf: '2026-07-20', lineage: null },
    ],
    standardTags: ['COG-8'],
    domainKeys: ['governance'],
    defaultDomainKey: 'governance',
    severity: 'warn',
    likelihood: 'possible',
    confidence: 'observation',
    horizon: { kind: 'none', value: null, confidence: null, reason: 'A condition today.' },
    consequence: 'Meeting cadence is the first thing a governance reviewer counts.',
    ...over,
  } as TwinFinding
}

function result(findings: TwinFinding[]): TwinResult {
  return {
    version: '1.0.0',
    now: '2026-08-01',
    frameworkCode: 'cognia_2022',
    demoData: false,
    snapshotAsOf: '2026-07-31',
    findings,
    notEvaluated: [],
    coverage: {
      rulesTotal: 26,
      rulesEvaluated: 10,
      rulesFired: findings.length,
      rulesNotEvaluated: 16,
      evaluablePct: 0.385,
      signals: { available: 5, not_licensed: 0, no_data: 30, not_tracked: 0 },
      blockedByModule: {},
      unlockableByYears: { signalKey: null, ruleIds: [], yearsNeeded: 0, fyLabels: [] },
      namedHoles: [],
    },
    perStandardRisk: [],
    domainBands: [],
  } as TwinResult
}

interface RowSeed {
  id: string
  schoolId?: string
  findingKey: string
  ruleId?: string
  scopeKey?: string
  status?: string
  clearedAt?: Date | null
  resolutionKind?: string | null
  mutedUntil?: Date | null
  ackedUntil?: Date | null
  reopenCount?: number
  payload?: Record<string, unknown>
}

function row(seed: RowSeed) {
  const [ruleId, ...rest] = seed.findingKey.split(':')
  return {
    id: seed.id,
    schoolId: seed.schoolId ?? 'school-A',
    ruleId: seed.ruleId ?? ruleId,
    scopeKey: seed.scopeKey ?? rest.join(':'),
    findingKey: seed.findingKey,
    factKey: 'fact',
    standardTags: ['COG-8'],
    domainKeys: ['governance'],
    primaryDomainKey: 'governance',
    severity: 'warn',
    status: seed.status ?? 'open',
    likelihood: 'possible',
    confidence: 'observation',
    horizonKind: 'none',
    horizonDate: null,
    horizonPeriods: null,
    horizonConfidence: null,
    firstSeenAt: new Date('2026-05-01T04:00:00.000Z'),
    lastSeenAt: new Date('2026-07-31T04:00:00.000Z'),
    clearedAt: seed.clearedAt ?? null,
    resolutionKind: seed.resolutionKind ?? null,
    reopenCount: seed.reopenCount ?? 0,
    evidencePayload: seed.payload ?? {
      title: 'A stored title',
      rationale: 'A stored rationale.',
      consequence: 'A stored consequence.',
      evidence: [],
    },
    payloadHash: 'h',
    initiativeId: null,
    mutedReason: null,
    mutedUntil: seed.mutedUntil ?? null,
    ackedUntil: seed.ackedUntil ?? null,
    lastNotifiedAt: null,
    notifiedReopenCount: 0,
    notifiedSeverity: null,
    ackedByUserId: null,
    isDemo: false,
    engineVersion: '1.1.0',
    createdAt: AT,
    updatedAt: AT,
  }
}

function harness(over: { fired?: TwinFinding[]; rows?: RowSeed[] } = {}) {
  const store = (over.rows ?? []).map(row)
  const updateMany = vi.fn(
    async ({ where, data }: { where: { id: string; schoolId: string }; data: Record<string, unknown> }) => {
      let count = 0
      for (const r of store) {
        if (r.id !== where.id) continue
        if (r.schoolId !== where.schoolId) continue
        Object.assign(r, data)
        count += 1
      }
      return { count }
    },
  )
  const prisma = {
    accreditationFinding: {
      findMany: vi.fn(async () => store.map((r) => ({ ...r }))),
      findFirst: vi.fn(async ({ where }: { where: { id: string; schoolId: string } }) => {
        const r = store.find((x) => x.id === where.id && x.schoolId === where.schoolId)
        return r ? { ...r } : null
      }),
      updateMany,
    },
  }
  const audit = { write: vi.fn(async () => undefined) }
  const billing = { isEntitledForModule: vi.fn(async () => true) }
  const set = { schoolId: 'school-A', signals: [], generatedAt: AT.toISOString() } as unknown as TwinSignalSet
  const twinSignals = { collect: vi.fn(async () => set) }
  const twinRegister = {
    build: vi.fn(async () => ({
      register: { frameworkCode: null, standards: [], evidenceGroups: [], demoData: false, snapshotAsOf: null },
      weights: {},
      registerAvailable: true,
    })),
  }
  const priorFacts = {
    collect: vi.fn(async (_schoolId: string, _entitled: Set<string>, _live: Record<string, string | null>) => ({})),
  }

  const derived = result(over.fired ?? [])
  const cache = {
    set: vi.fn(),
    contextFor: vi.fn(),
    derive: vi.fn(() => derived),
    deriveWithDomains: vi.fn(() => derived),
  } as unknown as TwinContextRegistry

  const svc = new EarlyWarningService(
    prisma as never,
    billing as never,
    audit as never,
    twinSignals as never,
    twinRegister as never,
    priorFacts as never,
  )
  svc.useCache(cache)
  return { svc, prisma, audit, store, updateMany, cache, twinSignals, twinRegister, priorFacts }
}

describe('EarlyWarningService — the live/ledger merge', () => {
  it('fires WITH a row: content from the engine, lifecycle from the ledger', async () => {
    const h = harness({
      fired: [finding()],
      rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school', reopenCount: 2 }],
    })
    const res = await h.svc.getTwin('school-A', {}, AT)
    const f = res.findings[0]
    expect(f.id).toBe('f-1')
    expect(f.reopenCount).toBe(2)
    // The LIVE rationale, not the stored one — the engine is the authority on what
    // is true right now.
    expect(f.rationale).toBe('2 board meetings were held in the last twelve months.')
    expect(f.firstSeenAt).toBe('2026-05-01T04:00:00.000Z')
  })

  it('fires with NO row: shown immediately with id: null', async () => {
    const h = harness({ fired: [finding()] })
    const res = await h.svc.getTwin('school-A', {}, AT)
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0].id).toBeNull()
    expect(res.findings[0].status).toBe('open')
    expect(res.findings[0].firstSeenAt).toBeNull()
    expect(res.findings[0].reopenCount).toBe(0)
  })

  it('a row that does NOT fire is absent by default and in cleared[] with includeCleared', async () => {
    const h = harness({
      rows: [
        {
          id: 'f-9',
          findingKey: 'FIN-AUDIT-STALE:evidence:financial_audit',
          clearedAt: new Date('2026-07-10T04:00:00.000Z'),
          resolutionKind: 'improved',
        },
      ],
    })
    const plain = await h.svc.getTwin('school-A', {}, AT)
    expect(plain.findings).toHaveLength(0)
    expect(plain.cleared).toHaveLength(0)

    const withCleared = await h.svc.getTwin('school-A', { includeCleared: true }, AT)
    expect(withCleared.findings).toHaveLength(0)
    expect(withCleared.cleared).toHaveLength(1)
    expect(withCleared.cleared[0].findingCleared).toBe(true)
  })

  it('a HUMAN-CLOSED row that still fires is hidden unless includeCleared', async () => {
    const h = harness({
      fired: [finding()],
      rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school', status: 'resolved' }],
    })
    expect((await h.svc.getTwin('school-A', {}, AT)).findings).toHaveLength(0)
    expect((await h.svc.getTwin('school-A', { includeCleared: true }, AT)).findings).toHaveLength(1)
  })

  it('a MUTED finding STAYS in findings[] — hiding it would make an ack look like a fix', async () => {
    const muted = new Date(AT.getTime() + 30 * DAY)
    const h = harness({
      fired: [finding()],
      rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school', status: 'muted', mutedUntil: muted }],
    })
    const res = await h.svc.getTwin('school-A', {}, AT)
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0].mutedUntil).toBe(muted.toISOString())
    expect(res.findings[0].status).toBe('muted')
  })

  it('a ledger read failure degrades to no lifecycle, never a 500', async () => {
    const h = harness({ fired: [finding()] })
    h.prisma.accreditationFinding.findMany.mockRejectedValueOnce(new Error('relation does not exist'))
    const res = await h.svc.getTwin('school-A', {}, AT)
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0].id).toBeNull()
  })

  it('filters by severity and ruleId', async () => {
    const h = harness({
      fired: [finding(), finding({ ruleId: 'FIN-AUDIT-STALE', scopeKey: 'evidence:financial_audit', severity: 'critical' })],
    })
    expect((await h.svc.getTwin('school-A', { severity: 'critical' }, AT)).findings).toHaveLength(1)
    expect((await h.svc.getTwin('school-A', { ruleId: 'GOV-CADENCE-GAP' }, AT)).findings).toHaveLength(1)
  })
})

describe('EarlyWarningService — acceptance 3: never "resolved" for stale data', () => {
  it('renders the stale-data sentence, and the word "resolved" appears nowhere on the row', async () => {
    const h = harness({
      rows: [
        {
          id: 'f-9',
          findingKey: 'GOV-CADENCE-GAP:school',
          clearedAt: new Date('2026-07-10T04:00:00.000Z'),
          resolutionKind: 'stale_data',
        },
      ],
    })
    const res = await h.svc.getTwin('school-A', { includeCleared: true }, AT)
    const f = res.cleared[0]
    expect(f.clearedCopy).toBe(
      'We stopped being able to see the data behind this on 2026-07-10. That is not the same as it being fixed.',
    )
    expect(JSON.stringify(f)).not.toMatch(/resolved/i)
  })

  it('an IMPROVED clear is allowed to use the word — because it is the right word', async () => {
    const h = harness({
      rows: [
        {
          id: 'f-9',
          findingKey: 'GOV-CADENCE-GAP:school',
          clearedAt: new Date('2026-07-10T04:00:00.000Z'),
          resolutionKind: 'improved',
        },
      ],
    })
    const res = await h.svc.getTwin('school-A', { includeCleared: true }, AT)
    expect(res.cleared[0].clearedCopy).toContain('Confirm it is genuinely resolved.')
  })

  it('a clear with NO resolutionKind falls back to the STALE sentence, never the improved one', async () => {
    const h = harness({
      rows: [{ id: 'f-9', findingKey: 'GOV-CADENCE-GAP:school', clearedAt: new Date('2026-07-10T04:00:00.000Z') }],
    })
    const res = await h.svc.getTwin('school-A', { includeCleared: true }, AT)
    expect(res.cleared[0].clearedCopy).not.toMatch(/resolved/i)
  })
})

describe('EarlyWarningService — ack / mute / status', () => {
  it('ACK sets mutedUntil AND ackedUntil to +45d and never clears lastNotifiedAt', async () => {
    const h = harness({ rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school' }] })
    const out = await h.svc.ack('school-A', 'f-1', { reason: 'Board retreat in September' }, 'user-1', AT)
    const expected = new Date(AT.getTime() + ACK_WINDOW_DAYS * DAY).toISOString()
    expect(out.status).toBe('acknowledged')
    expect(out.mutedUntil).toBe(expected)
    expect(out.ackedUntil).toBe(expected)
    const data = h.updateMany.mock.calls[0][0].data
    expect('lastNotifiedAt' in data).toBe(false)
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accreditation.finding.acked', schoolId: 'school-A' }),
    )
  })

  it('MUTE with days: 0 UNMUTES — one route, one verb', async () => {
    const h = harness({
      rows: [
        {
          id: 'f-1',
          findingKey: 'GOV-CADENCE-GAP:school',
          status: 'muted',
          mutedUntil: new Date(AT.getTime() + 10 * DAY),
          ackedUntil: new Date(AT.getTime() + 10 * DAY),
        },
      ],
    })
    const out = await h.svc.mute('school-A', 'f-1', { days: 0, reason: 'x' }, 'user-1', AT)
    expect(out.status).toBe('open')
    expect(out.mutedUntil).toBeNull()
    expect(out.ackedUntil).toBeNull()
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accreditation.finding.unmuted' }),
    )
  })

  it('MUTE with days > 0 stores the window AND the stated reason', async () => {
    const h = harness({ rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school' }] })
    const out = await h.svc.mute('school-A', 'f-1', { days: 14, reason: 'Vendor quote pending' }, 'u', AT)
    expect(out.status).toBe('muted')
    expect(out.mutedUntil).toBe(new Date(AT.getTime() + 14 * DAY).toISOString())
    expect(out.mutedReason).toBe('Vendor quote pending')
  })

  it("STATUS writes resolutionKind 'dismissed' ONLY for dismissed", async () => {
    const h1 = harness({ rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school' }] })
    const dismissed = await h1.svc.setStatus('school-A', 'f-1', { status: 'dismissed' }, 'u')
    expect(dismissed.resolutionKind).toBe('dismissed')

    const h2 = harness({ rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school' }] })
    const resolved = await h2.svc.setStatus('school-A', 'f-1', { status: 'resolved' }, 'u')
    expect(resolved.resolutionKind).toBeNull()
  })

  it("STATUS 'open' clears the mute and the ack window", async () => {
    const h = harness({
      rows: [
        {
          id: 'f-1',
          findingKey: 'GOV-CADENCE-GAP:school',
          status: 'muted',
          mutedUntil: new Date(AT.getTime() + 10 * DAY),
          ackedUntil: new Date(AT.getTime() + 10 * DAY),
        },
      ],
    })
    const out = await h.svc.setStatus('school-A', 'f-1', { status: 'open' }, 'u')
    expect(out.status).toBe('open')
    expect(out.mutedUntil).toBeNull()
    expect(out.ackedUntil).toBeNull()
  })
})

describe('EarlyWarningService — TENANCY rides on the WRITE', () => {
  it('every mutation is an updateMany scoped by schoolId', async () => {
    const h = harness({ rows: [{ id: 'f-1', findingKey: 'GOV-CADENCE-GAP:school' }] })
    await h.svc.ack('school-A', 'f-1', {}, 'u', AT)
    await h.svc.mute('school-A', 'f-1', { days: 5, reason: 'r' }, 'u', AT)
    await h.svc.setStatus('school-A', 'f-1', { status: 'resolved' }, 'u')
    for (const call of h.updateMany.mock.calls) {
      expect(call[0].where).toMatchObject({ schoolId: 'school-A', id: 'f-1' })
    }
  })

  it('a CROSS-TENANT id writes ZERO rows and 404s', async () => {
    const h = harness({ rows: [{ id: 'f-1', schoolId: 'school-B', findingKey: 'GOV-CADENCE-GAP:school' }] })
    await expect(h.svc.ack('school-A', 'f-1', {}, 'u', AT)).rejects.toThrow(/not found/i)
    // The row belonging to the OTHER school is untouched.
    expect(h.store[0].status).toBe('open')
  })
})

describe('EarlyWarningService — prepare', () => {
  it('ADOPTS a signal set it is handed rather than re-collecting it', async () => {
    const h = harness()
    const set = { schoolId: 'school-A', signals: [] } as unknown as TwinSignalSet
    const out = await h.svc.prepare('school-A', AT, set)
    expect(out).toBe(set)
    expect(h.twinSignals.collect).not.toHaveBeenCalled()
    expect(h.cache.set).toHaveBeenCalled()
  })

  it('NEVER throws — a failed register read leaves the set usable', async () => {
    const h = harness()
    ;(h.cache.set as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const set = { schoolId: 'school-A', signals: [] } as unknown as TwinSignalSet
    await expect(h.svc.prepare('school-A', AT, set)).resolves.toBe(set)
  })

  it('a NOT_TRACKED signal is not proof of a licence — entitlement stays fail-closed', async () => {
    // `resolveOne` returns `not_tracked` from step 1, BEFORE the licence check, so
    // a finance-only school still gets `not_tracked` on the four HR/Facilities
    // holes. Reading "not not_licensed" as "licensed" put both modules into the
    // set handed to the prior-fact collector.
    const h = harness()
    const set = {
      schoolId: 'school-A',
      signals: [
        { key: 'fin.ar_aging', moduleKey: 'finance', availability: 'no_data', observedOn: null },
        { key: 'hr.pd_participation', moduleKey: 'hr', availability: 'not_tracked', observedOn: null },
        {
          key: 'fac.inspections',
          moduleKey: 'facilities',
          availability: 'not_licensed',
          observedOn: null,
        },
      ],
    } as unknown as TwinSignalSet
    await h.svc.prepare('school-A', AT, set)
    const entitled = h.priorFacts.collect.mock.calls[0][1]
    // `no_data` IS proof — it is only reachable once the licence check passed.
    expect(entitled.has('finance')).toBe(true)
    expect(entitled.has('hr')).toBe(false)
    expect(entitled.has('facilities')).toBe(false)
  })

  it('carries register HEALTH out, so a caller can tell an outage from an empty register', async () => {
    const h = harness()
    const set = { schoolId: 'school-A', signals: [] } as unknown as TwinSignalSet
    await h.svc.prepare('school-A', AT, set)
    expect(h.svc.registerAvailableFor(set)).toBe(true)

    h.twinRegister.build.mockResolvedValueOnce({
      register: {
        frameworkCode: null,
        standards: [],
        evidenceGroups: [],
        demoData: false,
        snapshotAsOf: null,
      },
      weights: {},
      registerAvailable: false,
    } as never)
    const set2 = { schoolId: 'school-A', signals: [] } as unknown as TwinSignalSet
    await h.svc.prepare('school-A', AT, set2)
    expect(h.svc.registerAvailableFor(set2)).toBe(false)

    // A set that was never prepared is `false` — the answer that declines to clear.
    expect(h.svc.registerAvailableFor({ schoolId: 'x', signals: [] } as unknown as TwinSignalSet)).toBe(
      false,
    )
  })
})

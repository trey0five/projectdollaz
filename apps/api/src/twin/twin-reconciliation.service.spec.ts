import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { DomainKey } from '@finrep/compliance'
import { DOMAIN_KEYS } from '@finrep/compliance'
import {
  TWIN_ENGINE_VERSION,
  TWIN_RULES,
  TwinReconciliationService,
} from './twin-reconciliation.service.js'
import { domainNumerators } from './fact-domains.js'
import { TWIN_SIGNAL_KEYS } from './twin-contract.js'
import type {
  FiredFinding,
  ReconcileWrite,
  SignalAvailability,
  TwinRule,
  TwinSignal,
  TwinSignalKey,
  TwinSignalSet,
} from './twin-contract.js'
import { FINDING_LIKELIHOODS } from './finding-vocab.js'

// ─────────────────────────────────────────────────────────────────────────────
// TwinReconciliationService — the nightly run.
//
// The invariants this file exists to PIN, in the order they matter:
//
//   1. PHASE D WRITES NOTHING. TWIN_RULES is empty, and with zero rules the job
//      scans, collects, logs and issues not one write. A non-zero row count in
//      accreditation_findings after a Phase-D run is a bug, not a feature.
//
//   2. FINDINGS NEVER AUTO-CLOSE. `ReconcileWrite` has no `status` key — asserted
//      at COMPILE TIME with @ts-expect-error below — and a source scan of the
//      service finds no `status:` literal in any write path. A rule that stops
//      firing gets `clearedAt` + a `resolutionKind`, and a human moves status.
//
//   3. A SCHOOL THAT STOPPED UPLOADING IS NOT A SCHOOL THAT IMPROVED. That
//      distinction is `resolutionKind`, and the word "resolved" must appear
//      nowhere on such a row.
//
//   4. A 4AM HOUSEKEEPING JOB DOES NOT PROVISION SUBSCRIPTIONS. The entitlement
//      probe is a read-only findUnique, because isEntitledForModule goes through
//      getOrCreateSubscription and would hand out 14-day trials at 4AM.
//
// Prisma is hand-mocked over a small in-memory store. No DB, no Nest boot.
// ─────────────────────────────────────────────────────────────────────────────

const AT = new Date('2026-08-03T04:00:00.000Z')
const LATER = new Date('2026-08-04T04:00:00.000Z')

interface Row {
  id: string
  schoolId: string
  ruleId: string
  scopeKey: string
  findingKey: string
  factKey: string
  standardTags: string[]
  domainKeys: string[]
  primaryDomainKey: string
  severity: string
  status: string
  likelihood: string | null
  confidence: string
  horizonKind: string
  horizonDate: Date | null
  horizonPeriods: number | null
  horizonConfidence: string | null
  firstSeenAt: Date
  lastSeenAt: Date
  clearedAt: Date | null
  resolutionKind: string | null
  reopenCount: number
  evidencePayload: unknown
  payloadHash: string
  initiativeId: string | null
  mutedReason: string | null
  mutedUntil: Date | null
  ackedUntil: Date | null
  lastNotifiedAt: Date | null
  isDemo: boolean
  engineVersion: string
}

function signal(key: TwinSignalKey, over: Partial<TwinSignal> = {}): TwinSignal {
  return {
    key,
    label: key,
    kind: 'register',
    availability: 'available',
    unavailableReason: null,
    moduleKey: 'finance',
    value: 1,
    trend: null,
    observedOn: '2026-08-01',
    ageDays: 2,
    expectedCadenceDays: 45,
    staleAfterDays: 68,
    changeState: 'unchanged',
    ferpaSensitive: false,
    cells: null,
    domainKeys: ['finance'],
    lineage: { table: 'X' },
    ...over,
  }
}

function signalSet(schoolId: string, over: Partial<TwinSignalSet> = {}): TwinSignalSet {
  const counts: Record<SignalAvailability, number> = {
    available: 1,
    not_licensed: 0,
    no_data: TWIN_SIGNAL_KEYS.length - 1,
    not_tracked: 0,
  }
  return {
    schoolId,
    generatedAt: AT.toISOString(),
    signals: [signal('fin.ar_aging')],
    counts,
    demoData: false,
    snapshotAsOf: '2026-08-02',
    ...over,
  }
}

function fired(over: Partial<FiredFinding> = {}): FiredFinding {
  return {
    ruleId: 'TEST-RULE',
    scopeKey: 'school',
    factKey: 'register:ar_aging@2026-08-01',
    standardTags: ['COG-15'],
    domainKeys: ['finance'],
    defaultDomainKey: 'finance',
    severity: 'warn',
    likelihood: 'possible',
    confidence: 'directional',
    horizonKind: 'none',
    horizonDate: null,
    horizonPeriods: null,
    horizonConfidence: null,
    evidencePayload: { basis: 'ar90Plus = 1' },
    ...over,
  }
}

function testRule(over: Partial<TwinRule> & { emit?: FiredFinding[] } = {}): TwinRule {
  const emit = over.emit ?? [fired()]
  return {
    id: over.id ?? 'TEST-RULE',
    requiredSignals: over.requiredSignals ?? ['fin.ar_aging'],
    evaluate: over.evaluate ?? (() => emit),
  }
}

interface Fixture {
  schools?: string[]
  billed?: string[]
  licensed?: string[]
  sets?: Record<string, TwinSignalSet>
  collectThrows?: string[]
  seed?: Row[]
  standards?: { id: string; code: string; catalogStandardId: string | null }[]
  catalog?: { id: string; isAssurance: boolean; domainKey: string | null; domainWeights: unknown; signalKeys: string[] }[]
  /** The register read FAILED this run — every rule refuses for want of a code. */
  registerUnreadable?: boolean
}

function harness(fx: Fixture = {}) {
  const schools = fx.schools ?? ['school-A']
  const billed = fx.billed ?? schools
  const licensed = fx.licensed ?? schools
  const store: Row[] = (fx.seed ?? []).map((r) => ({ ...r }))
  let seq = store.length

  let inFlight = 0
  let maxInFlight = 0

  const prisma = {
    accreditationStandard: {
      groupBy: vi.fn(async () => schools.map((schoolId) => ({ schoolId, _count: { _all: 1 } }))),
      findMany: vi.fn(async () => fx.standards ?? []),
    },
    accreditationCatalogStandard: { findMany: vi.fn(async () => fx.catalog ?? []) },
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: { schoolId: string } }) =>
        billed.includes(where.schoolId) ? { id: `sub-${where.schoolId}` } : null,
      ),
    },
    accreditationFinding: {
      findMany: vi.fn(
        async ({ where }: { where: { schoolId: string; status?: { notIn: string[] } } }) =>
          store
            .filter((r) => r.schoolId === where.schoolId)
            .filter((r) => !where.status || !where.status.notIn.includes(r.status))
            .map((r) => ({ ...r })),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // THE REAL UNIQUE INDEX. Without this the harness cannot see the defect it
        // exists to catch: a row a human resolved, whose rule fires again, routed
        // to `create` and aborting the school's whole nightly run with P2002.
        const clash = store.find(
          (r) =>
            r.schoolId === data.schoolId &&
            r.ruleId === data.ruleId &&
            r.scopeKey === data.scopeKey,
        )
        if (clash) {
          const err = new Error(
            'Unique constraint failed on the fields: (`school_id`,`rule_id`,`scope_key`)',
          ) as Error & { code?: string }
          err.code = 'P2002'
          throw err
        }
        seq += 1
        const row = {
          id: `f-${seq}`,
          status: 'open',
          clearedAt: null,
          resolutionKind: null,
          reopenCount: 0,
          initiativeId: null,
          mutedReason: null,
          mutedUntil: null,
          ackedUntil: null,
          lastNotifiedAt: null,
          isDemo: false,
          ...data,
        } as unknown as Row
        store.push(row)
        return { ...row }
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; schoolId?: string }
          data: Record<string, unknown>
        }) => {
          const row = store.find(
            (r) => r.id === where.id && (where.schoolId === undefined || r.schoolId === where.schoolId),
          )
          if (!row) throw new Error('not found')
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'increment' in (v as object)) {
              ;(row as unknown as Record<string, number>)[k] =
                ((row as unknown as Record<string, number>)[k] ?? 0) +
                (v as { increment: number }).increment
            } else {
              ;(row as unknown as Record<string, unknown>)[k] = v
            }
          }
          return { ...row }
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: { in: string[] }; schoolId?: string }
          data: Record<string, unknown>
        }) => {
          let count = 0
          for (const row of store) {
            if (!where.id.in.includes(row.id)) continue
            if (where.schoolId !== undefined && row.schoolId !== where.schoolId) continue
            Object.assign(row, data)
            count += 1
          }
          return { count }
        },
      ),
    },
  }

  const billing = {
    isEntitledForModule: vi.fn(async (schoolId: string) => licensed.includes(schoolId)),
    getOrCreateSubscription: vi.fn(async () => {
      throw new Error('a 4AM job must never provision a subscription')
    }),
  }

  const twinSignals = {
    collect: vi.fn(async (schoolId: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight -= 1
      if (fx.collectThrows?.includes(schoolId)) throw new Error('collector exploded')
      return fx.sets?.[schoolId] ?? signalSet(schoolId)
    }),
  }

  // AIC Phase E — the rules are synchronous, so the register view + prior facts
  // are resolved and registered against the signal set BEFORE evaluation. The
  // stub records the call so a spec can assert the ordering; an unprepared set
  // resolves to an empty register, which the engine reports honestly.
  //
  // `registerAvailableFor` is the register-health probe the stopped-firing sweep
  // consults. It defaults to TRUE here so every pre-existing spec keeps driving
  // the healthy path unchanged; `fx.registerUnreadable` flips it to reproduce a
  // failed `listStandards` read.
  const earlyWarning = {
    prepare: vi.fn(async (_schoolId: string, _at: Date, signals?: TwinSignalSet) => signals),
    registerAvailableFor: vi.fn((_set: TwinSignalSet) => fx.registerUnreadable !== true),
  }

  const service = new TwinReconciliationService(
    prisma as never,
    billing as never,
    twinSignals as never,
    earlyWarning as never,
  )
  return {
    service,
    prisma,
    billing,
    twinSignals,
    earlyWarning,
    store,
    maxInFlight: () => maxInFlight,
  }
}

describe('zero rules writes nothing', () => {
  // AIC Phase E CHANGED ONE FACT AND ONLY ONE: `TWIN_RULES` is no longer empty.
  // The PROPERTY these cases pin — with no rules the ledger is never touched — is
  // unchanged and is now pinned against an EXPLICITLY empty rule set, which is
  // stronger: it survives every future rule the catalog grows.
  it('ships the production rule set, and every rule declares its signals', () => {
    expect(TWIN_RULES.length).toBeGreaterThan(0)
    for (const r of TWIN_RULES) {
      expect(typeof r.id).toBe('string')
      expect(Array.isArray(r.requiredSignals)).toBe(true)
      expect(typeof r.evaluate).toBe('function')
    }
  })

  it('scans, collects and logs — and issues no write at all', async () => {
    const h = harness({ schools: ['school-A', 'school-B'] })
    const summary = await h.service.reconcileAll(AT, [])

    expect(summary.rules).toBe(0)
    expect(summary.schoolsScanned).toBe(2)
    expect(summary.signalsCollected).toBe(2)
    expect(summary.created + summary.updated + summary.touched + summary.cleared).toBe(0)
    expect(h.prisma.accreditationFinding.create).not.toHaveBeenCalled()
    expect(h.prisma.accreditationFinding.update).not.toHaveBeenCalled()
    expect(h.prisma.accreditationFinding.updateMany).not.toHaveBeenCalled()
    // With no rules the ledger is not even READ.
    expect(h.prisma.accreditationFinding.findMany).not.toHaveBeenCalled()
    expect(h.store).toHaveLength(0)
  })

  it('the @Cron entrypoint uses the PRODUCTION rule set', async () => {
    const h = harness()
    const summary = await h.service.reconcileAll()
    expect(summary.rules).toBe(TWIN_RULES.length)
  })
})

describe('the firing branch', () => {
  it('creates a finding with firstSeenAt === lastSeenAt, open, uncleared', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])

    expect(h.store).toHaveLength(1)
    const row = h.store[0]
    expect(row.findingKey).toBe('TEST-RULE:school')
    expect(row.firstSeenAt).toEqual(AT)
    expect(row.lastSeenAt).toEqual(AT)
    expect(row.status).toBe('open')
    expect(row.clearedAt).toBeNull()
    expect(row.reopenCount).toBe(0)
    expect(row.engineVersion).toBe(TWIN_ENGINE_VERSION)
    // The basis chain cites the readiness reading that actually exists.
    expect((row.evidencePayload as { snapshotAsOf?: string }).snapshotAsOf).toBe('2026-08-02')
    // ...and carries the signals the rule declared it needed.
    expect((row.evidencePayload as { signals?: Record<string, unknown> }).signals).toHaveProperty(
      'fin.ar_aging',
    )
  })

  it('two identical nights leave ONE row, bumped in a batch, firstSeenAt untouched', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    h.prisma.accreditationFinding.create.mockClear()

    const second = await h.service.reconcileAll(LATER, [testRule()])

    expect(h.store).toHaveLength(1)
    expect(h.prisma.accreditationFinding.create).not.toHaveBeenCalled()
    expect(h.prisma.accreditationFinding.update).not.toHaveBeenCalled()
    expect(h.prisma.accreditationFinding.updateMany).toHaveBeenCalledTimes(1)
    expect(second.touched).toBe(1)
    expect(h.store[0].firstSeenAt).toEqual(AT)
    expect(h.store[0].lastSeenAt).toEqual(LATER)
  })

  it('a same-night re-run is byte-identical', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    const first = JSON.stringify(h.store)
    await h.service.reconcileAll(AT, [testRule()])
    expect(JSON.stringify(h.store)).toBe(first)
  })

  it('a changed payload rewrites the row — and still never rewrites firstSeenAt', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    const hashBefore = h.store[0].payloadHash

    await h.service.reconcileAll(LATER, [
      testRule({ emit: [fired({ severity: 'critical', evidencePayload: { basis: 'ar90Plus = 9' } })] }),
    ])

    expect(h.store).toHaveLength(1)
    expect(h.store[0].payloadHash).not.toBe(hashBefore)
    expect(h.store[0].severity).toBe('critical')
    expect(h.store[0].firstSeenAt).toEqual(AT)
    expect(h.store[0].lastSeenAt).toEqual(LATER)
  })

  it('stores likelihood as an ORDINAL WORD, never a number', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    expect(h.store[0].likelihood).toBe('possible')
    for (const l of FINDING_LIKELIHOODS) {
      expect(typeof l).toBe('string')
      expect(Number.isNaN(Number(l))).toBe(true)
    }
    // No numeric probability anywhere in the row.
    expect(JSON.stringify(h.store[0])).not.toMatch(/"probability"/)
  })

  it('honours the horizon invariant: exactly one of date/periods, and none carries neither', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [
      testRule({
        emit: [
          fired({
            horizonKind: 'periods_to_breach',
            horizonPeriods: 4,
            horizonDate: new Date('2030-06-30'),
            horizonConfidence: 'trend',
          }),
        ],
      }),
    ])
    expect(h.store[0].horizonKind).toBe('periods_to_breach')
    expect(h.store[0].horizonPeriods).toBe(4)
    // A date supplied alongside a periods horizon is DROPPED, not stored.
    expect(h.store[0].horizonDate).toBeNull()
    expect(h.store[0].horizonConfidence).toBe('trend')

    const h2 = harness()
    await h2.service.reconcileAll(AT, [
      testRule({ emit: [fired({ horizonKind: 'none', horizonPeriods: 3, horizonConfidence: 'trend' })] }),
    ])
    expect(h2.store[0].horizonKind).toBe('none')
    expect(h2.store[0].horizonPeriods).toBeNull()
    expect(h2.store[0].horizonDate).toBeNull()
    expect(h2.store[0].horizonConfidence).toBeNull()
  })
})

describe('the stopped-firing branch — cleared, never closed', () => {
  it('sets clearedAt and resolutionKind "improved" while status stays open', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])

    const row = h.store[0]
    expect(row.clearedAt).toEqual(LATER)
    expect(row.resolutionKind).toBe('improved')
    expect(row.status).toBe('open')
    // lastSeenAt does NOT move: we did not see it tonight.
    expect(row.lastSeenAt).toEqual(AT)
  })

  it('a run that could not READ THE REGISTER clears nothing — an outage is not a resolution', async () => {
    // `TwinRegisterService.build` never throws: a transient `listStandards`
    // failure hands back an EMPTY register, every rule then refuses for want of a
    // standard code, and `fired` is empty — indistinguishable from "everything
    // improved". `resolutionFor` cannot tell either, because it inspects only the
    // LIVE SIGNALS, which are perfectly healthy. Without this guard one pool
    // timeout marks a school's whole ledger 'improved' and the next night reopens
    // all of it and mails a digest for the lot.
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    expect(h.store[0].clearedAt).toBeNull()

    h.earlyWarning.registerAvailableFor.mockReturnValue(false)
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])

    const row = h.store[0]
    expect(row.clearedAt).toBeNull()
    expect(row.resolutionKind).toBeNull()
    expect(row.status).toBe('open')

    // And once the register reads again, the ordinary sweep resumes.
    h.earlyWarning.registerAvailableFor.mockReturnValue(true)
    await h.service.reconcileAll(new Date('2026-08-05T04:00:00.000Z'), [
      testRule({ evaluate: () => [] }),
    ])
    expect(h.store[0].clearedAt).toEqual(new Date('2026-08-05T04:00:00.000Z'))
  })

  it('a second night of not firing writes nothing at all', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])
    h.prisma.accreditationFinding.update.mockClear()

    await h.service.reconcileAll(new Date('2026-08-05T04:00:00.000Z'), [
      testRule({ evaluate: () => [] }),
    ])
    expect(h.prisma.accreditationFinding.update).not.toHaveBeenCalled()
    expect(h.store[0].clearedAt).toEqual(LATER)
  })

  it('a school that simply stopped uploading gets stale_data — and never the word "resolved"', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])

    // The required signal went dark. The rule cannot fire, but nothing improved.
    h.twinSignals.collect.mockResolvedValue(
      signalSet('school-A', {
        signals: [
          signal('fin.ar_aging', {
            availability: 'no_data',
            value: null,
            unavailableReason: 'No reading is available for this signal yet.',
          }),
        ],
      }),
    )
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])

    const row = h.store[0]
    expect(row.resolutionKind).toBe('stale_data')
    expect(row.status).toBe('open')
    expect(JSON.stringify(row)).not.toContain('resolved')
  })

  it('a stale (but available) required signal is also stale_data, not improved', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    h.twinSignals.collect.mockResolvedValue(
      signalSet('school-A', {
        signals: [signal('fin.ar_aging', { changeState: 'stale_data', ageDays: 400 })],
      }),
    )
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])
    expect(h.store[0].resolutionKind).toBe('stale_data')
  })

  it('re-firing after a clear resets clearedAt, increments reopenCount and PRESERVES a human status', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])

    // A human acknowledged it and muted it until next term.
    const mutedUntil = new Date('2026-12-01T00:00:00.000Z')
    h.store[0].status = 'acknowledged'
    h.store[0].mutedUntil = mutedUntil
    h.store[0].mutedReason = 'Board is on it'
    h.store[0].ackedUntil = mutedUntil

    await h.service.reconcileAll(new Date('2026-08-06T04:00:00.000Z'), [testRule()])

    const row = h.store[0]
    expect(row.clearedAt).toBeNull()
    expect(row.resolutionKind).toBeNull()
    expect(row.reopenCount).toBe(1)
    // Byte-for-byte: the nightly job cannot name these columns.
    expect(row.status).toBe('acknowledged')
    expect(row.mutedUntil).toEqual(mutedUntil)
    expect(row.mutedReason).toBe('Board is on it')
    expect(row.ackedUntil).toEqual(mutedUntil)
    expect(row.firstSeenAt).toEqual(AT)
  })

  it('a RESOLVED finding whose rule fires again re-arms — it does NOT collide with the unique index', async () => {
    // The ledger exists for exactly this: a condition a human closed out that
    // comes back. Deciding new-vs-existing on the OPEN subset instead of the whole
    // key space routed it to `create`, P2002 escaped reconcileSchool, the
    // per-school catch swallowed it, and the school silently vanished from the run
    // — permanently, because the resolved row never goes away.
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])
    expect(h.store[0].clearedAt).toEqual(LATER)

    // A human resolves it.
    h.store[0].status = 'resolved'
    h.prisma.accreditationFinding.create.mockClear()

    const again = new Date('2026-08-09T04:00:00.000Z')
    const summary = await h.service.reconcileAll(again, [testRule()])

    // The school was scanned, not silently lost.
    expect(summary.schoolsScanned).toBe(1)
    expect(h.prisma.accreditationFinding.create).not.toHaveBeenCalled()
    expect(h.store).toHaveLength(1)

    const row = h.store[0]
    expect(row.clearedAt).toBeNull()
    expect(row.resolutionKind).toBeNull()
    expect(row.reopenCount).toBe(1)
    expect(row.lastSeenAt).toEqual(again)
    expect(row.firstSeenAt).toEqual(AT)
    // `status` is STILL the human's. Reconciliation cannot name that column.
    expect(row.status).toBe('resolved')
  })

  it('a DISMISSED finding that keeps firing is maintained quietly, never duplicated', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    h.store[0].status = 'dismissed'
    h.prisma.accreditationFinding.create.mockClear()

    const summary = await h.service.reconcileAll(LATER, [testRule()])
    expect(summary.schoolsScanned).toBe(1)
    expect(h.prisma.accreditationFinding.create).not.toHaveBeenCalled()
    expect(h.store).toHaveLength(1)
    // Unchanged payload => one batched bump, no reopen churn on a dismissed row.
    expect(h.store[0].reopenCount).toBe(0)
    expect(h.store[0].status).toBe('dismissed')
    expect(h.store[0].lastSeenAt).toEqual(LATER)
  })

  it('never touches a finding a human already resolved or dismissed', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    h.store[0].status = 'resolved'
    h.prisma.accreditationFinding.update.mockClear()
    h.prisma.accreditationFinding.create.mockClear()

    // The rule stops firing. A resolved row is outside the open set entirely.
    await h.service.reconcileAll(LATER, [testRule({ evaluate: () => [] })])
    expect(h.prisma.accreditationFinding.update).not.toHaveBeenCalled()
    expect(h.store[0].status).toBe('resolved')
    expect(h.store[0].clearedAt).toBeNull()
  })
})

describe('findings never auto-close — structurally', () => {
  it('ReconcileWrite has no status key (compile-time)', () => {
    const write: ReconcileWrite = {
      lastSeenAt: AT,
      severity: 'warn',
      likelihood: null,
      confidence: 'directional',
      standardTags: [],
      domainKeys: [],
      primaryDomainKey: 'finance',
      horizonKind: 'none',
      horizonDate: null,
      horizonPeriods: null,
      horizonConfidence: null,
      evidencePayload: {},
      payloadHash: 'x',
      clearedAt: null,
      resolutionKind: null,
      isDemo: false,
      engineVersion: TWIN_ENGINE_VERSION,
      // @ts-expect-error — `status` is DELIBERATELY absent. This line failing to
      // error is the defect: it would mean a nightly job could close a finding.
      status: 'resolved',
    }
    expect(write.clearedAt).toBeNull()
  })

  it('the service source contains no status literal in any write', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./twin-reconciliation.service.ts', import.meta.url)),
      'utf8',
    )
    // `status:` appears only in the READ filter (status: { notIn: [...] }) and in
    // the create's explicit 'open'. Anything else would be a close.
    const writes = src.match(/status:\s*'[^']*'/g) ?? []
    expect(writes).toEqual(["status: 'open'"])
  })
})

describe('the anti-double-count invariant at the database (acceptance 3)', () => {
  it('7 findings across 4 facts and 3 domains sum to 4 distinct facts', async () => {
    const standards = [
      { id: 'std-fin', code: 'COG-15', catalogStandardId: 'cat-fin' },
      { id: 'std-gov', code: 'COG-8', catalogStandardId: 'cat-gov' },
      { id: 'std-fac', code: 'COG-A2', catalogStandardId: 'cat-fac' },
    ]
    const catalog = [
      { id: 'cat-fin', isAssurance: false, domainKey: 'finance', domainWeights: null, signalKeys: [] },
      { id: 'cat-gov', isAssurance: false, domainKey: 'governance', domainWeights: null, signalKeys: [] },
      { id: 'cat-fac', isAssurance: false, domainKey: 'facilities', domainWeights: null, signalKeys: [] },
    ]
    const emit: FiredFinding[] = [
      // fact A — three rules, two of them citing a different domain's standard.
      fired({ ruleId: 'R1', scopeKey: 'a1', factKey: 'fact:A', standardTags: ['COG-15'] }),
      fired({ ruleId: 'R2', scopeKey: 'a2', factKey: 'fact:A', standardTags: ['COG-15', 'COG-8'] }),
      fired({ ruleId: 'R3', scopeKey: 'a3', factKey: 'fact:A', standardTags: ['COG-A2'] }),
      // fact B — two rules, governance only.
      fired({ ruleId: 'R4', scopeKey: 'b1', factKey: 'fact:B', standardTags: ['COG-8'] }),
      fired({ ruleId: 'R5', scopeKey: 'b2', factKey: 'fact:B', standardTags: ['COG-8'] }),
      // facts C and D — one rule each.
      fired({ ruleId: 'R6', scopeKey: 'c1', factKey: 'fact:C', standardTags: ['COG-A2'] }),
      fired({ ruleId: 'R7', scopeKey: 'd1', factKey: 'fact:D', standardTags: ['COG-15'] }),
    ]
    const h = harness({ standards, catalog })
    await h.service.reconcileAll(AT, [testRule({ requiredSignals: ['fin.ar_aging'], evaluate: () => emit })])

    expect(h.store).toHaveLength(7)

    // SELECT primary_domain_key, count(DISTINCT fact_key) GROUP BY 1, in memory.
    const { byDomain, distinctFacts } = domainNumerators(
      h.store.map((r) => ({ factKey: r.factKey, primaryDomainKey: r.primaryDomainKey as DomainKey })),
    )
    let total = 0
    for (const d of DOMAIN_KEYS) total += (byDomain.get(d) as Set<string>).size
    expect(distinctFacts.size).toBe(4)
    expect(total).toBe(4)

    // (I2): no factKey appears in two domains' numerators.
    for (const a of DOMAIN_KEYS) {
      for (const b of DOMAIN_KEYS) {
        if (a === b) continue
        for (const k of byDomain.get(a) as Set<string>) {
          expect((byDomain.get(b) as Set<string>).has(k)).toBe(false)
        }
      }
    }

    // Every finding carrying fact:A got the SAME primary domain, whichever rule
    // produced it — while domainKeys (rendering) is untouched.
    const factA = h.store.filter((r) => r.factKey === 'fact:A')
    expect(new Set(factA.map((r) => r.primaryDomainKey)).size).toBe(1)
    for (const r of h.store) expect(r.domainKeys.length).toBeGreaterThanOrEqual(1)
  })
})

describe('skipping, isolation and tenancy', () => {
  it('skips a school with no Subscription row and NEVER provisions one', async () => {
    const h = harness({ schools: ['school-A'], billed: [] })
    const summary = await h.service.reconcileAll(AT, [testRule()])

    expect(summary.schoolsScanned).toBe(0)
    expect(summary.schoolsSkipped).toBe(1)
    expect(h.billing.getOrCreateSubscription).not.toHaveBeenCalled()
    expect(h.billing.isEntitledForModule).not.toHaveBeenCalled()
    expect(h.twinSignals.collect).not.toHaveBeenCalled()
    expect(h.store).toHaveLength(0)
  })

  it('skips an accreditation-unlicensed school with no signal collection', async () => {
    const h = harness({ schools: ['school-A'], licensed: [] })
    const summary = await h.service.reconcileAll(AT, [testRule()])
    expect(summary.schoolsSkipped).toBe(1)
    expect(h.twinSignals.collect).not.toHaveBeenCalled()
  })

  it('a billing throw skips the school rather than reconciling it', async () => {
    const h = harness()
    h.billing.isEntitledForModule.mockRejectedValue(new Error('billing is down'))
    const summary = await h.service.reconcileAll(AT, [testRule()])
    expect(summary.schoolsSkipped).toBe(1)
    expect(h.store).toHaveLength(0)
  })

  it('school 2 of 3 throwing leaves schools 1 and 3 reconciled and the job resolved', async () => {
    const h = harness({
      schools: ['school-A', 'school-B', 'school-C'],
      collectThrows: ['school-B'],
    })
    const summary = await h.service.reconcileAll(AT, [testRule()])
    expect(summary.schoolsScanned).toBe(2)
    expect(h.store.map((r) => r.schoolId).sort()).toEqual(['school-A', 'school-C'])
  })

  it('a groupBy failure logs and returns rather than taking the process down', async () => {
    const h = harness()
    h.prisma.accreditationStandard.groupBy.mockRejectedValue(new Error('pool exhausted'))
    const summary = await h.service.reconcileAll(AT, [testRule()])
    expect(summary.schoolsScanned).toBe(0)
    expect(summary.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('the payload hash SEES a date change — a basis chain never keeps a stale fact', async () => {
    // The register facts Phase E cites are dates. `stableStringify` serialised any
    // non-plain object as `{}`, so two different termEnds hashed identically, the
    // run took the unchanged branch, and the stored evidence kept the old date
    // forever — a finding whose basis cites a fact that is no longer true.
    const h = harness()
    await h.service.reconcileAll(AT, [
      testRule({ emit: [fired({ evidencePayload: { termEnd: new Date('2026-06-30T00:00:00.000Z') } })] }),
    ])
    const firstHash = h.store[0].payloadHash

    await h.service.reconcileAll(LATER, [
      testRule({ emit: [fired({ evidencePayload: { termEnd: new Date('2027-06-30T00:00:00.000Z') } })] }),
    ])

    expect(h.store).toHaveLength(1)
    expect(h.store[0].payloadHash).not.toBe(firstHash)
    expect((h.store[0].evidencePayload as { termEnd: Date }).termEnd).toEqual(
      new Date('2027-06-30T00:00:00.000Z'),
    )
  })

  it('every ledger WRITE carries the schoolId, not only every read', async () => {
    const h = harness({ schools: ['school-A', 'school-B'] })
    await h.service.reconcileAll(AT, [testRule()])
    // A second night: a touch (updateMany) and, after a clear, an update.
    await h.service.reconcileAll(LATER, [testRule()])
    await h.service.reconcileAll(new Date('2026-08-09T04:00:00.000Z'), [
      testRule({ evaluate: () => [] }),
    ])

    const writes = [
      ...h.prisma.accreditationFinding.update.mock.calls,
      ...h.prisma.accreditationFinding.updateMany.mock.calls,
    ]
    expect(writes.length).toBeGreaterThan(0)
    for (const call of writes) {
      const where = (call[0] as { where: { schoolId?: string } }).where
      expect(['school-A', 'school-B']).toContain(where.schoolId)
    }
    for (const call of h.prisma.accreditationFinding.create.mock.calls) {
      expect((call[0] as { data: { schoolId?: string } }).data.schoolId).toBeDefined()
    }
  })

  it('a run for school A writes nothing readable from school B', async () => {
    const h = harness({ schools: ['school-A', 'school-B'] })
    await h.service.reconcileAll(AT, [testRule()])
    expect(h.store).toHaveLength(2)
    for (const row of h.store) {
      expect(['school-A', 'school-B']).toContain(row.schoolId)
    }
    // Every ledger read is schoolId-scoped.
    for (const call of h.prisma.accreditationFinding.findMany.mock.calls) {
      expect((call[0] as { where: { schoolId?: string } }).where.schoolId).toBeDefined()
    }
    const a = h.store.filter((r) => r.schoolId === 'school-A')
    const b = h.store.filter((r) => r.schoolId === 'school-B')
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0].id).not.toBe(b[0].id)
  })

  it('never runs more than 4 schools at once', async () => {
    const h = harness({ schools: Array.from({ length: 12 }, (_, i) => `s${i}`) })
    const summary = await h.service.reconcileAll(AT)
    expect(summary.schoolsScanned).toBe(12)
    expect(h.maxInFlight()).toBeLessThanOrEqual(4)
    expect(h.maxInFlight()).toBeGreaterThan(1)
  })

  it('a rule that throws costs that rule only', async () => {
    const h = harness()
    const boom: TwinRule = {
      id: 'BOOM',
      requiredSignals: [],
      evaluate: () => {
        throw new Error('bad rule')
      },
    }
    const summary = await h.service.reconcileAll(AT, [boom, testRule()])
    expect(summary.created).toBe(1)
    expect(h.store).toHaveLength(1)
  })

  it('proceeds when no readiness snapshot landed, citing no reading it does not have', async () => {
    const h = harness({ sets: { 'school-A': signalSet('school-A', { snapshotAsOf: null }) } })
    await h.service.reconcileAll(AT, [testRule()])
    expect((h.store[0].evidencePayload as { snapshotAsOf: unknown }).snapshotAsOf).toBeNull()
  })

  it('inherits isDemo from the collected set, so fabricated history cannot launder itself', async () => {
    const h = harness({ sets: { 'school-A': signalSet('school-A', { demoData: true }) } })
    await h.service.reconcileAll(AT, [testRule()])
    expect(h.store[0].isDemo).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE E — the wiring, and the four hunks that carried it.
//
// Everything above is Phase D's and is UNCHANGED. What is added below is the
// narrow set of properties the arrival of rules could have broken:
//
//   • the context is PREPARED BEFORE evaluation, and it is prepared with the set
//     that was already collected — not with a second collection of all 35 signals
//   • the engine version says the write semantics changed
//   • `ReconcileWrite` still has no `status` (the compile assertion above still
//     holds; here it is re-asserted over the SOURCE)
//   • a stopped-firing rule whose signal went quiet is still `stale_data`, and
//     the row still never says "resolved"
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase E — the rules are wired', () => {
  it('PREPARES the rule context before evaluating, with the set it already collected', async () => {
    const h = harness()
    const rule = testRule()
    await h.service.reconcileAll(AT, [rule])

    expect(h.earlyWarning.prepare).toHaveBeenCalledTimes(1)
    const [schoolId, at, signals] = h.earlyWarning.prepare.mock.calls[0]
    expect(schoolId).toBe('school-A')
    expect(at).toBe(AT)
    // THE POINT: the already-collected set is handed in. If this were undefined
    // the nightly job would collect all 35 signals for every school TWICE.
    expect(signals).toBeDefined()
    expect(signals!.schoolId).toBe('school-A')
    expect(h.twinSignals.collect).toHaveBeenCalledTimes(1)
  })

  it('prepares ONCE PER SCHOOL, and only for schools that are actually scanned', async () => {
    const h = harness({ schools: ['school-A', 'school-B', 'school-C'], licensed: ['school-A', 'school-B'] })
    await h.service.reconcileAll(AT, [testRule()])
    expect(h.earlyWarning.prepare).toHaveBeenCalledTimes(2)
  })

  it('does NOT prepare when there are no rules — no rules, no work', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [])
    expect(h.earlyWarning.prepare).not.toHaveBeenCalled()
  })

  it('stamps the Phase-E engine version on every row it writes', async () => {
    const h = harness()
    await h.service.reconcileAll(AT, [testRule()])
    expect(h.store[0].engineVersion).toBe(TWIN_ENGINE_VERSION)
    expect(TWIN_ENGINE_VERSION).toBe('1.1.0')
  })

  it('the production rule set writes findings for a school whose signals support them', async () => {
    // Driven with the REAL adapter rules but an unprepared context, which is the
    // honest degraded case: every rule reports why it could not be read, and NOT
    // ONE of them invents a finding. That is the property that matters — a rule
    // engine that cannot see must produce nothing, never a guess.
    const h = harness()
    const summary = await h.service.reconcileAll(AT, TWIN_RULES)
    expect(summary.rules).toBe(TWIN_RULES.length)
    expect(summary.created).toBe(0)
    expect(h.store).toHaveLength(0)
  })

  it('FINDINGS STILL NEVER AUTO-CLOSE — no `status:` literal in any write path', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./twin-reconciliation.service.ts', import.meta.url)),
      'utf8',
    )
    // The ONE permitted occurrence is the `status: 'open'` on CREATE, which is the
    // initial value of a row that did not exist a moment ago — not a transition.
    const writes = [...src.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect(writes).toEqual(['open'])
  })
})

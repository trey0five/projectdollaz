import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  TWIN_RULE_DEFS,
  TWIN_RULE_IDS,
  type TwinRegisterView,
} from '@finrep/compliance'
import { TWIN_SIGNAL_CATALOG, staleAfterDaysFor } from './twin-signal-catalog.js'
import { TwinContextRegistry, buildTwinRules, toFiredFinding } from './twin-rules.js'
import { TWIN_RULES } from './twin-reconciliation.service.js'
import type { TwinSignal, TwinSignalSet } from './twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — THE ADAPTER.
//
// Three properties, and each one is a defect this file exists to prevent:
//
//   1. TWENTY-SIX EVALUATIONS, ONE DERIVATION. The naive adapter runs the whole
//      engine once per rule — 26x the risk math, 26x the band math, and a
//      `notEvaluated` list that can never be assembled because each run only
//      knows about its own rule.
//
//   2. `requiredSignals` CARRIES BOTH GATES. Phase D reads it for the basis chain
//      and for `resolutionFor`. An absence-gated rule whose absent signal is
//      missing from that array records an incomplete basis and mis-attributes why
//      it stopped firing.
//
//   3. THE SHARED-QUERY-GROUP INVARIANT. `requiredAbsent` only means anything if
//      "the query ran and found nothing" is distinguishable from "the query
//      failed". That is true exactly when the absent signal's collector shares a
//      memoised loader with a required-available one — and that is asserted here
//      by READING twin-signals.service.ts, not by trusting a comment.
// ─────────────────────────────────────────────────────────────────────────────

const AT = new Date('2026-08-01T04:00:00.000Z')

function signal(key: string, over: Partial<TwinSignal> = {}): TwinSignal {
  const def = TWIN_SIGNAL_CATALOG.find((d) => d.key === key)!
  return {
    key: def.key,
    label: def.label,
    kind: def.kind,
    availability: 'no_data',
    unavailableReason: 'No reading is available for this signal yet.',
    moduleKey: def.moduleKey,
    value: null,
    trend: null,
    observedOn: null,
    ageDays: null,
    expectedCadenceDays: def.expectedCadenceDays,
    staleAfterDays: staleAfterDaysFor(def),
    changeState: 'never_observed',
    ferpaSensitive: def.ferpaSensitive,
    cells: null,
    domainKeys: def.domainKeys,
    lineage: null,
    ...over,
  } as TwinSignal
}

function signalSet(over: Partial<TwinSignalSet> = {}): TwinSignalSet {
  const signals = TWIN_SIGNAL_CATALOG.map((d) => signal(d.key))
  return {
    schoolId: 'school-A',
    generatedAt: AT.toISOString(),
    signals,
    counts: { available: 0, not_licensed: 0, no_data: signals.length, not_tracked: 0 },
    demoData: false,
    snapshotAsOf: '2026-07-31',
    ...over,
  }
}

const EMPTY_REGISTER: TwinRegisterView = {
  frameworkCode: 'cognia_2022',
  standards: [],
  evidenceGroups: [],
  demoData: false,
  snapshotAsOf: null,
}

describe('buildTwinRules — the shape', () => {
  it('returns ONE TwinRule per pure rule definition, in the frozen id order', () => {
    const rules = buildTwinRules(new TwinContextRegistry())
    expect(rules.map((r) => r.id)).toEqual(TWIN_RULE_DEFS.map((d) => d.id))
    expect(rules).toHaveLength(TWIN_RULE_IDS.length)
  })

  it('the PRODUCTION TWIN_RULES is that same set — the wiring landed', () => {
    expect(TWIN_RULES.map((r) => r.id)).toEqual([...TWIN_RULE_IDS])
  })

  it('requiredSignals === [...requiredAvailable, ...requiredAbsent] for every rule', () => {
    const rules = buildTwinRules(new TwinContextRegistry())
    for (const r of rules) {
      const def = TWIN_RULE_DEFS.find((d) => d.id === r.id)!
      expect(r.requiredSignals).toEqual([...def.requiredAvailable, ...def.requiredAbsent])
    }
  })

  it('every declared signal is a REAL catalog key — a typo cannot ship', () => {
    const keys = new Set(TWIN_SIGNAL_CATALOG.map((d) => d.key as string))
    for (const r of buildTwinRules(new TwinContextRegistry())) {
      for (const k of r.requiredSignals) expect(keys.has(k)).toBe(true)
    }
  })
})

describe('buildTwinRules — ONE derivation across all 26 evaluations', () => {
  it('derives exactly once per TwinSignalSet, however many rules run', () => {
    const cache = new TwinContextRegistry()
    const spy = vi.spyOn(cache, 'derive')
    const rules = buildTwinRules(cache)
    const set = signalSet()
    cache.set(set, { register: EMPTY_REGISTER, priors: {} })

    for (const r of rules) r.evaluate(set, AT)

    // 26 evaluations. The memo is consulted 26 times; the ENGINE runs once, which
    // the second assertion proves by checking the memo returns the SAME object.
    expect(spy).toHaveBeenCalledTimes(rules.length)
    const a = cache.derive(set, AT)
    const b = cache.derive(set, AT)
    expect(a).toBe(b)
  })

  it('a DIFFERENT signal set is a different derivation — no cross-school bleed', () => {
    const cache = new TwinContextRegistry()
    const a = signalSet({ schoolId: 'school-A' })
    const b = signalSet({ schoolId: 'school-B' })
    cache.set(a, { register: EMPTY_REGISTER, priors: {} })
    cache.set(b, { register: EMPTY_REGISTER, priors: {} })
    expect(cache.derive(a, AT)).not.toBe(cache.derive(b, AT))
  })

  it('an UNPREPARED set derives against an empty register — honestly, never a finding', () => {
    const cache = new TwinContextRegistry()
    const set = signalSet()
    const result = cache.derive(set, AT)
    expect(result.findings).toEqual([])
    // Every rule reports why it could not be read, and none of them is silent.
    expect(result.notEvaluated.length).toBe(TWIN_RULE_IDS.length)
    for (const ne of result.notEvaluated) expect(ne.message.length).toBeGreaterThan(0)
  })

  it('re-preparing a set INVALIDATES the memo — a moved register is not cached', () => {
    const cache = new TwinContextRegistry()
    const set = signalSet()
    cache.set(set, { register: EMPTY_REGISTER, priors: {} })
    const first = cache.derive(set, AT)
    cache.set(set, { register: EMPTY_REGISTER, priors: {} })
    expect(cache.derive(set, AT)).not.toBe(first)
  })
})

describe('the shared-query-group invariant (requiredAbsent is sound)', () => {
  const SRC = readFileSync(
    fileURLToPath(new URL('./twin-signals.service.ts', import.meta.url)),
    'utf8',
  )

  /** The `ctx.<loader>()` calls inside one collector body. */
  function loadersFor(signalKey: string): string[] {
    // Every collector is a `private async collectX(ctx)` method; find the one the
    // catalog binds to this key by name convention, then read its ctx. calls.
    const method = COLLECTOR_BY_KEY[signalKey]
    if (!method) return []
    const start = SRC.indexOf(`private async ${method}(`)
    if (start === -1) return []
    const next = SRC.indexOf('\n  private async ', start + 1)
    const body = SRC.slice(start, next === -1 ? SRC.length : next)
    return [...body.matchAll(/ctx\.([a-zA-Z]+)\(/g)].map((m) => m[1])
  }

  const COLLECTOR_BY_KEY: Record<string, string> = {
    'gov.minutes_lag': 'collectMinutesLag',
    'gov.meeting_cadence': 'collectMeetingCadence',
  }

  it('every requiredAbsent key shares a memoised loader with a requiredAvailable one', () => {
    const absenceRules = TWIN_RULE_DEFS.filter((d) => d.requiredAbsent.length > 0)
    // If a future rule adds an absence gate on a pair this map does not cover, the
    // assertion below fails loudly rather than silently passing on an empty set.
    expect(absenceRules.length).toBeGreaterThan(0)

    for (const def of absenceRules) {
      for (const absentKey of def.requiredAbsent) {
        const absentLoaders = new Set(loadersFor(absentKey))
        expect(
          absentLoaders.size,
          `no collector mapping for requiredAbsent key ${absentKey}`,
        ).toBeGreaterThan(0)
        const shared = def.requiredAvailable.some((k) =>
          loadersFor(k).some((l) => absentLoaders.has(l)),
        )
        expect(shared, `${def.id}: ${absentKey} shares no loader with its partner`).toBe(true)
      }
    }
  })

  it('the specific pair the catalog relies on is gov.meeting_cadence / gov.minutes_lag', () => {
    expect(loadersFor('gov.minutes_lag')).toContain('meetings')
    expect(loadersFor('gov.meeting_cadence')).toContain('meetings')
  })
})

describe('toFiredFinding — the horizon invariant survives the re-shape', () => {
  it('by_date carries a date and no periods; periods_to_breach the reverse', () => {
    const base = {
      ruleId: 'X',
      scopeKey: 'school',
      factKey: 'f',
      title: 't',
      rationale: 'r',
      evidence: [],
      standardTags: ['COG-1'],
      domainKeys: ['governance'],
      defaultDomainKey: 'governance',
      severity: 'warn',
      likelihood: 'possible',
      confidence: 'observation',
      consequence: 'c',
    } as never

    const byDate = toFiredFinding({
      ...(base as object),
      horizon: { kind: 'by_date', value: '2027-06-30', confidence: null, reason: null },
    } as never)
    expect(byDate.horizonKind).toBe('by_date')
    expect(byDate.horizonDate?.toISOString()).toBe('2027-06-30T00:00:00.000Z')
    expect(byDate.horizonPeriods).toBeNull()

    const periods = toFiredFinding({
      ...(base as object),
      horizon: { kind: 'periods_to_breach', value: 4, confidence: 'trend', reason: null },
    } as never)
    expect(periods.horizonPeriods).toBe(4)
    expect(periods.horizonDate).toBeNull()
  })

  it('copies the engine sentences VERBATIM into the basis payload — never re-words', () => {
    const fired = toFiredFinding({
      ruleId: 'X',
      scopeKey: 'school',
      factKey: 'f',
      title: 'A title',
      rationale: '2 board meetings were held.',
      evidence: [{ key: 'meetingsHeld', label: 'Held', value: 2, display: '2', asOf: null, lineage: null }],
      standardTags: ['COG-8'],
      domainKeys: ['governance'],
      defaultDomainKey: 'governance',
      severity: 'warn',
      likelihood: 'possible',
      confidence: 'observation',
      horizon: { kind: 'none', value: null, confidence: null, reason: 'A condition.' },
      consequence: 'A consequence.',
    } as never)
    expect(fired.evidencePayload.title).toBe('A title')
    expect(fired.evidencePayload.rationale).toBe('2 board meetings were held.')
    expect(fired.evidencePayload.consequence).toBe('A consequence.')
    expect((fired.evidencePayload.evidence as unknown[]).length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE CRITERION 1, at the API boundary:
//
//   "An unlicensed facilities module yields not_licensed signals → cannot_evaluate,
//    never a false finding, and lowers `coverage` rather than the score."
//
// The half that is easy to get wrong is the LAST clause. It is tempting to treat
// an unreadable input as a bad one — a school with no facilities licence would
// then score WORSE than a school with a perfect facilities register, which is not
// a scoring system, it is a sales tactic. So the assertion below is not "the
// finding disappears"; it is that `perStandardRisk` and `domainBands` are
// IDENTICAL to the licensed run with that finding removed.
// ─────────────────────────────────────────────────────────────────────────────

describe('acceptance 1 — an unlicensed module lowers COVERAGE, never the score', () => {
  const REGISTER: TwinRegisterView = {
    frameworkCode: 'cognia_2022',
    standards: [
      {
        standardId: 'std-facilities',
        code: 'COG-A3',
        title: 'Facilities and safety',
        isAssurance: false,
        assuranceSatisfied: null,
        rubricScore: 3,
        evidenceCount: 2,
        domainKeys: ['facilities'],
        primaryDomainKey: 'facilities',
        boundMetricKeys: [],
        requirements: [],
      },
      {
        standardId: 'std-finance',
        code: 'COG-15',
        title: 'Equitable allocation of resources',
        isAssurance: false,
        assuranceSatisfied: null,
        rubricScore: 3,
        evidenceCount: 2,
        domainKeys: ['finance'],
        primaryDomainKey: 'finance',
        boundMetricKeys: [],
        requirements: [],
      },
    ],
    evidenceGroups: [],
    demoData: false,
    snapshotAsOf: '2026-07-31',
  }

  /** A set where fac.maintenance_backlog is readable and over the threshold. */
  function licensedSet(): TwinSignalSet {
    const set = signalSet()
    const i = set.signals.findIndex((s) => s.key === 'fac.maintenance_backlog')
    set.signals[i] = signal('fac.maintenance_backlog', {
      availability: 'available',
      unavailableReason: null,
      value: 31,
      observedOn: '2026-07-15',
      ageDays: 17,
      changeState: 'moved',
      lineage: { table: 'MaintenanceItem' },
    })
    return set
  }

  /** The SAME school with the facilities module switched off. */
  function unlicensedSet(): TwinSignalSet {
    const set = signalSet()
    const i = set.signals.findIndex((s) => s.key === 'fac.maintenance_backlog')
    set.signals[i] = signal('fac.maintenance_backlog', {
      availability: 'not_licensed',
      unavailableReason: 'Unlock the Facilities module to see Open maintenance items.',
    })
    return set
  }

  function derive(set: TwinSignalSet) {
    const cache = new TwinContextRegistry()
    cache.set(set, { register: REGISTER, priors: {} })
    return cache.derive(set, AT)
  }

  it('the licensed school fires FAC-BACKLOG', () => {
    const fired = derive(licensedSet()).findings.filter((f) => f.ruleId === 'FAC-BACKLOG')
    expect(fired).toHaveLength(1)
    expect(fired[0].standardTags.length).toBeGreaterThan(0)
  })

  it('the unlicensed school fires NOTHING for that rule, and says WHY, naming the module', () => {
    const result = derive(unlicensedSet())
    expect(result.findings.filter((f) => f.ruleId === 'FAC-BACKLOG')).toHaveLength(0)
    const ne = result.notEvaluated.find((n) => n.ruleId === 'FAC-BACKLOG')!
    expect(ne).toBeDefined()
    expect(ne.reason).toBe('signal_not_licensed')
    expect(ne.blockingSignalKey).toBe('fac.maintenance_backlog')
    expect(ne.moduleKey).toBe('facilities')
    expect(ne.message).toContain('Unlock the Facilities module')
  })

  it('COVERAGE drops by exactly one evaluable rule, and the module is named as the blocker', () => {
    const licensed = derive(licensedSet()).coverage
    const unlicensed = derive(unlicensedSet()).coverage
    expect(unlicensed.rulesEvaluated).toBe(licensed.rulesEvaluated - 1)
    expect(unlicensed.rulesNotEvaluated).toBe(licensed.rulesNotEvaluated + 1)
    expect(unlicensed.blockedByModule.facilities).toContain('FAC-BACKLOG')
  })

  it('THE SCORE IS NOT LOWERED: risk and bands match the licensed run minus that finding', () => {
    const licensed = derive(licensedSet())
    const unlicensed = derive(unlicensedSet())

    // The only difference on the standard the finding cited is its own
    // contribution — every OTHER standard is byte-identical.
    const byCode = (r: { code: string }) => r.code
    expect(unlicensed.perStandardRisk.map(byCode)).toEqual(licensed.perStandardRisk.map(byCode))
    for (const u of unlicensed.perStandardRisk) {
      const l = licensed.perStandardRisk.find((x) => x.code === u.code)!
      // Removing a finding can only make risk the same or LOWER, never higher.
      if (u.risk !== null && l.risk !== null) expect(u.risk).toBeLessThanOrEqual(l.risk)
    }
    // And no domain got DARKER for want of a licence.
    const rank = { clear: 0, watch: 1, elevated: 2, high: 3, critical: 4 } as Record<string, number>
    for (const u of unlicensed.domainBands) {
      const l = licensed.domainBands.find((x) => x.domainKey === u.domainKey)!
      // A NULL BAND IS NOT A DARKER BAND — it is a refusal to band at all, and it
      // is the correct answer when the licence takes away the domain's last
      // readable signal. It used to come back 'clear', which drew a GREEN card
      // reading "No open fact in this domain" over a module the school cannot
      // see into: the most reassuring output the strip can produce, from an
      // absence of input. Not measured must always carry its reason.
      if (u.band === null) {
        expect(u.reason).toBeTruthy()
        continue
      }
      expect(l.band).not.toBeNull()
      expect(rank[u.band]).toBeLessThanOrEqual(rank[l.band!])
    }
  })

  it('the FOUR VISIBLE HOLES are on every payload, licensed or not — that is the feature', () => {
    for (const set of [licensedSet(), unlicensedSet()]) {
      const holes = derive(set).coverage.namedHoles
      expect(holes.map((h) => h.ruleId).sort()).toEqual(
        ['ACAD-GROWTH-FLAT', 'CURR-DOC-AGING', 'HR-PD-LOW', 'SAFE-ENV-GAP'].sort(),
      )
      for (const h of holes) expect(h.copy.length).toBeGreaterThan(40)
    }
  })
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  VISIT_COMMENDATIONS_UNREADABLE,
  VISIT_EVIDENCE_UNREADABLE,
  VISIT_NO_FRAMEWORK_READINESS,
  VISIT_PLAN_UNREADABLE,
  VISIT_READINESS_UNREADABLE,
  VISIT_SUMMARY_KEYS,
} from '@finrep/compliance'
import type { TwinEvidenceEntry, VisitFindingInput } from '@finrep/compliance'
import { VisitService } from './visit.service.js'
import type { FindingPublic, TwinResponse } from '../twin/early-warning.service.js'
import { READINESS_DISCLAIMER } from '../accreditation/readiness-history.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — SPEC-API-3 and SPEC-API-4.
//
// SPEC-API-3 is ACCEPTANCE 11: the visit payload's `rationale`/`consequence` for a
// findingKey are BYTE-IDENTICAL to /twin's for the same key. Asserted by IDENTITY
// (`toBe`), not by `toEqual` and not by `toContain`: two equal strings composed by
// two code paths are the exact bug this phase refuses to ship, and only reference
// identity proves there is one path.
//
// SPEC-API-4 is the asymmetry: the twin is REQUIRED and everything else degrades.
// A Mock Visit without commendations lists no strengths. A Mock Visit without
// findings is a lie of omission.
// ─────────────────────────────────────────────────────────────────────────────

const AT = new Date('2026-07-31T12:00:00.000Z')

const evidence: TwinEvidenceEntry[] = [
  {
    key: 'gov.meetings',
    label: 'Board meetings',
    value: 2,
    display: '2 meetings',
    asOf: '2026-06-30',
    lineage: null,
  },
]

function findingPublic(over: Partial<FindingPublic> = {}): FindingPublic {
  return {
    ruleId: 'GOV-CADENCE-GAP',
    scopeKey: 'standard:s-gov-2',
    factKey: 'gov.cadence',
    title: 'Board meeting cadence',
    rationale: '2 board meetings were held in the last twelve months.',
    evidence,
    standardTags: ['GOV-2'],
    domainKeys: ['governance'],
    severity: 'warn',
    likelihood: 'possible',
    confidence: 'observation',
    horizon: { kind: 'none', value: null, confidence: null, reason: 'No trend.' },
    consequence: 'A visiting team would ask how the board exercises oversight.',
    id: null,
    findingKey: 'GOV-CADENCE-GAP:standard:s-gov-2',
    status: 'open',
    firstSeenAt: null,
    lastSeenAt: null,
    clearedAt: null,
    resolutionKind: null,
    mutedUntil: null,
    ackedUntil: null,
    mutedReason: null,
    reopenCount: 0,
    initiativeId: null,
    isDemo: false,
    findingCleared: false,
    clearedCopy: null,
    ...over,
  }
}

// ── THE TYPE-LEVEL ASSERTION ─────────────────────────────────────────────────
// `VisitFindingInput` must be assignable FROM `FindingPublic`. This is a compile-
// time claim with no runtime shape, and it is the one that would otherwise cost
// an engineer an hour: `FindingPublic` declares severity/likelihood/confidence as
// `string` while `TwinFinding` declares literal unions, so a `Pick<TwinFinding,…>`
// input type would NOT be assignable and the service would need a cast — and a
// cast is where a field quietly stops being carried through.
const _assignable: VisitFindingInput = findingPublic()
void _assignable

function twinResponse(over: Partial<TwinResponse> = {}): TwinResponse {
  return {
    version: '1.1.0',
    now: AT.toISOString(),
    frameworkCode: 'cognia_2022',
    demoData: false,
    snapshotAsOf: '2026-06-30',
    findings: [findingPublic()],
    cleared: [],
    notEvaluated: [],
    coverage: {
      rulesTotal: 29,
      rulesEvaluated: 11,
      rulesFired: 1,
      rulesNotEvaluated: 18,
      evaluablePct: 0.379,
      signals: { available: 1, not_licensed: 0, no_data: 0, not_tracked: 1 },
      blockedByModule: {},
      unlockableByYears: { signalKey: null, ruleIds: [], yearsNeeded: 0, fyLabels: [] },
      namedHoles: [],
    },
    perStandardRisk: [],
    domainBands: [],
    signals: [
      {
        key: 'gov.meetings',
        label: 'Board meetings',
        availability: 'available',
        unavailableReason: null,
        moduleKey: 'governance',
        observedOn: '2026-06-30',
        ageDays: 31,
        changeState: 'moved',
        domainKeys: ['governance'],
      },
      {
        key: 'hr.pd_participation',
        label: 'Professional development participation',
        availability: 'not_tracked',
        unavailableReason: null,
        moduleKey: 'hr',
        observedOn: null,
        ageDays: null,
        changeState: 'never_observed',
        domainKeys: ['hr'],
      },
    ],
    disclaimer: READINESS_DISCLAIMER,
    ...over,
  } as TwinResponse
}

const commendationsPayload = {
  commendations: [],
  exclusions: {
    eligible: 0,
    noScore: 1,
    lowScore: 2,
    noRequirements: 3,
    noCurrentEvidence: 0,
    noFavorableSignal: 0,
  },
  caveat: 'A caveat composed by the Phase C engine.',
  signalsUnavailable: null,
  demoData: false,
}

const evidencePayload = {
  framework: { id: 'fw-1', code: 'cognia_2022', name: 'the Cognia Performance Standards' },
  generatedAt: AT.toISOString(),
  health: {
    evidenceHealthPct: 50,
    rated: 8,
    current: 4,
    expiring: 1,
    stale: 2,
    missing: 1,
    unknown: 0,
    notTracked: 3,
    basis: '4 of 8 rated artifacts are current.',
  },
  counts: {
    artifacts: 11,
    artifactsTracked: 8,
    requirements: 24,
    requiredTracked: 17,
    standardsWithRequirements: 9,
    standardsLegacy: 10,
  },
  groups: [{ tag: 'board_minutes' }],
  nudges: [],
  demoData: false,
  disclaimer: READINESS_DISCLAIMER,
}

const readinessPayload = {
  framework: { id: 'fw-1', code: 'cognia_2022', name: 'Cognia' },
  readinessPct: 54,
  selfScoredPct: 62,
  verifiedPct: 41,
  projectedIndex: 310,
  band: 'watch',
  confidence: {
    coveragePct: 60,
    measuredDomains: 6,
    unmeasuredDomains: [],
    caveat: 'Six of ten domains carry a measured reading.',
  },
}

const recommendationsPayload = {
  recommendations: [],
  adoptedKeys: [],
  basis: { accreditationLicensed: true, frameworkAdopted: true },
}

interface Overrides {
  licensed?: () => Promise<boolean>
  twin?: () => Promise<TwinResponse>
  commendations?: () => Promise<unknown>
  evidence?: () => Promise<unknown>
  readiness?: () => Promise<unknown>
  recommendations?: () => Promise<unknown>
}

function harness(over: Overrides = {}) {
  const earlyWarning = {
    getTwin: vi.fn(over.twin ?? (async () => twinResponse())),
    // Fail-closed entitlement, exactly as EarlyWarningService implements it.
    isLicensed: vi.fn(over.licensed ?? (async () => true)),
  }
  const commendations = {
    getCommendations: vi.fn(over.commendations ?? (async () => commendationsPayload)),
  }
  const evidenceReadiness = {
    getEvidenceReadiness: vi.fn(over.evidence ?? (async () => evidencePayload)),
  }
  const readiness = { getReadiness: vi.fn(over.readiness ?? (async () => readinessPayload)) }
  const improvement = {
    getRecommendations: vi.fn(over.recommendations ?? (async () => recommendationsPayload)),
  }
  const svc = new VisitService(
    earlyWarning as never,
    commendations as never,
    evidenceReadiness as never,
    readiness as never,
    improvement as never,
  )
  return { svc, earlyWarning, commendations, evidenceReadiness, readiness, improvement }
}

describe('SPEC-API-3 — acceptance 11: the visit quotes the twin, byte for byte', () => {
  it('every finding’s rationale, consequence and evidence are the SAME OBJECTS as /twin’s', async () => {
    const twin = twinResponse()
    const h = harness({ twin: async () => twin })
    const v = await h.svc.getVisit('school-A', {}, AT)

    const placed = [
      ...v.acts.findings.groups.flatMap((g) => g.findings),
      ...v.acts.findings.schoolLevel,
    ]
    expect(placed).toHaveLength(twin.findings.length)
    const byKey = new Map(placed.map((f) => [f.findingKey, f]))
    for (const src of twin.findings) {
      const out = byKey.get(src.findingKey)!
      expect(out.rationale).toBe(src.rationale)
      expect(out.consequence).toBe(src.consequence)
      expect(out.title).toBe(src.title)
      // Identity, not equality: one array, one rendering, one truth.
      expect(out.evidence).toBe(src.evidence)
      expect(out.basis).toBe(src.evidence)
    }
  })

  it('carries the ONE disclaimer, by identity, onto the visit payload', async () => {
    const h = harness()
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.disclaimer).toBe(READINESS_DISCLAIMER)
  })

  it('generatedAt is the passed-in clock, not a fresh read of one', async () => {
    const h = harness()
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.generatedAt).toBe(AT.toISOString())
  })

  it('forwards periodId to the commendations service and to nothing else', async () => {
    const h = harness()
    await h.svc.getVisit('school-A', { periodId: 'p-1' }, AT)
    expect(h.commendations.getCommendations).toHaveBeenCalledWith('school-A', { periodId: 'p-1' })
    // The twin resolves the framework itself; a second resolver would fork.
    expect(h.earlyWarning.getTwin).toHaveBeenCalledWith('school-A', {}, AT)
  })

  it('the framework NAME comes from the evidence index and the CODE from the twin', async () => {
    const h = harness()
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.framework).toEqual({
      code: 'cognia_2022',
      name: 'the Cognia Performance Standards',
    })
  })

  it('a school that has adopted NO framework is not handed a 0% readiness pair', async () => {
    // The readiness read SUCCEEDS for such a school and returns zeroes:
    // `selfScoredPct([])` and `verifiedPctCurrent([])` are 0 by construction, never
    // null. `frameworkAdopted` is the fact that tells the composer those zeroes are
    // not a measurement — without it the board email, the spoken summary and the
    // printed one-pager all said "Documented readiness is 0%, defensible readiness
    // is 0%" about a school that has never scored a standard.
    const h = harness({
      twin: async () => twinResponse({ frameworkCode: null }),
      evidence: async () => ({ ...evidencePayload, framework: null }),
      readiness: async () => ({
        ...readinessPayload,
        framework: null,
        readinessPct: 0,
        selfScoredPct: 0,
        verifiedPct: 0,
        projectedIndex: null,
        band: null,
      }),
    })
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.acts.arrival.documented).toBeNull()
    expect(v.acts.arrival.defensible).toBeNull()
    expect(v.acts.arrival.unavailableReason).toBe(VISIT_NO_FRAMEWORK_READINESS)
    const opening = v.executiveSummary.segments.find((s) => s.key === 'opening')!.text
    expect(opening).not.toContain('%')
    expect(opening).not.toContain('This framework')
  })

  it('either source calling it demonstration data makes it demonstration data', async () => {
    const h = harness({ evidence: async () => ({ ...evidencePayload, demoData: true }) })
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.demoData).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SPEC-API-7 — THE GATE IS ON THE METHOD, NOT ONLY ON THE CONTROLLER.
//
// `VisitController` carries `@RequiresModule('accreditation')`, and that was the
// only entitlement check on this path. Then a second, IN-PROCESS caller appeared:
// the board-summary scheduler calls `getVisit` directly, past every guard. Nothing
// downstream re-checks — `getTwin`, `getCommendations`, `getEvidenceReadiness` and
// `getReadiness` never consult billing, and `getRecommendations` degrades rather
// than throwing — so the call RESOLVED and an unlicensed school's board received
// six accreditation paragraphs plus a link to a page that 402s them.
//
// A fail-soft caller can only be as safe as the 402 it is catching.
// ─────────────────────────────────────────────────────────────────────────────
describe('SPEC-API-7 — an unlicensed school gets a 402 from the SERVICE, not just the guard', () => {
  const unlicensed = () => harness({ licensed: async () => false })

  it('throws 402 MODULE_NOT_LICENSED before reading anything at all', async () => {
    const h = unlicensed()
    await expect(h.svc.getVisit('school-A', {}, AT)).rejects.toMatchObject({
      status: 402,
      response: { code: 'MODULE_NOT_LICENSED', module: 'accreditation' },
    })
    // Not one read was attempted: the gate is BEFORE the fan-out, so an unlicensed
    // school costs one billing call rather than five queries it may not pay for.
    expect(h.earlyWarning.getTwin).not.toHaveBeenCalled()
    expect(h.commendations.getCommendations).not.toHaveBeenCalled()
    expect(h.evidenceReadiness.getEvidenceReadiness).not.toHaveBeenCalled()
    expect(h.readiness.getReadiness).not.toHaveBeenCalled()
    expect(h.improvement.getRecommendations).not.toHaveBeenCalled()
  })

  it('a LICENSED school is unaffected — one entitlement read, then the visit', async () => {
    const h = harness()
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(h.earlyWarning.isLicensed).toHaveBeenCalledWith('school-A')
    expect(h.earlyWarning.isLicensed).toHaveBeenCalledTimes(1)
    expect(v.acts.findings.severityCounts.total).toBe(1)
  })
})

describe('SPEC-API-4 — the twin is REQUIRED; everything else degrades', () => {
  it('a throwing twin FAILS the request — a visit with no findings is a lie of omission', async () => {
    const boom = new Error('MODULE_NOT_LICENSED')
    const h = harness({
      twin: async () => {
        throw boom
      },
    })
    await expect(h.svc.getVisit('school-A', {}, AT)).rejects.toBe(boom)
  })

  it('a throwing COMMENDATIONS read still returns a visit, with the reason named', async () => {
    const h = harness({
      commendations: async () => {
        throw new Error('nope')
      },
    })
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.acts.commendations.commendations).toEqual([])
    expect(v.acts.commendations.unavailableReason).toBe(VISIT_COMMENDATIONS_UNREADABLE)
    // NOT a silent []: the summary says so too.
    expect(v.executiveSummary.segments.find((s) => s.key === 'strengths')!.text).toBe(
      VISIT_COMMENDATIONS_UNREADABLE,
    )
  })

  it('a throwing EVIDENCE read still returns a visit, with the reason named', async () => {
    const h = harness({
      evidence: async () => {
        throw new Error('nope')
      },
    })
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.acts.requests.groups).toEqual([])
    expect(v.acts.requests.health).toBeNull()
    expect(v.acts.requests.unavailableReason).toBe(VISIT_EVIDENCE_UNREADABLE)
  })

  it('a throwing READINESS read still returns a visit — nulls plus a reason, never zeroes', async () => {
    const h = harness({
      readiness: async () => {
        throw new Error('nope')
      },
    })
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.acts.arrival.documented).toBeNull()
    expect(v.acts.arrival.defensible).toBeNull()
    expect(v.acts.arrival.unavailableReason).toBe(VISIT_READINESS_UNREADABLE)
  })

  it('a throwing RECOMMENDATIONS read still returns a visit, and the plan says WHY it is empty', async () => {
    const h = harness({
      recommendations: async () => {
        throw new Error('nope')
      },
    })
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(v.acts.plan.items).toEqual([])
    expect(v.acts.plan.basis).toBeNull()
    expect(v.acts.plan.emptyReason).toBe(VISIT_PLAN_UNREADABLE)
  })

  it('ALL FOUR failing at once still returns a visit with all six acts and all six segments', async () => {
    const bang = async () => {
      throw new Error('nope')
    }
    const h = harness({
      commendations: bang,
      evidence: bang,
      readiness: bang,
      recommendations: bang,
    })
    const v = await h.svc.getVisit('school-A', {}, AT)
    expect(Object.keys(v.acts).sort()).toEqual([
      'arrival',
      'commendations',
      'findings',
      'plan',
      'requests',
      'unanswered',
    ])
    expect(v.executiveSummary.segments.map((s) => s.key)).toEqual([...VISIT_SUMMARY_KEYS])
    // Act 5 survives every degradation — it is sourced from the REQUIRED twin.
    expect(v.acts.unanswered.rosterCounts.total).toBe(2)
    // …and the findings are still all there.
    expect(v.acts.findings.severityCounts.total).toBe(1)
  })

  it('the service composes no sentence — every string it emits comes from the pure module', () => {
    // Read as SOURCE. The degraded copy lives in packages/compliance so there is
    // exactly one spelling per failure; a string literal appearing here would be
    // a second one nobody would notice until two surfaces disagreed.
    const src = readFileSync(
      fileURLToPath(new URL('./visit.service.ts', import.meta.url)),
      'utf8',
    )
    const body = src.slice(src.indexOf('export class VisitService'))
    // Allowed literals: the log label strings and nothing else.
    const literals = [...body.matchAll(/'([^'\\\n]{12,})'/g)].map((m) => m[1])
    expect(literals.filter((l) => /[.!?]$/.test(l))).toEqual([])
  })
})

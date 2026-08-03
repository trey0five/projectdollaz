// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — SPEC-PURE-1..4. The Mock Visit composer.
//
// What these specs are actually defending:
//   1. THE BASIS CHAIN IS THE ENGINE'S ARRAY. Not a copy, not a mapping — the
//      same reference. A copy is how one fact acquires two renderings.
//   2. NO PERCENTAGE ON ANY FINDING. Phase E's likelihood is an ordinal word and
//      the composer writes no string about a finding, so there is nothing that
//      COULD introduce one; the spec proves the absence rather than trusting it.
//   3. THE EXECUTIVE SUMMARY IS FROZEN AND ALWAYS SIX SEGMENTS. A variable-length
//      summary cannot be compared byte-for-byte between the spoken surface and
//      the printed one, which is acceptance 3.
//   4. ACT 5 IS POPULATED AND NEVER BLANK.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import {
  NO_REASON_GIVEN,
  SCHOOL_LEVEL_FINDING_NOTE,
  VISIT_COMMENDATIONS_UNREADABLE,
  VISIT_EVIDENCE_INDEX_ROUTE,
  VISIT_EVIDENCE_UNREADABLE,
  VISIT_NO_COMMENDATION,
  VISIT_NO_FINDING,
  VISIT_NO_FRAMEWORK_LABEL,
  VISIT_NO_FRAMEWORK_READINESS,
  VISIT_PLAN_ALL_ADOPTED,
  VISIT_PLAN_LIMIT,
  VISIT_PLAN_NOT_LICENSED,
  VISIT_PLAN_NO_FRAMEWORK,
  VISIT_PLAN_UNREADABLE,
  VISIT_READINESS_UNREADABLE,
  VISIT_SUMMARY_KEYS,
  VISIT_VERSION,
  composeMockVisit,
} from '../src/index.js'
import type { Recommendation, VisitInput } from '../src/index.js'
import {
  VISIT_FIXTURE_DISCLAIMER,
  visitFixtureFindings,
  visitFixtureInput,
  visitFixtureRecommendations,
} from './fixtures.js'

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

const NUMERAL_RE = /\d+(?:\.\d+)?/g

describe('SPEC-PURE-1 — the basis chain, the partition, and determinism', () => {
  it('every finding carries at least one basis row, with an observed value and a date', () => {
    const v = composeMockVisit(visitFixtureInput())
    const all = [...v.acts.findings.groups.flatMap((g) => g.findings), ...v.acts.findings.schoolLevel]
    expect(all.length).toBeGreaterThan(0)
    for (const f of all) {
      // A finding with an empty basis is a bug, not a finding. Asserted here
      // rather than filtered at runtime — a filter would silently hide it.
      expect(f.basis.length, f.findingKey).toBeGreaterThanOrEqual(1)
      for (const b of f.basis) {
        expect(typeof b.display, `${f.findingKey} / ${b.key}`).toBe('string')
        expect(b.display.length).toBeGreaterThan(0)
        // `asOf` may be null — "we have this value and no date for it" is a real
        // state — but the KEY must exist so a renderer can say so.
        expect(Object.prototype.hasOwnProperty.call(b, 'asOf')).toBe(true)
      }
    }
  })

  it('basis IS evidence — the same array reference, never a mapped copy', () => {
    const input = visitFixtureInput()
    const v = composeMockVisit(input)
    const byKey = new Map(
      [...v.acts.findings.groups.flatMap((g) => g.findings), ...v.acts.findings.schoolLevel].map(
        (f) => [f.findingKey, f],
      ),
    )
    for (const src of input.findings) {
      const out = byKey.get(src.findingKey)
      expect(out, src.findingKey).toBeDefined()
      expect(out!.basis).toBe(src.evidence)
      expect(out!.evidence).toBe(src.evidence)
      // And the prose is carried BYTE-IDENTICAL. The composer writes no sentence
      // about a finding, so these are identity comparisons, not `toContain`.
      expect(out!.title).toBe(src.title)
      expect(out!.rationale).toBe(src.rationale)
      expect(out!.consequence).toBe(src.consequence)
    }
  })

  it('the partition is TOTAL — every finding lands in exactly one place', () => {
    const input = visitFixtureInput()
    const v = composeMockVisit(input)
    const placed = [
      ...v.acts.findings.groups.flatMap((g) => g.findings),
      ...v.acts.findings.schoolLevel,
    ]
    expect(placed).toHaveLength(input.findings.length)
    expect(new Set(placed.map((f) => f.findingKey)).size).toBe(input.findings.length)
    expect(v.acts.findings.severityCounts.total).toBe(input.findings.length)
  })

  it('a finding with no standard code goes school-level, under the frozen note', () => {
    const v = composeMockVisit(visitFixtureInput())
    expect(v.acts.findings.schoolLevel.map((f) => f.findingKey)).toEqual([
      'SCHOOL-NOT-REPORTING:school',
    ])
    expect(v.acts.findings.schoolLevelNote).toBe(SCHOOL_LEVEL_FINDING_NOTE)
  })

  it('a multi-code finding appears ONCE, with the rest as alsoServes', () => {
    const v = composeMockVisit(visitFixtureInput())
    const hits = v.acts.findings.groups.filter((g) =>
      g.findings.some((f) => f.findingKey === 'GOV-CADENCE-GAP:standard:s-gov-2'),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].code).toBe('GOV-2')
    const f = hits[0].findings.find((x) => x.findingKey === 'GOV-CADENCE-GAP:standard:s-gov-2')!
    expect(f.alsoServes).toEqual(['GOV-4'])
  })

  it('groups order by worst severity, then code ASCII — and are stable under permutation', () => {
    const v = composeMockVisit(visitFixtureInput())
    expect(v.acts.findings.groups.map((g) => g.code)).toEqual(['FIN-1', 'GOV-2'])
    expect(v.acts.findings.groups.map((g) => g.worstSeverity)).toEqual(['critical', 'warn'])

    const reversed = composeMockVisit(
      visitFixtureInput({ findings: [...visitFixtureFindings].reverse() }),
    )
    expect(reversed.acts.findings.groups.map((g) => g.code)).toEqual(['FIN-1', 'GOV-2'])
  })

  it('two runs over one input are byte-identical, and the input is not mutated', () => {
    const input = deepFreeze(visitFixtureInput())
    const a = composeMockVisit(input)
    const b = composeMockVisit(input)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('carries the version, the passed-in `now` and the passed-in disclaimer VERBATIM', () => {
    const input = visitFixtureInput()
    const v = composeMockVisit(input)
    expect(v.version).toBe(VISIT_VERSION)
    expect(v.generatedAt).toBe(input.now)
    // The composer never contains the sentence. It copies whatever it is handed.
    expect(v.disclaimer).toBe(VISIT_FIXTURE_DISCLAIMER)
    expect(v.disclaimer).toBe(input.disclaimer)
  })

  it('`worked` is the Phase G back-link, not a re-derivation', () => {
    const v = composeMockVisit(visitFixtureInput())
    const all = [...v.acts.findings.groups.flatMap((g) => g.findings), ...v.acts.findings.schoolLevel]
    expect(all.filter((f) => f.worked).map((f) => f.findingKey)).toEqual([
      'GOV-POLICY-OVERDUE:standard:s-gov-2',
    ])
  })
})

describe('SPEC-PURE-2 — acceptance 2: NO PERCENTAGE APPEARS ON ANY FINDING', () => {
  it('nothing under acts.findings contains a percent sign', () => {
    const v = composeMockVisit(visitFixtureInput())
    const json = JSON.stringify(v.acts.findings)
    expect(json).not.toContain('%')
  })

  it('likelihood stays an ordinal word on every finding', () => {
    const v = composeMockVisit(visitFixtureInput())
    const all = [...v.acts.findings.groups.flatMap((g) => g.findings), ...v.acts.findings.schoolLevel]
    for (const f of all) {
      expect(['possible', 'likely'], f.findingKey).toContain(f.likelihood)
      expect(String(f.likelihood)).not.toMatch(/\d/)
    }
  })

  it('the composer introduces no string of its own onto a finding card', () => {
    // Every string on a VisitFinding must be traceable to the input finding. The
    // only added members are `basis` (an array), `worked` (a boolean) and
    // `alsoServes` (a slice of standardTags).
    const input = visitFixtureInput()
    const v = composeMockVisit(input)
    const byKey = new Map(input.findings.map((f) => [f.findingKey, f]))
    for (const f of [
      ...v.acts.findings.groups.flatMap((g) => g.findings),
      ...v.acts.findings.schoolLevel,
    ]) {
      const src = byKey.get(f.findingKey)!
      const added = Object.keys(f).filter((k) => !(k in src))
      expect(added.sort()).toEqual(['alsoServes', 'basis', 'worked'])
    }
  })
})

describe('SPEC-PURE-3 — acceptance 3, half one: the frozen executive summary', () => {
  it('is ALWAYS all six keys, ALWAYS in order, never an empty text', () => {
    for (const input of [
      visitFixtureInput(),
      visitFixtureInput({
        findings: [],
        commendations: null,
        evidence: null,
        readiness: null,
        recommendations: null,
        recommendationsBasis: null,
      }),
    ]) {
      const s = composeMockVisit(input).executiveSummary
      expect(s.segments.map((x) => x.key)).toEqual([...VISIT_SUMMARY_KEYS])
      for (const seg of s.segments) expect(seg.text.trim().length, seg.key).toBeGreaterThan(0)
    }
  })

  it('THE FROZEN SNAPSHOT for the shared fixture', () => {
    const s = composeMockVisit(visitFixtureInput()).executiveSummary
    expect(s.segments).toEqual([
      {
        key: 'opening',
        text: 'A visiting team would arrive to the Cognia Performance Standards. Documented readiness is 62%, defensible readiness is 41%. The projected index is 310, which bands as watch.',
      },
      {
        key: 'strengths',
        text: 'A visiting team would commend 1 standard we can defend with a score, current evidence and a favorable operating figure.',
      },
      {
        key: 'findings',
        text: 'They would likely raise 4 findings — 2 critical, 1 to watch, 1 informational — across 2 named standards, with 1 raised with the head of school rather than under a code.',
      },
      {
        key: 'evidence',
        text: 'They would ask for 11 artifacts; of the 8 we rate for currency, 4 are current today.',
      },
      {
        key: 'unanswered',
        text: 'We could not answer 2 named questions. Of the 5 signals we track we could read 2, and 2 rules could not be evaluated at all.',
      },
      { key: 'plan', text: 'The draft plan commits to 2 pieces of work.' },
    ])
  })

  it('THE NUMERAL RULE — every numeral in every segment is in allowedNumerals', () => {
    for (const input of [
      visitFixtureInput(),
      visitFixtureInput({ findings: [], commendations: null }),
      visitFixtureInput({ readiness: null, evidence: null }),
      visitFixtureInput({ recommendations: null, recommendationsBasis: null }),
    ]) {
      const s = composeMockVisit(input).executiveSummary
      const allow = new Set(s.allowedNumerals)
      for (const seg of s.segments) {
        for (const t of seg.text.match(NUMERAL_RE) ?? []) {
          expect(allow.has(t), `${seg.key} emitted an unallowed numeral ${t}: ${seg.text}`).toBe(
            true,
          )
        }
      }
    }
  })

  it('every degraded source gets its FROZEN sentence rather than a silent zero', () => {
    const s = composeMockVisit(
      visitFixtureInput({
        readiness: null,
        commendations: null,
        evidence: null,
        recommendations: null,
        recommendationsBasis: null,
        findings: [],
      }),
    ).executiveSummary
    const text = Object.fromEntries(s.segments.map((x) => [x.key, x.text]))
    expect(text.opening).toContain(VISIT_READINESS_UNREADABLE)
    expect(text.strengths).toBe(VISIT_COMMENDATIONS_UNREADABLE)
    expect(text.findings).toBe(VISIT_NO_FINDING)
    expect(text.evidence).toBe(VISIT_EVIDENCE_UNREADABLE)
    expect(text.plan).toBe(VISIT_PLAN_UNREADABLE)
  })

  it('zero commendations is a legitimate answer with its own frozen sentence', () => {
    const base = visitFixtureInput()
    const s = composeMockVisit(
      visitFixtureInput({
        commendations: { ...base.commendations!, commendations: [] },
      }),
    ).executiveSummary
    expect(s.segments.find((x) => x.key === 'strengths')!.text).toBe(VISIT_NO_COMMENDATION)
  })
})

describe('SPEC-PURE-4 — ACT 5, which must not be cut', () => {
  it('is populated from all three sources for the shared fixture', () => {
    const a = composeMockVisit(visitFixtureInput()).acts.unanswered
    expect(a.namedHoles.length).toBeGreaterThan(0)
    expect(a.rules.length).toBeGreaterThan(0)
    expect(a.rosterCounts.total).toBe(5)
    expect(a.upsell.map((u) => u.moduleKey)).toEqual(['facilities', 'hr'])
    expect(a.unlockableByYears.fyLabels).toEqual(['FY2023–24', 'FY2022–23'])
  })

  it('the roster is partitioned and each partition is sorted by key ASCII', () => {
    const a = composeMockVisit(visitFixtureInput()).acts.unanswered
    expect(a.signalRows.available.map((r) => r.key)).toEqual(['fin.days_cash', 'gov.meetings'])
    expect(a.signalRows.notLicensed.map((r) => r.key)).toEqual(['fac.inspections'])
    expect(a.signalRows.noData.map((r) => r.key)).toEqual(['acad.growth'])
    expect(a.signalRows.notTracked.map((r) => r.key)).toEqual(['hr.pd_participation'])
    const sum =
      a.signalRows.available.length +
      a.signalRows.notLicensed.length +
      a.signalRows.noData.length +
      a.signalRows.notTracked.length
    expect(sum).toBe(a.rosterCounts.total)
  })

  it('a row with a NULL unavailableReason renders NO_REASON_GIVEN, never blank', () => {
    const a = composeMockVisit(visitFixtureInput()).acts.unanswered
    const row = a.signalRows.notTracked.find((r) => r.key === 'hr.pd_participation')!
    // The collector's own field is carried through VERBATIM …
    expect(row.unavailableReason).toBeNull()
    // … and the field the screen renders is never empty.
    expect(row.reasonText).toBe(NO_REASON_GIVEN)
    for (const part of [
      a.signalRows.notLicensed,
      a.signalRows.noData,
      a.signalRows.notTracked,
    ]) {
      for (const r of part) expect(r.reasonText, r.key).toBeTruthy()
    }
    // An AVAILABLE row has nothing to explain, and says so with null rather than
    // with a sentence that would read as a failure.
    for (const r of a.signalRows.available) expect(r.reasonText).toBeNull()
  })

  it('named holes, not-evaluated rules and unlockableByYears are carried VERBATIM', () => {
    const input = visitFixtureInput()
    const a = composeMockVisit(input).acts.unanswered
    expect(a.namedHoles).toBe(input.coverage.namedHoles)
    expect(a.rules).toBe(input.notEvaluated)
    expect(a.unlockableByYears).toBe(input.coverage.unlockableByYears)
  })
})

describe('the other five acts', () => {
  it('ACT 1 speaks the DOCUMENTED / DEFENSIBLE pair and never a bare evaluablePct', () => {
    const a = composeMockVisit(visitFixtureInput()).acts.arrival
    expect(a.documented).toBe(62)
    expect(a.defensible).toBe(41)
    expect(a.asOfLine).toBe('Figures are as of 30 June 2026.')
    expect(a.evaluableLine).toBe("11 of 29 rules could be evaluated on today's data.")
    expect(a.evaluableLine).not.toContain('%')
    expect(a.unavailableReason).toBeNull()
  })

  it('ACT 1 degrades to nulls plus the frozen reason, never to zeroes', () => {
    const a = composeMockVisit(visitFixtureInput({ readiness: null })).acts.arrival
    expect(a.documented).toBeNull()
    expect(a.defensible).toBeNull()
    expect(a.projectedIndex).toBeNull()
    expect(a.unavailableReason).toBe(VISIT_READINESS_UNREADABLE)
  })

  // ── A SCHOOL WITH NO ADOPTED FRAMEWORK ─────────────────────────────────────
  // The readiness read SUCCEEDS for such a school and returns the pair of zeroes
  // `selfScoredPct([])` / `verifiedPctCurrent([])` produce by construction. This
  // is the exact shape the API sends, verified against readiness.service.ts, and
  // quoting it told a school "Documented readiness is 0%, defensible readiness is
  // 0%" — a measured-sounding score for a measurement that never happened, in the
  // same sentence that called the school framework-less, on a page whose Act 6
  // correctly said there was nothing to plan against.
  const NO_FRAMEWORK: Partial<VisitInput> = {
    framework: { code: null, name: null },
    frameworkAdopted: false,
    readiness: {
      readinessPct: 0,
      selfScoredPct: 0,
      verifiedPct: 0,
      projectedIndex: null,
      band: null,
      confidence: {
        coveragePct: 0,
        measuredDomains: 0,
        unmeasuredDomains: [],
        caveat: 'No framework has been adopted, so no domain carries a measured reading.',
      },
    },
    recommendations: [],
    recommendationsBasis: { accreditationLicensed: true, frameworkAdopted: false },
  }

  it('ACT 1 states NO readiness figure for a school with no adopted framework', () => {
    const a = composeMockVisit(visitFixtureInput(NO_FRAMEWORK)).acts.arrival
    // NOT 0. "Nothing scored yet" and "scored at zero" are different facts, and
    // only one of them is about the school.
    expect(a.documented).toBeNull()
    expect(a.defensible).toBeNull()
    expect(a.readinessPct).toBeNull()
    expect(a.projectedIndex).toBeNull()
    expect(a.band).toBeNull()
    expect(a.unavailableReason).toBe(VISIT_NO_FRAMEWORK_READINESS)
    // …and it is NOT the failed-read sentence: the read worked fine.
    expect(a.unavailableReason).not.toBe(VISIT_READINESS_UNREADABLE)
    expect(a.frameworkLabel).toBe(VISIT_NO_FRAMEWORK_LABEL)
  })

  it('the OPENING never quotes a zero, and never says "This framework" when there is none', () => {
    const v = composeMockVisit(visitFixtureInput(NO_FRAMEWORK))
    const opening = v.executiveSummary.segments.find((s) => s.key === 'opening')!.text
    expect(opening).toBe(
      `A visiting team would arrive to ${VISIT_NO_FRAMEWORK_LABEL}. ${VISIT_NO_FRAMEWORK_READINESS}`,
    )
    expect(opening).not.toContain('0%')
    expect(opening).not.toContain('%')
    expect(opening).not.toContain('This framework')
    // The whole summary is consistent with itself: Act 6 says the same thing.
    expect(v.acts.plan.emptyReason).toBe(VISIT_PLAN_NO_FRAMEWORK)
  })

  it('a FAILED read beats a missing framework — we say the thing we are sure of', () => {
    const a = composeMockVisit(
      visitFixtureInput({ ...NO_FRAMEWORK, readiness: null }),
    ).acts.arrival
    expect(a.unavailableReason).toBe(VISIT_READINESS_UNREADABLE)
    expect(a.documented).toBeNull()
  })

  it('a flag claiming adoption cannot outvote a label that denies it', () => {
    // `frameworkAdopted: true` with no code and no name would otherwise emit
    // "A visiting team would arrive to a school with no adopted accreditation
    // framework. Documented readiness is 0%…" — one sentence, two answers.
    const a = composeMockVisit(
      visitFixtureInput({ ...NO_FRAMEWORK, frameworkAdopted: true }),
    ).acts.arrival
    expect(a.documented).toBeNull()
    expect(a.unavailableReason).toBe(VISIT_NO_FRAMEWORK_READINESS)
  })

  it('an ADOPTED framework with no index still says so — the clause is not collateral damage', () => {
    const v = composeMockVisit(
      visitFixtureInput({
        readiness: {
          readinessPct: 54,
          selfScoredPct: 62,
          verifiedPct: 41,
          projectedIndex: null,
          band: null,
          confidence: null,
        },
      }),
    )
    const opening = v.executiveSummary.segments.find((s) => s.key === 'opening')!.text
    expect(opening).toContain('Documented readiness is 62%')
    expect(opening).toContain('This framework publishes no index.')
  })

  it('ACT 2 carries the Phase C engine through and RE-RUNS NOTHING', () => {
    const input = visitFixtureInput()
    const a = composeMockVisit(input).acts.commendations
    expect(a.commendations).toBe(input.commendations!.commendations)
    expect(a.caveat).toBe(input.commendations!.caveat)
    expect(a.exclusions).toBe(input.commendations!.exclusions)
  })

  it('ACT 4 points at the Evidence Index that already exists and re-sorts nothing', () => {
    const input = visitFixtureInput()
    const a = composeMockVisit(input).acts.requests
    expect(a.indexRoute).toBe(VISIT_EVIDENCE_INDEX_ROUTE)
    expect(a.groups).toBe(input.evidence!.groups)
    expect(a.health).toBe(input.evidence!.health)
  })

  it('ACT 6 excludes adopted work, orders by real lift with nulls LAST, and caps at the limit', () => {
    const a = composeMockVisit(visitFixtureInput()).acts.plan
    expect(a.limit).toBe(VISIT_PLAN_LIMIT)
    // 's-gov-2' is in adoptedKeys, so the evidence-gap card is gone.
    expect(a.items.map((i) => i.originRef)).toEqual([
      's-aca-3',
      'FIN-RESERVE-THIN:standard:s-fin-1',
    ])
    expect(a.moreAvailable).toBe(0)
    expect(a.emptyReason).toBeNull()
    // Every field is COPIED. The composer writes no recommendation text.
    expect(a.items[0].title).toBe(visitFixtureRecommendations[0].title)
    expect(a.items[0].estimatedLift).toBe(visitFixtureRecommendations[0].estimatedLift)
  })

  it('ACT 6 caps at VISIT_PLAN_LIMIT and counts the remainder honestly', () => {
    const many: Recommendation[] = Array.from({ length: 9 }, (_, i) => ({
      ...visitFixtureRecommendations[0],
      originRef: `s-many-${i}`,
      estimatedLift: { points: 10 - i, basis: 'nextStepLift' },
    }))
    const a = composeMockVisit(visitFixtureInput({ recommendations: many, adoptedKeys: [] })).acts
      .plan
    expect(a.items).toHaveLength(VISIT_PLAN_LIMIT)
    expect(a.moreAvailable).toBe(4)
    expect(a.items.map((i) => i.originRef)).toEqual([
      's-many-0',
      's-many-1',
      's-many-2',
      's-many-3',
      's-many-4',
    ])
  })

  it('an EMPTY plan says WHICH empty it is — three different facts, three sentences', () => {
    const cases: [Partial<VisitInput>, string][] = [
      [
        {
          recommendations: [],
          recommendationsBasis: { accreditationLicensed: false, frameworkAdopted: false },
        },
        VISIT_PLAN_NOT_LICENSED,
      ],
      [
        {
          recommendations: [],
          recommendationsBasis: { accreditationLicensed: true, frameworkAdopted: false },
        },
        VISIT_PLAN_NO_FRAMEWORK,
      ],
      [
        {
          recommendations: [],
          recommendationsBasis: { accreditationLicensed: true, frameworkAdopted: true },
        },
        VISIT_PLAN_ALL_ADOPTED,
      ],
      [{ recommendations: null, recommendationsBasis: null }, VISIT_PLAN_UNREADABLE],
    ]
    for (const [over, expected] of cases) {
      const a = composeMockVisit(visitFixtureInput(over)).acts.plan
      expect(a.items).toHaveLength(0)
      expect(a.emptyReason).toBe(expected)
    }
  })

  it('acts is an OBJECT with six fixed keys — never an array a client could filter', () => {
    const v = composeMockVisit(visitFixtureInput())
    expect(Array.isArray(v.acts)).toBe(false)
    expect(Object.keys(v.acts).sort()).toEqual([
      'arrival',
      'commendations',
      'findings',
      'plan',
      'requests',
      'unanswered',
    ])
  })
})

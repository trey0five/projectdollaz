// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — the recommendation templates.
//
// Four of the sections below are not "tests" in the ordinary sense; they are the
// enforcement mechanism for promises this phase makes to a school in writing:
//
//   §1 every numeral in a rendered recommendation traces to the INPUT record it
//      was built from — by regex extraction, over every template (the Phase E
//      precedent);
//   §2 `estimatedLift` and `estimatedLiftReason` are an exclusive-or, in both
//      directions, so a null lift is always accompanied by a stated reason and a
//      real lift is never accompanied by an excuse;
//   §3 evidence work and assurance gates NEVER quote an index gain — proven with
//      a large, tempting `fullLift` sitting right there in the input;
//   §4 a lift is COPIED, byte-identical, never rounded or re-derived.
//
// If one of these fails, the correct response is to fix the engine. There is no
// version of "adjust the assertion" that leaves the product honest.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'

import {
  ASSURANCE_NOT_INDEXED_REASON,
  EVIDENCE_NOT_INDEXED_REASON,
  FINDING_NOT_STANDARD_SCOPED_REASON,
  FINDING_STANDARD_NOT_A_GAP_REASON,
  ZERO_LIFT_REASON,
  IMPROVEMENT_FINDINGS_VERSION,
  NO_INDEX_SCALE_REASON,
  OWNER_ROLE_BY_DOMAIN,
  RECOMMENDATION_LIMIT,
  RECOMMENDATION_TEMPLATE_IDS,
  composeFindingKey,
  computeRecommendations,
  type ImprovementAssuranceInput,
  type ImprovementFindingInput,
  type ImprovementGapInput,
  type Recommendation,
  type RecommendationInput,
  type SuggestedOwnerRole,
} from '../src/improvement-findings.js'
import { DOMAIN_KEYS } from '../src/accreditation-domains.js'
import { RUBRIC_MAX } from '../src/accreditation-readiness.js'

const NOW = '2026-07-31'

// ─────────────────────────────────────────────────────────────────────────────
// The fixture. An index-bearing framework (Cognia-shaped: 30 leaves, so
// nextStepLift = round1(100/30) = 3.3), with one of every branch:
//   s1  scored 2, evidenced        -> rubric step only
//   s2  UNRATED, no evidence       -> rubric step AND evidence gap
//   s3  scored 4, no evidence      -> evidence gap only (no room on the rubric)
//   s4  scored 3, evidenced        -> rubric step with an UNROUNDED lift
// plus one unmet and one satisfied assurance, and four findings spanning
// critical / warn / info and all three scope shapes.
// ─────────────────────────────────────────────────────────────────────────────

const GAPS: ImprovementGapInput[] = [
  {
    standardId: 's1',
    code: 'ACC-1.1',
    title: 'Purpose and direction',
    rubricScore: 2,
    evidenceGap: false,
    nextStepLift: 3.3,
    fullLift: 6.7,
    primaryDomainKey: 'governance',
    boundMetricKeys: ['board_meeting_cadence'],
  },
  {
    standardId: 's2',
    code: 'ACC-2.1',
    title: 'Financial resources sufficient to the program',
    rubricScore: null,
    evidenceGap: true,
    nextStepLift: 3.3,
    fullLift: 10,
    primaryDomainKey: 'finance',
    boundMetricKeys: ['operating_margin', 'months_operating_reserve'],
  },
  {
    standardId: 's3',
    code: 'ACC-3.1',
    title: 'Facilities support the program',
    rubricScore: 4,
    evidenceGap: true,
    // A large, TEMPTING lift on an evidence-only gap. §3 exists to prove it is
    // never quoted.
    nextStepLift: 9.7,
    fullLift: 9.7,
    primaryDomainKey: 'facilities',
    boundMetricKeys: [],
  },
  {
    standardId: 's4',
    code: 'ACC-4.1',
    title: 'Learning culture',
    rubricScore: 3,
    evidenceGap: false,
    // Deliberately unrounded: §4 asserts this arrives on the output byte-identical.
    nextStepLift: 3.3333333333333335,
    fullLift: 3.3333333333333335,
    primaryDomainKey: 'academic_excellence',
    boundMetricKeys: [],
  },
]

const ASSURANCES: ImprovementAssuranceInput[] = [
  {
    standardId: 's9',
    code: 'ASR-1',
    title: 'The governing body adopts and reviews policy',
    satisfied: false,
    primaryDomainKey: 'governance',
  },
  {
    standardId: 's10',
    code: 'ASR-2',
    title: 'Published tuition and fees',
    satisfied: true,
    primaryDomainKey: 'finance',
  },
]

const FINDINGS: ImprovementFindingInput[] = [
  {
    ruleId: 'FIN-RESERVE-THIN',
    scopeKey: 'standard:s2',
    title: 'Operating reserve is thin',
    severity: 'critical',
    standardTags: ['ACC-2.1'],
    primaryDomainKey: 'finance',
    consequence: 'A visiting team reads 1.2 months of reserve as a going-concern question.',
  },
  {
    ruleId: 'GOV-CADENCE-GAP',
    scopeKey: 'school',
    title: 'Board meeting cadence has slipped',
    severity: 'warn',
    standardTags: ['ACC-1.1'],
    primaryDomainKey: 'governance',
    consequence: 'The board has not met for 120 days, which a visiting team reads as drift.',
  },
  {
    ruleId: 'FAC-INSPECTION-DUE',
    scopeKey: 'standard:s99',
    title: 'A compliance inspection is due',
    severity: 'warn',
    standardTags: ['ACC-3.1'],
    primaryDomainKey: 'facilities',
    consequence: 'An expired inspection is a finding at the visit.',
  },
  {
    ruleId: 'ACC-EVIDENCE-NOTE',
    scopeKey: 'evidence:policy_manual',
    title: 'A note about the policy manual',
    severity: 'info',
    standardTags: [],
    primaryDomainKey: 'continuous_improvement',
    consequence: 'Nothing is wrong; this is a note.',
  },
]

function input(over: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    gaps: GAPS,
    assurances: ASSURANCES,
    findings: FINDINGS,
    adoptedKeys: [],
    now: NOW,
    limit: 50,
    ...over,
  }
}

/** The INPUT record a recommendation was built from, keyed by `originRef`. */
function inputRecordFor(rec: Recommendation, inp: RecommendationInput): unknown {
  if (rec.originType === 'finding') {
    return inp.findings.find((f) => composeFindingKey(f.ruleId, f.scopeKey) === rec.originRef)
  }
  if (rec.originType === 'assurance') {
    return inp.assurances.find((a) => a.standardId === rec.originRef)
  }
  return inp.gaps.find((g) => g.standardId === rec.originRef)
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

function shuffled<T>(xs: readonly T[]): T[] {
  // A FIXED permutation, not a random one — a spec that shuffles randomly proves
  // a different thing on every run and cannot be bisected when it fails.
  const out = [...xs]
  for (let i = 0; i < out.length; i++) {
    const j = (i * 7 + 3) % out.length
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

describe('AIC Phase G improvement recommendations', () => {
  it('publishes a semver version', () => {
    expect(IMPROVEMENT_FINDINGS_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §1 NUMERAL TRACEABILITY — the Phase E precedent, over every template
  // ───────────────────────────────────────────────────────────────────────────

  const NUMERAL = /-?\d[\d,]*(?:\.\d+)?/g
  const normalise = (s: string) => s.replace(/[,%$]/g, '')

  it('§1 every numeral in a rendered recommendation appears in its own input record', () => {
    const inp = input()
    const recs = computeRecommendations(inp)
    expect(recs.length).toBeGreaterThanOrEqual(7)

    const orphans: string[] = []
    for (const rec of recs) {
      const hay = normalise(JSON.stringify(inputRecordFor(rec, inp)))
      const rendered = `${rec.title} ${rec.rationale}`
      for (const m of rendered.match(NUMERAL) ?? []) {
        if (!hay.includes(normalise(m))) {
          orphans.push(`${rec.templateId} ${rec.originRef} :: orphan numeral "${m}" :: ${rendered}`)
        }
      }
    }
    expect(orphans).toEqual([])
  })

  it('§1 covers all four templates in one pass', () => {
    const seen = new Set(computeRecommendations(input()).map((r) => r.templateId))
    expect([...seen].sort()).toEqual([...RECOMMENDATION_TEMPLATE_IDS].sort())
  })

  it('§1 a numeral invented by the engine WOULD be caught (the check is not vacuous)', () => {
    const rec = computeRecommendations(input({ gaps: [GAPS[0] as ImprovementGapInput] }))[0] as Recommendation
    const hay = normalise(JSON.stringify(inputRecordFor(rec, input())))
    // The real rationale passes...
    expect((rec.rationale.match(NUMERAL) ?? []).every((m) => hay.includes(normalise(m)))).toBe(true)
    // ...and a fabricated one does not.
    const fabricated = 'One rubric level of movement is worth 41.9 index points.'
    expect((fabricated.match(NUMERAL) ?? []).some((m) => !hay.includes(normalise(m)))).toBe(true)
  })

  it('no rationale or title expresses anything as a percentage', () => {
    for (const rec of computeRecommendations(input())) {
      expect(rec.rationale).not.toContain('%')
      expect(rec.title).not.toContain('%')
      expect(rec.rationale).not.toMatch(/\d+\s*%/)
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §2 estimatedLift XOR estimatedLiftReason
  // ───────────────────────────────────────────────────────────────────────────

  it('§2 estimatedLift === null EXACTLY when estimatedLiftReason !== null (both directions)', () => {
    const cases: RecommendationInput[] = [
      input(),
      input({ gaps: GAPS.map((g) => ({ ...g, nextStepLift: null, fullLift: null })) }),
      input({ gaps: [], assurances: [], findings: FINDINGS }),
      input({ gaps: GAPS, assurances: [], findings: [] }),
    ]
    let sawLift = 0
    let sawReason = 0
    for (const c of cases) {
      for (const rec of computeRecommendations(c)) {
        expect(rec.estimatedLift === null).toBe(rec.estimatedLiftReason !== null)
        expect(rec.estimatedLift !== null).toBe(rec.estimatedLiftReason === null)
        if (rec.estimatedLift !== null) sawLift += 1
        if (rec.estimatedLiftReason !== null) sawReason += 1
      }
    }
    // Both arms actually occurred — an XOR over an empty set is trivially true.
    expect(sawLift).toBeGreaterThan(0)
    expect(sawReason).toBeGreaterThan(0)
  })

  it('§2 every stated reason is one of the frozen sentences, rendered verbatim', () => {
    const frozen = new Set([
      NO_INDEX_SCALE_REASON,
      EVIDENCE_NOT_INDEXED_REASON,
      ASSURANCE_NOT_INDEXED_REASON,
      FINDING_NOT_STANDARD_SCOPED_REASON,
      FINDING_STANDARD_NOT_A_GAP_REASON,
      ZERO_LIFT_REASON,
    ])
    for (const rec of computeRecommendations(input())) {
      if (rec.estimatedLiftReason !== null) expect(frozen.has(rec.estimatedLiftReason)).toBe(true)
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §3 evidence + assurance NEVER quote the index
  // ───────────────────────────────────────────────────────────────────────────

  it('§3 REC-EVIDENCE-GAP and REC-ASSURANCE-GATE never emit a lift, even with fullLift = 9.7', () => {
    const tempting = GAPS.map((g) => ({ ...g, evidenceGap: true, fullLift: 9.7, nextStepLift: 9.7 }))
    const recs = computeRecommendations(
      input({ gaps: tempting, assurances: ASSURANCES.map((a) => ({ ...a, satisfied: false })) }),
    )
    const evidence = recs.filter((r) => r.templateId === 'REC-EVIDENCE-GAP')
    const assurance = recs.filter((r) => r.templateId === 'REC-ASSURANCE-GATE')
    expect(evidence.length).toBeGreaterThan(0)
    expect(assurance.length).toBeGreaterThan(0)
    for (const rec of evidence) {
      expect(rec.estimatedLift).toBeNull()
      expect(rec.estimatedLiftReason).toBe(EVIDENCE_NOT_INDEXED_REASON)
      expect(rec.rationale).not.toContain('9.7')
      expect(rec.rationale).not.toContain('index point')
    }
    for (const rec of assurance) {
      expect(rec.estimatedLift).toBeNull()
      expect(rec.estimatedLiftReason).toBe(ASSURANCE_NOT_INDEXED_REASON)
      expect(rec.suggestedTargetRubricScore).toBeNull()
      expect(rec.rationale).not.toContain('9.7')
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §4 the lift is COPIED
  // ───────────────────────────────────────────────────────────────────────────

  it('§4 estimatedLift.points is toBe-identical to the input nextStepLift', () => {
    const recs = computeRecommendations(input())
    const step = recs.find((r) => r.templateId === 'REC-RUBRIC-STEP' && r.originRef === 's4')
    expect(step?.estimatedLift).toEqual({ points: 3.3333333333333335, basis: 'nextStepLift' })
    expect(step?.estimatedLift?.points).toBe((GAPS[3] as ImprovementGapInput).nextStepLift)
    // ...and the rationale renders it unrounded, because rounding it there would
    // make the sentence disagree with the field beside it.
    expect(step?.rationale).toContain('3.3333333333333335')

    const s1 = recs.find((r) => r.templateId === 'REC-RUBRIC-STEP' && r.originRef === 's1')
    expect(s1?.estimatedLift?.points).toBe(3.3)
  })

  it('§4 a finding scoped to a standard borrows THAT standard’s nextStepLift', () => {
    const rec = computeRecommendations(input()).find(
      (r) => r.originRef === composeFindingKey('FIN-RESERVE-THIN', 'standard:s2'),
    )
    expect(rec?.estimatedLift).toEqual({ points: 3.3, basis: 'nextStepLift' })
    expect(rec?.estimatedLiftReason).toBeNull()
  })

  it('§4 a finding not scoped to one standard, and one whose standard is not a gap, both refuse', () => {
    const recs = computeRecommendations(input())
    const school = recs.find((r) => r.originRef === composeFindingKey('GOV-CADENCE-GAP', 'school'))
    expect(school?.estimatedLift).toBeNull()
    expect(school?.estimatedLiftReason).toBe(FINDING_NOT_STANDARD_SCOPED_REASON)

    const unknown = recs.find(
      (r) => r.originRef === composeFindingKey('FAC-INSPECTION-DUE', 'standard:s99'),
    )
    expect(unknown?.estimatedLift).toBeNull()
    // NOT the "not scoped to a single standard" sentence — that would be false.
    expect(unknown?.estimatedLiftReason).toBe(FINDING_STANDARD_NOT_A_GAP_REASON)
  })

  it('§4 a lift of ZERO is not a lift — the rail never prints "+0 index pts"', () => {
    // THE REAL SHAPE, not a hypothetical: `computeGaps` sets nextStepLift = 0 for
    // a leaf already at the top of the rubric that is a gap only because it has
    // no evidence (`effective >= RUBRIC_MAX ? 0`). A finding scoped to that
    // standard used to COPY the 0 and ship `estimatedLift: { points: 0 }` with a
    // null reason — which the rail renders as a "+0 index pts" chip with nothing
    // to explain it, and which `compareRanked` ranks ABOVE every honestly-null
    // recommendation.
    const topOfRubric: ImprovementGapInput = {
      standardId: 's-top',
      code: 'ACC-9.9',
      title: 'Already at the top, but unevidenced',
      rubricScore: RUBRIC_MAX,
      evidenceGap: true,
      nextStepLift: 0,
      fullLift: 0,
      primaryDomainKey: 'governance',
      boundMetricKeys: [],
    }
    const scoped: ImprovementFindingInput = {
      ruleId: 'R-9',
      scopeKey: 'standard:s-top',
      title: 'A warning on a maxed-out standard',
      severity: 'critical',
      standardTags: ['ACC-9.9'],
      primaryDomainKey: 'governance',
      consequence: 'The artifact behind this standard has lapsed.',
    }
    const recs = computeRecommendations(
      input({ gaps: [topOfRubric], assurances: [], findings: [scoped] }),
    )
    const work = recs.find((r) => r.templateId === 'REC-FINDING-WORK')
    expect(work).toBeDefined()
    expect(work!.estimatedLift).toBeNull()
    expect(work!.estimatedLiftReason).toBe(ZERO_LIFT_REASON)

    // …and it no longer outranks the honestly-null evidence work beside it: with
    // no stated lift, the frozen severity/template order decides.
    const evidence = recs.find((r) => r.templateId === 'REC-EVIDENCE-GAP')
    expect(evidence?.estimatedLift).toBeNull()
    for (const rec of recs) expect(rec.estimatedLift?.points).not.toBe(0)
  })

  it('§4 a zero lift is refused on the RUBRIC-STEP template too, with the same sentence', () => {
    const zeroStep: ImprovementGapInput = {
      ...(GAPS[0] as ImprovementGapInput),
      standardId: 's-zero',
      code: 'ACC-0.0',
      nextStepLift: 0,
      fullLift: 0,
    }
    const rec = computeRecommendations(
      input({ gaps: [zeroStep], assurances: [], findings: [] }),
    ).find((r) => r.templateId === 'REC-RUBRIC-STEP')
    expect(rec?.estimatedLift).toBeNull()
    expect(rec?.estimatedLiftReason).toBe(ZERO_LIFT_REASON)
    // The rationale drops the "worth N index points" clause entirely rather than
    // stating it as zero.
    expect(rec?.rationale).not.toContain('index point')
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §5 determinism
  // ───────────────────────────────────────────────────────────────────────────

  it('§5 the same input twice produces an identical result', () => {
    expect(computeRecommendations(input())).toEqual(computeRecommendations(input()))
  })

  it('§5 a shuffled input produces an identical output ORDER', () => {
    const straight = computeRecommendations(input())
    const jumbled = computeRecommendations(
      input({
        gaps: shuffled(GAPS),
        assurances: shuffled(ASSURANCES),
        findings: shuffled(FINDINGS),
      }),
    )
    expect(jumbled).toEqual(straight)
  })

  it('§5 two rows that tie on EVERY frozen key still order identically when shuffled', () => {
    // Same lift, same severity, same template, same code — the four frozen sort
    // keys are exhausted and only the final originRef tie-break can separate
    // them. Without it the order would be whatever the caller's array happened
    // to be, and "deterministic" would be a property of the caller.
    const twin = (standardId: string): ImprovementGapInput => ({
      ...(GAPS[0] as ImprovementGapInput),
      standardId,
      code: 'ACC-9.9',
    })
    const a = computeRecommendations(
      input({ gaps: [twin('sA'), twin('sB')], assurances: [], findings: [] }),
    )
    const b = computeRecommendations(
      input({ gaps: [twin('sB'), twin('sA')], assurances: [], findings: [] }),
    )
    expect(a.map((r) => r.originRef)).toEqual(['sA', 'sB'])
    expect(b).toEqual(a)
  })

  it('§5 the output is invariant to `now` — nothing here reads a clock, even by proxy', () => {
    expect(computeRecommendations(input({ now: '1999-01-01' }))).toEqual(
      computeRecommendations(input({ now: '2099-12-31' })),
    )
  })

  it('§5 the inputs are never mutated', () => {
    const inp = deepFreeze(input())
    expect(() => computeRecommendations(inp)).not.toThrow()
    expect(GAPS[1]?.boundMetricKeys).toEqual(['operating_margin', 'months_operating_reserve'])
  })

  it('§5 standardTags are copied, so a caller cannot mutate the engine’s input through them', () => {
    const rec = computeRecommendations(input()).find((r) => r.originType === 'finding')
    expect(rec?.standardTags).not.toBe(FINDINGS[0]?.standardTags)
    rec?.standardTags.push('MUTATED')
    expect(FINDINGS[0]?.standardTags).toEqual(['ACC-2.1'])
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §6 adoptedKeys
  // ───────────────────────────────────────────────────────────────────────────

  it('§6 an adopted STANDARD id removes exactly its recommendation and shifts nothing else', () => {
    const before = computeRecommendations(input())
    // s4 produces exactly one recommendation (scored 3, evidenced).
    expect(before.filter((r) => r.originRef === 's4')).toHaveLength(1)
    const after = computeRecommendations(input({ adoptedKeys: ['s4'] }))
    expect(after).toEqual(before.filter((r) => r.originRef !== 's4'))
  })

  it('§6 an adopted FINDING key removes exactly that finding’s recommendation', () => {
    const key = composeFindingKey('GOV-CADENCE-GAP', 'school')
    const before = computeRecommendations(input())
    const after = computeRecommendations(input({ adoptedKeys: [key] }))
    expect(after).toEqual(before.filter((r) => r.originRef !== key))
  })

  it('§6 adopting a standard that produced TWO recommendations removes both', () => {
    const before = computeRecommendations(input())
    expect(before.filter((r) => r.originRef === 's2')).toHaveLength(2)
    const after = computeRecommendations(input({ adoptedKeys: ['s2'] }))
    expect(after.some((r) => r.originRef === 's2')).toBe(false)
    expect(after).toEqual(before.filter((r) => r.originRef !== 's2'))
  })

  it('§6 filtering happens BEFORE the limit, so an adoption promotes the next row', () => {
    const full = computeRecommendations(input())
    const top3 = computeRecommendations(input({ limit: 3 }))
    expect(top3).toEqual(full.slice(0, 3))
    const adopted = computeRecommendations(input({ adoptedKeys: [top3[0]?.originRef as string], limit: 3 }))
    expect(adopted).toHaveLength(3)
    expect(adopted).toEqual(full.filter((r) => r.originRef !== top3[0]?.originRef).slice(0, 3))
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §7 no-index frameworks (MSA / NSBECS) still get recommendations
  // ───────────────────────────────────────────────────────────────────────────

  it('§7 a framework with no index scale still produces work, all of it lift-free', () => {
    const recs = computeRecommendations(
      input({ gaps: GAPS.map((g) => ({ ...g, nextStepLift: null, fullLift: null })) }),
    )
    expect(recs.length).toBeGreaterThan(0)
    for (const rec of recs) expect(rec.estimatedLift).toBeNull()

    const step = recs.find((r) => r.templateId === 'REC-RUBRIC-STEP')
    expect(step?.estimatedLiftReason).toBe(NO_INDEX_SCALE_REASON)
    // The lift SENTENCE is omitted entirely rather than replaced with a guess.
    expect(step?.rationale).not.toContain('index point')
    expect(step?.rationale).toBe('ACC-1.1 is rated 2 today.')

    // A standard-scoped finding over a no-index gap says so in the same words.
    const finding = recs.find((r) => r.originRef === composeFindingKey('FIN-RESERVE-THIN', 'standard:s2'))
    expect(finding?.estimatedLiftReason).toBe(NO_INDEX_SCALE_REASON)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §8 which rows fire, and which deliberately do not
  // ───────────────────────────────────────────────────────────────────────────

  it('§8 a gap at the top of the rubric gets no rubric step, only its evidence gap', () => {
    const recs = computeRecommendations(input()).filter((r) => r.originRef === 's3')
    expect(recs.map((r) => r.templateId)).toEqual(['REC-EVIDENCE-GAP'])
  })

  it('§8 a fully-done standard (score 4, evidenced) produces nothing at all', () => {
    const done: ImprovementGapInput = {
      ...(GAPS[2] as ImprovementGapInput),
      evidenceGap: false,
    }
    expect(computeRecommendations(input({ gaps: [done], assurances: [], findings: [] }))).toEqual([])
  })

  it('§8 an unrated standard gets a rubric step, targeting the floor plus one', () => {
    const rec = computeRecommendations(input()).find(
      (r) => r.templateId === 'REC-RUBRIC-STEP' && r.originRef === 's2',
    )
    expect(rec?.rationale.startsWith('ACC-2.1 is unrated today.')).toBe(true)
    expect(rec?.suggestedTargetRubricScore).toBe(2)
  })

  it('§8 a rubric step never targets above the top of the scale', () => {
    for (const rec of computeRecommendations(input())) {
      if (rec.suggestedTargetRubricScore !== null) {
        expect(rec.suggestedTargetRubricScore).toBeLessThanOrEqual(RUBRIC_MAX)
      }
    }
    const near: ImprovementGapInput = { ...(GAPS[3] as ImprovementGapInput), rubricScore: 3 }
    const rec = computeRecommendations(input({ gaps: [near], assurances: [], findings: [] }))[0]
    expect(rec?.suggestedTargetRubricScore).toBe(RUBRIC_MAX)
  })

  it('§8 an out-of-range stored score is read as unrated, never printed', () => {
    const bogus: ImprovementGapInput = { ...(GAPS[0] as ImprovementGapInput), rubricScore: 7 }
    const rec = computeRecommendations(input({ gaps: [bogus], assurances: [], findings: [] }))[0]
    expect(rec?.rationale).not.toContain('7')
    expect(rec?.rationale.startsWith('ACC-1.1 is unrated today.')).toBe(true)
    expect(rec?.suggestedTargetRubricScore).toBe(2)
  })

  it('§8 a SATISFIED assurance is not work, and an info finding is not work', () => {
    const recs = computeRecommendations(input())
    expect(recs.some((r) => r.originRef === 's10')).toBe(false)
    expect(recs.some((r) => r.originRef.startsWith('ACC-EVIDENCE-NOTE:'))).toBe(false)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §9 the structured fields the manager actually adopts
  // ───────────────────────────────────────────────────────────────────────────

  it('§9 findingKey is non-null exactly for finding-derived recommendations, and equals originRef', () => {
    for (const rec of computeRecommendations(input())) {
      expect(rec.originRef).not.toBe('')
      if (rec.originType === 'finding') {
        expect(rec.findingKey).toBe(rec.originRef)
        expect(rec.templateId).toBe('REC-FINDING-WORK')
      } else {
        expect(rec.findingKey).toBeNull()
      }
    }
  })

  it('§9 composeFindingKey is the one formula', () => {
    expect(composeFindingKey('R', 'school')).toBe('R:school')
    expect(composeFindingKey('FIN-RESERVE-THIN', 'standard:s2')).toBe('FIN-RESERVE-THIN:standard:s2')
  })

  it('§9 suggestedMetricKey is the first BOUND key, or null — never guessed from a title', () => {
    const recs = computeRecommendations(input())
    expect(recs.find((r) => r.originRef === 's2')?.suggestedMetricKey).toBe('operating_margin')
    expect(recs.find((r) => r.originRef === 's1')?.suggestedMetricKey).toBe('board_meeting_cadence')
    // No bound keys on the standard -> null, even though its title says "Facilities".
    expect(recs.find((r) => r.originRef === 's3')?.suggestedMetricKey).toBeNull()
    // Assurances and findings never carry one.
    expect(recs.find((r) => r.originRef === 's9')?.suggestedMetricKey).toBeNull()
    for (const rec of recs.filter((r) => r.originType === 'finding')) {
      expect(rec.suggestedMetricKey).toBeNull()
    }
  })

  it('§9 the owner map is TOTAL over the ten domains and emits only known roles', () => {
    const roles: SuggestedOwnerRole[] = [
      'head_of_school',
      'principal',
      'business_manager',
      'board_chair',
      'facilities_manager',
      'advancement_director',
      'accreditation_lead',
    ]
    expect(Object.keys(OWNER_ROLE_BY_DOMAIN).sort()).toEqual([...DOMAIN_KEYS].sort())
    for (const key of DOMAIN_KEYS) {
      expect(roles).toContain(OWNER_ROLE_BY_DOMAIN[key])
    }
  })

  it('§9 the owner comes from the standard’s domain, every time', () => {
    const recs = computeRecommendations(input())
    expect(recs.find((r) => r.originRef === 's2')?.suggestedOwnerRole).toBe('business_manager')
    expect(recs.find((r) => r.originRef === 's3')?.suggestedOwnerRole).toBe('facilities_manager')
    expect(recs.find((r) => r.originRef === 's9')?.suggestedOwnerRole).toBe('board_chair')
    for (const rec of recs) expect(typeof rec.suggestedOwnerRole).toBe('string')
  })

  it('§9 a finding’s consequence is echoed VERBATIM, and its title with it', () => {
    const rec = computeRecommendations(input()).find(
      (r) => r.originRef === composeFindingKey('FIN-RESERVE-THIN', 'standard:s2'),
    )
    expect(rec?.rationale).toBe(FINDINGS[0]?.consequence)
    expect(rec?.title).toBe(FINDINGS[0]?.title)
    expect(rec?.standardTags).toEqual(['ACC-2.1'])
  })

  // ───────────────────────────────────────────────────────────────────────────
  // §10 ordering + limit
  // ───────────────────────────────────────────────────────────────────────────

  it('§10 lifted recommendations rank above lift-free ones, points descending', () => {
    const recs = computeRecommendations(input())
    const firstNull = recs.findIndex((r) => r.estimatedLift === null)
    expect(firstNull).toBeGreaterThan(0)
    expect(recs.slice(firstNull).every((r) => r.estimatedLift === null)).toBe(true)
    const points = recs.slice(0, firstNull).map((r) => r.estimatedLift?.points as number)
    expect([...points].sort((a, b) => b - a)).toEqual(points)
  })

  it('§10 among equal lifts, critical findings outrank warn-level work', () => {
    const recs = computeRecommendations(input())
    const s1Step = recs.findIndex((r) => r.templateId === 'REC-RUBRIC-STEP' && r.originRef === 's1')
    const critical = recs.findIndex(
      (r) => r.originRef === composeFindingKey('FIN-RESERVE-THIN', 'standard:s2'),
    )
    // Both carry a 3.3 lift; the critical finding wins the tie.
    expect(recs[critical]?.estimatedLift?.points).toBe(3.3)
    expect(recs[s1Step]?.estimatedLift?.points).toBe(3.3)
    expect(critical).toBeLessThan(s1Step)
  })

  it('§10 among lift-free rows the template order is the declared one', () => {
    const recs = computeRecommendations(
      input({ gaps: GAPS.map((g) => ({ ...g, nextStepLift: null, fullLift: null })) }),
    )
    const ranks = recs
      .filter((r) => r.originType !== 'finding')
      .map((r) => RECOMMENDATION_TEMPLATE_IDS.indexOf(r.templateId))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('§10 the default limit is 8 and it is applied last', () => {
    expect(RECOMMENDATION_LIMIT).toBe(8)
    const defaulted = computeRecommendations({ ...input(), limit: undefined })
    const full = computeRecommendations(input())
    expect(full.length).toBeGreaterThan(RECOMMENDATION_LIMIT)
    expect(defaulted).toEqual(full.slice(0, RECOMMENDATION_LIMIT))
  })

  it('§10 a zero or negative limit returns nothing rather than the whole rail', () => {
    expect(computeRecommendations(input({ limit: 0 }))).toEqual([])
    expect(computeRecommendations(input({ limit: -5 }))).toEqual([])
  })

  it('§10 an empty world is an empty rail, not a placeholder', () => {
    expect(computeRecommendations(input({ gaps: [], assurances: [], findings: [] }))).toEqual([])
  })
})

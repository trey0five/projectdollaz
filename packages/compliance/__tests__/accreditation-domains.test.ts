import { describe, expect, it } from 'vitest'
import {
  DOMAIN_KEYS,
  DOMAIN_LABELS,
  MIN_DOMAIN_LEAVES,
  computeDomainConfidence,
  computeDomainReadiness,
  normalizeDomainWeights,
  type DomainKey,
  type DomainMap,
  type DomainReadiness,
} from '../src/accreditation-domains.js'
import {
  schoolReadiness,
  selfScoredPct,
  verifiedPct,
  type ReadinessLeafInput,
} from '../src/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// The domain map — the defects this file exists to PIN:
//   • a domain we cannot score must render NO NUMBER (never 0, which reads as
//     "you scored badly here" when the truth is "your accreditor asks nothing"),
//   • a standard that straddles two domains must contribute HALF to each and
//     exactly its whole self in total — no double-counting, no inflation,
//   • when every weight is 1 the domain math must REDUCE to the frozen engine,
//     so the grid can never disagree with the hero,
//   • a signal bound to a standard that only 25%-belongs to a domain must not be
//     reported as that domain's signal.
// The per-framework maps below mirror the seed in apps/api catalog-seed.ts; the
// API's domain-coverage-matrix spec re-derives the same numbers FROM the seed,
// so a drift between the two is caught there rather than assumed here.
// ─────────────────────────────────────────────────────────────────────────────

type Split = Partial<Record<DomainKey, number>>

/** code → its lead domain, or an explicit fractional split. */
const COGNIA_MAP: Record<string, DomainKey | Split> = {
  'COG-1': { mission_identity: 0.5, leadership: 0.5 },
  'COG-2': 'mission_identity',
  'COG-3': 'leadership',
  'COG-4': 'student_services',
  'COG-5': 'hr',
  'COG-6': 'hr',
  'COG-7': 'continuous_improvement',
  'COG-8': 'governance',
  'COG-9': 'leadership',
  'COG-10': 'hr',
  'COG-11': 'leadership',
  'COG-12': 'academic_excellence',
  'COG-13': { hr: 0.5, academic_excellence: 0.5 },
  'COG-14': { academic_excellence: 0.5, technology: 0.5 },
  'COG-15': 'finance',
  'COG-16': 'academic_excellence',
  'COG-17': 'student_services',
  'COG-18': 'academic_excellence',
  'COG-19': 'student_services',
  'COG-20': 'student_services',
  'COG-21': 'academic_excellence',
  'COG-22': 'academic_excellence',
  'COG-23': 'technology',
  'COG-24': 'continuous_improvement',
  'COG-25': 'continuous_improvement',
  'COG-26': 'continuous_improvement',
  'COG-27': 'student_services',
  'COG-28': 'student_services',
  'COG-29': 'hr',
  'COG-30': 'academic_excellence',
  'COG-31': 'academic_excellence',
}

const MSA_MAP: Record<string, DomainKey | Split> = {
  'MSA-1': { mission_identity: 0.5, continuous_improvement: 0.5 },
  'MSA-2': 'governance',
  'MSA-3': 'student_services',
  'MSA-4': { finance: 0.5, facilities: 0.25, hr: 0.25 },
  'MSA-5': 'academic_excellence',
}

const NSBECS_MAP: Record<string, DomainKey | Split> = {
  'NSBECS-1': 'mission_identity',
  'NSBECS-2': { mission_identity: 0.5, academic_excellence: 0.5 },
  'NSBECS-3': 'mission_identity',
  'NSBECS-4': 'mission_identity',
  'NSBECS-5': 'governance',
  'NSBECS-6': { leadership: 0.5, hr: 0.5 },
  'NSBECS-7': 'academic_excellence',
  'NSBECS-8': { academic_excellence: 0.5, continuous_improvement: 0.5 },
  'NSBECS-9': 'student_services',
  'NSBECS-10': 'finance',
  'NSBECS-11': 'hr',
  'NSBECS-12': { facilities: 0.5, technology: 0.5 },
  'NSBECS-13': { finance: 0.5, leadership: 0.5 },
}

const COGNIA_SIGNALS: Record<string, string[]> = {
  'COG-7': ['plan_readiness'],
  'COG-10': ['total_staff_fte', 'fte_change_yoy'],
  'COG-13': ['student_teacher_ratio', 'teaching_staff_share'],
  'COG-15': [
    'operating_margin',
    'days_cash_on_hand',
    'months_operating_reserve',
    'tuition_dependency',
    'cost_per_pupil',
    'student_teacher_ratio',
    'teaching_staff_share',
  ],
  'COG-17': ['pct_students_on_aid'],
  'COG-24': ['plan_readiness'],
  'COG-26': ['forecast_vs_budget_net'],
}

function build(
  spec: Record<string, DomainKey | Split>,
  over: Record<string, Partial<ReadinessLeafInput>> = {},
): { leaves: ReadinessLeafInput[]; map: DomainMap } {
  const leaves: ReadinessLeafInput[] = []
  const map: Record<string, ReturnType<typeof normalizeDomainWeights>> = {}
  for (const [code, value] of Object.entries(spec)) {
    leaves.push({
      standardId: code,
      code,
      title: code,
      rubricScore: null,
      evidenceCount: 0,
      ...(over[code] ?? {}),
    })
    map[code] =
      typeof value === 'string'
        ? normalizeDomainWeights(value, null)
        : normalizeDomainWeights(Object.keys(value)[0], value)
  }
  return { leaves, map }
}

const byKey = (rows: DomainReadiness[]): Record<string, DomainReadiness> =>
  Object.fromEntries(rows.map((r) => [r.domainKey, r]))

const sumWeight = (rows: DomainReadiness[]): number =>
  Math.round(rows.reduce((s, r) => s + r.effectiveLeafWeight, 0) * 100) / 100

describe('computeDomainReadiness — shape', () => {
  it('always returns exactly ten entries in DOMAIN_KEYS order, uncovered included', () => {
    const { leaves, map } = build(MSA_MAP)
    const rows = computeDomainReadiness(leaves, map)
    expect(rows).toHaveLength(DOMAIN_KEYS.length)
    expect(rows.map((r) => r.domainKey)).toEqual([...DOMAIN_KEYS])
    expect(rows.map((r) => r.label)).toEqual(DOMAIN_KEYS.map((k) => DOMAIN_LABELS[k]))
  })

  it('an EMPTY register still returns ten uncovered domains with reasons', () => {
    const rows = computeDomainReadiness([], {})
    expect(rows).toHaveLength(10)
    for (const r of rows) {
      expect(r.covered).toBe(false)
      expect(r.measured).toBe(false)
      expect(r.readinessPct).toBeNull()
      expect(r.reason).toBeTruthy()
    }
  })
})

describe('ACCEPTANCE — a domain we cannot score renders NO NUMBER', () => {
  it('1: MSA + technology → nulls, not zeros, with the exact frozen sentence', () => {
    const { leaves, map } = build(MSA_MAP)
    const tech = byKey(computeDomainReadiness(leaves, map)).technology
    expect(tech).toEqual(
      expect.objectContaining({
        readinessPct: null,
        selfScoredPct: null,
        verifiedPct: null,
        covered: false,
        measured: false,
        contributingLeafCount: 0,
        effectiveLeafWeight: 0,
        reason: 'Your framework has no technology standards',
      }),
    )
  })

  it('2: Cognia + finance (ONE leaf) → covered but not measured, still no number', () => {
    const { leaves, map } = build(COGNIA_MAP)
    const finance = byKey(computeDomainReadiness(leaves, map, { signalKeys: COGNIA_SIGNALS }))
      .finance
    expect(finance).toEqual(
      expect.objectContaining({
        covered: true,
        measured: false,
        contributingLeafCount: 1,
        effectiveLeafWeight: 1,
        readinessPct: null,
      }),
    )
    expect(finance.reason).toBe(
      `Your framework has 1 finance standard — fewer than the ${MIN_DOMAIN_LEAVES} needed to score this domain.`,
    )
    // The flagship card of this phase: no rubric number, SEVEN live signals.
    expect(finance.signalCount).toBe(7)
  })

  it('3: a 0.5/0.5 split contributes HALF to each domain and its whole self in total', () => {
    const leaves: ReadinessLeafInput[] = [
      { standardId: 's1', code: 'X-1', title: 'X', rubricScore: 3, evidenceCount: 1 },
    ]
    const map: DomainMap = { s1: { finance: 0.5, facilities: 0.5 } }
    const rows = computeDomainReadiness(leaves, map)
    const k = byKey(rows)
    expect(k.finance.effectiveLeafWeight).toBe(0.5)
    expect(k.facilities.effectiveLeafWeight).toBe(0.5)
    expect(k.finance.contributingLeafCount).toBe(1)
    expect(k.facilities.contributingLeafCount).toBe(1)
    expect(sumWeight(rows)).toBe(1)
  })
})

describe('computeDomainReadiness — the fractional-sum invariant', () => {
  it('Σ effectiveLeafWeight equals the leaf count for every seeded framework', () => {
    for (const [spec, expected] of [
      [COGNIA_MAP, 31],
      [MSA_MAP, 5],
      [NSBECS_MAP, 13],
    ] as const) {
      const { leaves, map } = build(spec)
      expect(sumWeight(computeDomainReadiness(leaves, map))).toBe(expected)
      expect(leaves).toHaveLength(expected)
    }
  })

  it('the too-few reason names the FRACTIONAL weight when weights are split', () => {
    const { leaves, map } = build(NSBECS_MAP)
    const rows = byKey(computeDomainReadiness(leaves, map))
    // leadership: NSBECS-6 (0.5) + NSBECS-13 (0.5) = 2 leaves counting for 1.
    expect(rows.leadership.contributingLeafCount).toBe(2)
    expect(rows.leadership.effectiveLeafWeight).toBe(1)
    expect(rows.leadership.reason).toBe(
      `Your framework has 2 leadership standards counting for 1 — fewer than the ${MIN_DOMAIN_LEAVES} needed to score this domain.`,
    )
    // mission_identity: 4 leaves counting for 3.5 → MEASURED, so no reason.
    expect(rows.mission_identity.measured).toBe(true)
    expect(rows.mission_identity.effectiveLeafWeight).toBe(3.5)
    expect(rows.mission_identity.reason).toBeNull()
  })
})

describe('computeDomainReadiness — reduction to the frozen engine', () => {
  it('whole-weight domains return figures byte-identical to schoolReadiness', () => {
    // Six whole-weight academic_excellence leaves with a mixed rubric/evidence
    // profile, plus unrelated leaves in other domains that must not leak in.
    const subset: ReadinessLeafInput[] = [
      { standardId: 'a1', code: 'A-1', title: '', rubricScore: 4, evidenceCount: 2 },
      { standardId: 'a2', code: 'A-2', title: '', rubricScore: 3, evidenceCount: 0 },
      { standardId: 'a3', code: 'A-3', title: '', rubricScore: null, evidenceCount: 1 },
      { standardId: 'a4', code: 'A-4', title: '', rubricScore: 1, evidenceCount: 0 },
      { standardId: 'a5', code: 'A-5', title: '', rubricScore: 2, evidenceCount: 3 },
    ]
    const others: ReadinessLeafInput[] = [
      { standardId: 'f1', code: 'F-1', title: '', rubricScore: 4, evidenceCount: 4 },
      { standardId: 'f2', code: 'F-2', title: '', rubricScore: 4, evidenceCount: 4 },
      { standardId: 'f3', code: 'F-3', title: '', rubricScore: 4, evidenceCount: 4 },
    ]
    const map: DomainMap = {
      ...Object.fromEntries(subset.map((l) => [l.standardId, { academic_excellence: 1 }])),
      ...Object.fromEntries(others.map((l) => [l.standardId, { finance: 1 }])),
    }
    const rows = byKey(computeDomainReadiness([...subset, ...others], map))
    expect(rows.academic_excellence.readinessPct).toBe(schoolReadiness(subset).readinessPct)
    expect(rows.academic_excellence.selfScoredPct).toBe(selfScoredPct(subset))
    expect(rows.academic_excellence.verifiedPct).toBe(verifiedPct(subset))
    // And the disjoint domain reduces to ITS own subset, not the whole register.
    expect(rows.finance.readinessPct).toBe(schoolReadiness(others).readinessPct)
  })

  it('a HALF-weight leaf moves a domain less than an unweighted mean would', () => {
    const leaves: ReadinessLeafInput[] = [
      { standardId: 'w1', code: 'W-1', title: '', rubricScore: 1, evidenceCount: 0 },
      { standardId: 'w2', code: 'W-2', title: '', rubricScore: 1, evidenceCount: 0 },
      { standardId: 'h', code: 'H-1', title: '', rubricScore: 4, evidenceCount: 1 },
    ]
    const weighted = computeDomainReadiness(
      leaves,
      { w1: { hr: 1 }, w2: { hr: 1 }, h: { hr: 0.5, finance: 0.5 } },
      { minLeaves: 2 },
    )
    const unweighted = computeDomainReadiness(
      leaves,
      { w1: { hr: 1 }, w2: { hr: 1 }, h: { hr: 1 } },
      { minLeaves: 2 },
    )
    const wHr = byKey(weighted).hr.readinessPct as number
    const uHr = byKey(unweighted).hr.readinessPct as number
    expect(wHr).toBeLessThan(uHr)
    // Sanity: the unweighted case IS the frozen engine's mean of all three.
    expect(uHr).toBe(schoolReadiness(leaves).readinessPct)
  })
})

describe('computeDomainReadiness — the null/reason contract', () => {
  it('readinessPct is null whenever !measured, and reason is null IFF measured', () => {
    for (const spec of [COGNIA_MAP, MSA_MAP, NSBECS_MAP]) {
      const { leaves, map } = build(spec, { 'COG-1': { rubricScore: 3, evidenceCount: 1 } })
      for (const r of computeDomainReadiness(leaves, map)) {
        if (r.measured) {
          expect(r.reason).toBeNull()
          expect(r.readinessPct).not.toBeNull()
          expect(r.selfScoredPct).not.toBeNull()
          expect(r.verifiedPct).not.toBeNull()
        } else {
          expect(r.reason).not.toBeNull()
          expect(r.readinessPct).toBeNull()
          expect(r.selfScoredPct).toBeNull()
          expect(r.verifiedPct).toBeNull()
        }
      }
    }
  })

  it('MIN_DOMAIN_LEAVES is applied to the EFFECTIVE weight, not the leaf count', () => {
    // Four leaves, every one a half-share: 4 leaves but only 2.0 effective.
    const leaves: ReadinessLeafInput[] = ['a', 'b', 'c', 'd'].map((id) => ({
      standardId: id,
      code: id,
      title: '',
      rubricScore: 4,
      evidenceCount: 1,
    }))
    const map: DomainMap = Object.fromEntries(
      leaves.map((l) => [l.standardId, { hr: 0.5, finance: 0.5 }]),
    )
    const hr = byKey(computeDomainReadiness(leaves, map)).hr
    expect(hr.contributingLeafCount).toBe(4)
    expect(hr.effectiveLeafWeight).toBe(2)
    expect(hr.measured).toBe(false)
    expect(hr.readinessPct).toBeNull()
    expect(hr.reason).toContain('counting for 2')
  })
})

describe('normalizeDomainWeights', () => {
  it('keeps known keys, drops unknown/negative/zero/NaN, and normalizes to sum 1', () => {
    expect(normalizeDomainWeights('finance', { finance: 0.4, hr: 0.4 })).toEqual({
      finance: 0.5,
      hr: 0.5,
    })
    expect(normalizeDomainWeights('finance', { finance: 1, not_a_domain: 5 })).toEqual({
      finance: 1,
    })
    expect(normalizeDomainWeights('finance', { finance: 3, hr: -1, technology: 0 })).toEqual({
      finance: 1,
    })
    expect(normalizeDomainWeights('finance', { finance: Number.NaN, hr: 2 })).toEqual({ hr: 1 })
  })

  it('falls back to the lead domainKey, then to NO domain at all', () => {
    expect(normalizeDomainWeights('governance', null)).toEqual({ governance: 1 })
    expect(normalizeDomainWeights('governance', {})).toEqual({ governance: 1 })
    expect(normalizeDomainWeights('governance', [1, 2])).toEqual({ governance: 1 })
    expect(normalizeDomainWeights('governance', { nope: 1 })).toEqual({ governance: 1 })
    expect(normalizeDomainWeights(null, null)).toEqual({})
    expect(normalizeDomainWeights('not_a_domain', { also_not: 1 })).toEqual({})
  })

  it('a seed typo can never inflate a school effective leaf count above 1', () => {
    const w = normalizeDomainWeights('finance', { finance: 0.5, facilities: 0.6 })
    const total = Object.values(w).reduce((s, v) => s + (v as number), 0)
    expect(total).toBeCloseTo(1, 12)
  })
})

describe('computeDomainConfidence', () => {
  const runFor = (spec: Record<string, DomainKey | Split>, unmapped?: number) => {
    const { leaves, map } = build(spec)
    const domains = computeDomainReadiness(leaves, map)
    return { domains, confidence: computeDomainConfidence(domains, { unmappedLeafCount: unmapped }) }
  }

  it('Cognia: 5 of 10 measured → 50% and the mixed caveat', () => {
    const { confidence } = runFor(COGNIA_MAP)
    expect(confidence.measuredDomains).toBe(5)
    expect(confidence.coveragePct).toBe(50)
    expect(confidence.caveat).toBe(
      'Based on 5 of 10 domains. 1 not in your framework; 4 with too few standards to score.',
    )
  })

  it('unmeasuredDomains comes back in DOMAIN_KEYS order', () => {
    const { domains, confidence } = runFor(COGNIA_MAP)
    const expected = domains.filter((d) => !d.measured).map((d) => d.domainKey)
    expect(confidence.unmeasuredDomains).toEqual(expected)
    expect(confidence.unmeasuredDomains).toEqual(
      DOMAIN_KEYS.filter((k) => confidence.unmeasuredDomains.includes(k)),
    )
  })

  it('MSA: nothing scores, but coverage exists → the "exact figures" caveat, 0%', () => {
    const { confidence } = runFor(MSA_MAP)
    expect(confidence.coveragePct).toBe(0)
    expect(confidence.caveat).toBe(
      'No domain has enough standards to score on its own. Your school-wide readiness figures are exact; the domain grid shows what your framework covers.',
    )
  })

  it('no standards at all → "Adopt your accreditor\'s framework"', () => {
    const confidence = computeDomainConfidence(computeDomainReadiness([], {}))
    expect(confidence.caveat).toBe(
      "No standards yet. Adopt your accreditor's framework to see the domain grid.",
    )
  })

  it('an UNMAPPED register (framework-less mode) says exactly that', () => {
    const confidence = computeDomainConfidence(computeDomainReadiness([], {}), {
      unmappedLeafCount: 12,
    })
    expect(confidence.caveat).toBe(
      "Your standards register isn't linked to an accreditor framework, so it can't be grouped into domains. Adopt a framework to see the domain grid.",
    )
  })

  it('a LINKED framework whose rows are unmapped never says "adopt a framework"', () => {
    // The seed can fail-soft partway through (catalog.service.onModuleInit
    // swallows), leaving one framework adopted but unmapped. The school is
    // looking at a hero titled with that framework — telling them to adopt one
    // is the product contradicting itself on the same screen.
    const confidence = computeDomainConfidence(computeDomainReadiness([], {}), {
      unmappedLeafCount: 5,
      frameworkLinked: true,
    })
    expect(confidence.caveat).toBe(
      "Your framework's standards aren't mapped to domains in this build, so the domain grid can't be filled in yet. Your school-wide readiness figures are exact.",
    )
    expect(confidence.caveat).not.toContain('Adopt')
    // …and the framework-LESS wording is unchanged when the flag is absent/false.
    expect(
      computeDomainConfidence(computeDomainReadiness([], {}), {
        unmappedLeafCount: 5,
        frameworkLinked: false,
      }).caveat,
    ).toContain("isn't linked to an accreditor framework")
  })

  it('every domain measured → the all-ten caveat at 100%', () => {
    const leaves: ReadinessLeafInput[] = []
    const map: Record<string, Partial<Record<DomainKey, number>>> = {}
    for (const k of DOMAIN_KEYS) {
      for (let i = 0; i < 3; i += 1) {
        const id = `${k}-${i}`
        leaves.push({ standardId: id, code: id, title: '', rubricScore: 4, evidenceCount: 1 })
        map[id] = { [k]: 1 }
      }
    }
    const confidence = computeDomainConfidence(computeDomainReadiness(leaves, map))
    expect(confidence.coveragePct).toBe(100)
    expect(confidence.measuredDomains).toBe(10)
    expect(confidence.unmeasuredDomains).toEqual([])
    expect(confidence.caveat).toBe('All 10 domains carry enough standards to score.')
  })

  it('the unmapped clause appends to a partially-measured caveat, singular and plural', () => {
    expect(runFor(COGNIA_MAP, 1).confidence.caveat).toContain(
      ' 1 standard in this framework is not mapped to a domain.',
    )
    expect(runFor(COGNIA_MAP, 3).confidence.caveat).toContain(
      ' 3 standards in this framework are not mapped to a domain.',
    )
  })

  it('coveragePct rounds (1 of 10 → 10, 7 of 10 → 70)', () => {
    const { confidence } = runFor(NSBECS_MAP)
    expect(confidence.measuredDomains).toBe(1)
    expect(confidence.coveragePct).toBe(10)
  })
})

describe('signalCount', () => {
  it('counts DISTINCT keys and ignores leaves below the 0.5 attribution floor', () => {
    const { leaves, map } = build(MSA_MAP)
    const signals = {
      'MSA-1': ['plan_readiness'],
      'MSA-4': ['operating_margin', 'days_cash_on_hand', 'operating_margin'],
    }
    const rows = byKey(computeDomainReadiness(leaves, map, { signalKeys: signals }))
    // MSA-4 is finance 0.5 / facilities 0.25 / hr 0.25 — the cash metrics belong
    // to finance ONLY; reporting them as facilities signals would be a lie.
    expect(rows.finance.signalCount).toBe(2)
    expect(rows.facilities.signalCount).toBe(0)
    expect(rows.hr.signalCount).toBe(0)
    // MSA-1 is a 0.5 split — exactly AT the floor, so both halves count.
    expect(rows.mission_identity.signalCount).toBe(1)
    expect(rows.continuous_improvement.signalCount).toBe(1)
  })

  it('is independent of `measured` and defaults to zero with no signal map', () => {
    const { leaves, map } = build(COGNIA_MAP)
    const withSignals = byKey(computeDomainReadiness(leaves, map, { signalKeys: COGNIA_SIGNALS }))
    expect(withSignals.finance.measured).toBe(false)
    expect(withSignals.finance.signalCount).toBe(7)
    expect(withSignals.hr.signalCount).toBe(4)
    expect(withSignals.academic_excellence.signalCount).toBe(2)
    const without = byKey(computeDomainReadiness(leaves, map))
    expect(without.finance.signalCount).toBe(0)
    expect(Object.values(without).every((r) => r.signalCount === 0)).toBe(true)
  })

  it('partialSignalCount reports the below-floor keys instead of dropping them', () => {
    const { leaves, map } = build(MSA_MAP)
    const rows = byKey(
      computeDomainReadiness(leaves, map, {
        signalKeys: { 'MSA-4': ['operating_margin', 'days_cash_on_hand'] },
      }),
    )
    // MSA-4: finance ½ (attributed), facilities ¼ + hr ¼ (below the floor).
    // Those two domains must be able to say "reported under Finance" rather
    // than "unlock the HR module" while the numbers render one card away.
    expect(rows.finance).toMatchObject({ signalCount: 2, partialSignalCount: 0 })
    expect(rows.facilities).toMatchObject({ signalCount: 0, partialSignalCount: 2 })
    expect(rows.hr).toMatchObject({ signalCount: 0, partialSignalCount: 2 })
    // A domain nothing touches stays a hard zero on BOTH counters.
    expect(rows.technology).toMatchObject({ signalCount: 0, partialSignalCount: 0 })
    // A key that clears the floor is never ALSO counted as partial there.
    expect(
      Object.values(
        byKey(computeDomainReadiness(leaves, map, { signalKeys: { 'MSA-1': ['plan_readiness'] } })),
      ).every((r) => r.signalCount === 0 || r.partialSignalCount === 0),
    ).toBe(true)
  })
})

describe('the too-few reason states the weight LOSSLESSLY', () => {
  it('a quarter weight prints 0.25 — never 0.3 — and matches effectiveLeafWeight', () => {
    const { leaves, map } = build(MSA_MAP)
    const rows = byKey(computeDomainReadiness(leaves, map))
    // MSA-4 carries hr and facilities at exactly ¼. The sentence and the number
    // ship in the SAME object and are BOTH persisted; they may never disagree.
    expect(rows.hr.effectiveLeafWeight).toBe(0.25)
    expect(rows.hr.reason).toBe(
      'Your framework has 1 human resources standard counting for 0.25 — fewer than the 3 needed to score this domain.',
    )
    expect(rows.facilities.reason).toContain('counting for 0.25')
    // Whole and half weights are unchanged — no spurious ".00"/".50".
    expect(rows.mission_identity.reason).toContain('counting for 0.5')
    expect(rows.governance.reason).toBe(
      'Your framework has 1 governance standard — fewer than the 3 needed to score this domain.',
    )
  })
})

describe('determinism', () => {
  it('two identical calls serialize identically', () => {
    const { leaves, map } = build(COGNIA_MAP, {
      'COG-15': { rubricScore: 3, evidenceCount: 2 },
      'COG-1': { rubricScore: 2, evidenceCount: 0 },
    })
    const a = computeDomainReadiness(leaves, map, { signalKeys: COGNIA_SIGNALS })
    const b = computeDomainReadiness(leaves, map, { signalKeys: COGNIA_SIGNALS })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(computeDomainConfidence(a))).toBe(
      JSON.stringify(computeDomainConfidence(b)),
    )
  })

  it('does not mutate its inputs', () => {
    const { leaves, map } = build(MSA_MAP)
    const before = JSON.stringify({ leaves, map })
    computeDomainReadiness(leaves, map, { signalKeys: { 'MSA-4': ['operating_margin'] } })
    expect(JSON.stringify({ leaves, map })).toBe(before)
  })
})

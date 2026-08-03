// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — SPEC PURE-1..PURE-12. The superintendent portfolio engine.
//
// What these specs are actually defending — each one exists because the failure
// it catches is SILENT:
//
//   PURE-2  An unmeasured dimension must LEAVE THE DENOMINATOR. Folding it in at
//           zero makes an unmeasured school look healthy, which is the failure
//           this whole program exists to prevent.
//   PURE-3  ANY 3 of 6 missing is unrankable — proven over all twenty 3-subsets,
//           not over one convenient example.
//   PURE-4  The confidence floor is REACHABLE. If a future weight edit made it
//           unreachable, the count floor would be the only live rule and nobody
//           would notice; this spec goes red on that edit.
//   PURE-5  No rank without a stated driver, and NO DRIVER MAY NAME A FIGURE THE
//           ROW DOES NOT CARRY. Proven by extracting every integer from every
//           `detail` and requiring set membership in the row's own numerals.
//   PURE-6  Urgency is a SORT KEY, never a multiplier. A multiplier invents a
//           number; an ordering states a preference.
//   PURE-7  The comparator is a TOTAL ORDER. Without key 6 two same-named
//           schools make the output depend on the database's return order, and
//           the byte-identical-ordering criterion fails INTERMITTENTLY.
//   PURE-8  The tiebreak is `verifiedPct`, NOT `readinessPct`. Ranking on
//           self-scores rewards optimistic self-assessment.
//   PURE-10 An unranked school carries NO score and NO band — there is no key on
//           it a UI could render as "steady".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ALL_CLEAR_DRIVER_DETAIL,
  ATTENTION_BAND_RANK,
  COMPONENT_WEIGHT_BP,
  INVALID_INPUT_REASON,
  MIN_CONFIDENCE,
  MIN_KNOWN_COMPONENTS,
  NO_INDEX_SCALE_NOTE,
  PORTFOLIO_COMPONENT_KEYS,
  PORTFOLIO_PRIORITY_VERSION,
  TOTAL_WEIGHT_BP,
  TRAJECTORY_BASELINE_DAYS,
  UNKNOWN_FRAMEWORK_NOTE,
  URGENCY_TIER_DAYS,
  assessTrajectoryComparability,
  canonicalBulkAdoptPayload,
  comparePortfolioRows,
  computePortfolio,
  multiFrameworkNote,
  scoreDomainExposure,
  scoreEarlyWarning,
  scoreEvidenceCurrency,
  scoreImprovement,
  scoreReadinessLevel,
  scoreTrajectory,
  trajectoryBaselineCutoff,
  type PortfolioComponentInput,
  type PortfolioComponentKey,
  type PortfolioRow,
  type PortfolioSchoolInput,
} from '../src/portfolio-priority.js'

const NOW = '2026-08-03'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function known(score: number, basis = 'test basis'): PortfolioComponentInput {
  return { known: true, score, basis, reason: null }
}

function absent(reason: string): PortfolioComponentInput {
  return { known: false, score: null, basis: null, reason }
}

function allKnown(
  over: Partial<Record<PortfolioComponentKey, PortfolioComponentInput>> = {},
): Record<PortfolioComponentKey, PortfolioComponentInput> {
  return {
    readinessLevel: known(40),
    earlyWarning: known(30),
    evidenceCurrency: known(20),
    domainExposure: known(45),
    improvement: known(25),
    trajectory: known(50),
    ...over,
  }
}

function school(over: Partial<PortfolioSchoolInput> = {}): PortfolioSchoolInput {
  return {
    schoolId: 'sch-1',
    name: 'Alpha Academy',
    seriesKey: 'fw-1|current',
    frameworkCode: 'COG',
    frameworkName: 'Cognia',
    indexComparable: true,
    verifiedPct: 60,
    selfScoredPct: 80,
    readinessPct: 70,
    projectedIndex: 300,
    band: 'watch',
    leafCount: 40,
    snapshotDate: '2026-07-01',
    demoData: false,
    components: allKnown(),
    urgencyDaysToReview: 400,
    citationOverdue: false,
    openFindings: { critical: 1, warn: 2, info: 3 },
    initiatives: { open: 4, overdue: 1, stale: 2, unresponded: 1 },
    weakestDomain: { domainKey: 'finance', pct: 55 },
    trajectoryDeltaPct: -3,
    ...over,
  }
}

/** Deterministic shuffle — a spec about determinism may not use a random source. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let s = (seed >>> 0) || 1
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * THE NUMERALS A DRIVER IS ALLOWED TO NAME — deliberately NARROW. It is exactly
 * the set of figures the row itself shows: percentages (as rendered, i.e.
 * rounded), the finding counts, the initiative counts, the weakest domain's pct
 * and the trajectory delta. Widening this set would let a driver quote a number
 * that merely happens to appear somewhere on the row.
 */
function rowNumerals(row: PortfolioRow): Set<number> {
  const out = new Set<number>()
  if (row.verifiedPct !== null) out.add(Math.round(row.verifiedPct))
  if (row.selfScoredPct !== null) out.add(Math.round(row.selfScoredPct))
  out.add(row.openFindings.critical)
  out.add(row.openFindings.warn)
  out.add(row.openFindings.info)
  out.add(row.initiatives.unresponded)
  out.add(row.initiatives.overdue)
  out.add(row.initiatives.stale)
  if (row.weakestDomain !== null) out.add(Math.round(row.weakestDomain.pct))
  if (row.trajectoryDeltaPct !== null) out.add(Math.abs(Math.round(row.trajectoryDeltaPct)))
  return out
}

function integersIn(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map((n) => Number(n))
}

function subsetsOfSize<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [head, ...rest] = items
  return [...subsetsOfSize(rest, size - 1).map((s) => [head, ...s]), ...subsetsOfSize(rest, size)]
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE-1 — the weight table
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-1 — the frozen weight table', () => {
  it('is six positive INTEGER basis points summing to exactly 10000', () => {
    expect(PORTFOLIO_COMPONENT_KEYS).toHaveLength(6)
    let total = 0
    for (const key of PORTFOLIO_COMPONENT_KEYS) {
      const w = COMPONENT_WEIGHT_BP[key]
      expect(Number.isInteger(w), `${key} weight must be an integer`).toBe(true)
      expect(w).toBeGreaterThan(0)
      total += w
    }
    expect(total).toBe(10000)
    expect(TOTAL_WEIGHT_BP).toBe(10000)
    expect(Object.keys(COMPONENT_WEIGHT_BP).sort()).toEqual([...PORTFOLIO_COMPONENT_KEYS].sort())
  })

  it('publishes a version', () => {
    expect(PORTFOLIO_PRIORITY_VERSION).toBe('1.0.0')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-2 — renormalization over KNOWN components only
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-2 — renormalization drops unknown components from the DENOMINATOR', () => {
  const weightedFive =
    3200 * 40 + 3000 * 30 + 1400 * 20 + 1100 * 45 + 800 * 25 // 315500

  it('a school missing trajectory scores over the 9500bp it actually knows', () => {
    const missingTrajectory = computePortfolio(
      [school({ components: allKnown({ trajectory: absent('no_baseline_reading') }) })],
      NOW,
    )
    const row = missingTrajectory.ranked[0]
    expect(row.knownComponents).toEqual([
      'readinessLevel',
      'earlyWarning',
      'evidenceCurrency',
      'domainExposure',
      'improvement',
    ])
    expect(row.confidence).toBe(9500 / TOTAL_WEIGHT_BP)
    expect(row.attentionScore).toBe(Math.round(weightedFive / 9500))
    expect(row.attentionScore).toBe(33)
  })

  it('a KNOWN-but-zero component still occupies the denominator (and lowers the score)', () => {
    const zeroTrajectory = computePortfolio(
      [school({ components: allKnown({ trajectory: known(0) }) })],
      NOW,
    )
    const row = zeroTrajectory.ranked[0]
    expect(row.knownComponents).toHaveLength(6)
    expect(row.confidence).toBe(1)
    expect(row.attentionScore).toBe(Math.round(weightedFive / 10000))
    expect(row.attentionScore).toBe(32)

    // The whole point: KNOWN-zero and MISSING are different answers.
    const missing = computePortfolio(
      [school({ components: allKnown({ trajectory: absent('no_baseline_reading') }) })],
      NOW,
    ).ranked[0]
    expect(missing.attentionScore).not.toBe(row.attentionScore)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-3 / PURE-4 / PURE-10 — the two floors
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-3 — ANY three of six missing is NOT RANKED, with all three named', () => {
  const triples = subsetsOfSize([...PORTFOLIO_COMPONENT_KEYS], 3)

  it('covers all twenty 3-subsets', () => {
    expect(triples).toHaveLength(20)
  })

  it.each(triples.map((t) => [t.join('+'), t] as const))(
    'missing %s → insufficientData with the three named',
    (_label, triple) => {
      const over: Partial<Record<PortfolioComponentKey, PortfolioComponentInput>> = {}
      for (const key of triple) over[key] = absent(`${key}_unreadable`)
      const result = computePortfolio([school({ components: allKnown(over) })], NOW)

      expect(result.ranked).toHaveLength(0)
      expect(result.insufficientData).toHaveLength(1)
      const row = result.insufficientData[0]
      expect(row.reason).toBe('too_few_components')
      expect(row.missingComponents.map((m) => m.component).sort()).toEqual([...triple].sort())
      expect(row.missingComponents.length).toBeGreaterThan(0)
      for (const m of row.missingComponents) expect(m.reason).toBe(`${m.component}_unreadable`)
      expect(row.knownComponents).toHaveLength(3)
    },
  )
})

describe('PURE-4 — the CONFIDENCE floor is live and reachable', () => {
  it('the four lightest components pass the count rule and fail on confidence', () => {
    const result = computePortfolio(
      [
        school({
          components: allKnown({
            readinessLevel: absent('no_snapshot'),
            earlyWarning: absent('ledger_unreadable'),
          }),
        }),
      ],
      NOW,
    )
    expect(result.ranked).toHaveLength(0)
    const row = result.insufficientData[0]
    expect(row.knownComponents).toEqual([
      'evidenceCurrency',
      'domainExposure',
      'improvement',
      'trajectory',
    ])
    expect(row.knownComponents.length).toBeGreaterThanOrEqual(MIN_KNOWN_COMPONENTS)
    expect(row.confidence).toBe(0.38)
    expect(row.confidence).toBeLessThan(MIN_CONFIDENCE)
    expect(row.reason).toBe('low_confidence')
    expect(row.missingComponents.map((m) => m.component)).toEqual(['readinessLevel', 'earlyWarning'])
  })

  it('every OTHER 4-subset contains readinessLevel or earlyWarning and clears the floor', () => {
    for (const quad of subsetsOfSize([...PORTFOLIO_COMPONENT_KEYS], 4)) {
      const bp = quad.reduce((acc, k) => acc + COMPONENT_WEIGHT_BP[k], 0)
      const light = !quad.includes('readinessLevel') && !quad.includes('earlyWarning')
      if (light) expect(bp / TOTAL_WEIGHT_BP).toBe(0.38)
      else expect(bp / TOTAL_WEIGHT_BP).toBeGreaterThanOrEqual(0.54)
    }
  })
})

describe('PURE-10 — an unranked school carries no score and no band', () => {
  it('has no attentionScore / attentionBand / band KEY at all', () => {
    const result = computePortfolio(
      [
        school({
          components: allKnown({
            readinessLevel: absent('no_snapshot'),
            earlyWarning: absent('ledger_unreadable'),
            trajectory: absent('no_baseline_reading'),
          }),
        }),
      ],
      NOW,
    )
    const row = result.insufficientData[0] as unknown as Record<string, unknown>
    expect('attentionScore' in row).toBe(false)
    expect('attentionBand' in row).toBe(false)
    expect('band' in row).toBe(false)
    expect('drivers' in row).toBe(false)
    expect('verifiedPct' in row).toBe(false)
    // Nothing in the serialised row can read as a healthy state.
    const json = JSON.stringify(row)
    for (const word of ['steady', 'clear', 'fine', 'on track']) {
      expect(json.toLowerCase()).not.toContain(word)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-5 — mandatory drivers
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-5 — every ranked row states its drivers, and names no figure it does not carry', () => {
  it('drivers are 1..3, ordered by contribution then by the frozen key order', () => {
    const row = computePortfolio([school()], NOW).ranked[0]
    expect(row.drivers.length).toBeGreaterThanOrEqual(1)
    expect(row.drivers.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < row.drivers.length; i += 1) {
      expect(row.drivers[i - 1].contributionBp).toBeGreaterThanOrEqual(row.drivers[i].contributionBp)
    }
    // round(3200*40/10000)=13, round(3000*30/10000)=9, round(1100*45/10000)=5
    expect(row.drivers.map((d) => d.component)).toEqual([
      'readinessLevel',
      'earlyWarning',
      'domainExposure',
    ])
    expect(row.drivers.map((d) => d.contributionBp)).toEqual([13, 9, 5])
    for (const d of row.drivers) {
      expect(row.knownComponents).toContain(d.component)
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.detail.length).toBeGreaterThan(0)
    }
  })

  it('the shares of ALL known components sum to attentionScore, up to rounding', () => {
    // The unit check. `contributionBp` divides by knownBp, so it is in
    // ATTENTION-SCORE POINTS — a reader who renders it as a fraction of 10000
    // is off by two orders of magnitude, and this is where that shows up.
    for (const s of [school(), school({ components: allKnown({ trajectory: absent('none') }) })]) {
      const row = computePortfolio([s], NOW).ranked[0]
      const knownBp = row.knownComponents.reduce((acc, k) => acc + COMPONENT_WEIGHT_BP[k], 0)
      const shares = row.knownComponents.map((k) =>
        Math.round((COMPONENT_WEIGHT_BP[k] * (row.components[k].score ?? 0)) / knownBp),
      )
      const total = shares.reduce((a, b) => a + b, 0)
      expect(Math.abs(total - row.attentionScore)).toBeLessThanOrEqual(row.knownComponents.length / 2)
      for (const d of row.drivers) expect(d.contributionBp).toBeLessThanOrEqual(100)
    }
  })

  it('a fully-measured school with every component at zero still gets exactly one driver', () => {
    const zeroed = allKnown()
    for (const key of PORTFOLIO_COMPONENT_KEYS) zeroed[key] = known(0)
    const row = computePortfolio([school({ components: zeroed })], NOW).ranked[0]
    expect(row.attentionScore).toBe(0)
    expect(row.attentionBand).toBe('clear')
    expect(row.drivers).toHaveLength(1)
    expect(row.drivers[0].component).toBe('readinessLevel') // the highest-weight known component
    expect(row.drivers[0].contributionBp).toBe(0)
    expect(row.drivers[0].detail).toBe(ALL_CLEAR_DRIVER_DETAIL)
    expect(integersIn(row.drivers[0].detail)).toEqual([])
  })

  it('every integer in every driver detail appears on the row itself', () => {
    const rows = computePortfolio(
      [
        school(),
        school({ schoolId: 'sch-2', name: 'Beta', components: allKnown({ readinessLevel: known(5) }) }),
        school({
          schoolId: 'sch-3',
          name: 'Gamma',
          trajectoryDeltaPct: 7,
          components: allKnown({ trajectory: known(15), readinessLevel: known(2), earlyWarning: known(1) }),
        }),
        school({
          schoolId: 'sch-4',
          name: 'Delta',
          trajectoryDeltaPct: null,
          components: allKnown({ readinessLevel: known(1), earlyWarning: known(1), trajectory: known(80) }),
        }),
      ],
      NOW,
    ).ranked

    expect(rows).toHaveLength(4)
    let sawDetailWithFigures = false
    for (const row of rows) {
      const allowed = rowNumerals(row)
      for (const d of row.drivers) {
        const found = integersIn(d.detail)
        if (found.length > 0) sawDetailWithFigures = true
        for (const n of found) {
          expect(
            allowed.has(n),
            `driver ${d.component} on ${row.schoolId} names ${n}, which the row does not carry ` +
              `(allowed: ${[...allowed].join(', ')}) — detail: ${d.detail}`,
          ).toBe(true)
        }
        // Labels may not invent figures either.
        for (const n of integersIn(d.label)) expect(allowed.has(n)).toBe(true)
      }
    }
    // Guard the guard: a run where no detail carried a figure would prove nothing.
    expect(sawDetailWithFigures).toBe(true)
  })

  it('the trajectory driver states a DIRECTION and no figure when the row carries no delta', () => {
    const row = computePortfolio(
      [
        school({
          trajectoryDeltaPct: null,
          components: allKnown({ readinessLevel: known(0), earlyWarning: known(0), trajectory: known(80) }),
        }),
      ],
      NOW,
    ).ranked[0]
    const trajectory = row.drivers.find((d) => d.component === 'trajectory')
    expect(trajectory).toBeDefined()
    expect(integersIn(trajectory!.detail)).toEqual([])
    expect(trajectory!.detail).toContain('moved backwards')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-6 — urgency is a SORT KEY, never a multiplier
// ─────────────────────────────────────────────────────────────────────────────

describe('urgency is a SORT KEY, never a multiplier', () => {
  it('varying urgency 0→3 on one school leaves attentionScore, attentionBand, confidence, components and drivers byte-identical, and changes only the ordering', () => {
    const dayCounts = [900, 600, 300, 100] // urgency 0, 1, 2, 3
    const rows = dayCounts.map(
      (days) => computePortfolio([school({ urgencyDaysToReview: days })], NOW).ranked[0],
    )

    expect(rows.map((r) => r.urgency)).toEqual([0, 1, 2, 3])
    expect(rows.map((r) => r.urgencyReason)).toEqual([
      'review_beyond_horizon',
      'visit_on_horizon',
      'visit_within_year',
      'visit_imminent',
    ])

    // EVERY field except the urgency inputs/outputs and the rank must be
    // byte-identical. This is the assertion a multiplier reddens.
    const stripped = rows.map((r) => {
      const copy = { ...r } as Partial<PortfolioRow>
      delete copy.urgency
      delete copy.urgencyReason
      delete copy.urgencyDaysToReview
      delete copy.rank
      return JSON.stringify(copy)
    })
    for (const s of stripped) expect(s).toBe(stripped[0])

    // …and the four sort into strictly DESCENDING urgency inside one band.
    const together = computePortfolio(
      dayCounts.map((days, i) =>
        school({ schoolId: `sch-${i}`, name: 'Same Name', urgencyDaysToReview: days }),
      ),
      NOW,
    ).ranked
    expect(together.map((r) => r.urgency)).toEqual([3, 2, 1, 0])
    expect(new Set(together.map((r) => r.attentionBand)).size).toBe(1)
    expect(new Set(together.map((r) => r.attentionScore)).size).toBe(1)
  })

  it('urgency can never promote a school into a worse band', () => {
    // A calm school with the most urgent calendar still bands below a bad one.
    const calm = school({
      schoolId: 'calm',
      name: 'Calm',
      urgencyDaysToReview: 1,
      citationOverdue: true,
      components: allKnown({
        readinessLevel: known(0),
        earlyWarning: known(0),
        evidenceCurrency: known(0),
        domainExposure: known(0),
        improvement: known(0),
        trajectory: known(0),
      }),
    })
    const bad = school({
      schoolId: 'bad',
      name: 'Bad',
      urgencyDaysToReview: null,
      components: allKnown({
        readinessLevel: known(95),
        earlyWarning: known(95),
        evidenceCurrency: known(95),
        domainExposure: known(95),
        improvement: known(95),
        trajectory: known(95),
      }),
    })
    const ranked = computePortfolio([calm, bad], NOW).ranked
    expect(ranked[0].schoolId).toBe('bad')
    expect(ranked[0].attentionBand).toBe('high')
    expect(ranked[1].attentionBand).toBe('clear')
    expect(ranked[1].urgency).toBe(3)
  })

  it('urgency tiers follow URGENCY_TIER_DAYS, and an overdue citation names itself', () => {
    const at = (days: number | null, citation = false) =>
      computePortfolio([school({ urgencyDaysToReview: days, citationOverdue: citation })], NOW).ranked[0]

    expect(at(URGENCY_TIER_DAYS.imminent).urgency).toBe(3)
    expect(at(URGENCY_TIER_DAYS.imminent + 1).urgency).toBe(2)
    expect(at(URGENCY_TIER_DAYS.near).urgency).toBe(2)
    expect(at(URGENCY_TIER_DAYS.near + 1).urgency).toBe(1)
    expect(at(URGENCY_TIER_DAYS.horizon).urgency).toBe(1)
    expect(at(URGENCY_TIER_DAYS.horizon + 1).urgency).toBe(0)
    expect(at(-30).urgency).toBe(3)
    expect(at(null, true).urgency).toBe(3)
    expect(at(null, true).urgencyReason).toBe('citation_overdue')
  })

  it('says no_scheduled_review ONLY when no date is known', () => {
    const noDate = computePortfolio([school({ urgencyDaysToReview: null })], NOW).ranked[0]
    expect(noDate.urgencyReason).toBe('no_scheduled_review')
    // A review scheduled 900 days out is urgency 0 — but it is NOT "no scheduled
    // review", and saying so would be the exact class of quiet falsehood this
    // engine exists to remove.
    const farOut = computePortfolio([school({ urgencyDaysToReview: 900 })], NOW).ranked[0]
    expect(farOut.urgency).toBe(0)
    expect(farOut.urgencyReason).toBe('review_beyond_horizon')
  })

  // RED PROOF (run): removing the `daysToReview < 0` branch from computeUrgency
  // makes BOTH assertions below report 'visit_imminent' — the engine describes a
  // date 200 days in the PAST as "a visit within six months".
  it('a LAPSED review names itself review_overdue, never visit_imminent', () => {
    const lapsed = computePortfolio([school({ urgencyDaysToReview: -200 })], NOW).ranked[0]
    expect(lapsed.urgency).toBe(3)
    expect(lapsed.urgencyReason).toBe('review_overdue')

    // A date one day past is still past.
    const justLapsed = computePortfolio([school({ urgencyDaysToReview: -1 })], NOW).ranked[0]
    expect(justLapsed.urgencyReason).toBe('review_overdue')

    // …and today itself is NOT lapsed: it is imminent.
    const today = computePortfolio([school({ urgencyDaysToReview: 0 })], NOW).ranked[0]
    expect(today.urgencyReason).toBe('visit_imminent')
  })

  // RED PROOF (run): restoring `const citationOverdue = s.citationOverdue === true`
  // makes the first assertion read `false` — a payload field asserting, of every
  // school in every diocese, that we checked a due date this product does not store.
  it('citationOverdue is TRI-STATE: an unassessed input stays null, never false', () => {
    const unassessed = computePortfolio(
      [school({ citationOverdue: null })],
      NOW,
    ).ranked[0]
    expect(unassessed.citationOverdue).toBeNull()
    // null behaves like false for ORDERING — it may not invent urgency either.
    expect(unassessed.urgency).toBe(computePortfolio([school({ citationOverdue: false })], NOW).ranked[0].urgency)

    // The two answerable states are still answerable and still distinct.
    expect(computePortfolio([school({ citationOverdue: false })], NOW).ranked[0].citationOverdue).toBe(false)
    const overdue = computePortfolio([school({ citationOverdue: true })], NOW).ranked[0]
    expect(overdue.citationOverdue).toBe(true)
    expect(overdue.urgencyReason).toBe('citation_overdue')
  })

  it('derives the day count from urgencyDate against the `now` PARAMETER', () => {
    const row = computePortfolio(
      [school({ urgencyDaysToReview: null, urgencyDate: '2026-09-02' })],
      NOW,
    ).ranked[0]
    expect(row.urgencyDaysToReview).toBe(30)
    expect(row.urgency).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-7 — the comparator is a TOTAL ORDER
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-7 — the comparator is total and deterministic', () => {
  function bigFixture(): PortfolioSchoolInput[] {
    const out: PortfolioSchoolInput[] = []
    for (let i = 0; i < 200; i += 1) {
      const nullVerified = i % 5 === 0
      const components = allKnown({
        readinessLevel: nullVerified ? absent('no_snapshot') : known((i % 4) * 20),
        evidenceCurrency: nullVerified ? absent('basis_exists') : known((i % 3) * 10),
        earlyWarning: known((i % 6) * 10),
        domainExposure: known((i % 5) * 12),
        improvement: known((i % 7) * 8),
        trajectory: known(50),
      })
      out.push(
        school({
          schoolId: `sch-${String(i).padStart(3, '0')}`,
          // DUPLICATE names on purpose: "St. Mary" twice is the normal case.
          name: `School ${i % 7}`,
          verifiedPct: nullVerified ? null : (i % 10) * 10,
          selfScoredPct: nullVerified ? null : 80,
          urgencyDaysToReview: [null, 100, 300, 600, 900][i % 5],
          components,
        }),
      )
    }
    return out
  }

  it('shuffling the input 50 times yields ONE identical schoolId sequence', () => {
    const fixture = bigFixture()
    const canonical = computePortfolio(fixture, NOW).ranked.map((r) => r.schoolId)
    expect(canonical.length).toBeGreaterThan(150)
    // The fixture must actually exercise the hard cases, or the spec proves nothing.
    expect(new Set(fixture.map((s) => s.name)).size).toBeLessThan(fixture.length)
    expect(fixture.some((s) => s.verifiedPct === null)).toBe(true)

    for (let seed = 1; seed <= 50; seed += 1) {
      const order = computePortfolio(shuffled(fixture, seed), NOW).ranked.map((r) => r.schoolId)
      expect(order, `seed ${seed}`).toEqual(canonical)
    }
  })

  it('is antisymmetric and never returns 0 for two distinct rows', () => {
    const rows = computePortfolio(bigFixture(), NOW).ranked
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < Math.min(rows.length, i + 12); j += 1) {
        const ab = comparePortfolioRows(rows[i], rows[j])
        const ba = comparePortfolioRows(rows[j], rows[i])
        expect(ab).not.toBe(0)
        expect(Math.sign(ab)).toBe(-Math.sign(ba))
      }
      expect(comparePortfolioRows(rows[i], rows[i])).toBe(0)
    }
  })

  it('null verifiedPct sorts LAST within its tie group', () => {
    const base = { urgencyDaysToReview: 100, components: allKnown({ trajectory: known(50) }) }
    const ranked = computePortfolio(
      [
        school({ ...base, schoolId: 'a', name: 'Aaa', verifiedPct: null, selfScoredPct: null,
          components: allKnown({ readinessLevel: absent('x'), evidenceCurrency: absent('y') }) }),
        school({ ...base, schoolId: 'b', name: 'Bbb', verifiedPct: 90 }),
      ],
      NOW,
    ).ranked
    // Force the tie: both must land on the same band/urgency/score for key 4 to decide.
    if (ranked[0].attentionScore === ranked[1].attentionScore) {
      expect(ranked[ranked.length - 1].verifiedPct).toBeNull()
    }
    const nullRow = ranked.find((r) => r.verifiedPct === null)!
    const numRow = ranked.find((r) => r.verifiedPct !== null)!
    const tied: PortfolioRow = { ...numRow, attentionBand: nullRow.attentionBand, attentionScore: nullRow.attentionScore, urgency: nullRow.urgency }
    expect(comparePortfolioRows(tied, nullRow)).toBeLessThan(0)
    expect(comparePortfolioRows(nullRow, tied)).toBeGreaterThan(0)
  })

  it('two rows identical on keys 1..5 are separated by schoolId', () => {
    const twins = [
      school({ schoolId: 'sch-b', name: 'St. Mary' }),
      school({ schoolId: 'sch-a', name: 'St. Mary' }),
    ]
    const ranked = computePortfolio(twins, NOW).ranked
    expect(ranked.map((r) => r.schoolId)).toEqual(['sch-a', 'sch-b'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2])
  })

  it('two identical invocations are byte-identical', () => {
    const fixture = bigFixture()
    expect(JSON.stringify(computePortfolio(fixture, NOW))).toBe(
      JSON.stringify(computePortfolio(fixture, NOW)),
    )
  })

  it('name ordering uses raw code-unit comparison, not a locale collation', () => {
    const ranked = computePortfolio(
      [
        school({ schoolId: 'x', name: 'a lower' }),
        school({ schoolId: 'y', name: 'B upper' }),
      ],
      NOW,
    ).ranked
    // localeCompare would put 'a lower' first; raw `<` puts 'B upper' first.
    expect(ranked.map((r) => r.name)).toEqual(['B upper', 'a lower'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-8 — the tiebreak is verifiedPct, NOT readinessPct
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-8 — ranking on EVIDENCE, not on self-assessment', () => {
  it('the row with the LOWER verifiedPct ranks first even though its readinessPct is higher', () => {
    const a = school({
      schoolId: 'sch-a',
      name: 'Zeta School', // deliberately LAST alphabetically
      verifiedPct: 40,
      readinessPct: 90,
      selfScoredPct: 95,
    })
    const b = school({
      schoolId: 'sch-b',
      name: 'Alpha School', // deliberately FIRST alphabetically
      verifiedPct: 70,
      readinessPct: 10,
      selfScoredPct: 95,
    })
    const ranked = computePortfolio([b, a], NOW).ranked
    expect(ranked[0].attentionBand).toBe(ranked[1].attentionBand)
    expect(ranked[0].urgency).toBe(ranked[1].urgency)
    expect(ranked[0].attentionScore).toBe(ranked[1].attentionScore)
    // Key 4 decides, and it decides on evidence — beating the name key too.
    expect(ranked.map((r) => r.schoolId)).toEqual(['sch-a', 'sch-b'])
    expect(ranked[0].verifiedPct).toBe(40)
    expect(ranked[0].readinessPct).toBe(90)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-9 — mixed frameworks
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-9 — mixed frameworks are never merged into one histogram', () => {
  it('emits one bandDistribution entry per framework, indexComparable:false and the frozen note', () => {
    const result = computePortfolio(
      [
        school({ schoolId: 's1', name: 'A', frameworkCode: 'COG', frameworkName: 'Cognia' }),
        school({ schoolId: 's2', name: 'B', frameworkCode: 'COG', frameworkName: 'Cognia' }),
        school({ schoolId: 's3', name: 'C', frameworkCode: 'MSA', frameworkName: 'Middle States' }),
      ],
      NOW,
    )
    expect(result.indexComparable).toBe(false)
    expect(result.bandDistribution).toHaveLength(2)
    expect(result.bandDistribution.map((b) => b.frameworkCode)).toEqual(['COG', 'MSA'])
    expect(result.bandDistribution.map((b) => b.schoolCount)).toEqual([2, 1])
    // Counts carry all five band keys — a missing key is a chart that silently
    // drops a band.
    for (const entry of result.bandDistribution) {
      expect(Object.keys(entry.counts).sort()).toEqual(
        ['clear', 'critical', 'elevated', 'high', 'watch'],
      )
      const total = Object.values(entry.counts).reduce((a, b) => a + b, 0)
      expect(total).toBe(entry.schoolCount)
    }
    expect(result.notes).toContain(multiFrameworkNote(2))
    expect(result.notes.join(' ')).toContain('never by index')
  })

  it('one framework with an index scale IS comparable, and emits no note', () => {
    const result = computePortfolio(
      [
        school({ schoolId: 's1', name: 'A', frameworkCode: 'COG', indexComparable: true }),
        school({ schoolId: 's2', name: 'B', frameworkCode: 'COG', indexComparable: true }),
      ],
      NOW,
    )
    expect(result.indexComparable).toBe(true)
    expect(result.notes).toEqual([])
    expect(result.bandDistribution).toHaveLength(1)
  })

  it('does NOT claim "N different frameworks" when the real reason is something else', () => {
    const noScale = computePortfolio(
      [
        school({ schoolId: 's1', name: 'A', frameworkCode: 'COG', indexComparable: false }),
        school({ schoolId: 's2', name: 'B', frameworkCode: 'COG', indexComparable: true }),
      ],
      NOW,
    )
    expect(noScale.indexComparable).toBe(false)
    expect(noScale.notes).toEqual([NO_INDEX_SCALE_NOTE])
    expect(noScale.notes.join(' ')).not.toContain('different accreditation frameworks')

    const unknownFramework = computePortfolio(
      [
        school({ schoolId: 's1', name: 'A', frameworkCode: 'COG' }),
        school({ schoolId: 's2', name: 'B', frameworkCode: null, frameworkName: null }),
      ],
      NOW,
    )
    expect(unknownFramework.indexComparable).toBe(false)
    expect(unknownFramework.notes).toContain(UNKNOWN_FRAMEWORK_NOTE)
    expect(unknownFramework.notes.join(' ')).not.toContain('different accreditation frameworks')
    // null framework sorts LAST in the distribution.
    expect(unknownFramework.bandDistribution.map((b) => b.frameworkCode)).toEqual(['COG', null])
  })

  it('an empty portfolio is not comparable and invents no note', () => {
    const result = computePortfolio([], NOW)
    expect(result).toEqual({
      ranked: [],
      insufficientData: [],
      bandDistribution: [],
      indexComparable: false,
      notes: [],
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-11 — total on adversarial input
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-11 — computePortfolio is TOTAL and coerces to UNKNOWN, never to a plausible number', () => {
  it('never throws on adversarial input', () => {
    const adversarial = [
      null,
      undefined,
      42,
      'nope',
      {},
      { schoolId: 'x' },
      school({ components: allKnown({ readinessLevel: { known: true, score: 999, basis: null, reason: null } }) }),
      school({ components: allKnown({ earlyWarning: { known: true, score: Number.NaN, basis: null, reason: null } }) }),
      school({ components: allKnown({ improvement: { known: false, score: 12, basis: null, reason: 'x' } }) }),
      school({ weakestDomain: { domainKey: 'not_a_domain', pct: 10 } as never }),
      school({ openFindings: null as never, initiatives: undefined as never }),
      school({ verifiedPct: Number.POSITIVE_INFINITY, selfScoredPct: Number.NaN }),
      school({ urgencyDaysToReview: Number.NaN, snapshotDate: 'yesterday' }),
    ]
    expect(() => computePortfolio(adversarial as never, NOW)).not.toThrow()
    expect(() => computePortfolio(null as never, NOW)).not.toThrow()
    expect(() => computePortfolio([school()], null as never)).not.toThrow()
    expect(() => computePortfolio([school()], 'not-a-day')).not.toThrow()
  })

  it('an out-of-range score becomes UNKNOWN with invalid_input, never a clamped number', () => {
    const result = computePortfolio(
      [
        school({
          components: allKnown({
            readinessLevel: { known: true, score: 999, basis: 'lies', reason: null },
          }),
        }),
      ],
      NOW,
    )
    const row = result.ranked[0]
    expect(row.components.readinessLevel).toEqual({
      known: false,
      score: null,
      basis: null,
      reason: INVALID_INPUT_REASON,
    })
    expect(row.knownComponents).not.toContain('readinessLevel')
  })

  it('a score present on an UNKNOWN component is a contradiction, not a number we use', () => {
    const row = computePortfolio(
      [
        school({
          components: allKnown({
            trajectory: { known: false, score: 80, basis: null, reason: 'no_baseline_reading' },
          }),
        }),
      ],
      NOW,
    ).ranked[0]
    expect(row.components.trajectory.known).toBe(false)
    expect(row.components.trajectory.score).toBeNull()
    expect(row.components.trajectory.reason).toBe(INVALID_INPUT_REASON)
  })

  it('a KNOWN component whose figure the row cannot show is rejected, not ranked', () => {
    // domainExposure claims to be known but there is no weakest domain to name,
    // so its driver could not state a figure. Rejecting pushes the school
    // towards insufficientData — the SAFE direction.
    const row = computePortfolio([school({ weakestDomain: null })], NOW).ranked[0]
    expect(row.components.domainExposure.known).toBe(false)
    expect(row.components.domainExposure.reason).toBe(INVALID_INPUT_REASON)

    const noVerified = computePortfolio([school({ verifiedPct: null })], NOW)
    const rows = [...noVerified.ranked, ...noVerified.insufficientData]
    expect(rows).toHaveLength(1)
    const only = noVerified.ranked[0]
    expect(only.components.readinessLevel.known).toBe(false)
    expect(only.components.evidenceCurrency.known).toBe(false)
  })

  it('an unknown domain key is dropped rather than believed', () => {
    const row = computePortfolio(
      [school({ weakestDomain: { domainKey: 'not_a_domain', pct: 10 } as never })],
      NOW,
    ).ranked[0]
    expect(row.weakestDomain).toBeNull()
    expect(row.components.domainExposure.known).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PURE-12 — purity
// ─────────────────────────────────────────────────────────────────────────────

describe('PURE-12 — the purity guard covers portfolio-priority.ts', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const target = resolve(here, '..', 'src', 'portfolio-priority.ts')

  // The SAME list the package purity guard applies to every file in src/. Named
  // here so this spec fails on the new file specifically, rather than trusting
  // that the directory walk happened to include it.
  const FORBIDDEN = [
    /from\s+['"]react['"]/,
    /from\s+['"]react-dom/,
    /from\s+['"]node:fs['"]/,
    /from\s+['"]fs['"]/,
    /from\s+['"]xlsx['"]/,
    /\bfetch\s*\(/,
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /\bDate\s*\./,
    /\bnew\s+Date\b/,
    /\bMath\.random\b/,
  ]

  it('reads no clock, no random source, no I/O and no DOM — comments included', () => {
    const text = readFileSync(target, 'utf-8')
    expect(text.length).toBeGreaterThan(0)
    const offenders = FORBIDDEN.filter((re) => re.test(text)).map(String)
    expect(offenders).toEqual([])
  })

  it('imports only from the four permitted sibling modules', () => {
    const text = readFileSync(target, 'utf-8')
    const imports = [...text.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1])
    expect(new Set(imports)).toEqual(
      new Set([
        './accreditation-twin.js',
        './accreditation-domains.js',
        './review-status.js',
        './readiness-history.js',
      ]),
    )
  })

  it('does not mutate its inputs', () => {
    const fixture = [school(), school({ schoolId: 'sch-2', name: 'Beta' })]
    const before = JSON.stringify(fixture)
    computePortfolio(fixture, NOW)
    expect(JSON.stringify(fixture)).toBe(before)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The six scorers — direction is the most likely silent defect
// ─────────────────────────────────────────────────────────────────────────────

describe('the six scorers — HIGHER ALWAYS MEANS MORE ATTENTION NEEDED', () => {
  it('readinessLevel rises as evidence-backed coverage FALLS', () => {
    expect(scoreReadinessLevel(100)).toBe(0)
    expect(scoreReadinessLevel(60)).toBe(40)
    expect(scoreReadinessLevel(0)).toBe(100)
    expect(scoreReadinessLevel(null)).toBeNull()
    expect(scoreReadinessLevel(Number.NaN)).toBeNull()
  })

  it('earlyWarning treats a clean ledger as KNOWN-zero, never as unknown', () => {
    expect(scoreEarlyWarning({ critical: 0, warn: 0, info: 0 })).toBe(0)
    expect(scoreEarlyWarning({ critical: 1, warn: 2, info: 3 })).toBe(25 + 20 + 9)
    expect(scoreEarlyWarning({ critical: 10, warn: 10, info: 10 })).toBe(100)
    expect(scoreEarlyWarning({ critical: Number.NaN })).toBeNull()
  })

  it('evidenceCurrency refuses entirely under the `exists` basis', () => {
    expect(scoreEvidenceCurrency(80, 60, 'current')).toBe(20)
    expect(scoreEvidenceCurrency(60, 80, 'current')).toBe(0) // never negative
    expect(scoreEvidenceCurrency(80, 60, 'exists')).toBeNull()
    expect(scoreEvidenceCurrency(80, 60, null)).toBeNull()
  })

  it('domainExposure names the weakest domain and rises as that domain falls', () => {
    const weak = scoreDomainExposure({ finance: 20, governance: 80, facilities: 55 })
    expect(weak).toEqual({ score: 80, domainKey: 'finance', pct: 20 })
    expect(scoreDomainExposure({ finance: null, governance: null })).toBeNull()
    expect(scoreDomainExposure({ not_a_domain: 5 })).toBeNull()
    expect(scoreDomainExposure(null)).toBeNull()
    // Ties resolve to the lowest DOMAIN_KEYS index — frozen, never insertion order.
    expect(scoreDomainExposure({ finance: 30, governance: 30 })?.domainKey).toBe('governance')
  })

  it('improvement rises with unresponded findings and stalled work', () => {
    expect(scoreImprovement({ unresponded: 0, overdue: 0, stale: 0 })).toBe(0)
    expect(scoreImprovement({ unresponded: 1, overdue: 1, stale: 1 })).toBe(30)
    expect(scoreImprovement({ unresponded: 20, overdue: 0, stale: 0 })).toBe(100)
  })

  it('trajectory is 50 when flat, HIGHER when coverage fell, and null when unknown', () => {
    expect(scoreTrajectory(60, 60)).toBe(50)
    expect(scoreTrajectory(50, 60)).toBe(100) // fell 10 points → most attention
    expect(scoreTrajectory(70, 60)).toBe(0) // rose 10 points
    expect(scoreTrajectory(60, null)).toBeNull()
    expect(scoreTrajectory(null, 60)).toBeNull()
  })
})

describe('trajectory comparability — reuse, do not re-derive', () => {
  const reading = (over: Partial<Parameters<typeof assessTrajectoryComparability>[0]> = {}) => ({
    day: '2026-08-01',
    engineVersion: '1.0.0',
    leafCount: 40,
    frameworkId: 'fw-1',
    verifiedBasis: 'current',
    verifiedPct: 60,
    ...over,
  })

  it('the baseline cutoff is `now` minus TRAJECTORY_BASELINE_DAYS, as a civil day', () => {
    expect(TRAJECTORY_BASELINE_DAYS).toBe(90)
    expect(trajectoryBaselineCutoff('2026-08-03')).toBe('2026-05-05')
    expect(trajectoryBaselineCutoff('2026-01-01')).toBe('2025-10-03')
    expect(trajectoryBaselineCutoff('nope')).toBeNull()
  })

  it('is KNOWN only with a baseline, a long enough span and no comparability break', () => {
    const latest = reading()
    expect(assessTrajectoryComparability(latest, null).reason).toBe('no_baseline_reading')
    expect(assessTrajectoryComparability(null, reading()).reason).toBe('no_latest_reading')

    // 30 days is MIN_SPAN_DAYS_FOR_DIRECTION — imported, never re-typed.
    expect(assessTrajectoryComparability(latest, reading({ day: '2026-07-20' })).reason).toBe(
      'span_too_short',
    )

    const good = assessTrajectoryComparability(latest, reading({ day: '2026-05-01', verifiedPct: 66 }))
    expect(good.known).toBe(true)
    expect(good.deltaPct).toBe(-6)
    expect(good.spanDays).toBe(92)

    for (const breakField of [
      { engineVersion: '2.0.0' },
      { leafCount: 41 },
      { frameworkId: 'fw-2' },
      { verifiedBasis: 'exists' },
    ]) {
      const broken = assessTrajectoryComparability(
        latest,
        reading({ day: '2026-05-01', ...breakField }),
      )
      expect(broken.known, JSON.stringify(breakField)).toBe(false)
      expect(broken.reason).toBe('comparability_break')
      expect(broken.deltaPct).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// canonicalBulkAdoptPayload
// ─────────────────────────────────────────────────────────────────────────────

describe('canonicalBulkAdoptPayload — the propose→confirm identity', () => {
  const base = {
    orgId: 'org-1',
    catalogStandardId: 'cat-1',
    schoolIds: ['b', 'a', 'c'],
    title: 'Run one diocesan workshop',
    dueDate: '2026-12-01',
    targetRubricScore: 3,
  }

  it('is order-insensitive and duplicate-insensitive over schoolIds', () => {
    expect(canonicalBulkAdoptPayload(base)).toBe(
      canonicalBulkAdoptPayload({ ...base, schoolIds: ['c', 'b', 'a'] }),
    )
    expect(canonicalBulkAdoptPayload(base)).toBe(
      canonicalBulkAdoptPayload({ ...base, schoolIds: ['a', 'a', 'b', 'c'] }),
    )
  })

  it('changes when the SET of schools changes — which is what PROPOSAL_STALE catches', () => {
    expect(canonicalBulkAdoptPayload({ ...base, schoolIds: ['a', 'b'] })).not.toBe(
      canonicalBulkAdoptPayload(base),
    )
    expect(canonicalBulkAdoptPayload({ ...base, title: 'Something else' })).not.toBe(
      canonicalBulkAdoptPayload(base),
    )
    expect(canonicalBulkAdoptPayload({ ...base, dueDate: null })).not.toBe(
      canonicalBulkAdoptPayload(base),
    )
    expect(canonicalBulkAdoptPayload({ ...base, targetRubricScore: null })).not.toBe(
      canonicalBulkAdoptPayload(base),
    )
  })

  it('cannot be spoofed by moving a delimiter into a field', () => {
    const a = canonicalBulkAdoptPayload({ ...base, schoolIds: ['a'], title: 'x|y' })
    const b = canonicalBulkAdoptPayload({ ...base, schoolIds: ['a'], title: 'x', dueDate: 'y' })
    expect(a).not.toBe(b)
  })

  it('omitted optional fields hash the same as their explicit empty form', () => {
    expect(
      canonicalBulkAdoptPayload({
        orgId: 'o',
        catalogStandardId: 'c',
        schoolIds: ['a'],
        title: 't',
      }),
    ).toBe(
      canonicalBulkAdoptPayload({
        orgId: 'o',
        catalogStandardId: 'c',
        schoolIds: ['a'],
        title: 't',
        dueDate: null,
        targetRubricScore: null,
      }),
    )
  })
})

describe('ATTENTION_BAND_RANK', () => {
  it('ranks by severity, with critical sharing the worst rank', () => {
    expect(ATTENTION_BAND_RANK.critical).toBe(ATTENTION_BAND_RANK.high)
    expect(ATTENTION_BAND_RANK.high).toBeLessThan(ATTENTION_BAND_RANK.elevated)
    expect(ATTENTION_BAND_RANK.elevated).toBeLessThan(ATTENTION_BAND_RANK.watch)
    expect(ATTENTION_BAND_RANK.watch).toBeLessThan(ATTENTION_BAND_RANK.clear)
  })
})

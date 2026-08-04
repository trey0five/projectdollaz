// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE 2 for the roster-import fix: once an upload writes
// `period_operational_data.enrollment`, EVERY metric that depends on enrollment
// must actually compute — none may still report `inputsMissing: ['enrollment']`.
//
// The dependent set is DERIVED FROM THE REGISTRY, never hand-typed. A hardcoded
// list goes stale the moment a metric is added, and — as it happens — the
// hand-typed list of "eleven enrollment metrics" in the scope note is already
// wrong: only SEVEN metric defs read `curOp.enrollment`. The other four are
// enrollment-ADJACENT (they consume enrollmentFte, budget or forecast inputs) and
// are unaffected by a headcount landing. Deriving the set is what makes this
// test true today AND true after the twelfth metric ships.
//
// Two derivations, unioned, because either alone has a blind spot:
//   BEHAVIOURAL  — the metric's output changes when enrollment goes null → N.
//                  Catches a metric that reads the field without declaring it.
//   DECLARATIVE  — the metric's semantic-layer `inputs` spec names
//                  {key:'enrollment', source:'operational'}. Catches a metric
//                  whose enrollment branch this fixture happens not to reach.
//
// PURE: lives in __tests__/ (the purity walker only scans src/), and uses no
// clock or randomness regardless.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import type { MetricDef, PeriodFinancials, PeriodOperational } from '../src/index.js'
import { ALL_METRICS, fromBundle } from '../src/index.js'
import { FULL_BUNDLE, PRIOR_BUNDLE } from './fixtures.js'

/** The headcount from the user-reported bug: a 436-student OneRoster upload. */
const ROSTER_N = 436

const CUR: PeriodFinancials = fromBundle(FULL_BUNDLE)
const PRIOR: PeriodFinancials = fromBundle(PRIOR_BUNDLE)

/**
 * Every operational field EXCEPT enrollment, present and usable — so the only
 * thing that can make a metric unavailable below is the enrollment headcount
 * itself. Denominators are strictly > 0 (the types.ts contract: null = NOT
 * ENTERED, 0 is legitimate but unusable as a divisor).
 */
const OTHER_INPUTS_PRESENT = {
  enrollmentPlan: 420,
  enrollmentFte: 430,
  studentsOnAid: 150,
  financialAidTotal: 210,
  teachingFte: 40,
  totalStaffFte: 60,
  budgetTotalRevenue: 1000,
  budgetTotalExpense: 900,
  forecastTotalRevenue: 1000,
  forecastTotalExpense: 900,
  planArtifactsPresent: 3,
  planArtifactsTotal: 3,
} as const

/** BEFORE the upload: the headcount was never entered. */
const OP_WITHOUT: PeriodOperational = { ...OTHER_INPUTS_PRESENT, enrollment: null }

/** AFTER the upload: the roster promoted a real, non-fabricated headcount. */
const OP_WITH: PeriodOperational = { ...OTHER_INPUTS_PRESENT, enrollment: ROSTER_N }

/** The prior year, so the YoY metrics have a usable (>0) denominator of their own. */
const PRIOR_OP: PeriodOperational = {
  ...OTHER_INPUTS_PRESENT,
  enrollment: 420,
  enrollmentFte: 415,
  teachingFte: 38,
}

/** Does this metric's output actually move when a headcount lands? */
function readsEnrollment(def: MetricDef): boolean {
  const before = def.compute(CUR, PRIOR, OP_WITHOUT, PRIOR_OP)
  const after = def.compute(CUR, PRIOR, OP_WITH, PRIOR_OP)
  return JSON.stringify(before) !== JSON.stringify(after)
}

/** Does this metric DECLARE enrollment in the canonical semantic layer? */
function declaresEnrollment(def: MetricDef): boolean {
  return (def.inputs ?? []).some((i) => i.key === 'enrollment' && i.source === 'operational')
}

const BEHAVIOURAL = ALL_METRICS.filter(readsEnrollment)
const DECLARATIVE = ALL_METRICS.filter(declaresEnrollment)
const DEPENDENT = ALL_METRICS.filter((d) => readsEnrollment(d) || declaresEnrollment(d))

describe('enrollment-dependent metrics (registry-derived)', () => {
  it('finds a non-trivial dependent set — the empty-walk guard', () => {
    // A derivation that silently came back EMPTY would pass every assertion below
    // while proving nothing. That is exactly how a grep-based guard can rot, so
    // the walk asserts it found something before it asserts anything about it.
    expect(ALL_METRICS.length).toBeGreaterThan(0)
    expect(DEPENDENT.length).toBeGreaterThanOrEqual(5)
    // ...and it is a real subset, not "every metric" (which would mean the walk
    // is detecting noise rather than enrollment).
    expect(DEPENDENT.length).toBeLessThan(ALL_METRICS.length)
  })

  it('every metric that READS enrollment also DECLARES it (semantic-layer invariant)', () => {
    // The declared MetricInputSpec is what stamps lineage and what the UI shows as
    // "why is this unavailable". A metric consuming a field it never declares is a
    // silent hole in the semantic layer.
    const undeclared = BEHAVIOURAL.filter((d) => !declaresEnrollment(d)).map((d) => d.key)
    expect(undeclared).toEqual([])
    expect(DECLARATIVE.length).toBeGreaterThanOrEqual(5)
  })

  it('AFTER the upload: every dependent metric computes, none is missing enrollment', () => {
    // This is acceptance 2. It is only meaningful because of the paired BEFORE
    // case below — together they prove the enrollment value is what flipped them.
    for (const def of DEPENDENT) {
      const out = def.compute(CUR, PRIOR, OP_WITH, PRIOR_OP)
      expect(out.inputsMissing, `${def.key} still reports enrollment missing`).not.toContain(
        'enrollment',
      )
      expect(out.available, `${def.key} did not become available`).toBe(true)
      expect(out.value, `${def.key} is available with a null value`).not.toBeNull()
    }
  })

  it('BEFORE the upload: every dependent metric names enrollment as the missing input', () => {
    for (const def of DEPENDENT) {
      const out = def.compute(CUR, PRIOR, OP_WITHOUT, PRIOR_OP)
      expect(out.inputsMissing, `${def.key} did not name enrollment`).toContain('enrollment')
      expect(out.available, `${def.key} was available with no enrollment`).toBe(false)
      // The whole point of the contract: never a fabricated number in place of
      // "not entered".
      expect(out.value, `${def.key} fabricated a value with no enrollment`).toBeNull()
    }
  })

  it('a FABRICATED zero is not accepted as a headcount by any denominator', () => {
    // Guards the failure mode this fix must not introduce: an import that writes
    // `enrollment: 0` because a file was empty would turn a correct "not
    // available" into a confident, wrong number. Every metric that DIVIDES by
    // enrollment must still refuse.
    const opZero: PeriodOperational = { ...OTHER_INPUTS_PRESENT, enrollment: 0 }
    const denominators = DEPENDENT.filter(
      (def) => def.compute(CUR, PRIOR, opZero, PRIOR_OP).available === false,
    )
    expect(denominators.length).toBeGreaterThanOrEqual(4)
    for (const def of denominators) {
      const out = def.compute(CUR, PRIOR, opZero, PRIOR_OP)
      expect(out.value, `${def.key} produced a value from a zero headcount`).toBeNull()
      expect(out.inputsMissing).toContain('enrollment')
    }
  })

  it('does not disturb metrics that never look at enrollment', () => {
    // The other half of "additive": a headcount landing must not change a single
    // Tier-1 finance metric.
    const independent = ALL_METRICS.filter((d) => !DEPENDENT.includes(d))
    expect(independent.length).toBeGreaterThan(0)
    for (const def of independent) {
      expect(
        def.compute(CUR, PRIOR, OP_WITH, PRIOR_OP),
        `${def.key} moved when enrollment landed`,
      ).toEqual(def.compute(CUR, PRIOR, OP_WITHOUT, PRIOR_OP))
    }
  })
})

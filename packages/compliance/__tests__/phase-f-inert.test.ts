// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — "NOTHING ELSE CHANGES", PROVEN IN THE PURE ENGINE.
//
// The plan's acceptance sentence for this phase is:
//
//   "Each register flips its rule from cannot_evaluate to live and its requirement
//    rows from dataAvailability:'intake' to 'platform'. NOTHING ELSE CHANGES —
//    that is the payoff of the dataAvailability design."
//
// THE SHAPE OF THE PROOF, and why it is this shape.
//
// A recorded JSON baseline can only ever say "the change agrees with the file we
// wrote down". It cannot say WHY a payload moved, and — the failure this file was
// written to close — a baseline compared against ARITHMETIC ON ITSELF proves
// nothing at all: `expect(BASE.rulesEvaluated + 3).toBe(BASE.rulesEvaluated + 3)`
// passes for every possible engine.
//
// So the claim is made DIFFERENTIALLY instead. The same inputs are run through
// the engine TWICE:
//
//   PRE_F  — the twenty-six rule definitions that shipped in AIC Phase E, sliced
//            out of the frozen catalog by id;
//   ALL    — the twenty-nine that ship today.
//
// For a school with NOTHING in any Phase-F register, every enumerated payload —
// `findings[]`, `perStandardRisk[]`, `domainBands[]`, `coverage.namedHoles` and
// the pre-existing rules' `notEvaluated[]` rows — must be byte-identical between
// the two runs. Anything that moves is a Phase-F rule reaching a school that
// entered no Phase-F data, which is the exact regression the phase can cause.
//
// THIS SPEC IS FALSIFIABLE, and here is the falsification it was checked against:
// delete `requiredAvailable: ['acc.prior_visit_findings']` from
// ACC_PRIOR_FINDING_OPEN and the ALL run gains a coverage row and loses a
// `notEvaluated` refusal — the deep-equals below go red immediately. So does
// letting any new rule read a summary it was not handed.
//
// The counterpart in apps/api (`src/twin/phase-f-inert.spec.ts`) holds the
// captured-on-origin/main fixtures and the collector-side half. This file owns
// the ENGINE half, which is the half no fixture can express.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'

import {
  TWIN_RULE_DEFS,
  TWIN_RULE_IDS,
  VISIBLE_HOLE_RULE_IDS,
  deriveTwin,
  type TwinRegisterView,
  type TwinRuleDef,
  type TwinSignalView,
  type TwinStandardView,
} from '../src/accreditation-twin.js'
import type { DomainKey } from '../src/accreditation-domains.js'

const NOW = '2026-07-31'

/** The three ids AIC Phase F appended, and the three signals they read. */
const PHASE_F_RULE_IDS = ['HR-EVAL-OVERDUE', 'FAC-INSPECTION-DUE', 'ACC-PRIOR-FINDING-OPEN']
const PHASE_F_SIGNAL_KEYS = ['hr.staff_evaluations', 'fac.inspections', 'acc.prior_visit_findings']

/** The engine as AIC Phase E shipped it: the catalog minus the three appended defs. */
const PRE_F_RULE_DEFS: readonly TwinRuleDef[] = TWIN_RULE_DEFS.filter(
  (d) => !PHASE_F_RULE_IDS.includes(d.id),
)

// ── Fixtures ─────────────────────────────────────────────────────────────────
//
// The signal set is DERIVED from the rule catalog itself rather than retyped:
// `deriveTwin` throws `TwinUndeclaredSignalError` for a rule whose declared
// signal is absent from the set, so building the set from the declarations keeps
// this file correct when a later phase appends another rule.

const ALL_SIGNAL_KEYS: readonly string[] = [
  ...new Set(TWIN_RULE_DEFS.flatMap((d) => [...d.requiredAvailable, ...d.requiredAbsent])),
]

function mkSignal(key: string, over: Partial<TwinSignalView> = {}): TwinSignalView {
  const base: TwinSignalView = {
    key,
    label: key,
    availability: 'no_data',
    unavailableReason: 'Nothing has been recorded for this yet.',
    moduleKey: null,
    value: null,
    trend: null,
    observedOn: null,
    ageDays: null,
    changeState: 'unknown',
    staleAfterDays: 550,
    cells: null,
    domainKeys: ['governance'],
    lineage: null,
  }
  const merged = { ...base, ...over }
  if (merged.availability === 'available') merged.unavailableReason = null
  return merged
}

function available(
  value: number | string | boolean | null,
  observedOn: string | null = '2026-06-30',
  extra: Partial<TwinSignalView> = {},
): Partial<TwinSignalView> {
  return { availability: 'available', value, observedOn, changeState: 'moved', ageDays: 31, ...extra }
}

function mkStandard(
  code: string,
  domain: DomainKey,
  over: Partial<TwinStandardView> = {},
): TwinStandardView {
  return {
    standardId: `std-${code}`,
    code,
    title: `Standard ${code}`,
    isAssurance: false,
    assuranceSatisfied: null,
    rubricScore: 2,
    evidenceCount: 2,
    domainKeys: [domain],
    primaryDomainKey: domain,
    boundMetricKeys: [],
    requirements: [],
    ...over,
  }
}

/**
 * A school that FIRES pre-existing rules across several domains — governance,
 * facilities, HR, continuous improvement — and holds NOTHING in any Phase-F
 * register. A golden over a school where nothing fires proves nothing, so the
 * signals below are chosen to put real findings, real per-standard risk and real
 * domain bands on both sides of the comparison.
 */
function signals(over: Record<string, Partial<TwinSignalView>> = {}): TwinSignalView[] {
  const lit: Record<string, Partial<TwinSignalView>> = {
    'gov.meeting_cadence': available(2, '2026-05-10', { domainKeys: ['governance'] }),
    'gov.policy_review': available(9, '2026-04-01', { domainKeys: ['governance'] }),
    'gov.board_terms': available(3, '2026-01-01', { domainKeys: ['governance'] }),
    'gov.committee_chairs': available(2, null, { domainKeys: ['governance'] }),
    'fac.maintenance_backlog': available(31, '2026-03-01', { domainKeys: ['facilities'] }),
    'acc.unscored_standards': available(4, '2026-06-30', { domainKeys: ['continuous_improvement'] }),
    'acc.unsupported_score': available(3, '2026-06-30', { domainKeys: ['continuous_improvement'] }),
    ...over,
  }
  return ALL_SIGNAL_KEYS.map((k) => mkSignal(k, lit[k] ?? {}))
}

const STANDARDS: TwinStandardView[] = [
  mkStandard('COG-8', 'governance'),
  mkStandard('COG-9', 'governance'),
  mkStandard('COG-10', 'hr'),
  mkStandard('COG-13', 'hr'),
  // Unscored + a high score with no evidence: these light ACC-UNSCORED and
  // ACC-UNSUPPORTED-SCORE, so continuous_improvement is a THIRD banded domain and
  // the deep-equals below are comparing a payload with real content in it.
  mkStandard('COG-26', 'continuous_improvement', { rubricScore: null }),
  mkStandard('COG-A3', 'facilities'),
  mkStandard('COG-A4', 'continuous_improvement', { rubricScore: 4, evidenceCount: 0 }),
]

/** The ZERO-ROW school: three registers that exist and hold nothing. */
function zeroRowRegister(over: Partial<TwinRegisterView> = {}): TwinRegisterView {
  return {
    frameworkCode: 'cognia_2022',
    standards: STANDARDS,
    evidenceGroups: [],
    priorVisitCitations: [],
    staffEvaluations: null,
    complianceInspections: null,
    demoData: false,
    snapshotAsOf: '2026-06-30',
    ...over,
  }
}

const preF = deriveTwin(signals(), zeroRowRegister(), PRE_F_RULE_DEFS, NOW)
const all = deriveTwin(signals(), zeroRowRegister(), TWIN_RULE_DEFS, NOW)

/** `notEvaluated`, restricted to the rules that existed before AIC Phase F. */
const preExistingNotEvaluated = (r: typeof all) =>
  r.notEvaluated.filter((n) => !PHASE_F_RULE_IDS.includes(n.ruleId))

describe('AIC Phase F — the comparison is real, or nothing below means anything', () => {
  it('the catalog grew by exactly the three appended ids, and PRE_F is the other 26', () => {
    expect(TWIN_RULE_IDS).toHaveLength(29)
    expect(TWIN_RULE_IDS.slice(26)).toEqual(PHASE_F_RULE_IDS)
    expect(PRE_F_RULE_DEFS).toHaveLength(26)
    expect(PRE_F_RULE_DEFS.map((d) => d.id)).toEqual(TWIN_RULE_IDS.slice(0, 26))
  })

  it('the baseline school actually FIRES pre-existing rules in several domains', () => {
    // A golden over a silent school passes for every possible engine.
    expect(preF.findings.length).toBeGreaterThanOrEqual(4)
    expect(new Set(preF.findings.map((f) => f.ruleId)).size).toBeGreaterThanOrEqual(4)
    expect(
      new Set(preF.domainBands.filter((b) => b.facts.total > 0).map((b) => b.domainKey)).size,
    ).toBeGreaterThanOrEqual(3)
    expect(preF.perStandardRisk.some((s) => s.risk !== null)).toBe(true)
  })

  it('all three Phase-F signals are unreadable for this school, so all three rules must refuse', () => {
    const byKey = new Map(signals().map((s) => [s.key, s]))
    for (const k of PHASE_F_SIGNAL_KEYS) {
      expect(byKey.get(k)?.availability, k).toBe('no_data')
    }
    const refusals = all.notEvaluated.filter((n) => PHASE_F_RULE_IDS.includes(n.ruleId))
    expect(refusals.map((n) => n.ruleId).sort()).toEqual([...PHASE_F_RULE_IDS].sort())
    for (const n of refusals) {
      expect(n.reason, n.ruleId).toBe('signal_no_data')
      expect(PHASE_F_SIGNAL_KEYS, n.ruleId).toContain(n.blockingSignalKey)
    }
  })
})

describe('AIC Phase F — a zero-row school is BYTE-IDENTICAL to the pre-F engine', () => {
  it('findings[] — not one finding is added, removed, reordered or re-worded', () => {
    expect(all.findings).toEqual(preF.findings)
    for (const f of all.findings) expect(PHASE_F_RULE_IDS, f.ruleId).not.toContain(f.ruleId)
  })

  it('perStandardRisk[] — every code, driver, raw input, risk and band is unmoved', () => {
    expect(all.perStandardRisk).toEqual(preF.perStandardRisk)
  })

  it('domainBands[] — every fact count and band is unmoved', () => {
    expect(all.domainBands).toEqual(preF.domainBands)
  })

  it('coverage.namedHoles — still exactly the four, spelled the same way', () => {
    expect(all.coverage.namedHoles).toEqual(preF.coverage.namedHoles)
    expect(all.coverage.namedHoles.map((h) => h.ruleId)).toEqual([...VISIBLE_HOLE_RULE_IDS])
    for (const id of PHASE_F_RULE_IDS) {
      expect(VISIBLE_HOLE_RULE_IDS as readonly string[], id).not.toContain(id)
    }
  })

  it('notEvaluated[] — every PRE-EXISTING refusal keeps its reason, blocker and sentence', () => {
    expect(preExistingNotEvaluated(all)).toEqual(preExistingNotEvaluated(preF))
  })

  it('the ONLY coverage numbers that move are the three enumerated counters', () => {
    // rulesTotal +3, rulesNotEvaluated +3, evaluablePct recomputed. rulesEvaluated
    // must NOT move: a new rule that starts evaluating for a zero-row school is a
    // rule inventing a reading, and it would show up right here.
    expect(all.coverage.rulesEvaluated).toBe(preF.coverage.rulesEvaluated)
    expect(all.coverage.rulesTotal).toBe(preF.coverage.rulesTotal + 3)
    expect(all.coverage.rulesNotEvaluated).toBe(preF.coverage.rulesNotEvaluated + 3)
    expect(all.coverage.evaluablePct).toBe(
      Math.round((all.coverage.rulesEvaluated / all.coverage.rulesTotal) * 1000) / 1000,
    )
    // …and it MUST have moved: a percentage over a bigger denominator that did not
    // move would mean the counter is not counting.
    expect(all.coverage.evaluablePct).toBeLessThan(preF.coverage.evaluablePct)
  })
})

describe('AIC Phase F — the inertness is EARNED BY DATA, not by an empty engine', () => {
  // The mirror image of the golden: give the same school ROWS and the new rules
  // must actually speak. Without this, every assertion above would still pass if
  // the three rules were dead code.
  const withRows = deriveTwin(
    signals({
      'hr.staff_evaluations': available(5, '2026-05-31', { domainKeys: ['hr'] }),
      'fac.inspections': available(2, '2026-04-15', { domainKeys: ['facilities'] }),
      'acc.prior_visit_findings': available(2, '2021-03-12', {
        domainKeys: ['continuous_improvement'],
      }),
    }),
    zeroRowRegister({
      staffEvaluations: { registerSize: 20, overdueCount: 5, oldestOverdueDays: 90 },
      complianceInspections: {
        trackedCount: 8,
        overdueCount: 2,
        oldestOverdueDays: 40,
        overdueKinds: ['fire_life_safety'],
        anyLifeSafety: true,
      },
      priorVisitCitations: [{ code: 'COG-A4', visitDate: '2021-03-12', openCount: 2 }],
    }),
    TWIN_RULE_DEFS,
    NOW,
  )

  it('all three fire once the school has entered rows', () => {
    const fired = new Set(withRows.findings.map((f) => f.ruleId))
    for (const id of PHASE_F_RULE_IDS) expect(fired, id).toContain(id)
  })

  it('…and the pre-existing findings are STILL untouched beside them', () => {
    // Same school, same signals for the pre-F rules: entering staff-evaluation
    // rows may not move a governance finding or a facilities BAND driver.
    const others = withRows.findings.filter((f) => !PHASE_F_RULE_IDS.includes(f.ruleId))
    expect(others).toEqual(preF.findings)
    expect(preExistingNotEvaluated(withRows)).toEqual(preExistingNotEvaluated(preF))
  })
})

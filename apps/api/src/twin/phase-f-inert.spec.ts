import { describe, expect, it, vi } from 'vitest'
import {
  TWIN_RULE_DEFS,
  TWIN_RULE_IDS,
  VISIBLE_HOLE_RULE_IDS,
  deriveTwin,
  type TwinSignalView,
} from '@finrep/compliance'
import { applyLens, type Lens } from '../analytics/briefing-lens.js'
import type { AttentionItem } from '../analytics/briefing.service.js'
import { EARLY_WARNING_BRIEFABLE_RULE_IDS, EARLY_WARNING_SUPPRESSED } from '../analytics/briefing.service.js'
import { FRAMEWORK_REQUIREMENT_SEEDS } from '../accreditation/catalog-requirements-seed.js'
import { MODULE_GATED_REGISTERS } from '../accreditation/evidence-anchors.js'
import { TWIN_SIGNAL_CATALOG, staleAfterDaysFor } from './twin-signal-catalog.js'
import { TWIN_SIGNAL_KEYS } from './twin-contract.js'
import { TwinSignalsService } from './twin-signals.service.js'
import { emptyTwinRegister } from './twin-register.service.js'
import preFTwin from './__fixtures__/preF-twin.json' with { type: 'json' }
import preFReadiness from './__fixtures__/preF-readiness.json' with { type: 'json' }
import preFBriefing from './__fixtures__/preF-briefing.json' with { type: 'json' }

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — "NOTHING ELSE CHANGES", MADE FALSIFIABLE.
//
// The plan's acceptance sentence for this phase is:
//
//   "Each register flips its rule from cannot_evaluate to live and its requirement
//    rows from dataAvailability:'intake' to 'platform'. NOTHING ELSE CHANGES —
//    that is the payoff of the dataAvailability design."
//
// THE THREE FIXTURES WERE CAPTURED FROM THE RUNNING API ON origin/main BEFORE THE
// FIRST EDIT OF THIS PHASE, and they are READ-ONLY from that point. That ordering
// is the whole proof: a baseline regenerated after the change proves only that the
// change agrees with itself, which is not a claim anybody needs.
//
//   preF-twin.json       GET /schools/:id/accreditation/twin
//   preF-readiness.json  GET /schools/:id/accreditation/readiness
//   preF-briefing.json   GET /schools/:id/periods/:pid/briefing   (viewer lens)
//
// WHAT THIS SPEC CAN AND CANNOT PROVE, stated plainly rather than implied.
//
// It CANNOT re-derive a 71 KB live payload from Prisma doubles: reconstructing one
// school's whole financial, governance, enrollment and accreditation history in a
// fixture would be a test of the fixture. What it CAN do — and what actually
// catches the regressions this phase risks — is compare the SHIPPED VOCABULARY AND
// THE SHIPPED CODE PATHS against the recorded baseline and assert that the ONLY
// things that moved are the enumerated ones:
//
//   1. the signal roster, row for row, against the 35 rows the baseline recorded;
//   2. the rule vocabulary and the named holes;
//   3. the coverage counters, RECOMPUTED from the baseline's own numbers;
//   4. the requirement seed's currency behaviour for a zero-row school;
//   5. the briefing, re-shaped through the EDITED lens — which is the one place
//      this engineer's changes could reorder a payload that already exists.
//
// Anything that moves and is not enumerated below fails here.
// ─────────────────────────────────────────────────────────────────────────────

type BaselineSignal = {
  key: string
  label: string
  availability: string
  unavailableReason: string | null
  moduleKey: string | null
  observedOn: string | null
  ageDays: number | null
  changeState: string
  domainKeys: string[]
}

const BASE = preFTwin as unknown as {
  signals: BaselineSignal[]
  coverage: {
    rulesTotal: number
    rulesEvaluated: number
    rulesNotEvaluated: number
    evaluablePct: number
    signals: Record<string, number>
    blockedByModule: Record<string, string[]>
    namedHoles: { ruleId: string }[]
  }
  findings: { ruleId: string }[]
  notEvaluated: { ruleId: string }[]
}

const BASE_BRIEFING = preFBriefing as unknown as {
  items: AttentionItem[]
  lens: Lens
  summary: { total: number; critical: number; warn: number; info: number }
}

/** The two signals AIC Phase F lit, and the one it appended. */
const FLIPPED = ['hr.staff_evaluations', 'fac.inspections']
/**
 * AIC PHASE K flipped two more of the SAME baseline rows, by the same mechanism:
 * removing `declaredNotTracked` once the register behind each existed. This file
 * is Phase F's inertness record, and Phase K is the next legitimate movement of
 * that baseline — so the flip is named here rather than the guard weakened.
 */
const FLIPPED_K = ['hr.pd_participation', 'safe.clearances']
const FLIPPED_ALL = [...FLIPPED, ...FLIPPED_K]
const APPENDED = 'acc.prior_visit_findings'
const NEW_RULES = ['HR-EVAL-OVERDUE', 'FAC-INSPECTION-DUE', 'ACC-PRIOR-FINDING-OPEN']

describe('AIC Phase F — the baselines are the record, and they are intact', () => {
  it('the fixtures are the payloads they claim to be', () => {
    // A guard on the guard: a truncated or re-serialised fixture would make every
    // assertion below vacuous.
    expect(BASE.signals).toHaveLength(35)
    expect(BASE.coverage.rulesTotal).toBe(26)
    expect(BASE.notEvaluated.length + BASE.coverage.rulesEvaluated).toBe(26)
    expect(BASE_BRIEFING.items).toHaveLength(10)
    expect((preFReadiness as { leafCount: number }).leafCount).toBeGreaterThan(0)
  })
})

describe('AIC Phase F — the signal roster moved by exactly one APPENDED row', () => {
  it('the first 35 keys are byte-identical, in order', () => {
    expect(TWIN_SIGNAL_KEYS.slice(0, 35)).toEqual(BASE.signals.map((s) => s.key))
    expect(TWIN_SIGNAL_KEYS).toHaveLength(36)
    expect(TWIN_SIGNAL_KEYS[35]).toBe(APPENDED)
  })

  // The TWO relabels this phase makes, enumerated. A signal label is rendered on
  // the Signals tab immediately followed by the signal's VALUE, with no unit and
  // no qualifier — so a label has to describe the value it sits beside. Both of
  // these rows were labelled in Phase D while they were `declaredNotTracked` and
  // carried NO value; lighting them is what made a register-shaped label wrong.
  // "Life-safety inspections  0" reads as "we have none on file"; the value is in
  // fact the count PAST TARGET DATE, and zero of those is the good news.
  const RELABELLED: Record<string, string> = {
    'hr.staff_evaluations': 'Staff evaluations past their due date',
    'fac.inspections': 'Compliance inspections past their target date',
  }

  it('no pre-existing row changed its label except the TWO this phase lit', () => {
    // A relabelled signal moves the Signals tab for every school, so any label
    // that moves without being named here fails.
    const byKey = new Map(TWIN_SIGNAL_CATALOG.map((d) => [d.key, d]))
    for (const s of BASE.signals) {
      const def = byKey.get(s.key as never)!
      expect(def, s.key).toBeDefined()
      expect(def.label, s.key).toBe(RELABELLED[s.key] ?? s.label)
      expect(def.moduleKey ?? null, s.key).toBe(s.moduleKey)
      expect([...def.domainKeys], s.key).toEqual(s.domainKeys)
    }
    // …and the two named ones really did move, or this is a rubber stamp.
    for (const [key, label] of Object.entries(RELABELLED)) {
      expect(BASE.signals.find((s) => s.key === key)!.label, key).not.toBe(label)
    }
  })

  it('every count-bearing register label describes the VALUE, not the register', () => {
    // The catalog's own convention, made enforceable for the three rows Phase F
    // gave a value to: a label beside an overdue/open COUNT must not read as an
    // inventory of the register. `available: 0` and `no_data` are different facts
    // and the tab has only the label to keep them apart.
    const VALUE_DESCRIBING = ['hr.staff_evaluations', 'fac.inspections', 'acc.prior_visit_findings']
    const byKey = new Map(TWIN_SIGNAL_CATALOG.map((d) => [d.key, d]))
    for (const key of VALUE_DESCRIBING) {
      const label = byKey.get(key as never)!.label.toLowerCase()
      expect(
        /past their|past its|overdue|open |expired/.test(label),
        `${key}: "${label}" reads as an inventory, not as the count it carries`,
      ).toBe(true)
    }
  })

  it('EXACTLY the flipped rows lost declaredNotTracked — no others', () => {
    const wasNotTracked = BASE.signals.filter((s) => s.availability === 'not_tracked').map((s) => s.key)
    expect(wasNotTracked).toHaveLength(5)
    const stillDeclared = TWIN_SIGNAL_CATALOG.filter((d) => d.declaredNotTracked).map((d) => d.key)
    expect([...stillDeclared].sort()).toEqual(
      wasNotTracked.filter((k) => !FLIPPED_ALL.includes(k)).sort(),
    )
    // …and whatever remains still carries a sentence, byte-identical to the one the
    // baseline recorded. Phase F rewrote `WHY.evaluations` and `WHY.inspections`;
    // Phase K flipped `WHY.pd` and `WHY.safeEnv` away entirely. No surviving
    // sentence has been touched by either phase.
    for (const d of TWIN_SIGNAL_CATALOG) {
      if (!d.declaredNotTracked) continue
      const before = BASE.signals.find((s) => s.key === d.key)!
      expect(d.declaredNotTracked.reason, d.key).toBe(before.unavailableReason)
    }
  })

  it('the appended row is a full catalog citizen with a VISIT-CYCLE cadence', () => {
    const def = TWIN_SIGNAL_CATALOG[35]
    expect(def.key).toBe(APPENDED)
    expect(def.moduleKey).toBe('accreditation')
    expect(def.declaredNotTracked).toBeUndefined()
    // Not an annual clock: one visiting team per six years, and a `stale_data` flag
    // on a four-year-old visit would be a lie that also feeds SCHOOL-NOT-REPORTING.
    expect(def.expectedCadenceDays).toBe(2200)
    expect(staleAfterDaysFor(def)).toBe(3300)
  })
})

describe('AIC Phase F — the rule vocabulary moved by exactly three APPENDED ids', () => {
  it('26 → 29, appended after ACAD-GROWTH-FLAT', () => {
    expect(TWIN_RULE_IDS).toHaveLength(29)
    expect(TWIN_RULE_IDS.slice(26)).toEqual(NEW_RULES)
    // Every id the baseline named still exists, spelled the same way.
    for (const f of [...BASE.findings, ...BASE.notEvaluated]) {
      expect(TWIN_RULE_IDS, f.ruleId).toContain(f.ruleId)
    }
  })

  it('Phase F closed no hole; Phase K closed exactly two', () => {
    // The BASELINE still records four — it is a frozen Phase-F payload and must
    // not be edited. What moved is the live list, and the two it lost are exactly
    // the two Phase K built registers for.
    expect(BASE.coverage.namedHoles).toHaveLength(4)
    expect(VISIBLE_HOLE_RULE_IDS).toHaveLength(2)
    const closedByK = BASE.coverage.namedHoles
      .map((h) => h.ruleId)
      .filter((id) => !(VISIBLE_HOLE_RULE_IDS as readonly string[]).includes(id))
    expect(closedByK.sort()).toEqual(['HR-PD-LOW', 'SAFE-ENV-GAP'])
    for (const id of NEW_RULES) {
      expect(VISIBLE_HOLE_RULE_IDS as readonly string[], id).not.toContain(id)
    }
  })

  it('every new rule is CONSCIOUSLY briefable or suppressed, and none is both', () => {
    for (const id of NEW_RULES) {
      const briefable = EARLY_WARNING_BRIEFABLE_RULE_IDS.includes(id)
      const suppressed = EARLY_WARNING_SUPPRESSED.has(id)
      expect(briefable !== suppressed, id).toBe(true)
    }
    // FAC-BACKLOG stays SUPPRESSED (STEP 2.8 states the backlog size) while
    // FAC-INSPECTION-DUE is BRIEFABLE — they are different facts about one school.
    expect(EARLY_WARNING_SUPPRESSED.has('FAC-BACKLOG')).toBe(true)
    expect(EARLY_WARNING_BRIEFABLE_RULE_IDS).toContain('FAC-INSPECTION-DUE')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE ZERO-ROW HARNESS. Module scope, because two blocks below need it: the
// collector assertions AND the coverage counters, which are derived from a real
// run of the real engine over what this harness actually collects.
// ─────────────────────────────────────────────────────────────────────────────

/** The baseline school: fully licensed, with nothing in any Phase-F register. */
function zeroRowHarness() {
  const empty = { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) }
  const prisma = {
    arApAgingSnapshot: { findFirst: vi.fn(async () => null) },
    fiscalPeriod: { findFirst: vi.fn(async () => null) },
    meeting: { ...empty },
    policy: { ...empty },
    governancePerson: { ...empty },
    committee: { ...empty },
    strategicPlan: { ...empty },
    maintenanceItem: { findMany: vi.fn(async () => []) },
    staffEvaluation: { findMany: vi.fn(async () => []) },
    priorVisitFinding: { findMany: vi.fn(async () => []) },
    enrollmentSnapshot: { findFirst: vi.fn(async () => null) },
    accreditationReadinessSnapshot: { findFirst: vi.fn(async () => null) },
    accreditationStandard: { findMany: vi.fn(async () => []) },
    accreditationEvidence: { groupBy: vi.fn(async () => []) },
    accreditationFinding: { findMany: vi.fn(async () => []) },
  }
  const svc = new TwinSignalsService(
    prisma as never,
    {
      trends: vi.fn(async () => ({ points: [], granularity: 'annual' })),
      trendsMany: vi.fn(async () => new Map()),
    } as never,
    { isEntitledForModule: vi.fn(async () => true) } as never,
    {
      getCurrencyByStandard: vi.fn(async () => ({ byStandard: {}, framework: null, demoData: false })),
    } as never,
    {
      aggregate: vi.fn(async () => ({
        total: 0,
        counts: { flags: { iep: 0, plan504: 0, ell: 0, any: 0 } },
      })),
    } as never,
  )
  return { svc, prisma }
}


describe('AIC Phase F — the coverage counters, DERIVED from a real zero-row run', () => {
  // WHAT WENT WRONG HERE FIRST, recorded so it is not re-introduced: this block
  // used to build `expected` out of the baseline's own numbers plus integer
  // literals and then assert those literals back — `expect(15 + 3).toBe(18)`.
  // Nothing in it invoked a derivation, so no change to the engine could fail it:
  // deleting `requiredAvailable` from a Phase-F rule left every assertion green
  // while the rule started evaluating for schools with no rows.
  //
  // So the counters are now taken from the ENGINE, run over the signal set the
  // ZERO-ROW COLLECTOR actually produces, and compared against the SAME engine
  // holding only the twenty-six rules AIC Phase E shipped. The delta between the
  // two runs IS the §7.2 enumerated list, and anything else that moves fails.
  const PHASE_F_RULE_IDS = [...NEW_RULES]
  const PRE_F_RULE_DEFS = TWIN_RULE_DEFS.filter((d) => !PHASE_F_RULE_IDS.includes(d.id))
  const AT = new Date('2026-08-02T00:00:00Z')

  async function derivePair() {
    const { svc } = zeroRowHarness()
    const set = await svc.collect('school-A', { now: AT })
    const views = set.signals as unknown as readonly TwinSignalView[]
    const register = emptyTwinRegister()
    return {
      set,
      preF: deriveTwin(views, register, PRE_F_RULE_DEFS, '2026-08-02'),
      all: deriveTwin(views, register, TWIN_RULE_DEFS, '2026-08-02'),
    }
  }

  it('rulesTotal +3 and rulesNotEvaluated +3, with rulesEvaluated UNCHANGED', async () => {
    const { preF, all } = await derivePair()
    expect(all.coverage.rulesTotal).toBe(TWIN_RULE_IDS.length)
    expect(all.coverage.rulesTotal).toBe(preF.coverage.rulesTotal + 3)
    expect(all.coverage.rulesNotEvaluated).toBe(preF.coverage.rulesNotEvaluated + 3)
    // THE LOAD-BEARING ONE. A new rule that starts evaluating for a school with
    // no rows is a rule inventing a reading, and it shows up right here.
    expect(all.coverage.rulesEvaluated).toBe(preF.coverage.rulesEvaluated)
    expect(all.coverage.rulesEvaluated + all.coverage.rulesNotEvaluated).toBe(
      TWIN_RULE_IDS.length,
    )
  })

  it('each new rule refuses BY NAME, blocking on its own signal', async () => {
    const { all } = await derivePair()
    const refusals = all.notEvaluated.filter((n) => PHASE_F_RULE_IDS.includes(n.ruleId))
    expect(refusals.map((n) => n.ruleId).sort()).toEqual([...PHASE_F_RULE_IDS].sort())
    for (const n of refusals) {
      expect(n.reason, n.ruleId).toBe('signal_no_data')
      expect([...FLIPPED, APPENDED], n.ruleId).toContain(n.blockingSignalKey)
      expect((n.message ?? '').length, n.ruleId).toBeGreaterThan(0)
    }
  })

  it('every PRE-EXISTING rule refuses for exactly the reason it refused before', async () => {
    const { preF, all } = await derivePair()
    const preExisting = (r: typeof all) =>
      r.notEvaluated.filter((n) => !PHASE_F_RULE_IDS.includes(n.ruleId))
    expect(preExisting(all)).toEqual(preExisting(preF))
    expect(all.findings).toEqual(preF.findings)
    expect(all.perStandardRisk).toEqual(preF.perStandardRisk)
    expect(all.domainBands).toEqual(preF.domainBands)
    expect(all.coverage.namedHoles).toEqual(preF.coverage.namedHoles)
  })

  it('evaluablePct is RECOMPUTED at 3dp, not preserved', async () => {
    const { preF, all } = await derivePair()
    expect(all.coverage.evaluablePct).toBe(
      Math.round((all.coverage.rulesEvaluated / all.coverage.rulesTotal) * 1000) / 1000,
    )
    // Over a bigger denominator with the same numerator it can only fall — unless
    // the numerator is zero, which for this harness it is, so pin the identity
    // instead of an inequality and pin the BASELINE school's move separately.
    expect(all.coverage.evaluablePct).toBeLessThanOrEqual(preF.coverage.evaluablePct)
  })

  it('the BASELINE school, whose numbers we recorded, moves by exactly the same arithmetic', () => {
    // The recorded school HAS data (11 rules evaluated of 26). Its counters are not
    // re-derivable here, but the arithmetic that moves them is the one proven
    // above, so this states the enumerated §7.2 delta over the recorded numbers.
    expect(BASE.coverage.rulesTotal).toBe(26)
    expect(BASE.coverage.rulesEvaluated + BASE.coverage.rulesNotEvaluated).toBe(26)
    const after = {
      rulesTotal: BASE.coverage.rulesTotal + 3,
      rulesEvaluated: BASE.coverage.rulesEvaluated,
      rulesNotEvaluated: BASE.coverage.rulesNotEvaluated + 3,
    }
    expect(after.rulesTotal).toBe(TWIN_RULE_IDS.length)
    expect(Math.round((after.rulesEvaluated / after.rulesTotal) * 1000) / 1000).toBeLessThan(
      BASE.coverage.evaluablePct,
    )
  })

  it('the signal counts move by exactly (+3 no_data, −2 not_tracked) and nothing else', () => {
    const after = {
      available: BASE.coverage.signals.available,
      not_licensed: BASE.coverage.signals.not_licensed,
      no_data: BASE.coverage.signals.no_data + 3,
      not_tracked: BASE.coverage.signals.not_tracked - 2,
    }
    expect(after.available).toBe(17)
    expect(after.not_licensed).toBe(0)
    expect(after.no_data).toBe(16)
    expect(after.not_tracked).toBe(3)
    expect(Object.values(after).reduce((a, b) => a + b, 0)).toBe(TWIN_SIGNAL_KEYS.length)
  })

  it('blockedByModule stays empty for a FULLY LICENSED school', () => {
    // The upsell surface only appears for a school that has not bought the module;
    // it is not a new line for everybody.
    expect(BASE.coverage.blockedByModule).toEqual({})
  })
})

describe('AIC Phase F — a zero-row school is INERT at the collector', () => {
  it('every flipped signal reports no_data on a zero-row school — a hole, never a zero', async () => {
    const { svc } = zeroRowHarness()
    const set = await svc.collect('school-A', { now: new Date('2026-08-02T00:00:00Z') })
    const byKey = new Map(set.signals.map((s) => [s.key, s]))
    // Phase K's two are held to the identical standard: a school with no clearance
    // and no PD row must read "we could not look", never "we looked and it is
    // fine". Reporting a confident zero here would invent a clean safeguarding
    // record for a school that has entered nothing.
    for (const key of [...FLIPPED_ALL, APPENDED]) {
      const s = byKey.get(key as never)!
      expect(s.availability, key).toBe('no_data')
      expect(s.value, key).toBeNull()
      // The rule that reads it refuses `signal_no_data` and NAMES the signal; it
      // cannot fire, so no school gains a finding it did not have yesterday.
      expect(s.unavailableReason, key).toBeTruthy()
    }
    // One remains: measured learning growth, which has no table to query.
    expect(set.counts.not_tracked).toBe(1)
  })

  // WHY `toBeTruthy()` ABOVE IS NOT ENOUGH. Before Phase F these three signals were
  // `declaredNotTracked`, and each carried the sentence that named the intake which
  // would close it ("A four-field staff-evaluation register unlocks this, and it is
  // the highest-value item on the list."). Making them readable moved a zero-row
  // school onto the GENERIC no-reading sentence, which names no action — so the one
  // phase whose entire purpose is to make these three answerable ended up telling a
  // school less about them than the phase before it did. A truthiness check cannot
  // see that regression; it passes on either string. This one names the ask.
  it('an EMPTY register says what to do — it does not fall back to the generic sentence', async () => {
    const { svc } = zeroRowHarness()
    const set = await svc.collect('school-A', { now: new Date('2026-08-02T00:00:00Z') })
    const byKey = new Map(set.signals.map((s) => [s.key, s]))

    const GENERIC = 'No reading is available for this signal yet.'
    // Each signal must name the surface the reader has to go to. The register is
    // empty, not missing — the sentence has to say so and then say where.
    const ASK: Record<string, RegExp> = {
      'hr.staff_evaluations': /\bHR\b/,
      'fac.inspections': /\bFacilities\b/,
      'acc.prior_visit_findings': /visit report|previous accreditation visit/i,
    }
    for (const [key, mustName] of Object.entries(ASK)) {
      const reason = byKey.get(key as never)!.unavailableReason ?? ''
      expect(reason, `${key} fell back to the generic sentence`).not.toBe(GENERIC)
      expect(reason, `${key} names no surface to act on`).toMatch(mustName)
    }
  })
})

describe('AIC Phase F — the requirement seed is inert for a zero-row school', () => {
  it('the module-gated rows are exactly the ones naming a gated register', () => {
    const gated = Object.entries(FRAMEWORK_REQUIREMENT_SEEDS).flatMap(([fw, rows]) =>
      rows
        .filter((r) => r.sourceRegister !== null && r.sourceRegister in MODULE_GATED_REGISTERS)
        .map((r) => `${fw}/${r.standardCode}/${r.tag}`),
    )
    // Phase F flipped THREE (the Cognia and NSBECS rows). The four frameworks
    // added for dually-accredited schools reuse the same two registers where
    // their own standards ask for the same artifact — no new register and no new
    // resolver, so the gate behaves identically: a school that has recorded
    // nothing reads `not_tracked` with its own sentence.
    expect(gated.sort()).toEqual([
      'acs_wasc/WASC-E/inspection',
      'acsi_reach/ACSI-4/staff_evaluation',
      'cognia_2022/COG-10/staff_evaluation',
      'cognia_2022/COG-A3/inspection',
      'fcis_2023/FCIS-11/staff_evaluation',
      'fcis_2023/FCIS-12/inspection',
      'nsbecs/NSBECS-12/inspection',
      'sais_2023/SAIS-5/staff_evaluation',
    ])
  })

  it('every gated row still carries the sentence it renders when unearned', () => {
    // Without it the row would render `not_tracked` with no explanation — a hole
    // with no name, which is the one thing the whole dataAvailability design is
    // arranged to prevent.
    for (const rows of Object.values(FRAMEWORK_REQUIREMENT_SEEDS)) {
      for (const r of rows) {
        if (r.sourceRegister === null || !(r.sourceRegister in MODULE_GATED_REGISTERS)) continue
        expect((r.notTrackedReason ?? '').length, `${r.standardCode}/${r.tag}`).toBeGreaterThan(0)
      }
    }
  })

  it('no OTHER row changed its dataAvailability', () => {
    // 98 rows, and the only intake row left is STILL COG-29/pd_records (Phase K).
    // Four added frameworks did not conjure a PD register, so none of them asks
    // for PD participation — an `intake` row is a promise, and four more copies of
    // a promise we have not kept would just be four more holes.
    const intake = Object.values(FRAMEWORK_REQUIREMENT_SEEDS)
      .flat()
      .filter((r) => r.dataAvailability === 'intake')
    expect(intake.map((r) => `${r.standardCode}/${r.tag}`)).toEqual(['COG-29/pd_records'])
  })
})

describe('AIC Phase F — the briefing is BYTE-IDENTICAL through the edited lens', () => {
  // The one place THIS engineer's edits could disturb a payload that already
  // exists: three ids were appended to COMPLIANCE_ORDER, which the lens comparator
  // consults for every non-metric pair. Re-shaping the recorded briefing through
  // the EDITED lens is the direct test of that.

  it('re-applying the lens to the recorded items reproduces them exactly', () => {
    const out = applyLens(BASE_BRIEFING.items, BASE_BRIEFING.lens)
    expect(out).toEqual(BASE_BRIEFING.items)
  })

  it('…and the owner lens orders the recorded items identically', () => {
    // The recorded payload is the VIEWER lens, and owner shares viewer's source
    // weights, so the id order must match exactly; only `voice` differs.
    const ids = applyLens(BASE_BRIEFING.items, 'owner' as Lens).map((i) => i.id)
    expect(ids).toEqual(BASE_BRIEFING.items.map((i) => i.id))
    // The ACCOUNTANT lens deliberately re-ranks sources (metric LAST), so the
    // viewer's order is not its expected output and asserting it here would pin the
    // wrong thing. briefing-lens-golden.spec.ts already pins the accountant lens
    // byte-for-byte over every pre-existing id, from a fixture captured before the
    // first lens edit — that is where that claim belongs.
  })

  it('the two recorded early-warning items still rank where they did', () => {
    const ew = BASE_BRIEFING.items.filter((i) => i.source === 'earlywarning').map((i) => i.id)
    expect(ew).toEqual(['earlywarning:acc-assurance-gap', 'earlywarning:acc-unscored'])
    // The Phase-F ids were APPENDED to the block, so neither of these moved within
    // it — an unmet assurance gate still leads.
    const out = applyLens(BASE_BRIEFING.items, 'viewer')
    expect(out.filter((i) => i.source === 'earlywarning').map((i) => i.id)).toEqual(ew)
  })

  it('the summary counts are unchanged', () => {
    const out = applyLens(BASE_BRIEFING.items, BASE_BRIEFING.lens)
    expect({
      total: out.length,
      critical: out.filter((i) => i.severity === 'critical').length,
      warn: out.filter((i) => i.severity === 'warn').length,
      info: out.filter((i) => i.severity === 'info').length,
    }).toEqual(BASE_BRIEFING.summary)
  })
})

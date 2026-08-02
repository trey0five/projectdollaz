import { describe, expect, it } from 'vitest'
import { isRequirementTag, isSourceRegister } from '@finrep/compliance'
import { FRAMEWORK_SEEDS } from './catalog-seed.js'
import {
  FRAMEWORK_REQUIREMENT_SEEDS,
  RESOLVED_SOURCE_REGISTERS,
  type CatalogRequirementSeed,
} from './catalog-requirements-seed.js'
import { MODULE_GATED_REGISTERS } from './evidence-anchors.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — THE BOOT ASSERTION for the requirement seed.
//
// This file is the reason a bad requirement row can never reach a school. It
// pins the shape rules the engine RELIES on (a fixed row must carry a window; a
// source_interval row must point at a register that actually owns a cycle; a
// non-platform row must say what it would take), and it pins the deliberate
// SILENCES — the standards we chose not to model — so removing one is an act,
// not an accident.
// ─────────────────────────────────────────────────────────────────────────────

const ALL: [string, CatalogRequirementSeed[]][] = Object.entries(FRAMEWORK_REQUIREMENT_SEEDS)
const EVERY_ROW = ALL.flatMap(([code, rows]) => rows.map((r) => [code, r] as const))

/** The two registers that own a review CYCLE we can delegate to. */
const CYCLE_REGISTERS = new Set(['policy', 'strategic_plan'])

describe('requirement seed — every row hangs on a real leaf or assurance', () => {
  it('every standardCode exists in the matching framework', () => {
    for (const [fwCode, rows] of ALL) {
      const fw = FRAMEWORK_SEEDS.find((f) => f.code === fwCode)
      expect(fw, `unknown framework ${fwCode}`).toBeTruthy()
      const codes = new Set(fw!.standards.map((s) => s.code))
      for (const r of rows) expect(codes.has(r.standardCode), `${fwCode}/${r.standardCode}`).toBe(true)
    }
  })

  it('every standardCode is a LEAF or an ASSURANCE — never a domain parent', () => {
    for (const [fwCode, rows] of ALL) {
      const fw = FRAMEWORK_SEEDS.find((f) => f.code === fwCode)!
      const parents = new Set(fw.standards.map((s) => s.parentCode).filter(Boolean))
      for (const r of rows) {
        expect(parents.has(r.standardCode), `${r.standardCode} is a parent node`).toBe(false)
      }
    }
  })

  it('(standardCode, tag) is unique within a framework', () => {
    for (const [fwCode, rows] of ALL) {
      const keys = rows.map((r) => `${r.standardCode}:${r.tag}`)
      expect(new Set(keys).size, `duplicate in ${fwCode}`).toBe(keys.length)
    }
  })
})

describe('requirement seed — shape rules the engine relies on', () => {
  it('every tag is in the REQUIREMENT_TAGS vocabulary', () => {
    for (const [, r] of EVERY_ROW) expect(isRequirementTag(r.tag), r.tag).toBe(true)
  })

  it('every sourceRegister is in the SOURCE_REGISTERS vocabulary (or null)', () => {
    for (const [, r] of EVERY_ROW) {
      if (r.sourceRegister !== null) expect(isSourceRegister(r.sourceRegister), r.sourceRegister!).toBe(true)
    }
  })

  it("'fixed' carries a positive integer window; 'source_interval' carries none", () => {
    for (const [, r] of EVERY_ROW) {
      if (r.windowKind === 'fixed') {
        expect(Number.isInteger(r.windowMonths), `${r.standardCode}/${r.tag}`).toBe(true)
        expect(r.windowMonths!).toBeGreaterThan(0)
      } else {
        expect(r.windowMonths, `${r.standardCode}/${r.tag}`).toBeUndefined()
      }
    }
  })

  it("'source_interval' only ever points at a register that OWNS a cycle", () => {
    for (const [, r] of EVERY_ROW) {
      if (r.windowKind !== 'source_interval') continue
      expect(CYCLE_REGISTERS.has(r.sourceRegister ?? ''), `${r.standardCode}/${r.tag}`).toBe(true)
    }
  })

  it("'platform' only ever points at a register with a Phase-C resolver", () => {
    for (const [, r] of EVERY_ROW) {
      if (r.dataAvailability !== 'platform') continue
      expect(
        (RESOLVED_SOURCE_REGISTERS as readonly string[]).includes(r.sourceRegister ?? ''),
        `${r.standardCode}/${r.tag} → ${r.sourceRegister}`,
      ).toBe(true)
    }
  })

  it('every NON-platform row says what it would take (a non-empty reason)', () => {
    for (const [, r] of EVERY_ROW) {
      if (r.dataAvailability === 'platform') continue
      expect(typeof r.notTrackedReason, `${r.standardCode}/${r.tag}`).toBe('string')
      expect((r.notTrackedReason ?? '').length).toBeGreaterThan(0)
    }
  })

  it('no not-tracked sentence ever implies we can SEE the thing we cannot see', () => {
    // The forbidden claim is "we measured it"; the permitted one is "here is
    // what it would take". A copy edit that drifts across that line fails here.
    const FORBIDDEN = /\b(we (?:can )?(?:see|measure|track)s? your (?:curriculum|assessment|learning))/i
    for (const [, r] of EVERY_ROW) {
      if (!r.notTrackedReason) continue
      expect(FORBIDDEN.test(r.notTrackedReason), r.notTrackedReason).toBe(false)
    }
  })
})

describe('requirement seed — the frozen inventory', () => {
  it('20 / 11 / 14 = 45 rows across three frameworks', () => {
    expect(FRAMEWORK_REQUIREMENT_SEEDS.cognia_2022).toHaveLength(20)
    expect(FRAMEWORK_REQUIREMENT_SEEDS.msa_cess_2022).toHaveLength(11)
    expect(FRAMEWORK_REQUIREMENT_SEEDS.nsbecs).toHaveLength(14)
    expect(EVERY_ROW).toHaveLength(45)
  })

  it('35 platform, 1 intake, 5 integration, 4 external', () => {
    // AIC Phase F moved THREE rows intake → platform (COG-10/staff_evaluation,
    // COG-A3 and NSBECS-12/inspection) and added none. `integration` and `external`
    // did not move: an LMS we are not connected to and an accreditor portal we do
    // not hold are not registers we can build.
    const by = (v: string) => EVERY_ROW.filter(([, r]) => r.dataAvailability === v).length
    expect(by('platform')).toBe(35)
    expect(by('intake')).toBe(1)
    expect(by('integration')).toBe(5)
    expect(by('external')).toBe(4)
    expect(by('platform') + by('intake') + by('integration') + by('external')).toBe(45)
  })

  it('AIC Phase F — the three flipped rows, and NOTHING else moved', () => {
    const flipped = EVERY_ROW.filter(
      ([, r]) => r.sourceRegister === 'staff_evaluation_register' || r.sourceRegister === 'maintenance_item',
    )
    expect(flipped.map(([fw, r]) => `${fw}/${r.standardCode}/${r.tag}`).sort()).toEqual([
      'cognia_2022/COG-10/staff_evaluation',
      'cognia_2022/COG-A3/inspection',
      'nsbecs/NSBECS-12/inspection',
    ])
    for (const [, r] of flipped) {
      expect(r.dataAvailability).toBe('platform')
      // KEPT even though the row is `platform`: both registers are MODULE-GATED, so
      // the row still renders `not_tracked` for a school that has recorded nothing,
      // and a not-tracked row with no sentence is a hole with no explanation.
      expect((r.notTrackedReason ?? '').length).toBeGreaterThan(0)
    }
    // No MSA row was invented to make the grid tidy. The seed is sparse ON PURPOSE.
    expect(
      FRAMEWORK_REQUIREMENT_SEEDS.msa_cess_2022.some(
        (r) => r.tag === 'staff_evaluation' || r.tag === 'inspection',
      ),
    ).toBe(false)
  })

  it('each MODULE-GATED sentence names the COMPLETION CONDITION, not just the register', () => {
    // The resolvers do not satisfy these rows from the existence of a row:
    // `resolveStaffEvaluation` filters `completedDate: { not: null }`, and the
    // inspection resolver wants an item marked resolved. So a school that records
    // three evaluations with due dates and no completed date, or flags three items
    // `fire_life_safety` and leaves them open, keeps seeing the row unanswered with
    // no way to learn why. Naming the condition is the whole point of the sentence.
    const gated = Object.values(FRAMEWORK_REQUIREMENT_SEEDS)
      .flat()
      .filter((r) => r.sourceRegister !== null && r.sourceRegister in MODULE_GATED_REGISTERS)
    expect(gated.length).toBeGreaterThanOrEqual(3)
    for (const r of gated) {
      const why = (r.notTrackedReason ?? '').toLowerCase()
      const condition =
        r.sourceRegister === 'staff_evaluation_register' ? 'completed' : 'resolved'
      expect(why, `${r.standardCode}/${r.tag}`).toContain(condition)
      // …and it still names the register the school can actually open.
      expect(why, `${r.standardCode}/${r.tag}`).toMatch(/\bhr\b|facilities/)
    }
  })

  it('COG-29 / pd_records is STILL intake — Phase F does not touch it', () => {
    // The one remaining `intake` row. PD spend is not participation, and the PD
    // register is Phase K. A future edit that flips this without building the
    // register fails here.
    const pd = FRAMEWORK_REQUIREMENT_SEEDS.cognia_2022.filter((r) => r.tag === 'pd_records')
    expect(pd).toHaveLength(1)
    expect(pd[0].standardCode).toBe('COG-29')
    expect(pd[0].dataAvailability).toBe('intake')
    expect(pd[0].sourceRegister).toBe('professional_development')
    expect(pd[0].notTrackedReason).toContain('professional-development register')
  })

  it('a row carries notTrackedReason IFF it can ever render not_tracked', () => {
    // AIC Phase F restated this invariant. Before the phase it was simply "every
    // non-platform row"; now it is "every non-platform row, PLUS every platform row
    // whose register is module-gated" — because those are exactly the rows that can
    // still be read back as `intake`. A platform row on a non-gated register that
    // carried a reason would be dead copy nobody can reach.
    for (const [, r] of EVERY_ROW) {
      const canRenderNotTracked =
        r.dataAvailability !== 'platform' ||
        (r.sourceRegister !== null && r.sourceRegister in MODULE_GATED_REGISTERS)
      expect(
        (r.notTrackedReason ?? '').length > 0,
        `${r.standardCode}/${r.tag} → ${r.dataAvailability}/${r.sourceRegister}`,
      ).toBe(canRenderNotTracked)
    }
  })

  it('SPARSENESS: most Cognia rubric leaves carry ZERO requirement rows', () => {
    const cognia = FRAMEWORK_SEEDS.find((f) => f.code === 'cognia_2022')!
    const parents = new Set(cognia.standards.map((s) => s.parentCode).filter(Boolean))
    const rubricLeaves = cognia.standards.filter((s) => !parents.has(s.code) && !s.isAssurance)
    const withRows = new Set(FRAMEWORK_REQUIREMENT_SEEDS.cognia_2022.map((r) => r.standardCode))
    const bare = rubricLeaves.filter((s) => !withRows.has(s.code))
    // A standard with no requirement rows behaves byte-for-byte as pre-Phase-C.
    expect(bare.length).toBeGreaterThan(rubricLeaves.length / 2)
  })

  it('NSBECS-2/3/4/9 carry NO rows — we do not model Catholic identity from a ledger', () => {
    const codes = new Set(FRAMEWORK_REQUIREMENT_SEEDS.nsbecs.map((r) => r.standardCode))
    for (const c of ['NSBECS-2', 'NSBECS-3', 'NSBECS-4', 'NSBECS-9']) {
      expect(codes.has(c), `${c} must stay unmodelled`).toBe(false)
    }
  })

  it('the curriculum convention ships as a POLICY delegation, not a curriculum feature', () => {
    const curriculum = EVERY_ROW.filter(([, r]) => r.tag === 'curriculum_review')
    expect(curriculum.length).toBe(3) // COG-12, MSA-5, NSBECS-7
    for (const [, r] of curriculum) {
      expect(r.sourceRegister).toBe('policy')
      expect(r.windowKind).toBe('source_interval')
      expect(r.dataAvailability).toBe('platform')
    }
  })
})

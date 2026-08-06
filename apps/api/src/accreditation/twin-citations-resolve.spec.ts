import { describe, expect, it } from 'vitest'
import { TWIN_RULE_DEFS, TWIN_FRAMEWORK_CODES } from '@finrep/compliance'
import { FRAMEWORK_SEEDS } from './catalog-seed.js'

// ─────────────────────────────────────────────────────────────────────────────
// EVERY STANDARD THE TWIN CITES IS A STANDARD THAT EXISTS.
//
// The twin names standards by CODE, per framework: "this finding would be read
// against FCIS-10". Those codes live in the rule catalog (packages/compliance),
// the standards they refer to live in the seed (apps/api), and NOTHING connects
// the two — the pure package cannot import the seed, and until now nothing
// checked them against each other.
//
// So a typo, a renumbered standard, or a framework added to the union without a
// citation decision all fail the same silent way: the rule fires, finds no
// matching standard on the school's register, and reports `no_standards`. The
// engine looks like it is working. The finding just quietly stops being
// attributable to anything, which is the one thing the citation exists to do.
//
// This spec is the only place the two halves meet, and it lives here because
// this is the only package that can see both.
//
// AN EMPTY ARRAY IS NOT A FAILURE and is asserted separately below: where an
// accreditor has no equivalent standard, refusing to cite is correct, and
// inventing an approximate citation would be worse than the refusal.
// ─────────────────────────────────────────────────────────────────────────────

const CODES_BY_FRAMEWORK = new Map<string, Set<string>>(
  FRAMEWORK_SEEDS.map((fw) => [fw.code, new Set(fw.standards.map((s) => s.code))]),
)

describe('twin citations resolve against the catalog seed', () => {
  it('every framework the twin knows about is actually seeded', () => {
    for (const code of TWIN_FRAMEWORK_CODES) {
      expect(CODES_BY_FRAMEWORK.has(code), `${code} is a seeded framework`).toBe(true)
    }
  })

  it('every cited standard code exists in that framework', () => {
    const orphans: string[] = []
    for (const rule of TWIN_RULE_DEFS) {
      for (const fwCode of TWIN_FRAMEWORK_CODES) {
        const known = CODES_BY_FRAMEWORK.get(fwCode)
        if (!known) continue
        for (const code of rule.standardCodes[fwCode] ?? []) {
          if (!known.has(code)) orphans.push(`${rule.id} → ${fwCode}/${code}`)
        }
      }
    }
    expect(orphans).toEqual([])
  })

  it('a rule cites a LEAF or an assurance gate, never a domain parent', () => {
    // Parents are grouping rows. They carry no rubric score and no evidence, so a
    // finding attributed to one is attributed to nothing a school can act on.
    const parents = new Map<string, Set<string>>(
      FRAMEWORK_SEEDS.map((fw) => [
        fw.code,
        new Set(fw.standards.map((s) => s.parentCode).filter((c): c is string => !!c)),
      ]),
    )
    const bad: string[] = []
    for (const rule of TWIN_RULE_DEFS) {
      for (const fwCode of TWIN_FRAMEWORK_CODES) {
        for (const code of rule.standardCodes[fwCode] ?? []) {
          if (parents.get(fwCode)?.has(code)) bad.push(`${rule.id} → ${fwCode}/${code}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('each framework is cited by most rules — a silent framework is a broken one', () => {
    // The failure this catches is a framework added to the union with every entry
    // left as `[]` to make the compiler happy. It would type-check, ship, and give
    // that framework's schools an early-warning engine that attributes nothing.
    for (const fwCode of TWIN_FRAMEWORK_CODES) {
      const cited = TWIN_RULE_DEFS.filter((r) => (r.standardCodes[fwCode] ?? []).length > 0)
      expect(
        cited.length,
        `${fwCode} is cited by only ${cited.length} of ${TWIN_RULE_DEFS.length} rules`,
      ).toBeGreaterThan(TWIN_RULE_DEFS.length / 2)
    }
  })

  it('the deliberate refusals are named, not accidental', () => {
    // ONE rule genuinely has no FCIS equivalent: KYRO's condensed FCIS summary has
    // no student-assessment standard, so the learning-growth rule refuses to cite
    // rather than pointing at the curriculum standard, which is not the same claim.
    // If this list ever shrinks to nothing, the assertion above about coverage is
    // doing all the work and this one can go.
    const empties: string[] = []
    for (const rule of TWIN_RULE_DEFS) {
      for (const fwCode of TWIN_FRAMEWORK_CODES) {
        // NO_CODES rules cite nobody by design — they are not framework-specific.
        const anyCited = TWIN_FRAMEWORK_CODES.some(
          (c) => (rule.standardCodes[c] ?? []).length > 0,
        )
        if (anyCited && (rule.standardCodes[fwCode] ?? []).length === 0) {
          empties.push(`${rule.id}/${fwCode}`)
        }
      }
    }
    expect(empties.sort()).toEqual(['ACAD-GROWTH-FLAT/fcis_2023'])
  })
})

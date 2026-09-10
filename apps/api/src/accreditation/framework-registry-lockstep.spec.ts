import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TWIN_FRAMEWORK_CODES, TWIN_RULE_DEFS } from '@finrep/compliance'
import { KNOWN_FRAMEWORK_CODES } from '../twin/twin-register.service.js'
import { FRAMEWORK_SEEDS } from './catalog-seed.js'
import { FRAMEWORK_REQUIREMENT_SEEDS } from './catalog-requirements-seed.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS2 RISK #0 — THE REGISTRIES MOVE TOGETHER.
//
// Beyond the seed, FOUR code registries hardcode framework codes, and a
// framework present in the seed but missing from any of them breaks SILENTLY:
// `frameworkCodeFrom` maps the unknown code to null, `frameworkOf()`'s degrade
// fallback hardcodes 'cognia_2022', and every twin rule at that school either
// refuses with `no_standards` or cites against the wrong framework's constants —
// a working-looking engine with no attribution. Nothing at runtime ever says so.
//
// This spec is the gate: the seed, TWIN_FRAMEWORK_CODES, every rule's
// standardCodes map, KNOWN_FRAMEWORK_CODES (twin-register.service.ts) and
// FRAMEWORK_REQUIREMENT_SEEDS gain a Cognia edition together or the build is
// red. It also pins the cogniaPair mechanism's output: the 2025 citation array
// IS the 2022 array, by reference, on every rule — no second array to drift.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = fileURLToPath(new URL('.', import.meta.url))

const SEED_CODES = FRAMEWORK_SEEDS.map((f) => f.code)

describe('WS2 registry lockstep — cognia_2025 lands everywhere or nowhere', () => {
  it('the seed carries cognia_2025 (the anchor fact the rest key off)', () => {
    expect(SEED_CODES).toContain('cognia_2025')
  })

  it('TWIN_FRAMEWORK_CODES contains every seeded twin framework, incl. cognia_2025', () => {
    expect(TWIN_FRAMEWORK_CODES).toContain('cognia_2022')
    expect(TWIN_FRAMEWORK_CODES).toContain('cognia_2025')
    // …and never a code the seed does not hold (the citation spec's inverse).
    for (const code of TWIN_FRAMEWORK_CODES) {
      expect(SEED_CODES, `${code} is seeded`).toContain(code)
    }
  })

  it('KNOWN_FRAMEWORK_CODES (twin-register.service) names cognia_2025', () => {
    // Asserted by MEMBERSHIP on the imported const (n1) — source-string
    // containment could be satisfied by a comment. The gate at
    // frameworkCodeFrom returns null for any code missing here.
    expect(KNOWN_FRAMEWORK_CODES.has('cognia_2025')).toBe(true)
    expect(KNOWN_FRAMEWORK_CODES.has('cognia_2022')).toBe(true)
    // …and the set never names a code the seed does not hold.
    for (const code of KNOWN_FRAMEWORK_CODES) {
      expect(SEED_CODES, `${code} is seeded`).toContain(code)
    }
  })

  it("every rule's cognia_2025 citation array IS its cognia_2022 array (reference-equal)", () => {
    // The crosswalk is a code identity (pinned in catalog-seed.spec), so every
    // rule cites the SAME codes against either edition. Reference equality —
    // the cogniaPair construction — is what makes drift impossible.
    for (const rule of TWIN_RULE_DEFS) {
      expect(rule.standardCodes.cognia_2025, rule.id).toBe(rule.standardCodes.cognia_2022)
    }
  })

  it('FRAMEWORK_REQUIREMENT_SEEDS carries cognia_2025, sharing cognia_2022’s list by reference', () => {
    expect(Object.keys(FRAMEWORK_REQUIREMENT_SEEDS)).toContain('cognia_2025')
    expect(FRAMEWORK_REQUIREMENT_SEEDS.cognia_2025).toBe(FRAMEWORK_REQUIREMENT_SEEDS.cognia_2022)
  })

  // ── fccap rides the SAME mechanism: an accreditor whose standards are the
  //    NSBECS rows, so its citations and requirements are nsbecs's by reference.
  it('fccap lands in every registry — seed, twin union, register set, requirements', () => {
    expect(SEED_CODES).toContain('fccap')
    expect(TWIN_FRAMEWORK_CODES).toContain('fccap')
    expect(KNOWN_FRAMEWORK_CODES.has('fccap')).toBe(true)
    expect(Object.keys(FRAMEWORK_REQUIREMENT_SEEDS)).toContain('fccap')
  })

  it("every rule's fccap citation array IS its nsbecs array (reference-equal)", () => {
    for (const rule of TWIN_RULE_DEFS) {
      expect(rule.standardCodes.fccap, rule.id).toBe(rule.standardCodes.nsbecs)
    }
  })

  it('fccap requirements and catalog standards ARE nsbecs’s, by reference', () => {
    expect(FRAMEWORK_REQUIREMENT_SEEDS.fccap).toBe(FRAMEWORK_REQUIREMENT_SEEDS.nsbecs)
    const fcc = FRAMEWORK_SEEDS.find((f) => f.code === 'fccap')!
    const nsbecs = FRAMEWORK_SEEDS.find((f) => f.code === 'nsbecs')!
    expect(fcc.standards).toBe(nsbecs.standards)
  })

  it("frameworkOf()'s degrade fallback stays pinned at 'cognia_2022'", () => {
    // Deliberate: the fallback is a last-resort constant for schools with NO
    // framework on the register (where citing nothing real is exactly right).
    // Revisit only when 2025 becomes the majority framework — changing it now
    // churns fixtures for zero user value. Read from the pure package's source.
    const twinSource = readFileSync(
      HERE + '../../../../packages/compliance/src/accreditation-twin.ts',
      'utf8',
    )
    expect(twinSource).toMatch(/:\s*'cognia_2022'\n\}/)
  })
})

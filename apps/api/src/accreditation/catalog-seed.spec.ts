import { describe, expect, it } from 'vitest'
import { isMetricKey, MIX_METRIC_KEYS } from '@finrep/analytics'
import { DOMAIN_WEIGHT_EPSILON, isDomainKey } from '@finrep/compliance'
import { FRAMEWORK_SEEDS, type CatalogStandardSeed } from './catalog-seed.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase B — THE BOOT ASSERTION for the seed-only domain map.
//
// The seed is the ONE place a domain mapping exists (schools resolve theirs
// through catalogStandardId, so there is nothing to migrate when it changes).
// That makes a typo here silent and expensive: a standard with a mistyped domain
// key simply vanishes from the grid and quietly shrinks a school's effective
// leaf count, which can push a domain below the scoring threshold and turn a
// real percentage into "not measured" with no error anywhere.
//
// So every seeded row — parents and assurance gates included — is asserted here:
// a valid domain key, weights that sum to exactly 1, legal non-mix signal keys,
// and the framework shapes unchanged (proof the mapping edit did not add, drop
// or re-parent a standard).
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ROWS: { fw: string; s: CatalogStandardSeed }[] = FRAMEWORK_SEEDS.flatMap((fw) =>
  fw.standards.map((s) => ({ fw: fw.code, s })),
)

/** Leaves = rows no other row in the same framework names as its parent. */
function leavesOf(fwCode: string): CatalogStandardSeed[] {
  const fw = FRAMEWORK_SEEDS.find((f) => f.code === fwCode)!
  const parents = new Set(fw.standards.map((s) => s.parentCode).filter(Boolean))
  return fw.standards.filter((s) => !parents.has(s.code))
}

describe('catalog seed — every row carries a valid domain', () => {
  it('domainKey is non-null and inside the CLOSED vocabulary, on every row', () => {
    const offenders = ALL_ROWS.filter(({ s }) => !isDomainKey(s.domainKey)).map(
      ({ fw, s }) => `${fw}:${s.code}=${String(s.domainKey)}`,
    )
    expect(offenders).toEqual([])
  })

  it('domainWeights (when present) are valid, sum to 1, and include the lead key', () => {
    for (const { fw, s } of ALL_ROWS) {
      if (!s.domainWeights) continue
      const entries = Object.entries(s.domainWeights)
      expect(entries.length, `${fw}:${s.code} split must name ≥2 domains`).toBeGreaterThan(1)
      let sum = 0
      for (const [k, v] of entries) {
        expect(isDomainKey(k), `${fw}:${s.code} weight key ${k}`).toBe(true)
        expect(Number.isFinite(v) && (v as number) > 0, `${fw}:${s.code} weight ${k}=${v}`).toBe(
          true,
        )
        sum += v as number
      }
      expect(Math.abs(sum - 1), `${fw}:${s.code} weights sum to ${sum}`).toBeLessThan(
        DOMAIN_WEIGHT_EPSILON,
      )
      // The lead key is the register-grouping domain AND the fallback, so a
      // split that omits it would group the standard where it has no weight.
      expect(Object.keys(s.domainWeights), `${fw}:${s.code} lead domain`).toContain(s.domainKey)
    }
  })

  it('signalKeys are real, non-mix, deduped metric keys, at most 8 per standard', () => {
    for (const { fw, s } of ALL_ROWS) {
      const keys = s.signalKeys ?? []
      expect(keys.length, `${fw}:${s.code} binds ${keys.length} signals`).toBeLessThanOrEqual(8)
      expect(new Set(keys).size, `${fw}:${s.code} has duplicate signal keys`).toBe(keys.length)
      for (const k of keys) {
        expect(isMetricKey(k), `${fw}:${s.code} unknown metric key ${k}`).toBe(true)
        // A mix metric has no scalar value and no band; the signal panel is a
        // value+band surface, so binding one would render an empty row forever.
        expect(
          (MIX_METRIC_KEYS as readonly string[]).includes(k),
          `${fw}:${s.code} binds mix metric ${k}`,
        ).toBe(false)
      }
    }
  })
})

describe('catalog seed — the framework shapes are unchanged', () => {
  it('Cognia is still 42 rows / 31 non-assurance leaves / 6 assurance leaves', () => {
    const fw = FRAMEWORK_SEEDS.find((f) => f.code === 'cognia_2022')!
    expect(fw.standards).toHaveLength(42)
    const leaves = leavesOf('cognia_2022')
    expect(leaves.filter((s) => !s.isAssurance)).toHaveLength(31)
    expect(leaves.filter((s) => s.isAssurance)).toHaveLength(6)
  })

  it('MSA is still 5 root leaves; NSBECS is still 17 rows / 13 leaves', () => {
    expect(FRAMEWORK_SEEDS.find((f) => f.code === 'msa_cess_2022')!.standards).toHaveLength(5)
    expect(leavesOf('msa_cess_2022')).toHaveLength(5)
    const nsbecs = FRAMEWORK_SEEDS.find((f) => f.code === 'nsbecs')!
    expect(nsbecs.standards).toHaveLength(17)
    expect(leavesOf('nsbecs')).toHaveLength(13)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // THE FOUR ADDED FRAMEWORKS, AND THE HONESTY THEY SHIP WITH.
  //
  // FCIS, ACSI, ACS WASC and SAIS are the accreditors schools most often hold
  // ALONGSIDE Cognia, which is what made a single-framework read visibly wrong.
  // Unlike the three above they are KYRO's own condensed summaries rather than
  // transcriptions, and these tests pin the two things that must stay true of
  // anything authored that way.
  // ───────────────────────────────────────────────────────────────────────────
  it('the four condensed frameworks keep their authored shapes', () => {
    const shapes: [string, number, number][] = [
      // code, total rows, non-assurance leaves
      ['fcis_2023', 16, 12],
      ['acsi_reach', 8, 8],
      ['acs_wasc', 18, 13],
      ['sais_2023', 16, 11],
    ]
    for (const [code, rows, leaves] of shapes) {
      const fw = FRAMEWORK_SEEDS.find((f) => f.code === code)
      expect(fw, `${code} is seeded`).toBeDefined()
      expect(fw!.standards, `${code} row count`).toHaveLength(rows)
      expect(leavesOf(code).filter((s) => !s.isAssurance), `${code} leaf count`).toHaveLength(leaves)
    }
  })

  it('NONE of them invents a numeric accreditation index', () => {
    // Cognia publishes an index scale (100–400, banded). These accreditors do not,
    // and manufacturing one would be the single most misleading thing this file
    // could do — a school would read a number its accreditor never awards.
    for (const code of ['fcis_2023', 'acsi_reach', 'acs_wasc', 'sais_2023']) {
      const fw = FRAMEWORK_SEEDS.find((f) => f.code === code)!
      expect(fw.statusBands, `${code} bands`).toEqual([])
      expect(fw.indexMin, `${code} indexMin`).toBeNull()
      expect(fw.indexMax, `${code} indexMax`).toBeNull()
      expect(fw.defaultTarget, `${code} defaultTarget`).toBeNull()
    }
  })

  it('each one SAYS it is a KYRO summary, on every screen that shows a version', () => {
    // The version string is rendered on the adopt screen and on the readiness
    // hero. A school must never be able to mistake our condensation for its
    // accreditor's own document.
    for (const code of ['fcis_2023', 'acsi_reach', 'acs_wasc', 'sais_2023']) {
      const fw = FRAMEWORK_SEEDS.find((f) => f.code === code)!
      expect(fw.version, `${code} version`).toContain('KYRO condensed')
      expect(fw.description ?? '', `${code} description`).toMatch(/not the accreditor/i)
    }
  })

  it('every framework still offers exactly four rubric levels', () => {
    // The engine hardcodes RUBRIC_MIN/MAX at 1..4. A framework seeded with three
    // or five labels would render a picker whose pips and words disagree.
    for (const fw of FRAMEWORK_SEEDS) {
      expect(fw.rubricLabels, `${fw.code} rubric`).toHaveLength(4)
    }
  })

  it("each framework's leaf weights conserve: Σ weights === leaf count", () => {
    for (const fw of FRAMEWORK_SEEDS) {
      const leaves = leavesOf(fw.code).filter((s) => !s.isAssurance)
      const total = leaves.reduce((sum, s) => {
        const w = s.domainWeights
          ? Object.values(s.domainWeights).reduce((a, b) => a + (b as number), 0)
          : 1
        return sum + w
      }, 0)
      expect(Math.abs(total - leaves.length), `${fw.code} conservation`).toBeLessThan(
        DOMAIN_WEIGHT_EPSILON,
      )
    }
  })

  it('every parentCode still resolves inside its own framework', () => {
    for (const fw of FRAMEWORK_SEEDS) {
      const codes = new Set(fw.standards.map((s) => s.code))
      for (const s of fw.standards) {
        if (s.parentCode) expect(codes.has(s.parentCode), `${fw.code}:${s.code}`).toBe(true)
      }
    }
  })
})

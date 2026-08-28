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
  it('the four added frameworks match their published standard lists', () => {
    const shapes: [string, number, number][] = [
      // code, total rows, non-assurance leaves. FLAT for all four: the standard
      // list is the accreditor's own and indicators are deliberately not modelled,
      // so every row is a leaf.
      ['fcis_2023', 18, 18],
      ['acsi_reach', 8, 8],
      ['acs_wasc', 5, 5],
      ['sais_2023', 6, 6],
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

  it('each one names its source document and says indicators are not modelled', () => {
    // These four shipped first as KYRO's own condensed summaries and were WRONG —
    // ACSI standard 7 was seeded as "facilities" when it is spiritual formation,
    // SAIS was missing an entire standard, FCIS was a four-group invention where
    // the manual is a flat list of eighteen. The titles are now the accreditors'
    // own, and what remains unmodelled has to be stated rather than implied.
    for (const code of ['fcis_2023', 'acsi_reach', 'acs_wasc', 'sais_2023']) {
      const fw = FRAMEWORK_SEEDS.find((f) => f.code === code)!
      expect(fw.version, `${code} version`).not.toMatch(/KYRO/i)
      expect(fw.description ?? '', `${code} says indicators are not modelled`).toMatch(
        /not modelled/i,
      )
      expect(fw.description ?? '', `${code} attributes the titles`).toMatch(/accreditor’s/)
    }
  })

  it('the accreditors’ OWN standard titles are used verbatim', () => {
    // The check that would have caught the original errors. Each of these is a
    // title transcribed from the accreditor's published manual — a rewrite that
    // paraphrases one of them back into KYRO's words reddens here.
    const titleOf = (fw: string, code: string) =>
      FRAMEWORK_SEEDS.find((f) => f.code === fw)!.standards.find((s) => s.code === code)?.title
    expect(titleOf('fcis_2023', 'FCIS-12')).toBe('Safety, Security and Risk Management')
    expect(titleOf('acsi_reach', 'ACSI-7')).toBe(
      'Character, Values, and Spiritual Formation of Students',
    )
    expect(titleOf('acsi_reach', 'ACSI-6')).toBe('Student Care')
    expect(titleOf('acs_wasc', 'WASC-C')).toBe('Learning and Teaching')
    expect(titleOf('sais_2023', 'SAIS-4')).toBe('Stakeholder Communication & Relationships')
  })

  it('conditional standards SAY when they apply', () => {
    // FCIS 8 and 13–18 and SAIS 6 apply only to schools running those programs.
    // Seeding them without saying so would hand a day school seven standards it
    // can never meet and no way to know why.
    const conditional = [
      ['fcis_2023', 'FCIS-8'],
      ['fcis_2023', 'FCIS-13'],
      ['fcis_2023', 'FCIS-15'],
      ['fcis_2023', 'FCIS-18'],
      ['sais_2023', 'SAIS-6'],
    ]
    for (const [fw, code] of conditional) {
      const row = FRAMEWORK_SEEDS.find((f) => f.code === fw)!.standards.find(
        (s) => s.code === code,
      )!
      expect(row.description ?? '', `${fw}:${code}`).toMatch(/^Applies only to schools/)
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

// ─────────────────────────────────────────────────────────────────────────────
// WS2 — TWO COGNIA EDITIONS. These assertions are the versioning gates: the
// code-identity crosswalk the upgrade transaction rests on, the historical
// rubric vocabulary already-scored schools were graded under, and the verbatim
// 2025 wording — pinned so a lazy shared-title or paraphrase regression is a
// failing build, not a quiet lie to a scored school.
// ─────────────────────────────────────────────────────────────────────────────
describe('catalog seed — Cognia 2022/2025 versioning', () => {
  const cognia2022 = FRAMEWORK_SEEDS.find((f) => f.code === 'cognia_2022')!
  const cognia2025 = FRAMEWORK_SEEDS.find((f) => f.code === 'cognia_2025')!

  it('cognia_2025 is seeded with the 42/31/6 shape', () => {
    expect(cognia2025.standards).toHaveLength(42)
    const leaves = leavesOf('cognia_2025')
    expect(leaves.filter((s) => !s.isAssurance)).toHaveLength(31)
    expect(leaves.filter((s) => s.isAssurance)).toHaveLength(6)
  })

  it('THE CROSSWALK INVARIANT: the 2025 code SET === the 2022 code set', () => {
    // The upgrade flow's correctness rests on this: re-pointing maps by CODE
    // identity, so the two editions must hold exactly the same codes.
    const codes2022 = cognia2022.standards.map((s) => s.code).sort()
    const codes2025 = cognia2025.standards.map((s) => s.code).sort()
    expect(codes2025).toEqual(codes2022)
  })

  it('2022 keeps the VERBATIM legacy i3 rubric labels; 2025 carries the current four', () => {
    // R7 — the historical-integrity gate: these four words are the scale
    // already-scored schools actually used. Correcting them in place would
    // misrepresent what a school's historical 1–4 meant when asserted.
    expect(cognia2022.rubricLabels).toEqual(['Insufficient', 'Initiating', 'Improving', 'Impacting'])
    expect(cognia2025.rubricLabels).toEqual(['Insufficient', 'Developing', 'Engaging', 'Demonstrating'])
  })

  it('2025 rubricDescriptors are the four verbatim point-value definitions', () => {
    const d = cognia2025.rubricDescriptors!
    expect(d).toHaveLength(4)
    expect(d[0]).toBe('Reflecting areas with insufficient evidence and/or limited activity leading toward improvement')
    expect(d[1]).toBe('Developing or improving practices that provide evidence that effort approaches desired level of effectiveness')
    expect(d[2]).toBe('Engaging in practices that provide evidence of expected effectiveness that is reflected in the standard')
    // A3 — the research-verified verbatim L4 (no "systematic and systemic";
    // "producing", not "that produce").
    expect(d[3]).toBe('Demonstrating noteworthy practices producing clear results that positively impact learners')
    // 2022 publishes single words only — no descriptors invented for it.
    expect(cognia2022.rubricDescriptors).toBeUndefined()
  })

  it('both editions share identical statusBands and index fields; 2025 carries the 296 reference', () => {
    expect(cognia2025.statusBands).toEqual(cognia2022.statusBands)
    expect(cognia2025.indexMin).toBe(cognia2022.indexMin)
    expect(cognia2025.indexMax).toBe(cognia2022.indexMax)
    expect(cognia2025.defaultTarget).toBe(cognia2022.defaultTarget)
    expect(cognia2025.indexReference).toEqual({
      value: 296,
      label: 'Cognia network average IEQ (2024–25)',
    })
    expect(cognia2022.indexReference).toBeUndefined()
  })

  it('COG-1 differs between editions and the 2025 text contains "free from bias"', () => {
    // Pins the 2025 wording fix (the 2021 "equity, and inclusion" phrasing is
    // outdated) AND guards against a lazy shared-title regression.
    const t2022 = cognia2022.standards.find((s) => s.code === 'COG-1')!.title
    const t2025 = cognia2025.standards.find((s) => s.code === 'COG-1')!.title
    expect(t2025).not.toBe(t2022)
    expect(t2025).toContain('free from bias')
    expect(t2025).toBe(
      'Leaders cultivate and sustain a culture that demonstrates respect and fairness for all learners and is free from bias.',
    )
  })

  it('COG-31 is the accreditor’s own verbatim statement on the 2025 row, with no "2025 addition" note', () => {
    const s31 = cognia2025.standards.find((s) => s.code === 'COG-31')!
    expect(s31.title).toBe(
      'Learners demonstrate growth in their academic performance based on valid and reliable assessments.',
    )
    expect(s31.description).toBeUndefined()
  })

  it('supersededByCode targets exist, cognia_2022 → cognia_2025, and nothing supersedes 2025', () => {
    // The dangling-pointer gate: a supersededByCode naming an unseeded
    // framework would fail-soft at runtime (reads as "not superseded") — this
    // catches it at CI instead.
    const codes = new Set(FRAMEWORK_SEEDS.map((f) => f.code))
    for (const fw of FRAMEWORK_SEEDS) {
      if (fw.supersededByCode) {
        expect(codes.has(fw.supersededByCode), `${fw.code} → ${fw.supersededByCode}`).toBe(true)
      }
    }
    expect(cognia2022.supersededByCode).toBe('cognia_2025')
    expect(cognia2025.supersededByCode).toBeUndefined()
  })

  it('both Cognia rows carry the division/predecessor aliases', () => {
    for (const fw of [cognia2022, cognia2025]) {
      expect(fw.aliases ?? [], fw.code).toEqual(
        expect.arrayContaining(['NCA CASI', 'SACS CASI', 'NWAC', 'AdvancED']),
      )
    }
    // Alias identity: both editions answer the same searches.
    expect(cognia2025.aliases).toEqual(cognia2022.aliases)
  })

  it('the domain map, tags and signal bindings are IDENTICAL across editions (one product mapping)', () => {
    const by2022 = new Map(cognia2022.standards.map((s) => [s.code, s]))
    for (const s of cognia2025.standards) {
      const twin = by2022.get(s.code)!
      expect(s.domainKey, s.code).toBe(twin.domainKey)
      expect(s.domainWeights ?? null, s.code).toEqual(twin.domainWeights ?? null)
      expect(s.signalKeys ?? [], s.code).toEqual(twin.signalKeys ?? [])
      expect(s.evidenceTags ?? [], s.code).toEqual(twin.evidenceTags ?? [])
      expect(s.isAssurance ?? false, s.code).toBe(twin.isAssurance ?? false)
      expect(s.parentCode ?? null, s.code).toBe(twin.parentCode ?? null)
    }
  })

  it('MSA name/version are pinned to School Edition (2021); the code stays msa_cess_2022', () => {
    const msa = FRAMEWORK_SEEDS.find((f) => f.code === 'msa_cess_2022')!
    // `code` is an identity (seriesKey history, audit rows) and is never renamed.
    expect(msa.name).toBe('MSA-CESS Standards for Accreditation, School Edition (2021)')
    expect(msa.version).toBe('School Edition 2021')
  })
})

describe('catalog seed — the authored plain-language layer (WS3 F3)', () => {
  it('all 31 Cognia standards carry plainLanguage on BOTH editions — shared, never forked', () => {
    for (const code of ['cognia_2022', 'cognia_2025']) {
      const fw = FRAMEWORK_SEEDS.find((f) => f.code === code)!
      const leaves = leavesOf(code).filter((s) => !s.isAssurance)
      expect(leaves).toHaveLength(31)
      for (const s of leaves) {
        expect(
          (s.plainLanguage ?? '').length,
          `${code}:${s.code} has no plain language`,
        ).toBeGreaterThan(20)
      }
    }
    // Shared by construction: the SAME sentence on both editions, per code.
    const p2022 = new Map(
      FRAMEWORK_SEEDS.find((f) => f.code === 'cognia_2022')!.standards.map((s) => [s.code, s.plainLanguage ?? null]),
    )
    for (const s of FRAMEWORK_SEEDS.find((f) => f.code === 'cognia_2025')!.standards) {
      expect(s.plainLanguage ?? null, s.code).toBe(p2022.get(s.code) ?? null)
    }
  })

  it('plainLanguage NEVER parrots the statement, and no other framework invents any', () => {
    for (const code of ['cognia_2022', 'cognia_2025']) {
      for (const s of leavesOf(code).filter((x) => !x.isAssurance)) {
        expect(s.plainLanguage, `${code}:${s.code}`).not.toBe(s.title)
      }
    }
    // Null-tolerant by design: frameworks not yet authored carry NOTHING —
    // no lorem, no paraphrase. (NIPSA/MSA/etc. may be authored later.)
    for (const fw of FRAMEWORK_SEEDS) {
      if (fw.code === 'cognia_2022' || fw.code === 'cognia_2025') continue
      for (const s of fw.standards) {
        expect(s.plainLanguage, `${fw.code}:${s.code}`).toBeUndefined()
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NIPSA + RECOGNITION BADGES (contract addendum). The two facts the market
// guesses wrong are pinned hardest: Cognia carries NO badge (verified absence
// from the NCPSA member list, and not ICAISA), and FCIS is ICAISA — not NCPSA
// (the NCPSA Florida member is AISF, a different body).
// ─────────────────────────────────────────────────────────────────────────────
describe('catalog seed — nipsa_academic', () => {
  const nipsa = FRAMEWORK_SEEDS.find((f) => f.code === 'nipsa_academic')!

  it('is seeded: 12 flat leaves, no parents, no assurances', () => {
    expect(nipsa).toBeDefined()
    expect(nipsa.standards).toHaveLength(12)
    expect(nipsa.standards.every((s) => !s.parentCode)).toBe(true)
    expect(nipsa.standards.every((s) => !s.isAssurance)).toBe(true)
    expect(leavesOf('nipsa_academic')).toHaveLength(12)
  })

  it('invents NO index — the no-invented-index rule extends to it', () => {
    expect(nipsa.statusBands).toEqual([])
    expect(nipsa.indexMin).toBeNull()
    expect(nipsa.indexMax).toBeNull()
    expect(nipsa.defaultTarget).toBeNull()
    // …and no rubric vocabulary is ATTRIBUTED to NIPSA: the generic scale is
    // the same one the other unscaled frameworks use, and the description says
    // whose it is.
    expect(nipsa.rubricLabels).toEqual(['Not Evident', 'Emerging', 'Meets Standard', 'Exceeds Standard'])
    expect(nipsa.description ?? '').toMatch(/no numeric index|publishes no/i)
    expect(nipsa.description ?? '').toMatch(/7-year/)
  })

  it('the criterion statements are VERBATIM from the live page (drift guard)', () => {
    const byCode = new Map(nipsa.standards.map((s) => [s.code, s]))
    expect(byCode.get('NIPSA-2')!.title).toBe('Philosophy and Goals')
    expect(byCode.get('NIPSA-2')!.description).toBe(
      'A statement of philosophy by the governing body of the school. Goals and objectives consistent with that philosophy shall be systematically developed and reviewed by the administration and staff, and are to be shared often with the students and the parent community. There shall be a continual evaluation of progress toward these goals and objectives.',
    )
    expect(byCode.get('NIPSA-8')!.title).toBe('School Staff')
    expect(byCode.get('NIPSA-8')!.description).toBe(
      'A well-qualified staff that effectively fulfills its responsibilities.',
    )
    expect(byCode.get('NIPSA-11')!.title).toBe('Finance')
  })

  it('has aliases so a school searching "NIPSA" finds it, no divisions, no supersession', () => {
    expect(nipsa.aliases ?? []).toEqual(
      expect.arrayContaining(['NIPSA', 'National Independent Private Schools Association']),
    )
    expect(nipsa.supersededByCode).toBeUndefined()
  })
})

describe('catalog seed — recognition badges (the VERIFIED mapping)', () => {
  const recog = (code: string) =>
    FRAMEWORK_SEEDS.find((f) => f.code === code)!.recognitions ?? []

  it('pins the table exactly — especially the two the market would guess wrong', () => {
    // Cognia is NOT on the current NCPSA member list and not ICAISA — a
    // VERIFIED absence, never "unknown".
    expect(recog('cognia_2022')).toEqual([])
    expect(recog('cognia_2025')).toEqual([])
    // FCIS is an ICAISA full member; NOT NCPSA (AISF is the NCPSA Florida body).
    expect(recog('fcis_2023')).toEqual(['icaisa'])
    expect(recog('msa_cess_2022')).toEqual(['ncpsa'])
    expect(recog('nsbecs')).toEqual([])
    expect(recog('acsi_reach')).toEqual(['ncpsa'])
    expect(recog('acs_wasc')).toEqual(['ncpsa'])
    expect(recog('sais_2023')).toEqual(['ncpsa', 'icaisa'])
    expect(recog('nipsa_academic')).toEqual(['ncpsa'])
  })

  it('every recognition code is in the closed RECOGNITION_BODIES constant', async () => {
    const { RECOGNITION_BODIES } = await import('./recognitions.js')
    for (const fw of FRAMEWORK_SEEDS) {
      for (const code of fw.recognitions ?? []) {
        expect(RECOGNITION_BODIES[code], `${fw.code} → ${code}`).toBeDefined()
      }
    }
  })

  it("'NCPSA' is a badge, not an identity — never an alias on any framework", () => {
    for (const fw of FRAMEWORK_SEEDS) {
      expect(fw.aliases ?? [], fw.code).not.toContain('NCPSA')
      expect(fw.aliases ?? [], fw.code).not.toContain('ICAISA')
    }
  })
})

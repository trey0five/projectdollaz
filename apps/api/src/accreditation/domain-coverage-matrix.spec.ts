import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeDomainConfidence,
  computeDomainReadiness,
  normalizeDomainWeights,
  type DomainMap,
  type ReadinessLeafInput,
} from '@finrep/compliance'
import { FRAMEWORK_SEEDS, type CatalogStandardSeed } from './catalog-seed.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase B — the PER-FRAMEWORK DOMAIN-COVERAGE MATRIX, COMPUTED.
//
// This is the artifact we hand the client to answer "what will my school
// actually see?" — and it is deliberately NOT a hand-maintained document. A doc
// describing a mapping drifts from the mapping the day someone edits the seed,
// and a drifted doc is worse than none: it is a promise the product no longer
// keeps. So the matrix is DERIVED from FRAMEWORK_SEEDS by this spec and pinned
// against a committed fixture. Change the seed and this test tells you exactly
// which cell moved; the fixture is regenerated deliberately, never by accident.
//
// Every leaf is fed in UNSCORED with no evidence, because the matrix describes
// the FRAMEWORK (what your accreditor asks and what KYRO can instrument), not
// any school's progress. Percentages are therefore excluded from the artifact —
// they belong to a school, not to a framework.
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(here, '__fixtures__', 'domain-coverage-matrix.json')

interface MatrixDomain {
  domainKey: string
  label: string
  covered: boolean
  measured: boolean
  contributingLeafCount: number
  effectiveLeafWeight: number
  signalCount: number
  reason: string | null
}

interface MatrixFramework {
  leafCount: number
  measuredDomains: number
  coveragePct: number
  caveat: string
  domains: MatrixDomain[]
}

/** Non-assurance LEAVES: rows no other row in the framework names as parent. */
function scoredLeavesOf(fwCode: string): CatalogStandardSeed[] {
  const fw = FRAMEWORK_SEEDS.find((f) => f.code === fwCode)!
  const parents = new Set(fw.standards.map((s) => s.parentCode).filter(Boolean))
  return fw.standards.filter((s) => !parents.has(s.code) && !s.isAssurance)
}

function matrixFor(fwCode: string): MatrixFramework {
  const seeds = scoredLeavesOf(fwCode)
  const leaves: ReadinessLeafInput[] = seeds.map((s) => ({
    standardId: s.code,
    code: s.code,
    title: s.title,
    rubricScore: null,
    evidenceCount: 0,
  }))
  const map: DomainMap = Object.fromEntries(
    seeds.map((s) => [s.code, normalizeDomainWeights(s.domainKey, s.domainWeights ?? null)]),
  )
  const signalKeys: Record<string, string[]> = Object.fromEntries(
    seeds.filter((s) => (s.signalKeys ?? []).length > 0).map((s) => [s.code, s.signalKeys ?? []]),
  )
  const domains = computeDomainReadiness(leaves, map, { signalKeys })
  const confidence = computeDomainConfidence(domains)
  return {
    leafCount: leaves.length,
    measuredDomains: confidence.measuredDomains,
    coveragePct: confidence.coveragePct,
    caveat: confidence.caveat,
    domains: domains.map((d) => ({
      domainKey: d.domainKey,
      label: d.label,
      covered: d.covered,
      measured: d.measured,
      contributingLeafCount: d.contributingLeafCount,
      effectiveLeafWeight: d.effectiveLeafWeight,
      signalCount: d.signalCount,
      reason: d.reason,
    })),
  }
}

function computedMatrix(): Record<string, MatrixFramework> {
  return Object.fromEntries(FRAMEWORK_SEEDS.map((fw) => [fw.code, matrixFor(fw.code)]))
}

describe('per-framework domain-coverage matrix (computed, not hand-maintained)', () => {
  it('deep-equals the committed fixture — the artifact IS the seed', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as {
      frameworks: Record<string, MatrixFramework>
    }
    expect(computedMatrix()).toEqual(fixture.frameworks)
  })

  it('the three headline cells the client was promised', () => {
    const m = computedMatrix()
    const cell = (fw: string, key: string) =>
      m[fw].domains.find((d) => d.domainKey === key) as MatrixDomain

    // Cognia FINANCE: one standard, no number possible, SEVEN real signals.
    expect(cell('cognia_2022', 'finance')).toEqual(
      expect.objectContaining({
        covered: true,
        measured: false,
        contributingLeafCount: 1,
        effectiveLeafWeight: 1,
        signalCount: 7,
      }),
    )
    // MSA TECHNOLOGY: not in the framework at all — the exact frozen sentence.
    expect(cell('msa_cess_2022', 'technology')).toEqual(
      expect.objectContaining({
        covered: false,
        measured: false,
        contributingLeafCount: 0,
        effectiveLeafWeight: 0,
        signalCount: 0,
        reason: 'Your framework has no technology standards',
      }),
    )
    // NSBECS MISSION: the teaching moment — MEASURED, and ZERO signals, because
    // we do not measure Catholic identity from a general ledger.
    expect(cell('nsbecs', 'mission_identity')).toEqual(
      expect.objectContaining({
        covered: true,
        measured: true,
        contributingLeafCount: 4,
        effectiveLeafWeight: 3.5,
        signalCount: 0,
      }),
    )
  })

  it('coverage totals: Cognia 5/10, MSA 0/10, NSBECS 1/10', () => {
    const m = computedMatrix()
    expect([m.cognia_2022.leafCount, m.cognia_2022.measuredDomains, m.cognia_2022.coveragePct]).toEqual([31, 5, 50])
    expect([m.msa_cess_2022.leafCount, m.msa_cess_2022.measuredDomains, m.msa_cess_2022.coveragePct]).toEqual([5, 0, 0])
    expect([m.nsbecs.leafCount, m.nsbecs.measuredDomains, m.nsbecs.coveragePct]).toEqual([13, 1, 10])
  })

  it('every framework conserves its leaves across the ten domains', () => {
    for (const [code, fw] of Object.entries(computedMatrix())) {
      const total = fw.domains.reduce((s, d) => s + d.effectiveLeafWeight, 0)
      expect(Math.round(total * 100) / 100, `${code} conservation`).toBe(fw.leafCount)
    }
  })

  it('no framework ever reports a number for an unmeasured domain', () => {
    for (const fw of Object.values(computedMatrix())) {
      for (const d of fw.domains) {
        if (!d.measured) expect(d.reason).not.toBeNull()
        else expect(d.reason).toBeNull()
      }
    }
  })
})

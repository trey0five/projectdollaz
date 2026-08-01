import { describe, expect, it } from 'vitest'
import { DOMAIN_KEYS, type DomainKey } from '@finrep/compliance'
import { domainNumerators, resolvePrimaryDomains, type DomainWeightIndex } from './fact-domains.js'
import type { FiredFinding } from './twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — the anti-double-count invariant (F3), acceptance criterion 3.
//
// R3's untestable "contributions sum to the fact count" is replaced by two
// statements a machine can check:
//
//   (I1)  SUM over d of |N(d)|  <=  |K|
//   (I2)  for d != e,  N(d) INTERSECT N(e) = {}
//
// (I2) is the load-bearing one and (I1) is its corollary. The randomised property
// tests below use a SEEDED PRNG passed in — never Math.random, the Phase-A
// precedent — so a failure is reproducible from the seed printed in the name.
// ─────────────────────────────────────────────────────────────────────────────

function fired(over: Partial<FiredFinding> = {}): FiredFinding {
  return {
    ruleId: 'RULE-A',
    scopeKey: 'school',
    factKey: 'metric:operating_margin@FY2026',
    standardTags: [],
    domainKeys: ['finance'],
    defaultDomainKey: 'finance',
    severity: 'warn',
    likelihood: null,
    confidence: 'directional',
    horizonKind: 'none',
    horizonDate: null,
    horizonPeriods: null,
    horizonConfidence: null,
    evidencePayload: {},
    ...over,
  }
}

/** A tiny deterministic PRNG (mulberry32) — seeded, reproducible, host-stable. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('resolvePrimaryDomains — determinism', () => {
  it('gives one fact ONE primary domain across every rule that noticed it', () => {
    // COG-15 and COG-A2 both weight finance; COG-24 weights leadership. Finance
    // sums to 1.5, leadership to 0.5 — three findings, one fact, one domain.
    const weights: DomainWeightIndex = {
      'COG-15': { finance: 1 },
      'COG-A2': { finance: 0.5, facilities: 0.5 },
      'COG-24': { leadership: 0.5, governance: 0.5 },
    }
    const findings = [
      fired({ ruleId: 'FIN-BUDGET-DETERIORATING', standardTags: ['COG-15'] }),
      fired({ ruleId: 'FAC-DEFERRED', standardTags: ['COG-A2'] }),
      fired({ ruleId: 'ACC-UNSUPPORTED-SCORE', standardTags: ['COG-24'] }),
    ]
    const map = resolvePrimaryDomains(findings, weights)
    expect(map.get('metric:operating_margin@FY2026')).toBe('finance')

    const stamped = findings.map((f) => ({
      factKey: f.factKey,
      primaryDomainKey: map.get(f.factKey) as DomainKey,
    }))
    const { byDomain } = domainNumerators(stamped)
    expect(byDomain.get('finance')?.size).toBe(1)
    // The fan-out is real and is PRESERVED in domainKeys — but leadership's
    // NUMERATOR for this fact is zero. That is the whole point.
    expect(byDomain.get('leadership')?.size).toBe(0)
    expect(byDomain.get('facilities')?.size).toBe(0)
  })

  it('breaks an exact tie on the frozen DOMAIN_KEYS order, not on insertion order', () => {
    const weights: DomainWeightIndex = {
      'S-FIN': { finance: 1 },
      'S-GOV': { governance: 1 },
    }
    const findings = [fired({ standardTags: ['S-FIN', 'S-GOV'] })]
    const winner = resolvePrimaryDomains(findings, weights).get(findings[0].factKey)

    // Asserted against the LITERAL array, never a remembered order.
    const iGov = DOMAIN_KEYS.indexOf('governance')
    const iFin = DOMAIN_KEYS.indexOf('finance')
    expect(iGov).toBeLessThan(iFin)
    expect(winner).toBe('governance')
  })

  it('is byte-stable across 100 shuffled inputs', () => {
    const weights: DomainWeightIndex = {
      'S-FIN': { finance: 1 },
      'S-GOV': { governance: 1 },
      'S-HR': { hr: 0.5 },
    }
    const base = ['S-FIN', 'S-GOV', 'S-HR']
    const rand = prng(20260803)
    for (let i = 0; i < 100; i += 1) {
      const tags = [...base].sort(() => rand() - 0.5)
      const map = resolvePrimaryDomains([fired({ standardTags: tags })], weights)
      expect(map.get('metric:operating_margin@FY2026')).toBe('governance')
    }
  })

  it('falls back to the declared default when no tag resolves', () => {
    const map = resolvePrimaryDomains(
      [fired({ standardTags: ['UNKNOWN'], defaultDomainKey: 'facilities' })],
      {},
    )
    expect(map.get('metric:operating_margin@FY2026')).toBe('facilities')
  })

  it('breaks a two-default collision on DOMAIN_KEYS order too', () => {
    // Two rules, one fact, two different declared defaults, nothing resolvable.
    // Order-independence has to hold here as well, or a rule-registration change
    // would silently move a domain band.
    const findings = [
      fired({ ruleId: 'R1', defaultDomainKey: 'finance' }),
      fired({ ruleId: 'R2', defaultDomainKey: 'governance' }),
    ]
    expect(resolvePrimaryDomains(findings, {}).get(findings[0].factKey)).toBe('governance')
    expect(resolvePrimaryDomains([...findings].reverse(), {}).get(findings[0].factKey)).toBe(
      'governance',
    )
  })
})

describe('resolvePrimaryDomains — the invariants, as properties', () => {
  const weights: DomainWeightIndex = Object.fromEntries(
    DOMAIN_KEYS.map((d, i) => [`S-${i}`, { [d]: 1 } as Partial<Record<DomainKey, number>>]),
  )

  it('(I2) every pair of domain numerator sets is disjoint, over 200 seeded sets', () => {
    const rand = prng(0xf3d0)
    for (let run = 0; run < 200; run += 1) {
      const factCount = 1 + Math.floor(rand() * 6)
      const findings: FiredFinding[] = []
      for (let f = 0; f < factCount; f += 1) {
        const factKey = `fact:${f}`
        const rules = 1 + Math.floor(rand() * 3)
        for (let r = 0; r < rules; r += 1) {
          const tags = Array.from(
            { length: 1 + Math.floor(rand() * 3) },
            () => `S-${Math.floor(rand() * DOMAIN_KEYS.length)}`,
          )
          findings.push(fired({ ruleId: `R${r}`, scopeKey: `s${f}${r}`, factKey, standardTags: tags }))
        }
      }
      const map = resolvePrimaryDomains(findings, weights)
      const stamped = findings.map((x) => ({
        factKey: x.factKey,
        primaryDomainKey: map.get(x.factKey) as DomainKey,
      }))
      const { byDomain, distinctFacts } = domainNumerators(stamped)

      for (const a of DOMAIN_KEYS) {
        for (const b of DOMAIN_KEYS) {
          if (a === b) continue
          const A = byDomain.get(a) as Set<string>
          const B = byDomain.get(b) as Set<string>
          for (const k of A) expect(B.has(k)).toBe(false)
        }
      }

      // (I1), with EQUALITY here because nothing was filtered out of the set.
      let total = 0
      for (const d of DOMAIN_KEYS) total += (byDomain.get(d) as Set<string>).size
      expect(total).toBeLessThanOrEqual(distinctFacts.size)
      expect(total).toBe(distinctFacts.size)
    }
  })

  it('(I1) is a strict inequality once a fact’s only finding is filtered out', () => {
    const weights2: DomainWeightIndex = { 'S-FIN': { finance: 1 } }
    const all = [
      fired({ factKey: 'fact:a', standardTags: ['S-FIN'] }),
      fired({ ruleId: 'R2', scopeKey: 'x', factKey: 'fact:b', standardTags: ['S-FIN'] }),
    ]
    const map = resolvePrimaryDomains(all, weights2)
    // fact:b's only finding was dismissed and is therefore not in the open set —
    // it contributes to no domain, and forcing equality would invent a bucket.
    const open = [{ factKey: 'fact:a', primaryDomainKey: map.get('fact:a') as DomainKey }]
    const { byDomain } = domainNumerators(open)
    let total = 0
    for (const d of DOMAIN_KEYS) total += (byDomain.get(d) as Set<string>).size
    expect(total).toBe(1)
    expect(total).toBeLessThan(new Set(all.map((f) => f.factKey)).size)
  })

  it('preserves rendering fan-out while counting exactly once', () => {
    const weights3: DomainWeightIndex = { 'COG-15': { finance: 1 } }
    const f = fired({
      standardTags: ['COG-15'],
      domainKeys: ['finance', 'leadership', 'continuous_improvement'],
    })
    const map = resolvePrimaryDomains([f], weights3)
    expect(f.domainKeys.length).toBeGreaterThan(1)
    expect(map.get(f.factKey)).toBe('finance')
  })
})

import { DOMAIN_KEYS, DOMAIN_WEIGHT_EPSILON, type DomainKey } from '@finrep/compliance'
import type { FiredFinding } from './twin-contract.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — THE ANTI-DOUBLE-COUNT INVARIANT (F3).
//
// PURE: no I/O, no clock, no randomness. It lives in apps/api rather than the
// compliance package because it consumes the catalog domain-weight map that
// apps/api/src/accreditation/domain-map.ts already builds — and there must be
// exactly ONE domain-weight authority, never a second copy of the >= 0.5 rule.
//
// ── the problem, concretely ─────────────────────────────────────────────────
//
// One fact — `metric:operating_margin@FY2026` — legitimately fires
// FIN-BUDGET-DETERIORATING against COG-15 (finance) AND ACC-UNSUPPORTED-SCORE
// against COG-24 (leadership). That fan-out is real and must be PRESERVED in
// rendering: the finding has to appear under every standard it would be cited
// against. But if the domain BANDS counted affected leaves, that single fact
// would darken two domains, and a school with three problems would read as a
// school with seven.
//
// ── the split ───────────────────────────────────────────────────────────────
//
//   domainKeys[]      — for RENDERING. Every domain the finding touches.
//   primaryDomainKey  — for COUNTING. EXACTLY ONE. Domain bands read only this.
//
// and the primary domain is resolved PER factKey, not per finding, so:
//
//   (I1)  SUM over domains d of |N(d)|  <=  |K|
//   (I2)  for d != e,  N(d) INTERSECT N(e) = {}
//
// where K is the set of distinct factKeys and N(d) the factKeys whose findings
// carry primaryDomainKey d. (I2) holds BY CONSTRUCTION — step 5 below stamps one
// map lookup keyed on factKey onto every finding carrying it, so a fact cannot
// reach two numerators. (I1) is its corollary; `<=` rather than `=` is the honest
// form, because a fact whose only finding has been dismissed contributes to no
// domain at all and forcing equality would require inventing a bucket for it.
//
// DETERMINISM: the tie-break is the frozen DOMAIN_KEYS order — not insertion
// order, not Math.random, not "whichever standard we read first". Byte-stable
// across runs, across hosts and across a shuffled input.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard → domain weights, as `buildDomainMap` produces it.
 *
 * KEYING NOTE (and the one place the caller has work to do): a rule declares its
 * `standardTags` in whatever vocabulary suits it — a school-standard UUID, or the
 * accreditor CODE a human would recognise ('COG-15'). `buildDomainMap` keys by
 * school-standard id only, so the RECONCILIATION builds this map with BOTH
 * aliases pointing at the same weights before calling in. That keeps one
 * authority for the weights themselves and one lookup here.
 */
export type DomainWeightIndex = Readonly<
  Record<string, Readonly<Partial<Record<DomainKey, number>>>>
>

/** DOMAIN_KEYS index, for the frozen tie-break. */
const DOMAIN_ORDER: ReadonlyMap<DomainKey, number> = new Map(
  DOMAIN_KEYS.map((k, i): [DomainKey, number] => [k, i]),
)

function domainRank(k: DomainKey): number {
  return DOMAIN_ORDER.get(k) ?? Number.MAX_SAFE_INTEGER
}

/**
 * ONE FACT, ONE PRIMARY DOMAIN — the map every finding in this run is stamped from.
 *
 * Algorithm, frozen:
 *   1. Group the fired findings by factKey.
 *   2. Union every group member's standardTags, resolve each through `weights`,
 *      and SUM the per-domain weights across that union.
 *   3. Winner = the highest summed weight; ties break on the earlier key in the
 *      frozen DOMAIN_KEYS order.
 *   4. Empty standardTags (or every tag unresolvable) => the group's
 *      `defaultDomainKey`, itself tie-broken by DOMAIN_KEYS order so a fact fired
 *      by two rules with two different defaults still resolves deterministically.
 *   5. The caller stamps the winner on EVERY finding carrying that factKey.
 */
export function resolvePrimaryDomains(
  fired: readonly FiredFinding[],
  weights: DomainWeightIndex,
): Map<string, DomainKey> {
  const byFact = new Map<string, FiredFinding[]>()
  for (const f of fired) {
    const list = byFact.get(f.factKey)
    if (list) list.push(f)
    else byFact.set(f.factKey, [f])
  }

  const out = new Map<string, DomainKey>()
  for (const [factKey, group] of byFact) {
    // 2. The union of tags across the whole group — a fact is one fact however
    //    many rules noticed it, so its domain is decided once, over all of them.
    const tags = new Set<string>()
    for (const f of group) for (const t of f.standardTags) tags.add(t)

    const sums = new Map<DomainKey, number>()
    for (const tag of tags) {
      const w = weights[tag]
      if (!w) continue
      for (const d of DOMAIN_KEYS) {
        const v = w[d]
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
        sums.set(d, (sums.get(d) ?? 0) + v)
      }
    }

    if (sums.size === 0) {
      // 4. Nothing resolved. Fall back to the rules' declared defaults, choosing
      //    the earliest in DOMAIN_KEYS so two rules cannot make this order-dependent.
      let fallback: DomainKey | null = null
      for (const f of group) {
        if (fallback === null || domainRank(f.defaultDomainKey) < domainRank(fallback)) {
          fallback = f.defaultDomainKey
        }
      }
      out.set(factKey, fallback ?? DOMAIN_KEYS[0])
      continue
    }

    // 3. Highest sum wins; DOMAIN_KEYS order breaks a tie. The epsilon is the same
    //    float-comparison precedent DOMAIN_WEIGHT_EPSILON sets for fractional
    //    weights — 0.5 + 0.5 must not lose to 1.0 on a representation artefact.
    let best: DomainKey = DOMAIN_KEYS[0]
    let bestSum = -Infinity
    for (const d of DOMAIN_KEYS) {
      const v = sums.get(d)
      if (v === undefined) continue
      if (v > bestSum + DOMAIN_WEIGHT_EPSILON) {
        best = d
        bestSum = v
      }
      // Within epsilon => a tie, and DOMAIN_KEYS order already favours the
      // incumbent because this loop walks the frozen order.
    }
    out.set(factKey, best)
  }

  return out
}

/**
 * The invariant, computable — used by the specs and available to Phase E's read
 * model so a domain band can assert its own honesty rather than trust it.
 */
export function domainNumerators(
  findings: readonly { factKey: string; primaryDomainKey: DomainKey }[],
): { byDomain: Map<DomainKey, Set<string>>; distinctFacts: Set<string> } {
  const byDomain = new Map<DomainKey, Set<string>>(DOMAIN_KEYS.map((k) => [k, new Set<string>()]))
  const distinctFacts = new Set<string>()
  for (const f of findings) {
    distinctFacts.add(f.factKey)
    byDomain.get(f.primaryDomainKey)?.add(f.factKey)
  }
  return { byDomain, distinctFacts }
}

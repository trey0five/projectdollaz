// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase B — the PURE DOMAIN MAP.
//
// The frozen readiness engine (accreditation-readiness.ts) answers "how ready is
// the school?" with ONE number. That number is true and useless on its own: a
// head of school cannot act on 46%. This module answers the next question —
// "ready WHERE, and where are we exposed?" — by re-expressing the SAME leaves
// through a CLOSED ten-domain vocabulary.
//
// THE HONESTY RULE THAT GOVERNS EVERY LINE BELOW: a domain with too few
// standards renders NO NUMBER and a reason — never 0, never a guess. `0` in a
// readiness grid reads as "we scored badly here"; the truth is usually "your
// accreditor asks nothing here" or "one standard cannot carry a percentage".
// Those are completely different facts and the product must never conflate them.
// Hence every percentage is `number | null`, and `reason` is non-null exactly
// when the percentage is null.
//
// FRACTIONAL WEIGHTS. Some accreditor standards genuinely straddle two domains
// (MSA-4 "Resources" is finance AND facilities AND human resources). Splitting
// them is honest; double-counting them is not. So a standard contributes its
// weight — never more than its whole self — and `effectiveLeafWeight` reports
// the fractional truth (a 0.5/0.5 leaf reports 0.5 in each domain, not 1). The
// MIN_DOMAIN_LEAVES threshold is applied to that EFFECTIVE weight, so three
// half-standards do not masquerade as three standards.
//
// REDUCTION GUARANTEE: when every contributing weight is 1, this module's
// readinessPct/selfScoredPct/verifiedPct are byte-identical to the frozen
// engine's over the same leaf subset (asserted by spec). The domain grid can
// never disagree with the hero.
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no Date, no clock, no
// I/O, no randomness. Same inputs → same outputs on any host/timezone.
// ─────────────────────────────────────────────────────────────────────────────

import {
  normalizeRubricScore,
  standardReadiness,
  RUBRIC_MIN,
  RUBRIC_MAX,
  type ReadinessLeafInput,
} from './accreditation-readiness.js'

export const ACCREDITATION_DOMAINS_VERSION = '1.0.0'

/**
 * The CLOSED domain vocabulary. Order is FROZEN and is the render order —
 * `computeDomainReadiness` always returns exactly these ten, in this sequence,
 * so a school learns the SHAPE of its framework from a stable grid.
 *
 * These keys are persisted (accreditation_catalog_standards.domain_key and
 * accreditation_readiness_snapshots.domain_scores), so they are stable forever.
 */
export const DOMAIN_KEYS = [
  'mission_identity',
  'governance',
  'leadership',
  'academic_excellence',
  'student_services',
  'hr',
  'finance',
  'facilities',
  'technology',
  'continuous_improvement',
] as const
export type DomainKey = (typeof DOMAIN_KEYS)[number]

/**
 * Display labels. `mission_identity` keeps the word "Catholic" deliberately:
 * KYRO's market is diocesan Catholic schools and this is the client's own
 * vocabulary (NSBECS domain 1). There is NO per-framework configuration of
 * labels — this is a platform constant, and a non-Catholic tenant would be a
 * one-line change here, not a configuration surface.
 */
export const DOMAIN_LABELS: Record<DomainKey, string> = {
  mission_identity: 'Mission & Catholic Identity',
  governance: 'Governance',
  leadership: 'Leadership',
  academic_excellence: 'Academic Excellence',
  student_services: 'Student Services',
  hr: 'Human Resources',
  finance: 'Finance',
  facilities: 'Facilities',
  technology: 'Technology',
  continuous_improvement: 'Continuous Improvement',
}

/** The same domain as a NOUN PHRASE, so reason sentences read naturally. */
export const DOMAIN_REASON_NOUN: Record<DomainKey, string> = {
  mission_identity: 'mission and Catholic identity',
  governance: 'governance',
  leadership: 'leadership',
  academic_excellence: 'academic excellence',
  student_services: 'student services',
  hr: 'human resources',
  finance: 'finance',
  facilities: 'facilities',
  technology: 'technology',
  continuous_improvement: 'continuous improvement',
}

/**
 * Minimum EFFECTIVE leaf weight before a domain may carry a number. Applied to
 * `effectiveLeafWeight`, NOT to the raw leaf count — one standard's opinion is
 * not a percentage, and neither is three halves of one.
 */
export const MIN_DOMAIN_LEAVES = 3

/** Float tolerance for weight comparisons/sums. */
export const DOMAIN_WEIGHT_EPSILON = 1e-9

/**
 * A signal only counts toward a domain when its standard carries at least this
 * weight there. Without it, MSA-4's cash metrics would be reported as
 * "facilities signals" on the strength of a 0.25 share — a lie of attribution.
 */
export const SIGNAL_ATTRIBUTION_MIN_WEIGHT = 0.5

const DOMAIN_KEY_SET: ReadonlySet<string> = new Set<string>(DOMAIN_KEYS)

export function isDomainKey(v: unknown): v is DomainKey {
  return typeof v === 'string' && DOMAIN_KEY_SET.has(v)
}

/** domainKey → weight, already normalized (every value > 0, values sum to 1). */
export type DomainWeights = Readonly<Partial<Record<DomainKey, number>>>

/** standardId → weights. Built by the API from the catalog rows. */
export type DomainMap = Readonly<Record<string, DomainWeights>>

export interface DomainReadinessOptions {
  /** Override MIN_DOMAIN_LEAVES (tests only; production never passes it). */
  minLeaves?: number
  /** standardId → the metric keys bound to that standard. */
  signalKeys?: Readonly<Record<string, readonly string[]>>
}

/** ONE domain's reading. */
export interface DomainReadiness {
  domainKey: DomainKey
  label: string
  /** 0..100, or NULL whenever `measured === false`. NEVER 0-as-unknown. */
  readinessPct: number | null
  /** ≥1 leaf carries weight in this domain. */
  covered: boolean
  /** covered AND effectiveLeafWeight ≥ minLeaves. Only then is a number shown. */
  measured: boolean
  /** Human sentence, non-null whenever readinessPct is null; rendered VERBATIM. */
  reason: string | null
  /** Leaves with weight > 0 here (a 0.5-weight leaf counts as ONE leaf). */
  contributingLeafCount: number
  /** Σ of this domain's weights, rounded to 2dp. A 0.5/0.5 leaf reports 0.5. */
  effectiveLeafWeight: number
  /** Weighted DOCUMENTED (rubric-only) pct; null when !measured. */
  selfScoredPct: number | null
  /** Weighted DEFENSIBLE (evidence-only) pct; null when !measured. */
  verifiedPct: number | null
  /** DISTINCT metric keys bound to leaves with weight ≥ 0.5 here. Never null. */
  signalCount: number
  /**
   * DISTINCT metric keys bound to leaves that touch this domain but fall BELOW
   * the attribution floor (0 < weight < 0.5) — and are therefore reported under
   * whichever domain carries the larger share of that standard.
   *
   * It exists so a client never tells a school "unlock the HR module to light
   * this" while the very same metrics render live one card away under Finance.
   * MSA-4 is exactly that case: hr 0.25 → signalCount 0, partialSignalCount 2,
   * and the finance card shows those two signals. `signalCount === 0 &&
   * partialSignalCount > 0` is "reported elsewhere", not "nothing measured".
   */
  partialSignalCount: number
}

export interface DomainConfidence {
  /** round(100 × measuredDomains / 10) — the published size of the hole. */
  coveragePct: number
  measuredDomains: number
  /** Every domain with measured === false, in DOMAIN_KEYS order. */
  unmeasuredDomains: DomainKey[]
  /** One sentence, rendered VERBATIM on the hero chip + the print footer. */
  caveat: string
}

// ── Internals ────────────────────────────────────────────────────────────────

/** Round to 2 decimals — display/JSON hygiene only, never used as a divisor. */
function round2(x: number): number {
  return Math.round(x * 100) / 100
}

/**
 * A weight rendered LOSSLESSLY for the weights the seeds actually produce:
 * 3.5 → "3.5", 1.0 → "1", 0.25 → "0.25".
 *
 * One decimal is NOT enough. MSA-4 splits { finance ½, facilities ¼, hr ¼ }, and
 * a quarter rendered as "0.3" contradicts the `effectiveLeafWeight: 0.25` shipped
 * in the SAME object and persisted in the SAME snapshot — a 20% misstatement in
 * the one sentence this phase renders verbatim. Two decimals with trailing zeros
 * stripped covers every weight `normalizeDomainWeights` can emit from the seed
 * (halves, quarters, thirds) without ever printing a spurious ".00".
 */
function fmtWeight(w: number): string {
  const s = w.toFixed(2)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** The DOCUMENTED term for one leaf: rubric progress alone, 0..100. */
function selfScoreOf(leaf: ReadinessLeafInput): number {
  const score = normalizeRubricScore(leaf.rubricScore)
  return score === null ? 0 : (100 * (score - RUBRIC_MIN)) / (RUBRIC_MAX - RUBRIC_MIN)
}

/** The DEFENSIBLE term for one leaf: binary evidence alone, 0 or 100. */
function verifiedOf(leaf: ReadinessLeafInput): number {
  return leaf.evidenceCount > 0 ? 100 : 0
}

/**
 * Coerce one catalog row's stored mapping into normalized weights.
 *
 *   1. a valid `weights` object → keep known DomainKeys with a finite value > 0,
 *      then DIVIDE BY THE SUM so the row always contributes exactly 1.0. A seed
 *      typo (0.5 + 0.6) can therefore never inflate a school's effective leaf
 *      count — it can only mis-apportion one standard;
 *   2. else a known `domainKey` → { [domainKey]: 1 };
 *   3. else → {} — the row contributes to NO domain. This is legitimate and
 *      common: hand-made registers have no catalog row at all.
 */
export function normalizeDomainWeights(
  domainKey: string | null | undefined,
  weights: unknown,
): DomainWeights {
  if (weights !== null && typeof weights === 'object' && !Array.isArray(weights)) {
    const kept: Partial<Record<DomainKey, number>> = {}
    let sum = 0
    for (const [k, raw] of Object.entries(weights as Record<string, unknown>)) {
      if (!isDomainKey(k)) continue
      const v = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(v) || v <= 0) continue
      kept[k] = (kept[k] ?? 0) + v
      sum += v
    }
    if (sum > 0) {
      for (const k of Object.keys(kept) as DomainKey[]) kept[k] = (kept[k] as number) / sum
      return kept
    }
  }
  if (isDomainKey(domainKey)) return { [domainKey]: 1 }
  return {}
}

/** One domain's running accumulator. */
interface Acc {
  leaves: number
  weight: number
  readiness: number
  self: number
  verified: number
  signals: Set<string>
  partialSignals: Set<string>
}

/**
 * The ten domain readings over ONE framework's NON-ASSURANCE leaves.
 *
 * ALWAYS returns exactly DOMAIN_KEYS.length entries, in DOMAIN_KEYS order,
 * including uncovered domains (covered:false, every pct null, reason set) —
 * "your framework asks nothing here" is a finding, not an omission.
 */
export function computeDomainReadiness(
  leaves: readonly ReadinessLeafInput[],
  map: DomainMap,
  opts?: DomainReadinessOptions,
): DomainReadiness[] {
  const minLeaves = opts?.minLeaves ?? MIN_DOMAIN_LEAVES
  const signalsByStandard = opts?.signalKeys

  const acc = new Map<DomainKey, Acc>()
  for (const k of DOMAIN_KEYS) {
    acc.set(k, {
      leaves: 0,
      weight: 0,
      readiness: 0,
      self: 0,
      verified: 0,
      signals: new Set(),
      partialSignals: new Set(),
    })
  }

  for (const leaf of leaves) {
    const weights = map[leaf.standardId]
    if (!weights) continue
    const readiness = standardReadiness(leaf)
    const self = selfScoreOf(leaf)
    const verified = verifiedOf(leaf)
    const bound = signalsByStandard?.[leaf.standardId]
    for (const k of DOMAIN_KEYS) {
      const w = weights[k] ?? 0
      if (!(w > 0)) continue
      const a = acc.get(k) as Acc
      a.leaves += 1
      a.weight += w
      a.readiness += w * readiness
      a.self += w * self
      a.verified += w * verified
      // ATTRIBUTION FLOOR: a quarter-share of a standard does not make its
      // operating metrics "this domain's signals" — but it is not nothing
      // either, so the below-floor keys are counted separately rather than
      // dropped. That is what lets a card say "reported under Finance" instead
      // of "unlock the HR module" while HR numbers render one card away.
      if (bound) {
        const target =
          w >= SIGNAL_ATTRIBUTION_MIN_WEIGHT - DOMAIN_WEIGHT_EPSILON ? a.signals : a.partialSignals
        for (const key of bound) target.add(key)
      }
    }
  }

  return DOMAIN_KEYS.map((domainKey) => {
    const a = acc.get(domainKey) as Acc
    const covered = a.leaves > 0
    // Compare against the UNROUNDED sum; round2 is presentation only.
    const measured = covered && a.weight >= minLeaves - DOMAIN_WEIGHT_EPSILON
    const effectiveLeafWeight = round2(a.weight)
    // Every weight is ≤ 1, so the sum equals the count IFF every contributing
    // weight is exactly 1 — that is the fractional test, exactly, no heuristic.
    const fractional = Math.abs(a.weight - a.leaves) > DOMAIN_WEIGHT_EPSILON
    return {
      domainKey,
      label: DOMAIN_LABELS[domainKey],
      readinessPct: measured ? Math.round(a.readiness / a.weight) : null,
      covered,
      measured,
      reason: measured
        ? null
        : reasonFor(domainKey, covered, a.leaves, effectiveLeafWeight, fractional, minLeaves),
      contributingLeafCount: a.leaves,
      effectiveLeafWeight,
      selfScoredPct: measured ? Math.round(a.self / a.weight) : null,
      verifiedPct: measured ? Math.round(a.verified / a.weight) : null,
      signalCount: a.signals.size,
      // A key that clears the floor here is NOT also "partial" here.
      partialSignalCount: [...a.partialSignals].filter((k) => !a.signals.has(k)).length,
    }
  })
}

/** The frozen reason text. Rendered VERBATIM — never re-worded by a client. */
function reasonFor(
  domainKey: DomainKey,
  covered: boolean,
  leafCount: number,
  weight: number,
  fractional: boolean,
  minLeaves: number,
): string {
  const noun = DOMAIN_REASON_NOUN[domainKey]
  if (!covered) return `Your framework has no ${noun} standards`
  const plural = leafCount === 1 ? '' : 's'
  const counting = fractional ? ` counting for ${fmtWeight(weight)}` : ''
  return `Your framework has ${leafCount} ${noun} standard${plural}${counting} — fewer than the ${minLeaves} needed to score this domain.`
}

/**
 * The published size of the hole. This is the number that keeps the domain grid
 * honest: it says out loud how much of the ten-domain picture we can actually
 * measure, so nobody reads five confident cards as a whole-school verdict.
 */
export function computeDomainConfidence(
  domains: readonly DomainReadiness[],
  opts?: {
    unmappedLeafCount?: number
    /**
     * TRUE when the caller KNOWS the register is linked to an accreditor
     * framework. Without it, "nothing covered + unmapped rows" is indistinguishable
     * from "no framework adopted", and an MSA school whose catalog rows have not
     * been mapped yet would be told to "adopt a framework" directly under a hero
     * titled with the framework it has already adopted. The API passes
     * `framework != null`; a caller that genuinely does not know omits it.
     */
    frameworkLinked?: boolean
  },
): DomainConfidence {
  const total = DOMAIN_KEYS.length
  const measured = domains.filter((d) => d.measured).length
  const unmeasuredDomains = domains.filter((d) => !d.measured).map((d) => d.domainKey)
  const notInFramework = domains.filter((d) => !d.covered).length
  const tooFew = domains.filter((d) => d.covered && !d.measured).length
  const unmapped = opts?.unmappedLeafCount ?? 0
  const nothingCovered = domains.every((d) => d.contributingLeafCount === 0)

  let caveat: string
  if (measured === 0 && nothingCovered) {
    if (unmapped > 0 && opts?.frameworkLinked === true) {
      // Framework-LINKED but none of its standards carry a domain: a catalog
      // state, not a school action. Never tell this school to adopt a framework
      // — the hero above is already titled with the one they adopted.
      caveat = `Your framework's standards aren't mapped to domains in this build, so the domain grid can't be filled in yet. Your school-wide readiness figures are exact.`
    } else if (unmapped > 0) {
      caveat =
        "Your standards register isn't linked to an accreditor framework, so it can't be grouped into domains. Adopt a framework to see the domain grid."
    } else {
      caveat = "No standards yet. Adopt your accreditor's framework to see the domain grid."
    }
  } else if (measured === 0) {
    caveat =
      'No domain has enough standards to score on its own. Your school-wide readiness figures are exact; the domain grid shows what your framework covers.'
  } else if (measured === total) {
    caveat = `All ${total} domains carry enough standards to score.`
  } else {
    caveat = `Based on ${measured} of ${total} domains.`
    if (notInFramework > 0) caveat += ` ${notInFramework} not in your framework;`
    if (tooFew > 0) caveat += ` ${tooFew} with too few standards to score.`
  }

  // The "not linked to a framework" branch already says everything there is to
  // say about unmapped rows, so the clause is appended to the other three only.
  if (!(measured === 0 && nothingCovered) && unmapped > 0) {
    caveat += ` ${unmapped} standard${unmapped === 1 ? '' : 's'} in this framework ${unmapped === 1 ? 'is' : 'are'} not mapped to a domain.`
  }

  return {
    coveragePct: Math.round((100 * measured) / total),
    measuredDomains: measured,
    unmeasuredDomains,
    caveat,
  }
}

import {
  ACCREDITATION_TWIN_VERSION,
  TWIN_RULE_DEFS,
  deriveTwin,
  type DomainKey,
  type PriorFact,
  type TwinFinding,
  type TwinRegisterView,
  type TwinResult,
  type TwinSignalView,
} from '@finrep/compliance'
import { emptyTwinRegister } from './twin-register.service.js'
import type { FiredFinding, TwinRule, TwinSignalKey, TwinSignalSet } from './twin-contract.js'
import type { FindingHorizonKind, FindingLikelihood, FindingSeverity } from './finding-vocab.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — THE ADAPTER: 26 pure rule definitions, one derivation.
//
// Phase D's `TwinRule` contract is `evaluate(signals, at) => FiredFinding[]`,
// SYNCHRONOUS and per-rule. The pure engine's contract is one `deriveTwin` over
// the whole catalog — because the rules genuinely share work (the risk math, the
// domain bands, the `notEvaluated` bookkeeping) and running them 26 times
// independently would recompute all of it 26 times AND make `notEvaluated`
// impossible to assemble.
//
// So this file bridges the two WITHOUT changing either: 26 `TwinRule` objects,
// each delegating to a `deriveTwin` MEMOISED on the `TwinSignalSet` OBJECT
// IDENTITY. Twenty-six evaluations, one derivation. A spec spies the memo and
// asserts exactly that.
//
// ── WHY A WeakMap AND NOT A FIELD ON TwinSignalSet ──────────────────────────
//
// FROZEN: `TwinSignalSet` is extended by nobody. It is Phase D's frozen contract
// and the collector's return shape; hanging a register and a prior-fact map off
// it would make the twin's read model part of the signal contract, and every
// future consumer of `collect()` would inherit fields it has no use for.
//
// Instead `TwinContextRegistry` is a `WeakMap<TwinSignalSet, TwinContext>`:
// `EarlyWarningService.prepare()` registers the register view and the priors
// against the set it just collected, and the adapter reads them back. The set
// object is the key, so the entry dies with it — no eviction policy, no leak, no
// cross-school bleed (a different school is a different object).
//
// A set that was never prepared resolves to an EMPTY register and NO priors. That
// is not a silent failure: every `needsRegister` rule then reports `no_standards`
// and every comparison rule reports `no_prior_observation`, both of which are
// honest "we could not look" answers that name their own blocker. The engine has
// no path that turns a missing context into a finding.
// ─────────────────────────────────────────────────────────────────────────────

export interface TwinContext {
  register: TwinRegisterView
  priors: Readonly<Record<string, PriorFact>>
}

/**
 * Per-`TwinSignalSet` context + memoised derivation. Module-scope singleton,
 * wired in `TwinModule`; a `WeakMap` so nothing here outlives the signal set.
 */
export class TwinContextRegistry {
  private readonly context = new WeakMap<TwinSignalSet, TwinContext>()
  private readonly derived = new WeakMap<TwinSignalSet, TwinResult>()

  set(signals: TwinSignalSet, ctx: TwinContext): void {
    this.context.set(signals, ctx)
    // A re-prepare invalidates the memo: the register may have moved.
    this.derived.delete(signals)
  }

  contextFor(signals: TwinSignalSet): TwinContext {
    return this.context.get(signals) ?? { register: emptyTwinRegister(), priors: {} }
  }

  /** THE one derivation per signal set. Every rule's `evaluate` funnels here. */
  derive(signals: TwinSignalSet, at: Date): TwinResult {
    const memo = this.derived.get(signals)
    if (memo) return memo
    const { register, priors } = this.contextFor(signals)
    const result = deriveTwin(
      signals.signals as readonly TwinSignalView[],
      register,
      TWIN_RULE_DEFS,
      isoDay(at),
      { priorFacts: priors },
    )
    this.derived.set(signals, result)
    return result
  }

  /**
   * A derivation with the API-resolved `primaryDomainByFactKey` map folded in —
   * used by the READ model only, never by rule evaluation.
   *
   * Two calls, and the reason is structural rather than lazy: the map is keyed on
   * factKey, so it cannot exist until the facts do. `resolvePrimaryDomains` (the
   * ONE authority on the >= 0.5 attribution rule) needs fired findings as input
   * and lives in apps/api because it consumes the catalog weight map. `deriveTwin`
   * is pure and deterministic, so deriving twice on one input is byte-identical by
   * construction — the second pass changes `domainBands` and nothing else.
   *
   * The RULE path deliberately does NOT take this route: reconciliation resolves
   * primary domains itself, from the same authority, on the findings this returns.
   */
  deriveWithDomains(
    signals: TwinSignalSet,
    at: Date,
    primaryDomainByFactKey: Readonly<Record<string, DomainKey>>,
  ): TwinResult {
    const { register, priors } = this.contextFor(signals)
    return deriveTwin(
      signals.signals as readonly TwinSignalView[],
      register,
      TWIN_RULE_DEFS,
      isoDay(at),
      { priorFacts: priors, primaryDomainByFactKey },
    )
  }
}

/** The module-scope singleton the reconciliation's `TWIN_RULES` is built against. */
export const globalTwinCache = new TwinContextRegistry()

/** UTC calendar day — the pure engine takes `now` as a yyyy-mm-dd STRING. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * The 26 rules, as Phase D's ledger wants them.
 *
 * `requiredSignals = [...requiredAvailable, ...requiredAbsent]` — deliberately
 * BOTH, and with no Phase-D edit. Phase D uses `requiredSignals` for two things:
 * `basisSignals` (what the stored basis chain records) and `resolutionFor` (why a
 * finding stopped firing). An absence-gated rule's basis is incomplete without the
 * signal whose ABSENCE is the fact, and a rule that stops firing because that
 * signal became readable has genuinely stopped being evaluable the old way.
 * Including both keys makes each of those answers correct for free.
 */
export function buildTwinRules(cache: TwinContextRegistry = globalTwinCache): TwinRule[] {
  return TWIN_RULE_DEFS.map((def) => ({
    id: def.id,
    requiredSignals: [...def.requiredAvailable, ...def.requiredAbsent] as readonly TwinSignalKey[],
    evaluate: (signals: TwinSignalSet, at: Date): FiredFinding[] => {
      const result = cache.derive(signals, at)
      return result.findings.filter((f) => f.ruleId === def.id).map(toFiredFinding)
    },
  }))
}

/**
 * `TwinFinding` → `FiredFinding`. A pure re-shape and NOT a re-wording: `title`,
 * `rationale` and `consequence` are copied VERBATIM into the basis payload, exactly
 * as the pure engine composed and numerically validated them. Nothing downstream —
 * not the ledger, not the briefing, not the digest, not Penny — ever recomposes a
 * sentence about a number.
 */
export function toFiredFinding(f: TwinFinding): FiredFinding {
  const kind = f.horizon.kind as FindingHorizonKind
  return {
    ruleId: f.ruleId,
    scopeKey: f.scopeKey,
    factKey: f.factKey,
    standardTags: [...f.standardTags],
    domainKeys: [...f.domainKeys],
    defaultDomainKey: f.defaultDomainKey,
    severity: f.severity as FindingSeverity,
    likelihood: f.likelihood as FindingLikelihood,
    confidence: f.confidence,
    horizonKind: kind,
    horizonDate:
      kind === 'by_date' && typeof f.horizon.value === 'string'
        ? new Date(`${f.horizon.value}T00:00:00.000Z`)
        : null,
    horizonPeriods:
      kind === 'periods_to_breach' && typeof f.horizon.value === 'number' ? f.horizon.value : null,
    horizonConfidence: f.horizon.confidence ?? null,
    evidencePayload: {
      engine: ACCREDITATION_TWIN_VERSION,
      title: f.title,
      rationale: f.rationale,
      consequence: f.consequence,
      likelihood: f.likelihood,
      confidence: f.confidence,
      horizon: f.horizon,
      // THE BASIS CHAIN. Every numeral in `rationale` is one of these `display`s.
      evidence: f.evidence,
      standardTags: [...f.standardTags],
      scopeKey: f.scopeKey,
    },
  }
}

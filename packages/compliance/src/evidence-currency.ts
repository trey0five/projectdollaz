// ─────────────────────────────────────────────────────────────────────────────
// Accreditation Intelligence Phase C — PURE evidence CURRENCY.
//
// The frozen readiness engine answers "does an artifact exist?". This module
// answers the question a visiting team actually asks: "does it exist, is it
// dated, and is it still current?" — or refuses to answer, by name.
//
// THE ONE HONESTY RULE THAT GOVERNS EVERY LINE BELOW: we never infer a
// document's date, and "we don't track this" is a first-class answer that is
// excluded from every denominator and says which of the two kinds of not-tracked
// it is (the accreditor's portal owns it, or we simply have not built the intake
// yet). An artifact with no resolvable anchor is `unknown` — never `current`
// (which would be false confidence) and never `stale` (which would be a
// fabricated accusation). `unknown` sits in NEITHER side of the health ratio, so
// a school can never reach a flattering number by dating nothing: it reaches no
// number and a sentence.
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no clock, no I/O, no
// randomness, no React/DOM. `now` arrives as a caller-supplied value whose UTC
// accessors are only ever READ (identical to computeReviewStatus's contract) and
// every piece of date arithmetic runs through the shared civil-day helpers in
// ./review-status.js, so the cycle authority and this module can never drift.
// ─────────────────────────────────────────────────────────────────────────────

import { EVIDENCE_TAGS, type EvidenceTag } from './accreditation-readiness.js'
import {
  DUE_SOON_DAYS,
  addMonths,
  civilToIso,
  computeReviewStatus,
  daysFromCivil,
  toCivil,
} from './review-status.js'

export const EVIDENCE_CURRENCY_VERSION = '1.0.0'

// ── The requirement-tag vocabulary ───────────────────────────────────────────

/**
 * Phase-C additions: artifacts an accreditor asks for that the 12-tag matcher
 * vocabulary never needed, because nothing in KYRO could suggest them.
 *
 * EVIDENCE_TAGS lives in the FROZEN accreditation-readiness.ts and must not
 * grow — it drives the deterministic suggestion matcher, whose output is pinned
 * byte-for-byte. This file imports it read-only and publishes the superset.
 */
export const REQUIREMENT_EXTRA_TAGS = [
  'curriculum_review', // PLATFORM via the Policy convention (ledger row 23)
  'self_study', // external — portal-owned
  'compliance_attestation', // external — portal-owned
  'accreditor_training', // external — portal-owned
  'staff_evaluation', // intake  (Phase F)
  'inspection', // intake  (Phase F — MaintenanceItem.complianceKind)
  'pd_records', // intake  (Phase K)
  'safe_environment', // integration (Phase K — VIRTUS / CMG Connect)
  'assessment_results', // integration (deferred indefinitely — ledger row 32)
] as const

export const REQUIREMENT_TAGS = [...EVIDENCE_TAGS, ...REQUIREMENT_EXTRA_TAGS] as const
export type RequirementTag = (typeof REQUIREMENT_TAGS)[number]

export function isRequirementTag(v: unknown): v is RequirementTag {
  return typeof v === 'string' && (REQUIREMENT_TAGS as readonly string[]).includes(v)
}

/** Re-exported for callers that only need the frozen 12 (never widened here). */
export type { EvidenceTag }

// ── The source-register vocabulary ───────────────────────────────────────────

/**
 * WHERE the artifact that answers a requirement already lives.
 *
 * `governance_report` is deliberately NOT a source register: it is composed live
 * from live data and has no date of its own, so treating it as an anchor would
 * make it eternally "current". It remains attachable as manual evidence and
 * evaluates as `unknown` unless the school dates it.
 */
export const SOURCE_REGISTERS = [
  // Resolvers SHIP in Phase C:
  'policy',
  'meeting',
  'strategic_plan',
  'period_budget',
  'enrollment_snapshot',
  'knowledge_document',
  'board_report',
  // FORWARD-DECLARED — named so the card can say what would light it. No
  // resolver in Phase C; the row renders not_tracked until its phase lands.
  'maintenance_item',
  'staff_evaluation_register',
  'professional_development',
  'clearance_register',
  'lms',
  'portal',
] as const
export type SourceRegister = (typeof SOURCE_REGISTERS)[number]

export function isSourceRegister(v: unknown): v is SourceRegister {
  return typeof v === 'string' && (SOURCE_REGISTERS as readonly string[]).includes(v)
}

// ── Core types ───────────────────────────────────────────────────────────────

export type CurrencyState = 'current' | 'expiring' | 'stale' | 'missing' | 'unknown' | 'not_tracked'

/**
 * THE MOST IMPORTANT FIELD IN THIS PROGRAM.
 *
 *   platform    — KYRO holds the owning register TODAY. A real currency state.
 *   intake      — a register we have not built yet. Renders not_tracked.
 *   integration — a third-party system we are not connected to. not_tracked.
 *   external    — the accreditor's portal owns it. not_tracked, UNCONDITIONALLY:
 *                 letting a convenience copy in KYRO flip the state would let a
 *                 stale portal look current here.
 *
 * Everything that is not `platform` is excluded from EVERY denominator. A school
 * is never scored down for a hole we chose not to dig.
 */
export type DataAvailability = 'platform' | 'intake' | 'integration' | 'external'

export type WindowKind = 'fixed' | 'source_interval'

export type CurrencyBasis =
  | 'explicit_expiry'
  | 'source_interval'
  | 'fixed_window'
  | 'no_anchor'
  | 'no_artifact'
  | 'not_tracked'

/**
 * Delegation to the owning register's own cycle. The cycle is READ LIVE from
 * that register on every request — we never copy a date into the evidence row,
 * so editing a policy's review interval in Governance moves the evidence state
 * with no second edit anywhere.
 */
export type EvidenceCycle =
  | {
      kind: 'policy_review'
      adoptedDate: string | null
      lastReviewedDate: string | null
      reviewIntervalMonths: number
      status?: string
    }
  | { kind: 'plan_term'; endDate: string | null }

export interface RequirementInput {
  tag: string
  label: string
  windowMonths: number | null
  windowKind: WindowKind
  dataAvailability: DataAvailability
  sourceRegister: string | null
  notTrackedReason?: string | null
}

export interface ArtifactInput {
  /** Stable identity: `${sourceType}:${sourceRef ?? ''}` for links, `evidence:${id}` for manual. */
  key: string
  origin: 'attached' | 'auto'
  sourceType: string
  sourceRef: string | null
  label: string
  /** The artifact's OWN effective date, yyyy-mm-dd. NEVER an upload/created date. */
  effectiveDate: string | null
  /** Explicit school-set expiry; it wins over every computed expiry date. */
  expiresAt: string | null
  cycle: EvidenceCycle | null
  alsoInPortal: boolean | null
  link: string | null
  /** Frozen note, non-null only when origin === 'auto'. */
  autoLinkedNote: string | null
}

export interface CurrencyResult {
  state: CurrencyState
  /** yyyy-mm-dd the artifact stops being current; null when not computable. */
  expiresOn: string | null
  /** Whole days until expiry; negative = overdue by N; null when unknown. */
  daysUntilExpiry: number | null
  /** VERBATIM client sentence. NEVER null. */
  message: string
  basis: CurrencyBasis
}

export interface RequirementCurrency extends CurrencyResult {
  tag: string
  label: string
  dataAvailability: DataAvailability
  sourceRegister: string | null
  windowKind: WindowKind
  windowMonths: number | null
  /** Every candidate, each with its own result, best-first by CURRENCY_RANK. */
  artifacts: (ArtifactInput & CurrencyResult)[]
  /** True when the winning artifact came from a live register, not an evidence row. */
  autoSatisfied: boolean
  alsoInPortal: boolean | null
}

export interface EvidenceHealth {
  /** 100 × current / rated. NULL when rated === 0 — never 0-as-unknown. */
  evidenceHealthPct: number | null
  rated: number
  current: number
  expiring: number
  stale: number
  missing: number
  unknown: number
  notTracked: number
  /** One sentence, rendered VERBATIM on the tab header and the print footer. */
  basis: string
}

// ── Frozen constants ─────────────────────────────────────────────────────────

/**
 * Cap on the "expiring" lead. A TUNABLE SECTOR DEFAULT, documented as such (the
 * DEFAULT_BANDS / expectedCadenceDays precedent) — not a frozen constant.
 */
export const EXPIRING_LEAD_CAP_DAYS = 90

/** One third of the window, capped: 6mo → 60d, 12mo → 90d, 18/24/36/60/84 → 90d. */
export function expiringLeadDaysFor(windowMonths: number): number {
  if (!Number.isFinite(windowMonths) || windowMonths <= 0) return 0
  return Math.min(EXPIRING_LEAD_CAP_DAYS, Math.trunc(windowMonths) * 10)
}

/**
 * Worst-first ordering.
 *
 * WHY `unknown` OUTRANKS `stale`. One stale audit plus one undated audit is not
 * a stale requirement — we KNOW one is out of date and we CANNOT JUDGE the
 * other, and the honest reading is the weaker claim, not the worse one. This can
 * never inflate a score: `unknown` is excluded from the health denominator
 * entirely, so the row simply moves off the "renew this" list and onto the
 * "date this" list.
 */
export const CURRENCY_RANK: Record<CurrencyState, number> = {
  current: 0,
  expiring: 1,
  unknown: 2,
  stale: 3,
  missing: 4,
  not_tracked: 5,
}

export const CURRENCY_LABEL: Record<CurrencyState, string> = {
  current: 'Current',
  expiring: 'Expiring',
  stale: 'Out of date',
  missing: 'Missing',
  unknown: 'Date unknown',
  not_tracked: 'Not tracked',
}

/**
 * The FROZEN client-facing not-tracked wording, rendered VERBATIM by every
 * surface — the web composes no honesty copy of its own.
 *
 * FORBIDDEN COPY anywhere in this phase: any sentence implying KYRO can see
 * curriculum content, assessment growth, PD participation, teacher turnover or
 * Safe-Environment status. `not_tracked` says what it would TAKE, never what it
 * would say.
 */
export const NOT_TRACKED_LEAD: Record<Exclude<DataAvailability, 'platform'>, (label: string) => string> =
  {
    external: (l) => `${l} is tracked in your accreditor portal — KYRO doesn't hold it.`,
    intake: (l) => `${l} isn't tracked yet.`,
    integration: (l) => `${l} isn't tracked yet — it needs a system KYRO isn't connected to.`,
  }

// ── Internals ────────────────────────────────────────────────────────────────

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** UTC calendar day of `now` as a day number (accessor reads only — no Date built). */
function todayDays(now: Date): number {
  return daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
}

/** yyyy-mm-dd → days since epoch, or null when unparseable. */
function dayNumber(iso: string): number | null {
  const c = toCivil(iso)
  if (c === null) return null
  return daysFromCivil(c.y, c.m, c.d)
}

function notTrackedResult(req: RequirementInput): CurrencyResult {
  const availability = req.dataAvailability as Exclude<DataAvailability, 'platform'>
  const lead = NOT_TRACKED_LEAD[availability]
  const head = lead ? lead(req.label) : `${req.label} isn't tracked yet.`
  const why = (req.notTrackedReason ?? '').trim()
  return {
    state: 'not_tracked',
    expiresOn: null,
    daysUntilExpiry: null,
    message: why ? `${head} ${why}` : head,
    basis: 'not_tracked',
  }
}

function unknownResult(artifactLabel: string): CurrencyResult {
  return {
    state: 'unknown',
    expiresOn: null,
    daysUntilExpiry: null,
    message: `We found ${artifactLabel}, but we don't know which period it covers. Tell us and we'll track when it goes stale — we won't guess.`,
    basis: 'no_anchor',
  }
}

/** Step 6 of the frozen algorithm: an expiry date + a lead → a state + a sentence. */
function fromExpiry(
  req: RequirementInput,
  expiresOn: string,
  basis: CurrencyBasis,
  now: Date,
  artifactLabel: string,
): CurrencyResult {
  const expiryDays = dayNumber(expiresOn)
  if (expiryDays === null) return unknownResult(artifactLabel)
  const daysUntilExpiry = expiryDays - todayDays(now)
  const lead =
    req.windowKind === 'fixed' && req.windowMonths != null
      ? expiringLeadDaysFor(req.windowMonths)
      : DUE_SOON_DAYS

  if (daysUntilExpiry < 0) {
    return {
      state: 'stale',
      expiresOn,
      daysUntilExpiry,
      message: `Out of date by ${plural(-daysUntilExpiry, 'day')} — expired ${expiresOn}.`,
      basis,
    }
  }
  if (daysUntilExpiry <= lead) {
    return {
      state: 'expiring',
      expiresOn,
      daysUntilExpiry,
      message: `Expires in ${plural(daysUntilExpiry, 'day')}, on ${expiresOn}.`,
      basis,
    }
  }
  return {
    state: 'current',
    expiresOn,
    daysUntilExpiry,
    message:
      basis === 'source_interval'
        ? `Current — next review due ${expiresOn}.`
        : `Current — ${req.label} runs to ${expiresOn}.`,
    basis,
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * ONE artifact judged against ONE requirement. The FROZEN anchor-priority ladder
 * (first hit wins, no fall-through):
 *
 *   1. an explicit school-set `expiresAt`
 *   2. the OWNING REGISTER's cycle, when windowKind === 'source_interval' — read
 *      live on every request; the date is never copied into the evidence row
 *   3. the artifact's own effectiveDate + the requirement's fixed window
 *   4. nothing → `unknown`. NEVER a guess, and never a silent zero.
 */
export function computeArtifactCurrency(
  req: RequirementInput,
  art: ArtifactInput | null,
  now: Date,
): CurrencyResult {
  // 1. Non-platform is not_tracked UNCONDITIONALLY — even when a school has
  //    attached a dated, in-window copy. For an `external` requirement the
  //    accreditor's portal is the authoritative record, and letting a
  //    convenience copy here flip the state would let a stale portal look
  //    current in KYRO. The copies are still listed with their dates.
  if (req.dataAvailability !== 'platform') return notTrackedResult(req)

  // 2. Nothing on file at all.
  if (art === null) {
    return {
      state: 'missing',
      expiresOn: null,
      daysUntilExpiry: null,
      message: `No ${req.label} on file.`,
      basis: 'no_artifact',
    }
  }

  // 3. An explicit school-set expiry beats every computed expiry date.
  if (art.expiresAt != null) {
    return fromExpiry(req, art.expiresAt, 'explicit_expiry', now, art.label)
  }

  // 4. The window lives in the owning register.
  if (req.windowKind === 'source_interval') {
    const cycle = art.cycle
    if (cycle === null) return unknownResult(art.label)

    if (cycle.kind === 'policy_review') {
      // VERBATIM delegation: the register owns its own lead (DUE_SOON_DAYS) as
      // well as its own interval, so the Governance register and the Evidence
      // Index can never disagree about whether a policy is due.
      const review = computeReviewStatus(
        {
          adoptedDate: cycle.adoptedDate,
          lastReviewedDate: cycle.lastReviewedDate,
          reviewIntervalMonths: cycle.reviewIntervalMonths,
          ...(cycle.status !== undefined ? { status: cycle.status } : {}),
        },
        now,
      )
      if (review.status === 'unknown' || review.nextReviewDate === null) {
        // The cycle authority itself declined to name a date. We do not
        // manufacture one — that is the same refusal, forwarded.
        return unknownResult(art.label)
      }
      const expiresOn = review.nextReviewDate
      const daysUntilExpiry = review.daysUntilDue
      if (review.status === 'overdue') {
        return {
          state: 'stale',
          expiresOn,
          daysUntilExpiry,
          message: `Out of date by ${plural(-(daysUntilExpiry ?? 0), 'day')} — expired ${expiresOn}.`,
          basis: 'source_interval',
        }
      }
      if (review.status === 'due-soon') {
        return {
          state: 'expiring',
          expiresOn,
          daysUntilExpiry,
          message: `Expires in ${plural(daysUntilExpiry ?? 0, 'day')}, on ${expiresOn}.`,
          basis: 'source_interval',
        }
      }
      return {
        state: 'current',
        expiresOn,
        daysUntilExpiry,
        message: `Current — next review due ${expiresOn}.`,
        basis: 'source_interval',
      }
    }

    // cycle.kind === 'plan_term'
    if (cycle.endDate == null) return unknownResult(art.label)
    return fromExpiry(req, cycle.endDate, 'source_interval', now, art.label)
  }

  // 5. A fixed window measured from the artifact's OWN effective date.
  if (art.effectiveDate == null) return unknownResult(art.label)
  if (req.windowMonths == null) return unknownResult(art.label)
  const anchor = toCivil(art.effectiveDate)
  if (anchor === null) return unknownResult(art.label)
  const expiresOn = civilToIso(addMonths(anchor, Math.trunc(req.windowMonths)))
  return fromExpiry(req, expiresOn, 'fixed_window', now, art.label)
}

/**
 * ONE requirement judged against every candidate artifact — attached AND
 * auto-resolved. The head of the CURRENCY_RANK ordering is the requirement's
 * answer; ties go to the school's own attached row, so a school-set date or
 * expiry always overrides the auto-resolved view of the same artifact.
 */
export function computeRequirementCurrency(
  req: RequirementInput,
  artifacts: readonly ArtifactInput[],
  now: Date,
): RequirementCurrency {
  const judged = artifacts.map((a) => ({ ...a, ...computeArtifactCurrency(req, a, now) }))
  judged.sort((a, b) => {
    const r = CURRENCY_RANK[a.state] - CURRENCY_RANK[b.state]
    if (r !== 0) return r
    const o = (a.origin === 'attached' ? 0 : 1) - (b.origin === 'attached' ? 0 : 1)
    if (o !== 0) return o
    return a.key.localeCompare(b.key)
  })

  const head = judged.length > 0 ? judged[0] : null
  const result: CurrencyResult = head
    ? { state: head.state, expiresOn: head.expiresOn, daysUntilExpiry: head.daysUntilExpiry, message: head.message, basis: head.basis }
    : computeArtifactCurrency(req, null, now)

  // We NEVER assert on the school's behalf: null means NOT ASSERTED, and the UI
  // renders it as an em dash, never as "No".
  let alsoInPortal: boolean | null = null
  for (const a of judged) {
    if (a.alsoInPortal === true) {
      alsoInPortal = true
      break
    }
    if (a.alsoInPortal === false) alsoInPortal = false
  }

  return {
    ...result,
    tag: req.tag,
    label: req.label,
    dataAvailability: req.dataAvailability,
    sourceRegister: req.sourceRegister,
    windowKind: req.windowKind,
    windowMonths: req.windowMonths,
    artifacts: judged,
    autoSatisfied: head !== null && head.origin === 'auto',
    alsoInPortal,
  }
}

/**
 * THE UNDATED RULE, MADE ARITHMETIC.
 *
 *   rated = current + expiring + stale + missing
 *   evidenceHealthPct = rated === 0 ? null : round(100 × current / rated)
 *
 * `unknown` and `notTracked` are in NEITHER the numerator NOR the denominator.
 * A school cannot reach a flattering number by dating nothing — it reaches no
 * number and a sentence, which is why `basis` is a required part of the shape
 * and the UI is contractually obliged to render it beside the figure.
 *
 * This is a DIFFERENTLY SCALED dimension, never a second readiness percentage.
 */
export function computeEvidenceHealth(rows: readonly RequirementCurrency[]): EvidenceHealth {
  let current = 0
  let expiring = 0
  let stale = 0
  let missing = 0
  let unknown = 0
  let notTracked = 0
  for (const r of rows) {
    if (r.state === 'current') current += 1
    else if (r.state === 'expiring') expiring += 1
    else if (r.state === 'stale') stale += 1
    else if (r.state === 'missing') missing += 1
    else if (r.state === 'unknown') unknown += 1
    else notTracked += 1
  }
  const rated = current + expiring + stale + missing
  const excluded = unknown + notTracked

  let basis = `Based on ${rated} of ${rated + excluded} required artifacts.`
  if (unknown > 0) basis += ` ${unknown} undated`
  if (notTracked > 0) basis += `${unknown > 0 ? ' and' : ''} ${notTracked} not tracked in KYRO`
  if (excluded > 0) basis += ' excluded.'

  return {
    evidenceHealthPct: rated === 0 ? null : Math.round((100 * current) / rated),
    rated,
    current,
    expiring,
    stale,
    missing,
    unknown,
    notTracked,
    basis,
  }
}

// ── The DEFENSIBLE component, upgraded ───────────────────────────────────────

export interface CurrencyLeafInput {
  standardId: string
  evidenceCount: number
  currentEvidenceCount: number
}

/**
 * Phase-C DEFENSIBLE readiness: a leaf counts when it holds evidence we cannot
 * PROVE is out of date. Same shape and rounding as Phase A's `verifiedPct`, so
 * the reduction is provable by test — when currentEvidenceCount === evidenceCount
 * for every leaf the two functions are byte-identical.
 *
 * We do NOT assert staleness we cannot prove, in either direction: undated legacy
 * evidence still counts here. The pressure to date documents lives on the
 * Evidence Index (evidenceHealthPct, which excludes `unknown`), where it belongs
 * — not in a silent sixty-point drop on the hero on deploy day.
 */
export function verifiedPctCurrent(leaves: readonly CurrencyLeafInput[]): number {
  if (leaves.length === 0) return 0
  let covered = 0
  for (const l of leaves) if (l.currentEvidenceCount > 0) covered += 1
  return Math.round((100 * covered) / leaves.length)
}

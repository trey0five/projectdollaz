// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Accreditation v1 — PURE, framework-free, INJECTABLE-`now` coverage +
// review-urgency helper, shared by BOTH the accreditation AccreditationService (to
// enrich each list response) AND the analytics BriefingService (the new
// 'accreditation' STEP). One source of truth → the register list and the briefing
// can never disagree about coverage or review urgency (mirrors computeReviewStatus).
//
// DETERMINISM CONTRACT: like review-status.ts, this module reads NOTHING ambient —
// it never constructs a Date, never calls the clock, never touches I/O. It obeys
// the package PURITY GUARD (__tests__/purity.test.ts forbids the Date tokens): all
// date math is integer day-numbers via the shared daysFromCivil/toCivil helpers, so
// the same (input, now) ALWAYS yields the same result on any host/timezone.
//
// COVERAGE IS BINARY (v1): there is NO evidence verification/lifecycle state, so a
// standard is strictly 'no-evidence' vs 'covered' — an evidence row counts the
// moment it exists. No 'in-progress'/'partial' tier (deferred). This keeps the
// derivation trivially testable and mirrors the Governance pattern (a policy is
// active/not, not partially-active).
// ─────────────────────────────────────────────────────────────────────────────
import { daysFromCivil, toCivil, type ReviewStatus } from './review-status.js'

export type CoverageStatus = 'no-evidence' | 'covered'

/**
 * Default "review approaching" horizon for accreditation. DELIBERATELY WIDER than
 * the governance/AUP DUE_SOON_DAYS=60: accreditation review cycles are multi-year,
 * so schools begin assembling evidence months out — a visit within ~6 months is
 * "approaching". A dedicated constant (not the shared 60) is the better-justified
 * choice for this domain.
 */
export const ACCREDITATION_REVIEW_SOON_DAYS = 180

export interface StandardCoverageInput {
  evidenceCount: number
  /** yyyy-mm-dd string, a JS Date (@db.Date), or null. The next review/visit date. */
  reviewDate?: Date | string | null
}

export interface StandardCoverage {
  evidenceCount: number
  coverage: CoverageStatus
  /** REVIEW URGENCY (reuses the review-status date discipline). 'unknown' when no date. */
  reviewStatus: ReviewStatus
  /** Whole UTC days until the review; negative = overdue by N days; null when no date. */
  daysUntilReview: number | null
}

export interface SchoolCoverageSummary {
  total: number
  withEvidence: number
  /** === total - withEvidence. The headline "N of M standards still need evidence". */
  gaps: number
  /** 0..100 integer; 0 when total===0. */
  pctCovered: number
}

/** Binary coverage from an evidence count: 0 → 'no-evidence', else 'covered'. */
export function coverageForStandard(evidenceCount: number): CoverageStatus {
  return evidenceCount > 0 ? 'covered' : 'no-evidence'
}

/**
 * Full per-standard coverage: binary coverage + banded review urgency. `now` is
 * INJECTED for determinism (tests pin a fixed value; callers pass the current
 * time — only its UTC accessors are read, never a Date constructed).
 *
 * Review banding (an accreditation reviewDate is the review date DIRECTLY, unlike a
 * policy's anchor + interval, so we do NOT call computeReviewStatus):
 *   daysUntilReview = (reviewDate - today) in whole UTC days
 *   status = overdue (<0) | due-soon (0..soonDays) | current (>) | unknown (no date)
 */
export function computeStandardCoverage(
  input: StandardCoverageInput,
  now: Date,
  soonDays = ACCREDITATION_REVIEW_SOON_DAYS,
): StandardCoverage {
  const coverage = coverageForStandard(input.evidenceCount)
  const civil = toCivil(input.reviewDate ?? null)
  if (civil === null) {
    return { evidenceCount: input.evidenceCount, coverage, reviewStatus: 'unknown', daysUntilReview: null }
  }
  const reviewDays = daysFromCivil(civil.y, civil.m, civil.d)
  const todayDays = daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const daysUntilReview = reviewDays - todayDays
  let reviewStatus: ReviewStatus
  if (daysUntilReview < 0) reviewStatus = 'overdue'
  else if (daysUntilReview <= soonDays) reviewStatus = 'due-soon'
  else reviewStatus = 'current'
  return { evidenceCount: input.evidenceCount, coverage, reviewStatus, daysUntilReview }
}

/**
 * Roll a list of per-standard evidence counts up into the school coverage summary.
 * total===0 → { total:0, withEvidence:0, gaps:0, pctCovered:0 } (honest empty).
 */
export function summarizeCoverage(
  standards: readonly { evidenceCount: number }[],
): SchoolCoverageSummary {
  const total = standards.length
  const withEvidence = standards.filter((s) => s.evidenceCount > 0).length
  const gaps = total - withEvidence
  const pctCovered = total === 0 ? 0 : Math.round((withEvidence / total) * 100)
  return { total, withEvidence, gaps, pctCovered }
}

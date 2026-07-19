// ─────────────────────────────────────────────────────────────────────────────
// @finrep/db/enrollment-types — Phase 2 SEAM types for the enrollment pipeline.
//
// Pure TS (no Prisma import). The ONE normalized snapshot shape every enrollment
// adapter (OneRoster CSV, Blackbaud, OneRoster REST, FACTS, Veracross, manual)
// produces and the API's promote/summary paths consume — so a new provider only
// has to emit this shape. Grade keys are the analytics `GradeKey` union (PK3..12)
// so byGrade lines up with the driver model's enrollmentByGrade with no re-keying.
// ─────────────────────────────────────────────────────────────────────────────
import type { DemographicBreakdown, GradeKey } from '@finrep/analytics'

export type { DemographicBreakdown } from '@finrep/analytics'

/** The enrollment/SIS provider keys — MUST mirror the Prisma EnrollmentProvider enum. */
export type EnrollmentProviderKey =
  | 'oneroster_csv'
  | 'oneroster_api'
  | 'blackbaud'
  | 'facts'
  | 'veracross'
  | 'manual'
  // Granular diocesan enrollment — one org file routed to many schools by name.
  | 'diocesan_csv'
  | 'diocesan_api'

/**
 * A normalized, provider-agnostic roster observation as of a single date. This is
 * the value an adapter returns; the API stamps it with a resolved fiscalPeriodId,
 * upserts it as an EnrollmentSnapshot, and promotes `totalEnrolled` into the
 * period's operational `enrollment`.
 */
export interface NormalizedEnrollmentSnapshot {
  /** ISO yyyy-mm-dd — the "as of" date this headcount was observed. */
  observedOn: string
  provider: EnrollmentProviderKey
  /** Active headcount (e.g. OneRoster users.csv role=student, status not tobedeleted). */
  totalEnrolled: number
  /** Active count per grade; keys are a subset of the driver's GradeKey union. */
  byGrade: Partial<Record<GradeKey, number>>
  /** Funnel/status breakdown when the source exposes it (SIS APIs); CSV fills enrolled+withdrawn. */
  byStatus?: { enrolled: number; withdrawn?: number; applied?: number; accepted?: number; new?: number; returning?: number }
  /**
   * Aggregate demographic breakdown (gender / ethnicity / race) as COUNTS — no
   * student-level PII, aggregate by design. Canonical shape frozen in
   * @finrep/analytics/demographics. Present only for the diocesan "details" shape;
   * the API persists it to EnrollmentSnapshot.byDemographics.
   */
  byDemographics?: DemographicBreakdown | null
  /** Full-time-equivalent headcount when the source reports it; null/undefined otherwise. */
  fte?: number | null
  /** Non-fatal parse notes (unknown grade codes, dropped rows) surfaced to the UI. */
  warnings?: string[]
  /**
   * Optional provenance/diagnostic blob the API persists to EnrollmentSnapshot.raw
   * (e.g. the parser's rawGradeCounts / droppedRows / header). Not part of the API
   * response surface — purely for audit/debug. Optional so a hand-built manual
   * snapshot can omit it.
   */
  raw?: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Granular diocesan enrollment — SEAM types for the MULTI-school parser.
//
// The diocesan parser (@finrep/ingestion/diocesan, server-only) turns ONE org file
// (all schools at once) into a list of per-school NormalizedDiocesanRow. The API
// name-matches each row to a School, then fans it into the EXISTING per-school
// snapshot+promote pipeline. Aggregate counts only (no student PII).
// ─────────────────────────────────────────────────────────────────────────────

/** Which of the two real source shapes a diocesan file was recognized as. */
export type DiocesanSourceShape = 'admissions' | 'details'

/** One school's row parsed out of a diocesan file (pre name-match). */
export interface NormalizedDiocesanRow {
  /** The verbatim school name from the file — the API name-matches this. */
  sourceName: string
  /** Total headcount for the school (from a Total column or summed byGrade). */
  total: number
  /** Active count per canonical GradeKey (empty for the admissions shape). */
  byGrade: Partial<Record<GradeKey, number>>
  /** Admissions funnel split when present (new / returning). */
  byStatus?: { new?: number; returning?: number } | null
  /** Aggregate gender/ethnicity/race counts when present (details shape). */
  byDemographics?: DemographicBreakdown | null
  /** Per-row non-fatal parse notes (unknown grade column, unknown demo label). */
  warnings: string[]
}

/** The result of parsing a whole diocesan file — many schools, one observed date. */
export interface DiocesanParseResult {
  sourceShape: DiocesanSourceShape
  /** ISO yyyy-mm-dd parsed from the "as of" cell (or the opts override). */
  observedOn: string | null
  rows: NormalizedDiocesanRow[]
  /** File-level warnings (unrecognized shape, empty file, dropped columns). */
  warnings: string[]
}

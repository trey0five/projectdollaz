// ─────────────────────────────────────────────────────────────────────────────
// @finrep/db/enrollment-types — Phase 2 SEAM types for the enrollment pipeline.
//
// Pure TS (no Prisma import). The ONE normalized snapshot shape every enrollment
// adapter (OneRoster CSV, Blackbaud, OneRoster REST, FACTS, Veracross, manual)
// produces and the API's promote/summary paths consume — so a new provider only
// has to emit this shape. Grade keys are the analytics `GradeKey` union (PK3..12)
// so byGrade lines up with the driver model's enrollmentByGrade with no re-keying.
// ─────────────────────────────────────────────────────────────────────────────
import type { GradeKey } from '@finrep/analytics'

/** The enrollment/SIS provider keys — MUST mirror the Prisma EnrollmentProvider enum. */
export type EnrollmentProviderKey =
  | 'oneroster_csv'
  | 'oneroster_api'
  | 'blackbaud'
  | 'facts'
  | 'veracross'
  | 'manual'

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
  byStatus?: { enrolled: number; withdrawn?: number; applied?: number; accepted?: number }
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

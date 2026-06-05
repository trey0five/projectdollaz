// ─────────────────────────────────────────────────────────────
// The normalized trial-balance row contract shared with ingestion.
// `total` is a signed amount (debit positive, credit negative).
// ─────────────────────────────────────────────────────────────
export interface NormalizedRow {
  acct: number
  desc: string
  total: number
}

export type Dataset = NormalizedRow[]

/** A contributing source row captured for traceability/lineage. */
export interface SourceRowRef {
  acct: number
  desc: string
  total: number
}

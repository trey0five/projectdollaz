// ─────────────────────────────────────────────────────────────
// Traceability: per-statement-line lineage attached in a PARALLEL
// structure so flat numeric result fields stay byte-identical.
// ─────────────────────────────────────────────────────────────
import type { SourceRowRef } from './rows.js'
import type { SCoaCategory } from '../scoa/categories.js'

export type StatementId = 'SOA' | 'SFP' | 'SCF' | 'NetAssets'

export interface LineLineage {
  /** Line key, e.g. 'tuition', 'cash', 'ppNet'. */
  line: string
  /** Contributing SCoA category (null for explicit-acct rollups). */
  scoaCategory: SCoaCategory | null
  statement: StatementId
  /** Final flat field value this line carries. */
  value: number
  /** 1, or -1 when revenue negation was applied. */
  sign: 1 | -1
  /** Raw trial-balance rows that fed the line. */
  sources: SourceRowRef[]
}

export type StatementLineage = Record<string, LineLineage>

export interface ReportLineage {
  soa: {
    cy: StatementLineage
    py: StatementLineage | null
    audit: StatementLineage | null
  }
  sfp: {
    cy: StatementLineage | null
    py: StatementLineage | null
    audit: StatementLineage | null
  }
  scf: StatementLineage | null
  netAssets: StatementLineage
}

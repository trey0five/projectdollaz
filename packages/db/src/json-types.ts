// ─────────────────────────────────────────────────────────────────────────────
// Typed views over the JSONB columns. Prisma types these as `JsonValue`; these
// aliases document the actual engine/ingestion shapes stored in each column so
// future readers/writers stay aligned with the reproducibility contract.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  NormalizedRow,
  ReportBundle,
  StandardChart,
  SCoaCategory,
} from '@finrep/engine'

/** imports.rows — the immutable parsed trial balance snapshot. */
export type ImportRowsJson = NormalizedRow[]

/** imports.metadata — SheetMetadata-ish provenance captured at upload. */
export type ImportMetadataJson = Record<string, unknown>

/** mappings.entries — per-school account number -> SCoA category. */
export type MappingEntriesJson = Record<string, SCoaCategory>

/** standard_chart_versions.chart — the SCoA chart definition. */
export type StandardChartJson = StandardChart

/** statement_snapshots.payload — the full generateReports() ReportBundle. */
export type StatementPayloadJson = ReportBundle

/** audit_log.metadata — free-form structured context for an action. */
export type AuditMetadataJson = Record<string, unknown>

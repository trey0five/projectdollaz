// Shared snapshot-lineage reader — the exact `STMT_KEY` + variant-shaped lineage
// walker LIFTED VERBATIM from qbo-drill.service.ts so the transaction drill-down and
// the value-history service read a stored snapshot's lineage the same way (no
// copy-paste drift). Pure: zero Nest, zero IO — reads only the `lineage` block of a
// StatementSnapshot payload. IntegrationsModule already depends on statements, so
// qbo-drill importing this is a one-directional, boot-safe util import (no Nest wiring).

// ── Stored-snapshot shapes (only what we read) ────────────────────────────────
export interface LineageEntry {
  line: string
  value: number
  sign: 1 | -1
  sources: Array<{ acct: number; desc?: string | null; total?: number }>
}
export type LineageMap = Record<string, LineageEntry>
export interface SnapshotLineage {
  soa?: { cy?: LineageMap | null; py?: LineageMap | null; audit?: LineageMap | null }
  sfp?: { cy?: LineageMap | null; py?: LineageMap | null; audit?: LineageMap | null }
  scf?: LineageMap | null
  netAssets?: LineageMap | null
}

export const STMT_KEY: Record<string, keyof SnapshotLineage> = {
  SOA: 'soa',
  SFP: 'sfp',
  SCF: 'scf',
  NetAssets: 'netAssets',
}

/** The variant-shaped lineage map for a statement (scf/netAssets ignore variant). */
export function lineageMapFor(
  lineage: SnapshotLineage,
  statement: string,
  variant: 'cy' | 'py' | 'audit',
): LineageMap | null {
  const key = STMT_KEY[statement]
  if (!key) return null
  const node = lineage[key]
  if (!node) return null
  if (key === 'scf' || key === 'netAssets') return node as LineageMap
  return (node as Record<'cy' | 'py' | 'audit', LineageMap | null | undefined>)[variant] ?? null
}

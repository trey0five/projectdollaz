// #44 — the mapping popup's picks ride a multipart text field `mapping` as JSON
// ({ fieldKey: columnIndex | null }). Anything unreadable is ignored (our guess
// stands), never a 400: the popup is a convenience, not a gate.
import type { ColumnOverride, FieldSpec, TableSheet, ColumnMatches } from '@finrep/ingestion'

export function parseMappingField(raw: unknown): ColumnOverride | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    if (!obj || typeof obj !== 'object') return null
    const out: ColumnOverride = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === null) out[k] = null
      else if (typeof v === 'number' && Number.isInteger(v)) out[k] = v
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

/** What the popup needs to draw itself: the headers, a few rows, the fields, our mapping. */
export interface ImportTable {
  headers: string[]
  sample: string[][]
  fields: Array<{ key: string; label: string; required?: boolean }>
  mapping: Record<string, number>
  /** Plain words: what a file must have ("a student name and a grade"). */
  needs: string
}

export function importTable(sheet: TableSheet, fields: readonly FieldSpec[], columns: ColumnMatches, needs: string): ImportTable {
  return {
    headers: sheet.header,
    sample: sheet.rows.slice(0, 5),
    fields: fields.map((f) => ({ key: f.key, label: f.label, ...(f.required ? { required: true } : {}) })),
    mapping: columns.mapping,
    needs,
  }
}

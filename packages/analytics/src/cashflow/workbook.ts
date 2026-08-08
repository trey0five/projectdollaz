// ─────────────────────────────────────────────────────────────────────────────
// The workbook row model — the classic treasury cash-flow grid, as data.
//
// Opening balance / RECEIPTS by category / total receipts / DISBURSEMENTS by
// category / total disbursements / net change / closing balance, one column per
// bucket. Every treasurer has read this exact layout in Excel; the point of
// computing it HERE, in the engine, is that the web renders it and the tests
// assert against ONE row builder — a grid assembled ad hoc in a component is a
// grid that can quietly disagree with the chart drawn beside it.
//
// PURE AND TOTAL. Categories are discovered from the buckets themselves and
// ordered by total magnitude (largest first) so the rows that matter sit at the
// top of each section; a category that appears in only one bucket still gets a
// full row with zeros, because a grid with ragged rows cannot be scanned.
// ─────────────────────────────────────────────────────────────────────────────
import type { CashProjectionResult } from './types.js'

export type WorkbookRowKind =
  | 'opening'
  | 'section'
  | 'category'
  | 'subtotal'
  | 'net'
  | 'closing'

export interface WorkbookRow {
  kind: WorkbookRowKind
  /** Row label — 'Opening balance', 'Receipts', 'Tuition', … */
  label: string
  /** Stable key for React and for provenance lookups; category rows carry the category. */
  key: string
  /** 'in' | 'out' | null — which side a category row belongs to. */
  side: 'in' | 'out' | null
  /**
   * One value per bucket, aligned to `columns`. Null for section headers.
   * Disbursement categories and the disbursement subtotal are POSITIVE here —
   * the row lives under a DISBURSEMENTS header and a forest of minus signs
   * makes a grid harder to read, not more honest. Net change is signed.
   */
  values: (number | null)[]
}

export interface Workbook {
  /** Column headers, one per bucket: { key, start, end, belowReserve }. */
  columns: { key: string; start: string; end: string; belowReserve: boolean }[]
  rows: WorkbookRow[]
}

/** Categories present across all buckets on one side, ordered by total, largest first. */
function categoriesOf(
  result: CashProjectionResult,
  side: 'in' | 'out',
): { category: string; total: number }[] {
  const totals = new Map<string, number>()
  for (const b of result.buckets) {
    const map = side === 'in' ? b.receiptsByCategory : b.disbursementsByCategory
    for (const [cat, v] of Object.entries(map ?? {})) {
      totals.set(cat, (totals.get(cat) ?? 0) + v)
    }
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))
}

/** Human label for a category key — 'debt_service' → 'Debt service'. */
export function categoryLabel(category: string): string {
  const s = String(category ?? '').replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function workbookRows(result: CashProjectionResult): Workbook {
  const buckets = result.buckets
  const columns = buckets.map((b) => ({
    key: b.key,
    start: b.start,
    end: b.end,
    belowReserve: b.belowReserve,
  }))
  const n = buckets.length
  const rows: WorkbookRow[] = []

  rows.push({
    kind: 'opening',
    label: 'Opening balance',
    key: 'opening',
    side: null,
    values: buckets.map((b) => b.openingBalance),
  })

  for (const side of ['in', 'out'] as const) {
    const cats = categoriesOf(result, side)
    rows.push({
      kind: 'section',
      label: side === 'in' ? 'Receipts' : 'Disbursements',
      key: `section:${side}`,
      side,
      values: new Array<null>(n).fill(null),
    })
    for (const { category } of cats) {
      rows.push({
        kind: 'category',
        label: categoryLabel(category),
        key: category,
        side,
        values: buckets.map((b) =>
          side === 'in'
            ? (b.receiptsByCategory?.[category] ?? 0)
            : (b.disbursementsByCategory?.[category] ?? 0),
        ),
      })
    }
    rows.push({
      kind: 'subtotal',
      label: side === 'in' ? 'Total receipts' : 'Total disbursements',
      key: `subtotal:${side}`,
      side,
      values: buckets.map((b) => (side === 'in' ? b.receipts : b.disbursements)),
    })
  }

  rows.push({
    kind: 'net',
    label: 'Net change',
    key: 'net',
    side: null,
    values: buckets.map((b) => b.netChange),
  })
  rows.push({
    kind: 'closing',
    label: 'Closing balance',
    key: 'closing',
    side: null,
    values: buckets.map((b) => b.closingBalance),
  })

  return { columns, rows }
}

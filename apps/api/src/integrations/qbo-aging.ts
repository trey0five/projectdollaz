// QuickBooks AR/AP aging — PURE parser + bucket rollup. No Nest/DB imports; unit-
// tested in isolation (qbo-aging.spec.ts). Mirrors qbo-gl.ts: reads the report
// STRUCTURALLY (buildColIndex by ColType/ColTitle) and — critically — computes each
// open item's aging BUCKET ITSELF from `report_date − dueDate`, NEVER trusting the
// report's own bucket section labels (the same "don't depend on QBO honoring a
// filter/grouping" discipline the GL parser uses). Filter-agnostic, so the
// entity-query fallback (parseEntityAging) is a data-source swap, not a rewrite.
//
// Credit memos / negative residuals: each item's signed open balance bucketizes by
// its due date; the rollup CLAMPS overdue/90+ sums at 0 so a credit never counts as
// "overdue owed to us". Deep links reuse buildDeepLink from qbo-gl.ts.
import { buildDeepLink, type QboEnvironment } from './qbo-gl.js'

export type AgingSide = 'ar' | 'ap'
export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'

/** The five aging buckets, in age order (current → 90+). */
export const AGING_BUCKET_KEYS: AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']
/** The four OVERDUE buckets (everything past due) — current is not overdue. */
export const OVERDUE_BUCKET_KEYS: AgingBucket[] = ['d1_30', 'd31_60', 'd61_90', 'd90_plus']

export interface AgingBuckets {
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
}

/** One normalized open receivable/payable item (self-describing its aging bucket). */
export interface AgingItem {
  /** QBO transaction id (deep-link target); null when the report row carries none. */
  txnId: string | null
  /** Transaction type, e.g. 'Invoice' | 'Bill' | 'Credit Memo'. */
  type: string
  docNumber: string | null
  /** Customer (AR) / vendor (AP) display name. */
  party: string
  /** Transaction date (YYYY-MM-DD, verbatim). */
  txnDate: string
  /** Due date (YYYY-MM-DD); null when the report omits one (treated as not-overdue). */
  dueDate: string | null
  /** Open balance (residual), SIGNED (a credit memo is negative). Rounded to cents. */
  amount: number
  bucket: AgingBucket
  /** >0 overdue; ≤0 not yet due (computed from report_date − dueDate). */
  daysOverdue: number
  /** One-click link back into QuickBooks for this transaction; null when no txnId. */
  deepLink: string | null
}

/** A top debtor/creditor rolled up across their open items. */
export interface AgingParty {
  party: string
  /** Signed net open balance across all this party's items. */
  total: number
  /** Positive overdue amount (clamped ≥ 0). */
  overdue: number
  /** The oldest (most overdue) bucket this party has any item in. */
  oldestBucket: AgingBucket
  /** Number of open items for this party. */
  count: number
  /** Deep link of this party's oldest/worst item (null when none is deep-linkable). */
  worstDeepLink: string | null
}

/** The rolled-up aggregate for one side (AR or AP). */
export interface AgingRollup {
  /** Signed total across all items (credits net out). */
  total: number
  /** Positive overdue total (clamped ≥ 0). */
  overdue: number
  /** Positive 90+ total (clamped ≥ 0). */
  d90Plus: number
  /** The Current bucket (upcoming / not-yet-due), clamped ≥ 0. Feeds AP "due soon". */
  dueSoon: number
  buckets: AgingBuckets
  /** Distinct parties with a POSITIVE net open balance. */
  accounts: number
  /** Parties with any POSITIVE 90+ open balance. */
  overdue90Count: number
  /** Top parties by overdue then total, capped. */
  top: AgingParty[]
  /** ALL items, sorted oldest-then-largest (the service caps the register). */
  items: AgingItem[]
  /** M — count of ALL items (for "showing 25 of M"). */
  totalCount: number
}

// ── QBO report JSON shapes (only the fields we read) ─────────────────────────
interface QboColDataCell {
  value?: string
  id?: string
}
interface QboReportColumn {
  ColTitle?: string
  ColType?: string
}
interface QboReportRow {
  ColData?: QboColDataCell[]
  Header?: { ColData?: QboColDataCell[] }
  Rows?: { Row?: QboReportRow[] }
  Summary?: { ColData?: QboColDataCell[] }
}
interface QboReport {
  Columns?: { Column?: QboReportColumn[] }
  Rows?: { Row?: QboReportRow[] }
}

/** Logical column roles we read out of the report's positional ColData. */
interface ColIndex {
  txnDate: number
  type: number
  docNumber: number
  party: number
  dueDate: number
  /** Open balance (residual) — preferred amount column. */
  openBal: number
  /** Fallback amount column when no open-balance column is present. */
  amount: number
}

/**
 * Map the aging-detail report's declared Columns to positional indexes by ColType
 * (falling back to a lowercased ColTitle match). QBO aging column types are stable
 * strings (tx_date, txn_type, doc_num, cust_name/vend_name/name, due_date,
 * subt_open_bal/open_bal, subt_nat_amount/amount); the title fallback covers minor-
 * version drift. Returns -1 for any column the report omitted. Open balance is read
 * in preference to the raw amount (the residual is what ages).
 */
function buildColIndex(cols: QboReportColumn[]): ColIndex {
  const idx: ColIndex = { txnDate: -1, type: -1, docNumber: -1, party: -1, dueDate: -1, openBal: -1, amount: -1 }
  cols.forEach((c, i) => {
    const t = (c.ColType ?? '').toLowerCase()
    const title = (c.ColTitle ?? '').toLowerCase()
    const is = (types: string[], titles: string[]) =>
      types.includes(t) || titles.some((n) => title === n || title.includes(n))
    // due_date is checked BEFORE tx_date so a "Due Date" title can't be grabbed by
    // the generic 'date' title matcher on the tx_date branch.
    if (idx.dueDate < 0 && is(['due_date'], ['due date', 'due'])) idx.dueDate = i
    else if (idx.txnDate < 0 && is(['tx_date'], ['date'])) idx.txnDate = i
    else if (idx.type < 0 && is(['txn_type'], ['transaction type', 'type'])) idx.type = i
    else if (idx.docNumber < 0 && is(['doc_num'], ['num', 'doc num', '#'])) idx.docNumber = i
    else if (idx.party < 0 && is(['cust_name', 'vend_name', 'name'], ['customer', 'vendor', 'name', 'payee']))
      idx.party = i
    else if (idx.openBal < 0 && is(['subt_open_bal', 'open_bal', 'balance'], ['open balance', 'open bal', 'balance']))
      idx.openBal = i
    else if (idx.amount < 0 && is(['subt_nat_amount', 'amount'], ['amount'])) idx.amount = i
  })
  return idx
}

function cell(cols: QboColDataCell[] | undefined, i: number): string | null {
  if (!cols || i < 0 || i >= cols.length) return null
  const v = cols[i]?.value
  return v != null && String(v).trim() !== '' ? String(v).trim() : null
}

/** Parse a report money string ("1,234.50", "-89.50", "") to a number (0 on junk). */
function money(v: string | null): number {
  if (!v) return 0
  const n = Number(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** The first ColData cell carrying an `id` attribute — the row's transaction id. */
function firstId(cols: QboColDataCell[] | undefined): string | null {
  for (const c of cols ?? []) {
    if (c && typeof c.id === 'string' && c.id.trim() !== '') return c.id.trim()
  }
  return null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Whole days between two 'YYYY-MM-DD' dates (b − a); positive when b is later. */
function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return Math.round((tb - ta) / 86_400_000)
}

/** The aging bucket for a days-overdue count (≤0 → current; then 1–30/31–60/61–90/90+). */
export function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return 'd1_30'
  if (daysOverdue <= 60) return 'd31_60'
  if (daysOverdue <= 90) return 'd61_90'
  return 'd90_plus'
}

/** DEEP-LINK route type for the entity fallback (an open Invoice ⇒ 'Invoice'). */
function entityType(side: AgingSide): string {
  return side === 'ar' ? 'Invoice' : 'Bill'
}

/**
 * Parse a reports/AgedReceivableDetail | AgedPayableDetail JSON into AgingItem[].
 * Walks the nested Rows.Row tree; a detail row is read positionally against the
 * declared Columns; the aging BUCKET is computed HERE from `asOf − dueDate` (the
 * section headers are ignored — structural, drift-proof). The party is taken from
 * the row's own name column, falling back to the enclosing section header (so a
 * customer-grouped OR a bucket-grouped report both yield the right party). Rows with
 * no date AND no amount are skipped (spacers); section subtotals live on row.Summary
 * (not read) so they are never double-counted.
 */
export function parseAgedDetail(raw: unknown, asOf: string, side: AgingSide, env: QboEnvironment): AgingItem[] {
  const report = (raw ?? {}) as QboReport
  const cols = report.Columns?.Column ?? []
  const idx = buildColIndex(cols)
  const out: AgingItem[] = []

  const walk = (rows: QboReportRow[], sectionParty: string | null): void => {
    for (const row of rows) {
      const header = row.Header?.ColData
      const nextParty = cell(header, 0) ?? sectionParty

      if (row.ColData && row.ColData.length) {
        const txnDate = cell(row.ColData, idx.txnDate)
        const amountRaw = idx.openBal >= 0 ? cell(row.ColData, idx.openBal) : cell(row.ColData, idx.amount)
        const dueDate = cell(row.ColData, idx.dueDate)
        // Skip spacer/subtotal rows (no date AND no amount). Detail rows always carry
        // at least an amount; genuine section totals ride row.Summary, not here.
        if (txnDate || amountRaw) {
          const amount = round2(money(amountRaw))
          const daysOverdue = dueDate ? daysBetween(dueDate, asOf) : 0
          const txnId = firstId(row.ColData)
          const type = cell(row.ColData, idx.type) ?? entityType(side)
          out.push({
            txnId,
            type,
            docNumber: cell(row.ColData, idx.docNumber),
            party: cell(row.ColData, idx.party) ?? nextParty ?? 'Unknown',
            txnDate: txnDate ?? '',
            dueDate,
            amount,
            bucket: bucketFor(daysOverdue),
            daysOverdue,
            deepLink: buildDeepLink(type, txnId, env),
          })
        }
      }

      if (row.Rows?.Row?.length) walk(row.Rows.Row, nextParty)
    }
  }

  walk(report.Rows?.Row ?? [], null)
  return out
}

/** One Invoice/Bill entity row from the query fallback (only the fields we read). */
export interface QboOpenEntity {
  Id?: string
  DocNumber?: string
  TxnDate?: string
  DueDate?: string
  Balance?: number | string
  TotalAmt?: number | string
  CustomerRef?: { name?: string; value?: string }
  VendorRef?: { name?: string; value?: string }
}

/**
 * FALLBACK — parse Invoice/Bill entity-query rows into AgingItem[] and compute aging
 * ourselves (identical bucket math to the detail parser). Same AgingItem contract, so
 * nothing downstream changes; the service stamps source:'entity-fallback'.
 */
export function parseEntityAging(
  entities: QboOpenEntity[] | undefined,
  asOf: string,
  side: AgingSide,
  env: QboEnvironment,
): AgingItem[] {
  const out: AgingItem[] = []
  const type = entityType(side)
  for (const e of entities ?? []) {
    const balance = round2(money(e.Balance != null ? String(e.Balance) : null))
    if (balance === 0) continue // only OPEN items (Balance > 0)
    const txnId = e.Id != null ? String(e.Id).trim() || null : null
    const dueDate = e.DueDate ? String(e.DueDate).slice(0, 10) : null
    const txnDate = e.TxnDate ? String(e.TxnDate).slice(0, 10) : ''
    const daysOverdue = dueDate ? daysBetween(dueDate, asOf) : 0
    const ref = side === 'ar' ? e.CustomerRef : e.VendorRef
    out.push({
      txnId,
      type,
      docNumber: e.DocNumber != null ? String(e.DocNumber).trim() || null : null,
      party: (ref?.name ?? '').trim() || 'Unknown',
      txnDate,
      dueDate,
      amount: balance,
      bucket: bucketFor(daysOverdue),
      daysOverdue,
      deepLink: buildDeepLink(type, txnId, env),
    })
  }
  return out
}

function emptyBuckets(): AgingBuckets {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
}

/** The oldest (most overdue) of two buckets, by AGING_BUCKET_KEYS order. */
function olderBucket(a: AgingBucket, b: AgingBucket): AgingBucket {
  return AGING_BUCKET_KEYS.indexOf(a) >= AGING_BUCKET_KEYS.indexOf(b) ? a : b
}

/**
 * Roll AgingItem[] into totals + buckets + counts + top-N parties. Buckets sum the
 * SIGNED amount (credits net out per bucket); total = sum of buckets. overdue / 90+ /
 * dueSoon are CLAMPED at 0 (a net credit in an overdue bucket never reads as money
 * owed). Parties are ranked by overdue desc, then |total| desc; capped to `topN`. The
 * items list is returned sorted oldest-bucket-then-largest so the caller can cap the
 * register honestly (totals are over ALL items, before any cap).
 */
export function rollupAging(items: AgingItem[], topN = 8): AgingRollup {
  const buckets = emptyBuckets()
  const parties = new Map<
    string,
    { total: number; overduePos: number; count: number; oldest: AgingBucket; worst: AgingItem | null }
  >()

  for (const it of items) {
    buckets[it.bucket] = round2(buckets[it.bucket] + it.amount)
    const isOverdue = it.bucket !== 'current'
    const p = parties.get(it.party) ?? {
      total: 0,
      overduePos: 0,
      count: 0,
      oldest: 'current' as AgingBucket,
      worst: null as AgingItem | null,
    }
    p.total = round2(p.total + it.amount)
    if (isOverdue && it.amount > 0) p.overduePos = round2(p.overduePos + it.amount)
    p.count += 1
    p.oldest = olderBucket(p.oldest, it.bucket)
    // "worst" = the oldest-then-largest item (drives the row deep-link + oldestBucket).
    if (
      !p.worst ||
      AGING_BUCKET_KEYS.indexOf(it.bucket) > AGING_BUCKET_KEYS.indexOf(p.worst.bucket) ||
      (it.bucket === p.worst.bucket && Math.abs(it.amount) > Math.abs(p.worst.amount))
    ) {
      p.worst = it
    }
    parties.set(it.party, p)
  }

  const total = round2(AGING_BUCKET_KEYS.reduce((s, k) => s + buckets[k], 0))
  const overdue = round2(Math.max(0, OVERDUE_BUCKET_KEYS.reduce((s, k) => s + buckets[k], 0)))
  const d90Plus = round2(Math.max(0, buckets.d90_plus))
  const dueSoon = round2(Math.max(0, buckets.current))

  // 90+ party count: parties whose OWN net balance in the 90+ bucket is positive.
  const d90ByParty = new Map<string, number>()
  for (const it of items) {
    if (it.bucket === 'd90_plus') d90ByParty.set(it.party, round2((d90ByParty.get(it.party) ?? 0) + it.amount))
  }
  const overdue90Count = [...d90ByParty.values()].filter((v) => v > 0).length
  const accounts = [...parties.values()].filter((p) => p.total > 0).length

  const top: AgingParty[] = [...parties.entries()]
    .map(([party, p]) => ({
      party,
      total: p.total,
      overdue: p.overduePos,
      oldestBucket: p.oldest,
      count: p.count,
      worstDeepLink: p.worst?.deepLink ?? null,
    }))
    .filter((p) => p.total > 0 || p.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || Math.abs(b.total) - Math.abs(a.total) || a.party.localeCompare(b.party))
    .slice(0, topN)

  // Register order: oldest bucket first, then largest |amount|.
  const sortedItems = [...items].sort(
    (a, b) =>
      AGING_BUCKET_KEYS.indexOf(b.bucket) - AGING_BUCKET_KEYS.indexOf(a.bucket) ||
      Math.abs(b.amount) - Math.abs(a.amount),
  )

  return {
    total,
    overdue,
    d90Plus,
    dueSoon,
    buckets,
    accounts,
    overdue90Count,
    top,
    items: sortedItems,
    totalCount: sortedItems.length,
  }
}

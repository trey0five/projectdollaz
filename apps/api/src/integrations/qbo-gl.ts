// QuickBooks transaction drill-down — PURE parser + deep-link builder.
//
// Turns a raw QBO reports/GeneralLedger JSON (or the reports/TransactionList
// fallback) into a flat GlTxn[] where every row SELF-DESCRIBES its account
// (acctId when QBO emits one on the section header, always acctName). This is the
// Fallback-A contract: the parser NEVER depends on the `account=` filter being
// honored — the orchestrator/service filters server-side by the resolved account
// set, so the QBO filter is only a latency optimization. No Nest/DB imports; unit-
// tested in isolation (qbo-gl.spec.ts).

/** One normalized general-ledger transaction line, self-describing its account. */
export interface GlTxn {
  /** QBO transaction id (deep-link target); null when the report row carries none. */
  txnId: string | null
  /** Transaction date (YYYY-MM-DD, verbatim from the report). */
  date: string
  /** Transaction type, e.g. 'Invoice', 'Bill', 'Journal Entry'. */
  type: string
  docNumber: string | null
  /** Payee / customer / vendor name column. */
  payee: string | null
  memo: string | null
  /** Signed natural amount as printed by the report (subt_nat_amount). */
  amount: number
  /** QBO account id when the section header carried one; else null (match by name). */
  acctId: string | null
  /** Account display name (from the section header or the account_name column). */
  acctName: string
}

// ── QBO report JSON shapes (only the fields we read; everything else ignored) ──
interface QboColDataCell {
  value?: string
  id?: string
}
interface QboReportColumn {
  ColTitle?: string
  ColType?: string
  MetaData?: Array<{ Name?: string; Value?: string }>
}
interface QboReportRow {
  ColData?: QboColDataCell[]
  Header?: { ColData?: QboColDataCell[] }
  Rows?: { Row?: QboReportRow[] }
  Summary?: { ColData?: QboColDataCell[] }
  type?: string
  group?: string
}
interface QboReport {
  Columns?: { Column?: QboReportColumn[] }
  Rows?: { Row?: QboReportRow[] }
}

/** Logical column roles we read out of the report's positional ColData. */
interface ColIndex {
  date: number
  type: number
  docNumber: number
  payee: number
  memo: number
  amount: number
  account: number
}

/**
 * Map the report's declared Columns to positional indexes by ColType (falling
 * back to a lowercased ColTitle match). QBO GL column types are stable strings
 * (tx_date, txn_type, doc_num, name, memo, subt_nat_amount, account_name); the
 * title fallback covers TransactionList / minor-version drift. Returns -1 for any
 * column the report omitted, which the row reader treats as "absent".
 */
function buildColIndex(cols: QboReportColumn[]): ColIndex {
  const idx: ColIndex = { date: -1, type: -1, docNumber: -1, payee: -1, memo: -1, amount: -1, account: -1 }
  cols.forEach((c, i) => {
    const t = (c.ColType ?? '').toLowerCase()
    const title = (c.ColTitle ?? '').toLowerCase()
    const is = (needleTypes: string[], titleNeedles: string[]) =>
      needleTypes.includes(t) || titleNeedles.some((n) => title === n || title.includes(n))
    if (idx.date < 0 && is(['tx_date'], ['date'])) idx.date = i
    else if (idx.type < 0 && is(['txn_type'], ['transaction type', 'type'])) idx.type = i
    else if (idx.docNumber < 0 && is(['doc_num'], ['num', 'doc num', '#'])) idx.docNumber = i
    else if (idx.payee < 0 && is(['name'], ['name', 'payee'])) idx.payee = i
    else if (idx.memo < 0 && is(['memo', 'memo_description'], ['memo', 'description'])) idx.memo = i
    else if (idx.amount < 0 && is(['subt_nat_amount', 'amount'], ['amount'])) idx.amount = i
    else if (idx.account < 0 && is(['account_name', 'account'], ['account'])) idx.account = i
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

/**
 * Parse a reports/GeneralLedger JSON into GlTxn[]. Walks the nested Rows.Row tree
 * (accounts are Section rows: a Header naming the account, nested detail Data rows,
 * a Summary). Detail rows are read positionally against the declared Columns; the
 * account is taken from the row's own account_name column when present, else the
 * enclosing section's header (with the header's ColData id captured as acctId when
 * QBO emits it). Detail rows with no usable date AND no amount are skipped (Summary
 * / spacer rows). FILTER-AGNOSTIC: every row keeps its own account, so the caller
 * can filter server-side regardless of whether `account=` was honored.
 */
export function parseGeneralLedger(raw: unknown): GlTxn[] {
  const report = (raw ?? {}) as QboReport
  const cols = report.Columns?.Column ?? []
  const idx = buildColIndex(cols)
  const out: GlTxn[] = []

  const walk = (rows: QboReportRow[], sectionName: string, sectionId: string | null): void => {
    for (const row of rows) {
      // A section: its Header names an account; recurse into its nested rows with
      // that account as context. Header ColData[0] often carries the account id.
      const header = row.Header?.ColData
      const nextName = cell(header, 0) ?? sectionName
      const nextId = firstId(header) ?? sectionId

      if (row.ColData && row.ColData.length) {
        const date = cell(row.ColData, idx.date)
        const amountRaw = cell(row.ColData, idx.amount)
        // Skip non-transaction rows (blank date and blank amount => spacer/subtotal).
        if (date || amountRaw) {
          const rowAcctName = cell(row.ColData, idx.account)
          out.push({
            txnId: firstId(row.ColData),
            date: date ?? '',
            type: cell(row.ColData, idx.type) ?? '',
            docNumber: cell(row.ColData, idx.docNumber),
            payee: cell(row.ColData, idx.payee),
            memo: cell(row.ColData, idx.memo),
            amount: money(amountRaw),
            acctId: rowAcctName ? null : nextId,
            acctName: rowAcctName ?? nextName,
          })
        }
      }

      if (row.Rows?.Row?.length) walk(row.Rows.Row, nextName, nextId)
    }
  }

  walk(report.Rows?.Row ?? [], '', null)
  return out
}

/**
 * Parse a reports/TransactionList JSON into GlTxn[] (Fallback B). TransactionList is
 * flat — every detail row carries its own account_name column — so there is no
 * section nesting to walk; we read each Data row positionally. Same GlTxn[] contract
 * as the GL parser, so nothing downstream changes.
 */
export function parseTransactionList(raw: unknown): GlTxn[] {
  const report = (raw ?? {}) as QboReport
  const cols = report.Columns?.Column ?? []
  const idx = buildColIndex(cols)
  const out: GlTxn[] = []

  const walk = (rows: QboReportRow[]): void => {
    for (const row of rows) {
      if (row.ColData && row.ColData.length) {
        const date = cell(row.ColData, idx.date)
        const amountRaw = cell(row.ColData, idx.amount)
        const acctName = cell(row.ColData, idx.account)
        if ((date || amountRaw) && acctName) {
          out.push({
            txnId: firstId(row.ColData),
            date: date ?? '',
            type: cell(row.ColData, idx.type) ?? '',
            docNumber: cell(row.ColData, idx.docNumber),
            payee: cell(row.ColData, idx.payee),
            memo: cell(row.ColData, idx.memo),
            amount: money(amountRaw),
            acctId: null,
            acctName,
          })
        }
      }
      if (row.Rows?.Row?.length) walk(row.Rows.Row)
    }
  }

  walk(report.Rows?.Row ?? [])
  return out
}

// ── Deep links back into QuickBooks ──────────────────────────────────────────
const DEEP_LINK_ROUTES: Record<string, string> = {
  Invoice: 'invoice',
  Bill: 'bill',
  Check: 'check',
  Expense: 'expense',
  Purchase: 'expense',
  'Bill Payment': 'billpayment',
  'Bill Payment (Check)': 'billpayment',
  Deposit: 'deposit',
  'Journal Entry': 'journal',
  Journal: 'journal',
  'Sales Receipt': 'salesreceipt',
  Payment: 'recvpayment',
  'Credit Card Credit': 'creditcardcredit',
  Transfer: 'transfer',
}

export type QboEnvironment = 'sandbox' | 'production'

function qboHost(env: QboEnvironment): string {
  return env === 'production' ? 'https://app.qbo.intuit.com' : 'https://app.sandbox.qbo.intuit.com'
}

/**
 * A one-click link back into QuickBooks for a transaction. When a txnId is known we
 * route by transaction type (falling back to the universal `txnview`); otherwise we
 * link to the account register (needs a fallbackAccountId). Returns null when
 * neither a txnId nor a fallback account is available.
 */
export function buildDeepLink(
  type: string,
  txnId: string | null,
  env: QboEnvironment,
  fallbackAccountId?: string | null,
): string | null {
  const host = qboHost(env)
  if (!txnId) {
    return fallbackAccountId ? `${host}/app/register?accountId=${fallbackAccountId}` : null
  }
  const route = DEEP_LINK_ROUTES[type] ?? 'txnview'
  return `${host}/app/${route}?txnId=${txnId}`
}

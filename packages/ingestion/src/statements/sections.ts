// ─────────────────────────────────────────────────────────────
// Statement SECTION facts (A1): which report heading each account sits under.
//
// A QuickBooks statement export prints every account inside its section —
// "Income", "Expenses", "Bank Accounts", "Fixed Assets", "Other Current
// Liabilities", "Equity" … — which is exactly the AccountType the live sync
// reads (qbo.client.ts deriveAcct). Recording it lets the mapping step sort a
// fresh school's accounts by SECTION (the class is fixed; only the exact
// category is refined by name) instead of asking a person to confirm a
// name-only guess for each one — and keeps a P&L line like "Contributions
// without Donor Restrictions" out of the balance sheet, where a name rule
// alone would file it.
//
// PURE + browser-safe.
// ─────────────────────────────────────────────────────────────
import type { SheetMetadata, StatementSectionFact, StatementSectionKey } from '../types.js'
import { normalizeGroup, type TbSection } from './tbConventions.js'

export type { StatementSectionKey, StatementSectionFact } from '../types.js'

/** Every section key → the TB section (and so the sign) it implies. */
export const STATEMENT_SECTION_KEYS: Readonly<Record<StatementSectionKey, TbSection>> = Object.freeze({
  income: 'revenue',
  otherIncome: 'revenue',
  expenses: 'expense',
  otherExpense: 'expense',
  costOfGoodsSold: 'expense',
  bank: 'asset',
  accountsReceivable: 'asset',
  otherCurrentAssets: 'asset',
  currentAssets: 'asset',
  fixedAssets: 'asset',
  otherAssets: 'asset',
  assets: 'asset',
  accountsPayable: 'liability',
  creditCards: 'liability',
  otherCurrentLiabilities: 'liability',
  currentLiabilities: 'liability',
  longTermLiabilities: 'liability',
  liabilities: 'liability',
  equity: 'equity',
})

/** The coarse key for a TB section when no more specific heading is known. */
const COARSE: Record<TbSection, StatementSectionKey> = {
  revenue: 'income',
  expense: 'expenses',
  asset: 'assets',
  liability: 'liabilities',
  equity: 'equity',
}

/**
 * A printed section heading → its key, or undefined for a heading that is not
 * a standard QuickBooks section (a user's own sub-group like "Tuition
 * Revenue", a parent account). Letters only, case-insensitive.
 */
export function normalizeStatementSection(label: string): StatementSectionKey | undefined {
  const g = normalizeGroup(label)
  if (!g) return undefined
  // P&L
  if (/^other(income|revenues?)$/.test(g)) return 'otherIncome'
  if (/^(income|revenues?|revenuesandsupport|revenueandsupport|supportandrevenues?|operatingincome|operatingrevenues?)$/.test(g)) return 'income'
  if (/^otherexpenses?$/.test(g)) return 'otherExpense'
  if (/^(cogs|costofgoodssold|costofsales)$/.test(g)) return 'costOfGoodsSold'
  if (/^(expenses?|operatingexpenses?)$/.test(g)) return 'expenses'
  // Balance sheet — assets
  if (/^(bank|bankaccounts?|cashandcashequivalents|cashandequivalents)$/.test(g)) return 'bank'
  if (/^accountsreceivable/.test(g)) return 'accountsReceivable'
  if (/^othercurrentassets?$/.test(g)) return 'otherCurrentAssets'
  if (/^currentassets?$/.test(g)) return 'currentAssets'
  if (/^(fixedassets?|propertyandequipment|propertyplantandequipment|propertyequipment)$/.test(g)) return 'fixedAssets'
  if (/^(otherassets?|longtermassets?|noncurrentassets?)$/.test(g)) return 'otherAssets'
  if (/^(total)?assets$/.test(g)) return 'assets'
  // Balance sheet — liabilities
  if (/^accountspayable/.test(g)) return 'accountsPayable'
  if (/^creditcards?$/.test(g)) return 'creditCards'
  if (/^othercurrentliabilit(y|ies)$/.test(g)) return 'otherCurrentLiabilities'
  if (/^currentliabilit(y|ies)$/.test(g)) return 'currentLiabilities'
  if (/^(longtermliabilit(y|ies)|noncurrentliabilit(y|ies))$/.test(g)) return 'longTermLiabilities'
  if (/^(liabilit(y|ies)|liabilitiesandequity|liabilitiesandnetassets)$/.test(g)) return 'liabilities'
  // Equity
  if (/^(equity|netassets|fundbalances?|capital)$/.test(g)) return 'equity'
  return undefined
}

/**
 * The section fact for one leaf. The INNERMOST standard heading wins, but only
 * when it agrees with the TB section the row was actually signed as — the
 * fact can never contradict the row's sign. With no agreeing heading, the
 * coarse key for the signed section, marked by how that section was known.
 */
export function sectionFact(
  statement: 'pl' | 'bs',
  groups: readonly string[],
  signed: TbSection,
  fallbackBasis: 'number' | 'position',
): StatementSectionFact {
  for (let i = groups.length - 1; i >= 0; i--) {
    const key = normalizeStatementSection(groups[i]!)
    if (!key) continue
    if (STATEMENT_SECTION_KEYS[key] === signed) return { statement, section: key, basis: 'section' }
    break // the innermost standard heading disagrees with the sign: say only what the sign says
  }
  const anyHeading = groups.some((g) => normalizeStatementSection(g) !== undefined)
  return { statement, section: COARSE[signed], basis: anyHeading ? 'section' : fallbackBasis }
}

const isFact = (v: unknown): v is StatementSectionFact => {
  if (!v || typeof v !== 'object') return false
  const f = v as Record<string, unknown>
  return (
    (f.statement === 'pl' || f.statement === 'bs') &&
    typeof f.section === 'string' &&
    Object.prototype.hasOwnProperty.call(STATEMENT_SECTION_KEYS, f.section) &&
    (f.basis === undefined || f.basis === 'section' || f.basis === 'number' || f.basis === 'position')
  )
}

/**
 * The validated section facts of a file's metadata, keyed by account NUMBER
 * (client-written JSON is checked: unknown keys / malformed entries are
 * dropped). {} for a plain trial balance — which keeps confirm-first review.
 */
export function statementSections(metadata: SheetMetadata | null | undefined): Record<number, StatementSectionFact> {
  const raw = metadata?.statement?.sections
  const out: Record<number, StatementSectionFact> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    const acct = Number(k)
    if (!Number.isInteger(acct) || acct <= 0 || !isFact(v)) continue
    out[acct] = { statement: v.statement, section: v.section, basis: v.basis ?? 'section' }
  }
  return out
}

/**
 * Combine two halves' facts (merge of a P&L with a Balance Sheet). An account
 * number that appears in both under different sections is dropped — the class
 * is no longer known.
 */
export function mergeSectionFacts(
  a: Record<string, StatementSectionFact> | undefined,
  b: Record<string, StatementSectionFact> | undefined,
): Record<string, StatementSectionFact> | undefined {
  if (!a && !b) return undefined
  const out: Record<string, StatementSectionFact> = { ...(a ?? {}) }
  const conflicted = new Set<string>()
  for (const [k, v] of Object.entries(b ?? {})) {
    const prev = out[k]
    if (prev && (prev.section !== v.section || prev.statement !== v.statement)) conflicted.add(k)
    else out[k] = v
  }
  for (const k of conflicted) delete out[k]
  return out
}

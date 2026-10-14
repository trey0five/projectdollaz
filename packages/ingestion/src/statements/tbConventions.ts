// ─────────────────────────────────────────────────────────────
// Trial-balance conventions shared by EVERY path that turns a QuickBooks
// statement (P&L / Statement of Activity, Balance Sheet, Budget vs Actuals)
// into engine rows — the live Reports-API sync in apps/api
// (qbo-company.synth.ts / qbo.client.ts, which re-export from here) and the
// file-export adapter in ./statementAdapter.ts.
//
// This is the ONE place the rules live. Pure, byte-free, framework-free:
// packages never import apps, so the rules were moved DOWN here and the api
// re-exports them so its callers and specs are untouched.
//
//   TB sign (total = debit − credit) from a NATURAL-POSITIVE report value:
//     Revenue → −v · Expense → +v · Asset → +v · Liability / Equity → −v
//   Engine account blocks for QBO accounts without a number:
//     P&L  → QBO_REVENUE_BASE / QBO_EXPENSE_BASE + a per-account offset
//     BS   → the engine's fixed default-chart numbers (BS_ENGINE_ACCT)
//   Residual → one explicit acct-399 plug row (applyBalancePlug).
// ─────────────────────────────────────────────────────────────
import type { NormalizedRow } from '@finrep/engine'

// ── Engine account-number blocks ──────────────────────────────────────────────

/**
 * Engine account-number blocks for QBO P&L accounts WITHOUT an AcctNum. Both
 * QuickBooks paths number INSIDE the same block but in DISJOINT sub-ranges, so
 * a school that mixes a live sync with a file export never collides:
 *
 *   base + 1    … base + 999    LIVE SYNC   → base + the QBO account id
 *                                             (qbo.client.ts; ids are small ints)
 *   base + 1000 … base + 8999   FILE EXPORT → base + syntheticOffset(name)
 *                                             (a stable hash of the leaf NAME —
 *                                             no ids exist in a file)
 *
 * Both are > base, so the bare bases are never assigned.
 */
export const QBO_REVENUE_BASE = 40000
export const QBO_EXPENSE_BASE = 60000
/** First number of the "no idea what this is" synthetic block. */
export const QBO_SYNTHETIC_BASE = 90000
/** Export adapter sub-range inside a P&L block: base + OFFSET … base + OFFSET + SPAN − 1. */
export const QBO_SYNTHETIC_OFFSET = 1000
export const QBO_SYNTHETIC_SPAN = 8000

/** 32-bit FNV-1a — tiny, dependency-free, identical in node and the browser. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Lower-case letters+digits only — the identity of an unnumbered leaf across re-exports. */
export function normalizeLeafName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Where an UNNUMBERED export leaf lands inside its P&L block: a hash of the
 * normalised name, so inserting a row or a zero turning into a value in a later
 * export does NOT re-key every account after it (a 1-based order would). The
 * caller skips forward on a collision (same hash, or a number an explicit
 * account in the file already uses).
 */
export function syntheticOffset(name: string): number {
  return QBO_SYNTHETIC_OFFSET + (fnv1a(normalizeLeafName(name)) % QBO_SYNTHETIC_SPAN)
}

/**
 * Balance-sheet rows collapse onto the engine's FIXED default-chart numbers
 * (packages/engine/src/scoa/defaultMapping.ts): several rows sharing one acct
 * simply sum, exactly like the live sync's type-derived numbers. Keyed by the
 * QBO account TYPE family, which is also what the export's section labels are
 * ("Bank Accounts", "Accounts Receivable", "Other Current Assets", …).
 */
export const BS_ENGINE_ACCT = {
  bank: 100, // cash
  undepositedFunds: 100, // cash-equivalent
  receivable: 120, // → tuitionRec via the acct-120 description reclass
  otherCurrentAsset: 120,
  prepaid: 125,
  fixedAsset: 150, // ppGross
  accumulatedDepreciation: 170, // accumDepr (credit)
  otherAsset: 140, // ppGross
  currentLiability: 200, // apAccrued (lease-named rows split out by description)
  longTermLiability: 260, // leaseNonCurr
  equity: 300, // feeds opening net assets
} as const

// ── Sign convention ───────────────────────────────────────────────────────────

export type TbSection = 'revenue' | 'expense' | 'asset' | 'liability' | 'equity'

/** Multiplier that turns a natural-positive report value into a TB total. */
export function sectionSign(section: TbSection): 1 | -1 {
  return section === 'revenue' || section === 'liability' || section === 'equity' ? -1 : 1
}

/** Lower-case, letters only — "Other Income" / "OtherIncome" / "other income" agree. */
export function normalizeGroup(label: string): string {
  return label.toLowerCase().replace(/[^a-z]/g, '')
}

/** P&L section groups that are revenue — QBO JSON `group` tags AND export labels. */
export const PNL_REVENUE_GROUPS: ReadonlySet<string> = new Set([
  'income',
  'otherincome',
  'revenue',
  'revenues',
  'revenueandsupport',
  'revenuesandsupport',
  'supportandrevenue',
  'supportandrevenues',
])
/** P&L section groups that are expense. */
export const PNL_EXPENSE_GROUPS: ReadonlySet<string> = new Set([
  'expenses',
  'expense',
  'otherexpenses',
  'otherexpense',
  'cogs',
  'costofgoodssold',
  'costofsales',
])

/**
 * Resolve a P&L row's section from its enclosing groups (outermost→innermost).
 * Innermost wins. Unknown → undefined (the caller decides the fallback; the
 * live path treats it as expense — natural-positive debit).
 */
export function pnlSectionFromGroups(groups: readonly string[]): 'revenue' | 'expense' | undefined {
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = normalizeGroup(groups[i]!)
    if (PNL_REVENUE_GROUPS.has(g)) return 'revenue'
    if (PNL_EXPENSE_GROUPS.has(g)) return 'expense'
  }
  return undefined
}

/**
 * Resolve a balance-sheet row's section from its enclosing groups. Innermost
 * wins (an 'Equity' subsection inside 'LIABILITIES AND EQUITY'). Within one
 * label LIABILITY is tested before EQUITY so a leaf sitting directly under
 * "LIABILITIES AND EQUITY" (no subsection) is a liability, not equity. Unknown
 * → undefined (the live path treats it as asset).
 */
export function bsSectionFromGroups(groups: readonly string[]): 'asset' | 'liability' | 'equity' | undefined {
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = normalizeGroup(groups[i]!)
    if (g.includes('liabilit')) return 'liability'
    if (g.includes('equity')) return 'equity'
    if (g.includes('asset')) return 'asset'
  }
  return undefined
}

/** Sign for a P&L row by its groups — the live path's metadata-less fallback. */
export function pnlGroupSign(groups: readonly string[]): 1 | -1 {
  return sectionSign(pnlSectionFromGroups(groups) ?? 'expense')
}

/** Sign for a balance-sheet row by its groups — the live path's metadata-less fallback. */
export function bsGroupSign(groups: readonly string[]): 1 | -1 {
  return sectionSign(bsSectionFromGroups(groups) ?? 'asset')
}

/**
 * Section implied by an account NUMBER alone — the last-resort fallback for a
 * flat statement with no section rows. Follows the legacy chart AND the
 * 5-digit QBO convention by leading digit: 1 asset · 2 liability · 3 equity ·
 * 4 revenue · 5–9 expense.
 */
export function sectionFromAcct(acct: number): TbSection | undefined {
  if (!Number.isFinite(acct) || acct <= 0) return undefined
  const lead = String(Math.trunc(acct))[0]
  switch (lead) {
    case '1': return 'asset'
    case '2': return 'liability'
    case '3': return 'equity'
    case '4': return 'revenue'
    default: return 'expense'
  }
}

// ── Rounding + the balancing plug ─────────────────────────────────────────────

/** Round to cents — report cells are 2dp; float summing must not leak dust. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const PLUG_ACCT = 399
export const PLUG_DESC = 'Interlocation balance (organization QuickBooks)'

export interface PlugResult {
  rows: NormalizedRow[]
  /** The plug row's total when one was appended (−imbalance), else null. */
  balancePlug: number | null
  /** Σ of the pre-plug totals — how far off balance the rows were. */
  imbalance: number
}

/**
 * A P&L+BS pair rarely balances on its own (a single location's untagged
 * interlocation due-to/due-from entries; a statement pair exported on
 * different days). Absorb the residual into one explicit acct-399 row so the
 * engine's SFP ties — visible and labeled, never silently spread. Within a
 * cent (|Σ| ≤ 0.01) the rows pass through untouched (same array instance).
 */
export function applyBalancePlug(rows: NormalizedRow[], desc: string = PLUG_DESC): PlugResult {
  const diff = round2(rows.reduce((sum, r) => sum + r.total, 0))
  if (Math.abs(diff) <= 0.01) return { rows, balancePlug: null, imbalance: diff }
  const plug = round2(-diff)
  return {
    rows: [...rows, { acct: PLUG_ACCT, desc, total: plug }],
    balancePlug: plug,
    imbalance: diff,
  }
}

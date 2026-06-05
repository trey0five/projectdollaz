// ─────────────────────────────────────────────────────────────
// Derive a school's OPENING net assets from a trial balance instead of
// requiring it to be typed in by hand.
//
// Background — why this is recoverable:
//   A complete trial balance nets to zero (debits = credits). With the
//   engine's sign convention (debit positive, credit negative):
//
//     assets(+) + liabilities(−) + openingEquity(−) + revenue(−) + expense(+) = 0
//
//   The "management" trial balances this engine consumes OMIT the
//   opening net-assets / equity row (see calc/validate.ts). Removing that
//   one row from a balanced TB leaves a residual equal to its negative:
//
//     sum(present rows) = −openingEquity = openingNetAssets   (a credit,
//                                                              shown as +)
//
//   So the figure a user types into "Net assets — beginning" is already
//   present in the file as its own imbalance. This module recovers it.
//
// Three cases, in order of confidence:
//   • 'equity-row'  — the TB INCLUDES a 300-series opening-equity row, so
//                     the opening is read directly (and a complete TB
//                     should net to zero).
//   • 'plug'        — the TB omits equity but DOES carry balance-sheet
//                     accounts (assets/liabilities), so the imbalance is
//                     the opening net assets. Recover it, but it should be
//                     CONFIRMED: the plug absorbs any other omission/error
//                     too, not just the equity row.
//   • 'unavailable' — the TB has no balance-sheet accounts (a pure
//                     revenue/expense extract). Its imbalance is period
//                     activity, NOT opening net assets — fall back to
//                     manual entry or a prior-year roll-forward.
//
// Pure: no IO, no engine-state mutation. Mirrors the account-range
// semantics already used by calc/validate.ts (300–399 = equity).
// ─────────────────────────────────────────────────────────────
import type { Dataset } from '../types/rows.js'

const EPSILON = 0.01

/** Equity / opening-net-assets account range (300-series). */
const EQUITY_MIN = 300
const EQUITY_MAX = 399

/** How the opening figure was obtained. */
export type OpeningNetAssetsSource = 'equity-row' | 'plug' | 'unavailable'

export interface OpeningNetAssetsResult {
  /** Opening net assets as a positive (credit) figure; 0 when unavailable. */
  value: number
  /** Provenance of `value`. */
  source: OpeningNetAssetsSource
  /**
   * True when the figure can be trusted without human confirmation:
   * a complete TB that nets to zero ('equity-row'), or a management TB
   * with balance-sheet accounts ('plug'). 'unavailable' is never confident.
   * Even when true, surfacing the number for review is recommended.
   */
  confident: boolean
  /** Signed sum of every row (the raw plug); shown for transparency. */
  imbalance: number
  hasEquityRow: boolean
  hasBalanceSheet: boolean
  /** Human-readable explanation suitable for a UI hint. */
  note: string
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

const sumTotals = (rows: Dataset): number => rows.reduce((s, r) => s + r.total, 0)

/**
 * Recover opening net assets from a parsed trial balance.
 * @see OpeningNetAssetsResult for the three cases and their confidence.
 */
export function deriveOpeningNetAssets(data: Dataset): OpeningNetAssetsResult {
  const imbalance = round2(sumTotals(data))
  const equityRows = data.filter((r) => r.acct >= EQUITY_MIN && r.acct <= EQUITY_MAX)
  const hasEquityRow = equityRows.length > 0
  // Balance-sheet (asset/liability) accounts sit below the equity range.
  const hasBalanceSheet = data.some((r) => r.acct > 0 && r.acct < EQUITY_MIN)

  if (hasEquityRow) {
    // Complete TB: opening is the equity row(s) themselves (credit → flip sign).
    const value = round2(-sumTotals(equityRows))
    const netsToZero = Math.abs(imbalance) < EPSILON
    return {
      value,
      source: 'equity-row',
      confident: netsToZero,
      imbalance,
      hasEquityRow: true,
      hasBalanceSheet,
      note: netsToZero
        ? `Read opening net assets directly from the trial balance's opening-equity row(s).`
        : `Read the opening-equity row(s), but the trial balance is out of balance by ${imbalance.toFixed(2)} — review before use.`,
    }
  }

  if (hasBalanceSheet) {
    // Management TB with no equity row: the imbalance EQUALS the opening only
    // if the TB is otherwise complete and articulated (assets − liabilities =
    // opening + net change). Real management extracts frequently are NOT — the
    // sample TBs in this repo are imbalanced by ~9.8M against a stated 1.0M
    // opening — so the plug is a SUGGESTION that must be human-confirmed, never
    // auto-applied. Hence confident: false.
    return {
      value: imbalance,
      source: 'plug',
      confident: false,
      imbalance,
      hasEquityRow: false,
      hasBalanceSheet: true,
      note: `Suggested from the trial-balance imbalance, assuming the only missing row is the opening equity. Confirm against your records — if the trial balance doesn't otherwise tie out, this will be wrong.`,
    }
  }

  // No balance-sheet accounts: the imbalance is period activity, not opening.
  return {
    value: 0,
    source: 'unavailable',
    confident: false,
    imbalance,
    hasEquityRow: false,
    hasBalanceSheet: false,
    note: `This trial balance has no balance-sheet accounts, so opening net assets can't be derived from it. Enter it manually or roll forward the prior year's ending balance.`,
  }
}

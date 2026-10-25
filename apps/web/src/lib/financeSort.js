// ─────────────────────────────────────────────────────────────────────────────
// financeSort — "upload your financial files and we'll figure it out" (#43).
//
// One dropped file → ONE verdict about where it belongs, using the parsers the
// three finance tiles already run (so the sorter can never disagree with the
// tile it hands the file to):
//   • budget   — parseBudgetSpread reads it (a month-by-month or annual budget)
//   • monthly  — a month-end / YTD trial balance, or a workbook of monthly tabs
//   • half     — a QuickBooks P&L-only or Balance-Sheet-only export
//   • annual   — a full-year trial balance (one year → This year; several → Add years)
//   • unread   — nothing could read it (the tile's column picker takes over)
//
// PURE given the bytes: no React, no network. The sorter UI maps a verdict to
// a destination tile + a one-line summary.
// ─────────────────────────────────────────────────────────────────────────────
import { parseBudgetSpread } from '@finrep/ingestion'
import { expandFileToCandidates, partitionCandidates, readBytes } from './trendIntake.js'

export const DESTINATION = {
  budget: { option: 'budget', pending: 'budget', label: 'Budget' },
  monthly: { option: 'monthly', pending: 'monthly', label: 'Monthly numbers' },
  'tb-single': { option: 'tb', pending: 'tb-single', label: 'This year’s trial balance' },
  'tb-bulk': { option: 'tb', pending: 'tb-bulk', label: 'Add years' },
}

const HALF_LABEL = { pl: 'Profit and Loss', bs: 'Balance Sheet' }

const isSpreadsheetName = (name) => /\.(xlsx|xls|csv|tsv|txt)$/i.test(name || '')
const isPdfName = (name) => /\.pdf$/i.test(name || '')

/**
 * Classify one file. Returns
 *   { kind, destination, title, detail, candidates?, error? }
 * where `destination` is a DESTINATION key or null (unsupported).
 */
export async function sortFinanceFile(file, memory = null) {
  const name = file?.name || 'file'
  if (isPdfName(name)) {
    return {
      kind: 'unsupported',
      destination: null,
      title: 'PDF',
      detail: 'We can’t read numbers out of a PDF yet. Export the report as Excel or CSV from QuickBooks and drop that instead.',
    }
  }
  if (!isSpreadsheetName(name)) {
    return {
      kind: 'unsupported',
      destination: null,
      title: 'Not a spreadsheet',
      detail: 'Drop an Excel (.xlsx) or CSV export.',
    }
  }

  const bytes = await readBytes(file)

  // 1 — a budget spread. parseBudgetSpread also has an annual-only fallback
  // that accepts ANY sheet with account codes and one number column (a P&L
  // export reads as "a budget" that way), so a budget verdict needs month
  // columns, or the file/sheet to SAY budget.
  if (/\.xlsx?$/i.test(name)) {
    try {
      const spread = parseBudgetSpread(bytes)
      const months = Array.isArray(spread?.monthKeys) ? spread.monthKeys.length : 0
      const saysBudget = /budget/i.test(`${name} ${spread?.sheetName || ''}`) && !/budget\s*(vs\.?|versus|v\.?|to|and)\s*actual/i.test(name)
      if (months >= 2 || saysBudget) {
        return {
          kind: 'budget',
          destination: 'budget',
          title: 'Budget',
          detail: months >= 2 ? `${months} months of budget by account.` : 'An annual budget by account.',
        }
      }
    } catch {
      /* not a budget — fall through */
    }
  }

  // 2 — trial balances and statements, via the Add-years reader (every sheet).
  const candidates = await expandFileToCandidates(name, bytes, memory)
  const parts = partitionCandidates(candidates)

  if (parts.monthly.length > 0 && parts.annual.length === 0) {
    const months = parts.monthly.map((c) => c.metadata?.monthKey || c.periodEndDate).filter(Boolean)
    return {
      kind: 'monthly',
      destination: 'monthly',
      title: parts.monthly.length === 1 ? 'Monthly trial balance' : `${parts.monthly.length} monthly trial balances`,
      detail: months.length ? `Month-end numbers for ${months.slice(0, 3).join(', ')}${months.length > 3 ? '…' : ''}.` : 'Month-end numbers.',
      candidates,
    }
  }
  if (parts.partial.length > 0 && parts.annual.length === 0) {
    const halves = parts.partial.map((c) => HALF_LABEL[c.partial] || 'statement')
    const date = parts.partial[0]?.periodEndDate
    return {
      kind: 'half',
      destination: 'tb-single',
      title: Array.from(new Set(halves)).join(' + '),
      detail:
        halves.length === 1
          ? `Half a trial balance (${halves[0]} only)${date ? ` for ${date}` : ''}. Add the other half to complete this year.`
          : `Both halves of a trial balance${date ? ` for ${date}` : ''} — you can combine them on the next screen.`,
      candidates,
    }
  }
  if (parts.annual.length > 0) {
    const years = Array.from(new Set(parts.annual.map((c) => c.year).filter((y) => y != null))).sort()
    const accounts = parts.annual[0]?.accountCount ?? 0
    if (parts.annual.length > 1 || years.length > 1) {
      return {
        kind: 'multi-year',
        destination: 'tb-bulk',
        title: `${parts.annual.length} years of trial balances`,
        detail: years.length ? `Fiscal years ${years.join(', ')}.` : 'Several annual trial balances.',
        candidates,
      }
    }
    const partialNote = parts.partial.length ? ' Its statement halves ride along.' : ''
    return {
      kind: 'annual',
      destination: 'tb-single',
      title: 'Trial balance',
      detail: `${accounts} accounts${years[0] ? ` · fiscal year ${years[0]}` : ''}.${partialNote}`,
      candidates,
    }
  }
  if (parts.undated.length > 0) {
    return {
      kind: 'annual',
      destination: 'tb-single',
      title: 'Trial balance',
      detail: `${parts.undated[0]?.accountCount ?? 0} accounts · no period date found — you’ll set the year on the next screen.`,
      candidates,
    }
  }
  const err = parts.errors[0]
  return {
    kind: 'unread',
    destination: 'tb-single',
    title: 'Couldn’t read the columns',
    detail: err?.error
      ? `${err.error} We’ll show you the first rows on the next screen so you can point at the right columns.`
      : 'We’ll show you the first rows on the next screen so you can point at the right columns.',
    candidates,
  }
}

/** Group sorted files by destination for the summary + hand-off. */
export function groupByDestination(sorted) {
  const groups = new Map()
  for (const s of sorted) {
    if (!s.destination) continue
    groups.set(s.destination, [...(groups.get(s.destination) || []), s])
  }
  return groups
}

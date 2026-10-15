// ─────────────────────────────────────────────────────────────────────────────
// statementNotes — what a file card SAYS about a QuickBooks statement export
// (#40 / #41 / #32), as plain data the card renders.
//
// Pure and derived from the entry alone, so the honesty rules can be tested
// without rendering: half a trial balance is never called "Balanced", a merged
// P&L + Balance Sheet says it was combined and shows the balancing line's
// amount, and every account KYRO numbered itself is listed so a person can see
// (and change) the number.
// ─────────────────────────────────────────────────────────────────────────────
import { fmtDollar, formatShortDate } from './format.js'

const HALF_LABEL = { pl: 'Profit and Loss', bs: 'Balance Sheet' }
const HALF_PLURAL = { pl: 'income statements', bs: 'balance sheets' }

/** 'pl' | 'bs' | 'full' | null — the statement shape stored on the entry. */
export function statementPartial(file) {
  const p = file?.metadata?.statement?.partial
  return p === 'pl' || p === 'bs' || p === 'full' ? p : null
}

/**
 * The balance pill. Half a trial balance REPLACES "Balanced" — an income
 * statement alone always nets to its own surplus, so "Balanced" would be true
 * of the arithmetic and false of the books.
 * → { kind: 'half', label, half } | { kind: 'balanced' } | { kind: 'offBy', amount, label }
 *   | { kind: 'unbalanced' }
 */
export function balancePill(file) {
  const p = statementPartial(file)
  if (p === 'pl') return { kind: 'half', half: 'pl', label: 'Income only' }
  if (p === 'bs') return { kind: 'half', half: 'bs', label: 'Balance sheet only' }
  const b = file?.balance
  if (!b?.balanced) return { kind: 'unbalanced' }
  // The engine calls a trial balance with no opening net-assets row "balanced"
  // (that row is supplied elsewhere) — but debits and credits that are far
  // apart are never "Balanced" on the card: live-caught, a file read with only
  // its DEBIT column showed "Balanced" over half the books.
  const diff = Math.abs(Number(b.difference) || 0)
  if (diff >= 1) return { kind: 'offBy', amount: diff, label: `Off by ${fmtWhole(diff)}` }
  return { kind: 'balanced' }
}

const fmtWhole = (n) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`

/** P&L accounts KYRO had to number itself (revenue/expense synthesized rows). */
export function numberedAccounts(file) {
  const synth = file?.metadata?.statement?.synthesized
  if (!Array.isArray(synth)) return []
  return synth.filter((s) => s && (s.section === 'revenue' || s.section === 'expense'))
}

/** Set of account numbers KYRO numbered (for the "to review" tag). */
export function numberedAcctSet(file) {
  return new Set(numberedAccounts(file).map((s) => Number(s.acct)))
}

/** Asks the trial-balance step to switch to its "Add years" tab. */
export const OPEN_ADD_YEARS_EVENT = 'finrep:open-add-years'

/**
 * A workbook with MORE statements than one trial balance can hold (e.g. "P&L
 * Jan 2026", "P&L FY26", "Balance Sheet"): the parser used the sheets that make
 * one picture and says which (metadata.statement.workbook). → { statements,
 * used: string[], unused: string[] } | null. Keyed on the object, not its code
 * (an import saved earlier may carry no code).
 */
export function workbookNote(file) {
  const wb = file?.metadata?.statement?.workbook
  if (!wb || typeof wb !== 'object') return null
  const used = Array.isArray(wb.used) ? wb.used.filter(Boolean).map(String) : []
  const unused = Array.isArray(wb.unused) ? wb.unused.filter(Boolean).map(String) : []
  if (used.length === 0 && unused.length === 0) return null
  const n = Number(wb.statements)
  return { statements: Number.isFinite(n) && n > 0 ? n : used.length + unused.length, used, unused }
}

/** The parser's own copy of the workbook note — shown as a line, so kept out of "N notes". */
const isWorkbookWarning = (w) => typeof w === 'string' && /^This workbook has \d+ statements/.test(w)

/** The parser's notes the card lists under "N notes" (the workbook line is shown on its own). */
export function visibleWarnings(file) {
  const w = Array.isArray(file?.warnings) ? file.warnings.filter(Boolean) : []
  return workbookNote(file) ? w.filter((x) => !isWorkbookWarning(x)) : w
}

/**
 * Lines under the chips, in order. Each line is { key, tone, text, action? }
 * where action = { kind, label, ... } for the card to wire up.
 */
export function statementLines(file) {
  const lines = []
  if (!file || file.status !== 'ready') return lines
  const st = file.metadata?.statement
  const p = statementPartial(file)
  const note = file.pairNote || null
  const wb = workbookNote(file)

  // The workbook held more statements than one picture: say which ones KYRO
  // used, in plain sight (not behind "1 note"), with the way to add the rest.
  if (wb) {
    const quoted = (xs) => xs.map((x) => `“${x}”`).join(' + ')
    lines.push({
      key: 'workbook',
      tone: 'watch',
      text:
        `This workbook has ${wb.statements} statements: we used ${quoted(wb.used)}.` +
        (wb.unused.length ? ` Use Add years for the others (${wb.unused.map((x) => `“${x}”`).join(', ')}).` : ''),
      action: wb.unused.length && !file.fromHistory ? { kind: 'addYears', label: 'Open Add years' } : null,
    })
  }

  if (p === 'pl' || p === 'bs') {
    const other = p === 'pl' ? 'bs' : 'pl'
    if (note?.why === 'date-mismatch' && note.partnerDate) {
      lines.push({
        key: 'pair',
        tone: 'watch',
        text: `Its ${HALF_LABEL[other]} is for ${formatShortDate(note.partnerDate)}, so we kept them apart.`,
        action: note.partnerId ? { kind: 'combine', label: 'Combine anyway', partnerId: note.partnerId } : null,
      })
    } else if (note?.why === 'no-date' && note.partnerId) {
      lines.push({
        key: 'pair',
        tone: 'watch',
        text: 'We couldn’t read a date on one of them.',
        action: { kind: 'combine', label: `Combine with ${note.partnerName || 'the other file'}`, partnerId: note.partnerId },
      })
    } else if (note?.why === 'ambiguous') {
      const doubled = note.doubled === 'pl' || note.doubled === 'bs' ? note.doubled : p
      const date = file.metadata?.periodEndDate
      lines.push({
        key: 'pair',
        tone: 'watch',
        text: `Two ${HALF_PLURAL[doubled]} end ${date ? formatShortDate(date) : 'on the same day'} — remove one to combine.`,
      })
    } else if (!wb) {
      // The way to add the other half is RIGHT HERE, into this file's own slot —
      // never the nearest empty box, which is "Last year's trial balance".
      lines.push({
        key: 'half',
        tone: 'watch',
        text:
          p === 'pl'
            ? 'Income statement only — add a Balance Sheet export for the full picture.'
            : 'Balance sheet only — add a Profit and Loss export for the full picture.',
        action:
          file.fromHistory || file.mergedFrom
            ? null
            : { kind: 'addHalf', label: p === 'pl' ? 'Add its Balance Sheet' : 'Add its Profit and Loss', role: file.role ?? null },
      })
    }
  } else if (p === 'full') {
    lines.push({ key: 'combined', tone: 'quiet', text: 'Profit and Loss + Balance Sheet combined.' })
    const plug = st?.balancePlug
    if (plug != null && Number.isFinite(Number(plug)) && Number(plug) !== 0) {
      lines.push({
        key: 'plug',
        tone: 'watch',
        text: `They were ${fmtDollar(Math.abs(Number(plug))).replace('$ ', '$')} apart, so we added one balancing line (account 399).`,
      })
    }
  }

  const layout = file.metadata?.layout
  const canChange = !!file.bytes && !file.mergedFrom && !file.fromHistory
  if (layout?.source === 'picked') {
    lines.push({
      key: 'layout',
      tone: 'quiet',
      text: 'Read with your columns',
      action: canChange ? { kind: 'columns', label: 'Change' } : null,
    })
  } else if (layout?.source === 'remembered') {
    lines.push({
      key: 'layout',
      tone: 'quiet',
      text: 'Read with your saved columns',
      action: canChange ? { kind: 'columns', label: 'Change' } : null,
    })
  } else if (canChange && !st) {
    // NOT on a QuickBooks statement the automatic read walked (metadata.statement):
    // it was read by its STRUCTURE — sections, Total rows, names that carry
    // the numbers — not by columns, and a flat column pick on it garbled the
    // books live (2026-10-15: Budget taken as the account numbers, signs and
    // the Balance Sheet lost). The picker stays for failed reads and plain tables.
    lines.push({
      key: 'layout',
      tone: 'faint',
      text: 'Wrong numbers?',
      action: { kind: 'columns', label: 'Change columns' },
    })
  }
  return lines
}

/** "{n} accounts had no number, so KYRO numbered them." (null when none). */
export function numberedSummary(file) {
  const n = numberedAccounts(file).length
  if (n === 0) return null
  return n === 1
    ? '1 account had no number, so KYRO numbered it.'
    : `${n} accounts had no number, so KYRO numbered them.`
}

/** "{n} note(s)" over the parser's warnings (null when none). */
export function notesSummary(file) {
  const w = visibleWarnings(file)
  if (w.length === 0) return null
  return `${w.length} note${w.length === 1 ? '' : 's'}`
}

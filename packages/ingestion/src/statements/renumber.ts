// ─────────────────────────────────────────────────────────────
// Re-keying a number KYRO gave an unnumbered P&L account (#40). Only a
// synthesized revenue / expense number can change, only to a whole number in
// its own block (income 4…, expense 5–9…), and never onto a number another
// row already uses. The memory then pins the person's number next time.
// ─────────────────────────────────────────────────────────────
import type { NormalizedRow, SheetMetadata } from '../types.js'
import { round2, sectionFromAcct } from './tbConventions.js'

function findEntry(metadata: SheetMetadata | null | undefined, fromAcct: number) {
  const synth = metadata?.statement?.synthesized
  if (!Array.isArray(synth)) return -1
  return synth.findIndex((s) => s && s.acct === fromAcct && (s.section === 'revenue' || s.section === 'expense'))
}

/** null = OK, else the plain message to show. */
export function validateSyntheticRenumber(
  rows: NormalizedRow[],
  metadata: SheetMetadata,
  fromAcct: number,
  toAcct: number,
): string | null {
  const at = findEntry(metadata, fromAcct)
  if (at < 0) return 'Only accounts KYRO numbered can be renumbered.'
  if (!Number.isInteger(toAcct) || toAcct < 1 || toAcct > 999_999) return 'Use a whole number.'
  if (toAcct === fromAcct) return null
  const section = metadata.statement!.synthesized[at]!.section
  if (section === 'revenue' && sectionFromAcct(toAcct) !== 'revenue') return 'Income accounts start with 4.'
  if (section === 'expense' && sectionFromAcct(toAcct) !== 'expense') return 'Expense accounts start with 5, 6, 7, 8 or 9.'
  const holder = rows.find((r) => r.acct === toAcct)
  if (holder) return `Already used by "${holder.desc}".`
  return null
}

/**
 * Rewrite one synthesized account's number: its row, its synthesized entry
 * ({ acct: to, source: 'user' }, name + section unchanged) and its section
 * fact. Throws Error(message) when validateSyntheticRenumber refuses.
 */
export function renumberSynthetic(
  rows: NormalizedRow[],
  metadata: SheetMetadata,
  fromAcct: number,
  toAcct: number,
): { rows: NormalizedRow[]; metadata: SheetMetadata } {
  const msg = validateSyntheticRenumber(rows, metadata, fromAcct, toAcct)
  if (msg) throw new Error(msg)
  if (toAcct === fromAcct) return { rows: [...rows], metadata: { ...metadata } }
  const st = metadata.statement!
  const at = findEntry(metadata, fromAcct)
  const entry = st.synthesized[at]!
  let done = false
  const nextRows = rows.map((r) => {
    if (done || r.acct !== fromAcct) return r
    done = true
    return { ...r, acct: toAcct }
  })
  const synthesized = st.synthesized.map((s, i) =>
    i === at ? { acct: toAcct, name: entry.name, section: entry.section, source: 'user' as const } : s,
  )
  const statement = { ...st, synthesized }
  if (st.sections && Object.prototype.hasOwnProperty.call(st.sections, String(fromAcct))) {
    const sections = { ...st.sections }
    sections[String(toAcct)] = sections[String(fromAcct)]!
    delete sections[String(fromAcct)]
    statement.sections = sections
  }
  const net = round2(nextRows.reduce((s, r) => s + (Number.isFinite(r.total) ? r.total : 0), 0))
  return { rows: nextRows, metadata: { ...metadata, net, statement } }
}

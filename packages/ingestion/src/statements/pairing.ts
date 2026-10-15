// ─────────────────────────────────────────────────────────────
// Statement halves (#40 / #41 S-D): a QuickBooks P&L export and a Balance
// Sheet export are each HALF a trial balance. These pure helpers say which
// half a parsed file is, pair halves that share a period end (never guessing
// when it is ambiguous), rebuild a StatementSheetResult from stored rows so
// mergeStatementResults can combine them, and key synthesized P&L numbers by
// name for the school's memory.
// ─────────────────────────────────────────────────────────────
import type { NormalizedRow, SheetMetadata, StatementMetadata } from '../types.js'
import type { StatementSheetResult } from './statementAdapter.js'
import { normalizeLeafName } from './tbConventions.js'

/** "revenue:tuition", "expense:supplies#2" — section + normalised name (+ ordinal for repeats). */
export function syntheticKey(section: 'revenue' | 'expense', name: string, ordinal = 1): string {
  const base = `${section}:${normalizeLeafName(name)}`
  return ordinal > 1 ? `${base}#${ordinal}` : base
}

/**
 * Per synthesized entry, its memory key — null for balance-sheet entries
 * (their numbers are shared engine families, never pinned). Ordinals count
 * repeats of the same section + name in list order.
 */
export function syntheticKeys(synth: StatementMetadata['synthesized'] | null | undefined): Array<string | null> {
  const seen = new Map<string, number>()
  return (synth ?? []).map((e) => {
    if (!e || (e.section !== 'revenue' && e.section !== 'expense')) return null
    const base = syntheticKey(e.section, String(e.name ?? ''))
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n > 1 ? `${base}#${n}` : base
  })
}

export type StatementHalf = 'pl' | 'bs'

/** 'pl' / 'bs' when the file is half a trial balance, else null (a full TB, a merged pair, no statement). */
export function statementHalf(md: SheetMetadata | null | undefined): StatementHalf | null {
  const p = md?.statement?.partial
  return p === 'pl' || p === 'bs' ? p : null
}

export interface PairResult<T> {
  pairs: Array<{ pl: T; bs: T }>
  unpaired: Array<{
    item: T
    half: StatementHalf
    why: 'no-partner' | 'no-date' | 'date-mismatch' | 'ambiguous'
    partnerDate?: string
  }>
}

/**
 * Auto-pair halves sharing metadata.periodEndDate. A date with EXACTLY one
 * P&L half + one BS half (and canPair) pairs. Two or more of a kind on a date
 * where the other kind is present → everything on that date is 'ambiguous'
 * (two P&Ls and no BS → each 'no-partner'). Undated → 'no-date'. A half alone
 * on its date → 'date-mismatch' (partnerDate = the other date) when exactly
 * one unpaired opposite half exists on another date, else 'no-partner'.
 * Never guesses. Items that are not a half are ignored.
 */
export function pairStatements<T>(
  items: readonly T[],
  meta: (t: T) => SheetMetadata | null | undefined,
  opts?: { canPair?: (pl: T, bs: T) => boolean },
): PairResult<T> {
  type H = { item: T; half: StatementHalf; date: string | null; order: number }
  const halves: H[] = []
  items.forEach((item, order) => {
    const md = meta(item)
    const half = statementHalf(md)
    if (!half) return
    const date = typeof md?.periodEndDate === 'string' && md.periodEndDate ? md.periodEndDate : null
    halves.push({ item, half, date, order })
  })

  const pairs: PairResult<T>['pairs'] = []
  const verdict = new Map<H, { why: PairResult<T>['unpaired'][number]['why']; partnerDate?: string }>()
  const paired = new Set<H>()

  const byDate = new Map<string, H[]>()
  for (const h of halves) {
    if (h.date == null) {
      verdict.set(h, { why: 'no-date' })
      continue
    }
    const list = byDate.get(h.date) ?? []
    list.push(h)
    byDate.set(h.date, list)
  }
  const alone: H[] = []
  for (const list of byDate.values()) {
    const pls = list.filter((h) => h.half === 'pl')
    const bss = list.filter((h) => h.half === 'bs')
    if (pls.length === 1 && bss.length === 1) {
      const pl = pls[0]!
      const bs = bss[0]!
      if (!opts?.canPair || opts.canPair(pl.item, bs.item)) {
        pairs.push({ pl: pl.item, bs: bs.item })
        paired.add(pl).add(bs)
      } else {
        verdict.set(pl, { why: 'no-partner' })
        verdict.set(bs, { why: 'no-partner' })
      }
    } else if (pls.length > 0 && bss.length > 0) {
      for (const h of list) verdict.set(h, { why: 'ambiguous' })
    } else {
      alone.push(...list)
    }
  }
  // A half alone on its date: point at the ONE opposite half waiting elsewhere.
  for (const h of alone) {
    const others = alone.filter((o) => o.half !== h.half && o.date !== h.date)
    if (others.length === 1) verdict.set(h, { why: 'date-mismatch', partnerDate: others[0]!.date! })
    else verdict.set(h, { why: 'no-partner' })
  }

  const unpaired: PairResult<T>['unpaired'] = []
  for (const h of halves) {
    if (paired.has(h)) continue
    const v = verdict.get(h) ?? { why: 'no-partner' as const }
    unpaired.push(v.partnerDate ? { item: h.item, half: h.half, why: v.why, partnerDate: v.partnerDate } : { item: h.item, half: h.half, why: v.why })
  }
  return { pairs, unpaired }
}

/**
 * Rebuild a StatementSheetResult from stored rows + metadata (an intake entry,
 * a bulk candidate, a parsed chat attachment) so mergeStatementResults can
 * combine two halves. null unless the metadata says it is a P&L or BS half.
 */
export function asStatementResult(
  rows: NormalizedRow[],
  metadata: SheetMetadata | null | undefined,
  warnings?: string[],
): StatementSheetResult | null {
  if (!metadata || !statementHalf(metadata) || !Array.isArray(rows)) return null
  const st = metadata.statement!
  const statement: StatementMetadata = {
    ...st,
    synthesized: Array.isArray(st.synthesized) ? st.synthesized : [],
  }
  return {
    rows,
    startRow: 0,
    ...(warnings && warnings.length ? { warnings } : {}),
    metadata: { ...metadata, statement },
  }
}

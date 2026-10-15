// ─────────────────────────────────────────────────────────────
// A school's intake memory (#32, #41 S-B(b)), DERIVED from its Import.metadata
// history — no table of its own:
//   • layouts   — column layouts a person picked (metadata.layout), so the
//                 next file laid out the same way reads without asking;
//   • synthetic — the numbers KYRO gave unnumbered P&L accounts last time
//                 (metadata.statement.synthesized), keyed by section + the
//                 normalised name, so a re-ordered export keeps them.
//
// Pure + defensive: metadata is client-written JSON, so every field is type-
// and range-checked and counts are capped. The live QuickBooks sync's imports
// (metadata.source === 'quickbooks') are ignored.
// ─────────────────────────────────────────────────────────────
import type { IntakeMemory, SavedLayout, StatementMetadata, SyntheticRegistry } from '../types.js'
import { sectionFromAcct } from '../statements/tbConventions.js'
import { syntheticKeys } from '../statements/pairing.js'

export const EMPTY_INTAKE_MEMORY: IntakeMemory = Object.freeze({
  layouts: Object.freeze([]) as unknown as SavedLayout[],
  synthetic: Object.freeze({}) as SyntheticRegistry,
}) as IntakeMemory

const MAX_LAYOUTS = 20
const MAX_PINS = 2000

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isIdx = (v: unknown, max = 255): v is number => Number.isInteger(v) && (v as number) >= -1 && (v as number) <= max

function asLayout(v: unknown): SavedLayout | null {
  if (!isObj(v)) return null
  const { sheet, headerRow, acct, desc, amount, debit, credit, signature, source } = v
  if (!isIdx(headerRow, 1000)) return null
  if (![acct, desc, amount, debit, credit].every((i) => isIdx(i))) return null
  if (typeof signature !== 'string' || signature.length === 0 || signature.length > 300) return null
  if (!(sheet == null || (typeof sheet === 'string' && sheet.length <= 120))) return null
  if (source !== 'picked' && source !== 'remembered') return null
  return {
    sheet: (sheet as string | null | undefined) ?? null,
    headerRow,
    acct: acct as number,
    desc: desc as number,
    amount: amount as number,
    debit: debit as number,
    credit: credit as number,
    signature,
    source,
  }
}

type SynthEntry = StatementMetadata['synthesized'][number]

function asSynthesized(v: unknown): SynthEntry[] {
  if (!Array.isArray(v)) return []
  const out: SynthEntry[] = []
  for (const e of v) {
    if (!isObj(e)) continue
    const { acct, name, section } = e
    if (typeof name !== 'string' || typeof acct !== 'number') continue
    if (section !== 'revenue' && section !== 'expense' && section !== 'asset' && section !== 'liability' && section !== 'equity') continue
    out.push({ acct, name, section })
  }
  return out
}

/**
 * Build the memory from Import.metadata values, NEWEST FIRST. The newest
 * layout per signature wins (≤ 20); the newest pin per key wins, and a number
 * already claimed by a newer key is never pinned twice (≤ 2000).
 */
export function buildIntakeMemory(metadataNewestFirst: unknown[]): IntakeMemory {
  const layouts: SavedLayout[] = []
  const seenSig = new Set<string>()
  const synthetic: SyntheticRegistry = {}
  const claimed = new Set<number>()
  let pins = 0
  for (const md of Array.isArray(metadataNewestFirst) ? metadataNewestFirst : []) {
    if (!isObj(md)) continue
    if (md.source === 'quickbooks') continue

    if (layouts.length < MAX_LAYOUTS) {
      const layout = asLayout(md.layout)
      if (layout && !seenSig.has(layout.signature!)) {
        seenSig.add(layout.signature!)
        layouts.push(layout)
      }
    }

    if (pins >= MAX_PINS) continue
    const st = md.statement
    if (!isObj(st)) continue
    const synth = asSynthesized(st.synthesized)
    const keys = syntheticKeys(synth)
    synth.forEach((e, i) => {
      const key = keys[i]
      if (!key || pins >= MAX_PINS) return
      if (e.section !== 'revenue' && e.section !== 'expense') return
      if (!Number.isInteger(e.acct) || e.acct < 1 || e.acct > 999_999) return
      if (sectionFromAcct(e.acct) !== e.section) return
      if (Object.prototype.hasOwnProperty.call(synthetic, key)) return // a newer import already pinned it
      if (claimed.has(e.acct)) return // that number belongs to another (newer) key
      synthetic[key] = { acct: e.acct, section: e.section, name: e.name }
      claimed.add(e.acct)
      pins++
    })
  }
  return { layouts, synthetic }
}

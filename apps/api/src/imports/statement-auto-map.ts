// ─────────────────────────────────────────────────────────────────────────────
// A1 — statement accounts sort themselves (server side).
//
// A QuickBooks statement export (P&L / Balance Sheet) records the report
// SECTION each account was printed under (metadata.statement.sections, written
// by @finrep/ingestion). That is as reliable as the AccountType the live
// QuickBooks sync maps by, so a fresh school's 5-digit accounts no longer need
// a person to confirm every name-only guess before the Finance page can read
// them.
//
// This is the server half: whenever an import that carries section facts is
// saved — the Add-data intake, or a KYRO-chat import that has no review step
// at all — the accounts the school's mapping does not know yet are merged with
// the engine's SURE section-backed category (suggestStatementCategories). An
// account whose class is known but whose exact category is unclear (sure:
// false) is left for the review step; a real trial balance has no section
// facts, so it keeps today's confirm-first behaviour exactly. An account the
// mapping already knows (a default or anything the school picked) is NEVER
// re-pointed.
//
// Pure (no I/O) so the rule is unit-testable; ImportsService does the merge.
// ─────────────────────────────────────────────────────────────────────────────
import { categoryDef, suggestStatementCategories, type SCoaCategory, type StatementSectionFact } from '@finrep/engine'

/** The most account→category picks one import may auto-apply (the PATCH /mapping cap). */
export const AUTO_MAP_MAX = 500

interface RowLike {
  acct: number
  desc: string
  total: number
}

/** metadata.statement.sections when it is a usable object, else null. */
export function statementSectionsOf(
  metadata: unknown,
): Record<string, StatementSectionFact> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const st = (metadata as { statement?: unknown }).statement
  if (!st || typeof st !== 'object' || Array.isArray(st)) return null
  const sections = (st as { sections?: unknown }).sections
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return null
  // Client-written JSON: keep only well-shaped facts.
  const out: Record<string, StatementSectionFact> = {}
  for (const [acct, fact] of Object.entries(sections as Record<string, unknown>)) {
    if (!/^\d+$/.test(acct) || !fact || typeof fact !== 'object') continue
    const f = fact as { statement?: unknown; section?: unknown; basis?: unknown }
    if ((f.statement !== 'pl' && f.statement !== 'bs') || typeof f.section !== 'string') continue
    out[acct] = {
      statement: f.statement,
      section: f.section,
      ...(f.basis === 'section' || f.basis === 'number' || f.basis === 'position' ? { basis: f.basis } : {}),
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * The mapping patch ({ "41000": "contributions", … }) for the accounts of a
 * statement import that the school's mapping doesn't know yet and whose
 * category the report section settles for sure. {} for a plain trial balance.
 *
 * @param known the school's EFFECTIVE mapping (defaults ∪ its own picks); any
 *              acct present here is left alone.
 */
export function statementAutoMapping(
  rows: readonly RowLike[],
  metadata: unknown,
  known: Readonly<Record<string | number, unknown>>,
): Record<string, SCoaCategory> {
  const sections = statementSectionsOf(metadata)
  if (!sections) return {}
  const fresh = rows.filter(
    (r) =>
      Number.isInteger(r.acct) &&
      r.acct > 0 &&
      known[r.acct] == null &&
      known[String(r.acct)] == null,
  )
  if (fresh.length === 0) return {}
  const suggestions = suggestStatementCategories(
    fresh.map((r) => ({ acct: r.acct, desc: r.desc, total: r.total })),
    sections,
  )
  const patch: Record<string, SCoaCategory> = {}
  for (const [acct, s] of Object.entries(suggestions)) {
    if (!s.sure || !categoryDef(s.category)) continue
    patch[acct] = s.category
    if (Object.keys(patch).length >= AUTO_MAP_MAX) break
  }
  return patch
}

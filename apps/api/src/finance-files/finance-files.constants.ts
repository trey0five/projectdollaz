// ─────────────────────────────────────────────────────────────────────────────
// Finance "Already on file" + "Recently removed" — pure shared helpers.
//
// Zero Nest, zero IO. Both the inventory read and the removal/restore service
// (and ImportsService, for the drill-down source badge) use these, so the
// labels, the half / source reading and the budget "present" rule can never
// drift between the list a person sees and what Remove acts on.
// ─────────────────────────────────────────────────────────────────────────────

/** How long removed finance data stays restorable (the person is told "30 days"). */
export const RESTORE_DAYS = 30

export const REMOVAL_KINDS = ['trial_balance', 'monthly', 'budget'] as const
export type RemovalKind = (typeof REMOVAL_KINDS)[number]

export type FileHalf = 'pl' | 'bs' | 'full' | null
export type FileSource = 'quickbooks' | 'upload' | 'unknown'
export type BudgetKind = 'spread' | 'driver' | 'lines' | 'totals'

export interface Person {
  id: string
  name: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** When a removal made at `d` stops being restorable. */
export function expiresFrom(d: Date = new Date()): Date {
  return new Date(d.getTime() + RESTORE_DAYS * DAY_MS)
}

/** 'YYYY-MM-DD' for a DB date (stored at UTC midnight, so no timezone shift). */
export function ymd(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

/**
 * The short year name a person reads: a June 30 year-end is "FY25"; any other
 * end keeps the stored label. The web uses the identical rule.
 */
export function shortLabelFor(p: { label: string; periodEndDate: Date | string }): string {
  const end = ymd(p.periodEndDate)
  return end.endsWith('-06-30') ? `FY${end.slice(2, 4)}` : p.label
}

/** A raw metadata.statement.partial value → the public half. */
export function halfFromPartial(partial: unknown): FileHalf {
  if (partial === 'pl' || partial === 'bs') return partial
  if (partial === 'full') return 'full'
  return null
}

/** Which half of a statement export a stored import is (null = a plain trial balance). */
export function halfOf(metadata: unknown): FileHalf {
  if (!metadata || typeof metadata !== 'object') return null
  const statement = (metadata as { statement?: unknown }).statement
  if (!statement || typeof statement !== 'object') return null
  return halfFromPartial((statement as { partial?: unknown }).partial)
}

/** A raw metadata.source string → the public source enum. */
export function sourceFromRaw(source: unknown): FileSource {
  if (source === 'quickbooks') return 'quickbooks'
  if (source === 'upload') return 'upload'
  return 'unknown'
}

/** Read an import's stored metadata.source into the public source enum. */
export function readSourceType(metadata: unknown): FileSource {
  const source =
    metadata && typeof metadata === 'object'
      ? (metadata as { source?: unknown }).source
      : undefined
  return sourceFromRaw(source)
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function nonEmptyObject(v: unknown): boolean {
  const o = asObject(v)
  return !!o && Object.keys(o).length > 0
}

/**
 * A budget row only counts as "on file" when it holds budget numbers: totals,
 * an imported month-by-month spread, a guided-setup (driver) model, or category
 * lines. A row that is only notes/methods (or the web's "clear", which PUTs
 * nulls) reads as no budget.
 */
export function isBudgetPresent(
  row: { totalRevenue?: unknown; totalExpenses?: unknown; lines?: unknown } | null | undefined,
): boolean {
  if (!row) return false
  if (row.totalRevenue != null || row.totalExpenses != null) return true
  const lines = asObject(row.lines)
  if (!lines) return false
  if (lines.spread != null || lines.driverModel != null) return true
  return nonEmptyObject(lines.revenue) || nonEmptyObject(lines.expense)
}

/**
 * A budget row that is not "present" can still hold the person's own work: a
 * year-end forecast saved on its own (BudgetService.upsertForecast writes only
 * lines.forecast), the guided-setup methods, or notes. Restoring a removed budget
 * must never drop such a row silently, so it counts as "the slot is filled".
 * Only a truly empty row (the web's "clear" PUT of nulls) may be dropped.
 */
export function budgetHoldsWork(
  row: { totalRevenue?: unknown; totalExpenses?: unknown; lines?: unknown; notes?: unknown } | null | undefined,
): boolean {
  if (!row) return false
  if (isBudgetPresent(row)) return true
  if (typeof row.notes === 'string' && row.notes.trim() !== '') return true
  const lines = asObject(row.lines)
  if (!lines) return false
  if (lines.forecast != null) return true
  const methods = lines.methods
  if (methods == null) return false
  return typeof methods === 'object' ? nonEmptyObject(methods) || (Array.isArray(methods) && methods.length > 0) : true
}

/** How the budget was made, most specific first. */
export function budgetKind(linesRaw: unknown): BudgetKind {
  const lines = asObject(linesRaw)
  if (!lines) return 'totals'
  const spread = asObject(lines.spread)
  if (spread?.format === 'driver' || lines.driverModel != null) return 'driver'
  if (lines.spread != null) return 'spread'
  if (nonEmptyObject(lines.revenue) || nonEmptyObject(lines.expense)) return 'lines'
  return 'totals'
}

/** True when a saved year-end forecast rides along with the budget row. */
export function budgetHasForecast(linesRaw: unknown): boolean {
  const lines = asObject(linesRaw)
  return !!lines && lines.forecast != null
}

/** "First Last", else the part of the email before "@"; null when unknown. */
export function personName(
  user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined,
): string | null {
  if (!user) return null
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
  if (full) return full
  const local = (user.email ?? '').split('@')[0]?.trim()
  return local || null
}

export type UserLite = {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

/** A Person for a user id, or null when the user is unknown/deleted. */
export function toPerson(
  id: string | null | undefined,
  usersById: Map<string, UserLite>,
): Person | null {
  if (!id) return null
  const u = usersById.get(id)
  if (!u) return null
  const name = personName(u)
  return name ? { id: u.id, name } : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Which OTHER years' comparisons change when a trial balance stack is removed
// (or put back). Pure — zero IO.
//
// It runs the REAL comparative resolver (statements/comparative-resolver.ts)
// over import stubs with no rows: the resolver only reads `.rows` inside
// rowsOf(), so the resolved import ids it returns are exact. "FY26 loses its
// prior-year comparison" is therefore the same rule generate() will apply.
// ─────────────────────────────────────────────────────────────────────────────
import type { Import } from '@finrep/db'
import {
  resolveComparatives,
  type ResolverPeriod,
} from '../statements/comparative-resolver.js'

export interface ImportLite {
  id: string
  fiscalPeriodId: string
  role: string
  createdAt: Date
}

export interface PeriodLite {
  id: string
  periodEndDate: Date
}

export interface ComparativeSource {
  pyImportId: string | null
  pyFromPeriodId: string | null
  auditImportId: string | null
  auditFromPeriodId: string | null
}

export type ComparisonKind = 'prior-year' | 'audited'

export interface ChangedComparison {
  periodId: string
  comparison: ComparisonKind
  /** Where that comparison comes from afterwards (null = none). */
  afterFromPeriodId: string | null
}

type Role = 'cy' | 'py' | 'audit'

/**
 * Mirrors StatementsService.buildResolverPeriods: the ACTIVE (newest createdAt)
 * import per role per period, cast as Import with no rows.
 */
export function toResolverPeriods(periods: PeriodLite[], imports: ImportLite[]): ResolverPeriod[] {
  const sorted = [...imports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const byPeriod = new Map<string, Record<Role, Import | null>>()
  for (const p of periods) byPeriod.set(p.id, { cy: null, py: null, audit: null })
  for (const imp of sorted) {
    const slot = byPeriod.get(imp.fiscalPeriodId)
    const role = imp.role as Role
    if (slot && role in slot && slot[role] === null) {
      slot[role] = { ...imp, rows: [] } as unknown as Import
    }
  }
  return periods.map((period) => ({
    period: { id: period.id, periodEndDate: period.periodEndDate },
    active: byPeriod.get(period.id) ?? { cy: null, py: null, audit: null },
  }))
}

/** One period's resolved comparison sources (whether or not it has a cy). */
export function sourceFor(resolverPeriods: ResolverPeriod[], periodId: string): ComparativeSource {
  const r = resolveComparatives({ targetPeriodId: periodId, periods: resolverPeriods }).resolved
  return {
    pyImportId: r.pyImportId,
    pyFromPeriodId: r.pyFromPeriodId,
    auditImportId: r.auditImportId,
    auditFromPeriodId: r.auditFromPeriodId,
  }
}

/** Resolved comparison sources for every period that has statements (an active cy). */
export function comparativeSources(resolverPeriods: ResolverPeriod[]): Map<string, ComparativeSource> {
  const out = new Map<string, ComparativeSource>()
  for (const p of resolverPeriods) {
    if (!p.active.cy) continue
    out.set(p.period.id, sourceFor(resolverPeriods, p.period.id))
  }
  return out
}

/** The import set with a whole (period, role) stack gone — every version, not just the newest. */
export function withoutSlot<T extends { fiscalPeriodId: string; role: string }>(
  imports: T[],
  periodId: string,
  role: string,
): T[] {
  return imports.filter((i) => !(i.fiscalPeriodId === periodId && i.role === role))
}

/**
 * Periods (other than `excludePeriodId`) whose prior-year or audited source
 * changes between `before` and `after`. One entry per changed comparison. Only
 * periods present in `before` are considered (a period that gains statements
 * is not "affected"); a period missing from `after` is skipped.
 */
export function changedPeriods(
  before: Map<string, ComparativeSource>,
  after: Map<string, ComparativeSource>,
  excludePeriodId: string,
): ChangedComparison[] {
  const out: ChangedComparison[] = []
  for (const [periodId, b] of before) {
    if (periodId === excludePeriodId) continue
    const a = after.get(periodId)
    if (!a) continue
    if (b.pyImportId !== a.pyImportId) {
      out.push({ periodId, comparison: 'prior-year', afterFromPeriodId: a.pyFromPeriodId })
    }
    if (b.auditImportId !== a.auditImportId) {
      out.push({ periodId, comparison: 'audited', afterFromPeriodId: a.auditFromPeriodId })
    }
  }
  return out
}

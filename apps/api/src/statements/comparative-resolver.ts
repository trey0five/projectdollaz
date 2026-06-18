import type { FiscalPeriod, Import } from '@finrep/db'
import type { NormalizedRow } from '@finrep/engine'

/**
 * COMPARATIVE RESOLUTION RULE (pure, deterministic given the import set + override)
 * ─────────────────────────────────────────────────────────────────────────────
 * For a target period P:
 *  1. CY  = the ACTIVE (latest createdAt) role='cy' import for P. REQUIRED.
 *  2. PY  = override.pyImportId, ELSE the ACTIVE role='py' import on P itself
 *           (a prior-year file uploaded directly to this period), ELSE the ACTIVE
 *           role='cy' import of the MOST RECENT EARLIER period (greatest
 *           periodEndDate strictly < P's that has a cy import). "Last year's
 *           current-year becomes this year's prior."  None => []  (hasPY=false).
 *  3. Audit = override.auditImportId, ELSE the ACTIVE role='audit' import — first
 *           in P, falling back to the most recent earlier period that has one.
 *           None => []  (engine: hasAudit=false).
 *
 * PY and Audit are SYMMETRIC: a role-tagged import uploaded directly to the target
 * period (active.py / active.audit) is honored before the cross-period fallback,
 * so the canonical snapshot matches the live preview for a standard cy+py intake.
 *
 * Inputs are plain rows already loaded from the DB; this module performs ZERO I/O.
 */

export interface ResolverPeriod {
  period: Pick<FiscalPeriod, 'id' | 'periodEndDate'>
  /** Active (latest) import per role for this period; null if none. */
  active: { cy: Import | null; py: Import | null; audit: Import | null }
}

export interface ResolveInput {
  targetPeriodId: string
  /** Every period for the school, each with its active-per-role imports. */
  periods: ResolverPeriod[]
  override?: { pyImport?: Import | null; auditImport?: Import | null }
}

export interface ResolvedComparatives {
  cyData: NormalizedRow[]
  pyData: NormalizedRow[]
  auditData: NormalizedRow[]
  resolved: {
    cyImportId: string | null
    pyImportId: string | null
    auditImportId: string | null
    pyFromPeriodId: string | null
    auditFromPeriodId: string | null
  }
}

function rowsOf(imp: Import | null | undefined): NormalizedRow[] {
  if (!imp) return []
  return (imp.rows as unknown as NormalizedRow[]) ?? []
}

export function resolveComparatives(input: ResolveInput): ResolvedComparatives {
  const { targetPeriodId, periods, override } = input
  const target = periods.find((p) => p.period.id === targetPeriodId)

  const cyImport = target?.active.cy ?? null

  // Earlier periods (strictly earlier period-end), newest-first.
  const targetEnd = target ? target.period.periodEndDate.getTime() : -Infinity
  const earlier = periods
    .filter((p) => p.period.periodEndDate.getTime() < targetEnd)
    .sort((a, b) => b.period.periodEndDate.getTime() - a.period.periodEndDate.getTime())

  // PY: override wins, else a py-role import on P itself, else the most-recent
  // earlier period that HAS a cy import. (Mirrors the audit branch below.)
  let pyImport: Import | null = override?.pyImport ?? null
  let pyFromPeriodId: string | null = pyImport ? pyImport.fiscalPeriodId : null
  if (!pyImport) {
    if (target?.active.py) {
      pyImport = target.active.py
      pyFromPeriodId = target.period.id
    } else {
      const earlierWithCy = earlier.find((p) => p.active.cy)
      if (earlierWithCy?.active.cy) {
        pyImport = earlierWithCy.active.cy
        pyFromPeriodId = earlierWithCy.period.id
      }
    }
  }

  // Audit: override wins, else active audit in P, else most-recent earlier audit.
  let auditImport: Import | null = override?.auditImport ?? null
  let auditFromPeriodId: string | null = auditImport ? auditImport.fiscalPeriodId : null
  if (!auditImport) {
    if (target?.active.audit) {
      auditImport = target.active.audit
      auditFromPeriodId = target.period.id
    } else {
      const earlierWithAudit = earlier.find((p) => p.active.audit)
      if (earlierWithAudit?.active.audit) {
        auditImport = earlierWithAudit.active.audit
        auditFromPeriodId = earlierWithAudit.period.id
      }
    }
  }

  return {
    cyData: rowsOf(cyImport),
    pyData: rowsOf(pyImport),
    auditData: rowsOf(auditImport),
    resolved: {
      cyImportId: cyImport?.id ?? null,
      pyImportId: pyImport?.id ?? null,
      auditImportId: auditImport?.id ?? null,
      pyFromPeriodId,
      auditFromPeriodId,
    },
  }
}

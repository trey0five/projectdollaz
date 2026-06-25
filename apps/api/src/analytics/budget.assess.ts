// ─────────────────────────────────────────────────────────────
// Layer 1 — DETERMINISTIC budget sufficiency. Pure: no Nest, no I/O.
// Always runs (even when the LLM advisor is unavailable) and is the core
// the optional LLM advisor merely NARRATES. Fully unit-testable.
//
// ADVISORY ONLY: this never blocks an Apply/Confirm. It returns a status
// ('ok' | 'attention') and a flat list of board-appropriate checks.
// ─────────────────────────────────────────────────────────────

export interface AssessNormalizedStats {
  salariesTotal?: number
  enrollmentTotal?: number
  splitSum?: number
}

/** A budget normalized to category totals — the shape assessBudget consumes.
 * Both the driver and the import (rollupSpread) paths fold down to this. The
 * revenue/expense maps are treated as OPAQUE key→number maps (driver keys and
 * rollup keys are different namespaces) — assessBudget only ever sums values. */
export interface NormalizedBudget {
  revenue: Record<string, number>
  expense: Record<string, number>
  totalRevenue: number
  totalExpenses: number
  /** Import only; 0 for driver. Dollars on rows that couldn't be categorized. */
  unmappedDollars: number
  /** Import only; 0 for driver. Count of uncategorized rows (incl. label-only). */
  unmappedCount: number
  stats?: AssessNormalizedStats
}

export interface AssessCheck {
  id: string
  severity: 'warn' | 'info'
  message: string
}

export interface AssessResult {
  status: 'ok' | 'attention'
  checks: AssessCheck[]
}

/** Defensive sum: revenue/expense maps pass @IsObject() but per-key values
 * aren't deep-validated by class-validator, so coerce every value. */
export function sumMap(m: Record<string, number> | null | undefined): number {
  if (!m) return 0
  let s = 0
  for (const v of Object.values(m)) {
    const n = Number(v)
    if (Number.isFinite(n)) s += n
  }
  return s
}

/** Count of NONZERO buckets across revenue + expense (for "very-few-lines"). */
function nonzeroLineCount(b: NormalizedBudget): number {
  let n = 0
  for (const v of Object.values(b.revenue)) if (Number(v)) n++
  for (const v of Object.values(b.expense)) if (Number(v)) n++
  return n
}

/**
 * Pure deterministic sufficiency check. `source` gates the import-only and
 * driver-only checks. Thresholds use a relative+absolute "near zero" floor so
 * float residue ($0.40 leftovers) doesn't slip past, while a genuinely lean
 * micro-school budget doesn't false-positive.
 */
export function assessBudget(b: NormalizedBudget, source: 'driver' | 'import'): AssessResult {
  const checks: AssessCheck[] = []

  const rev = b.totalRevenue
  const exp = b.totalExpenses
  const grand = rev + exp
  const net = rev - exp

  // "near zero" relative to the OTHER side, with a flat floor so a tiny residual
  // on a blank side is still treated as empty.
  const revFloor = Math.max(1000, exp * 0.01)
  const expFloor = Math.max(1000, rev * 0.01)
  const emptyFloor = 1000

  const empty = rev < emptyFloor && exp < emptyFloor

  if (empty) {
    // One clean message instead of three contradictory ones.
    checks.push({
      id: 'empty-budget',
      severity: 'warn',
      message: 'This budget is empty — there is nothing to apply yet.',
    })
  } else {
    // missing-expenses: revenue present, expenses ~absent.
    if (rev >= revFloor && exp < expFloor) {
      checks.push({
        id: 'missing-expenses',
        severity: 'warn',
        message: 'No expenses entered — this looks like revenue only.',
      })
    }
    // missing-revenue: expenses present, revenue ~absent.
    if (exp >= expFloor && rev < revFloor) {
      checks.push({
        id: 'missing-revenue',
        severity: 'warn',
        message: 'No revenue entered — only costs are shown.',
      })
    }
    // implausible-surplus: guarded by exp>0 so it never co-fires with
    // missing-expenses (a revenue-only sheet has a 100% "surplus" already
    // covered above — double-warning is confusing).
    if (rev >= revFloor && exp >= expFloor && net / rev > 0.4) {
      checks.push({
        id: 'implausible-surplus',
        severity: 'warn',
        message: 'This shows an unusually large surplus — some costs may be missing.',
      })
    }
  }

  // large-unmapped (import only). Dollars derived from uncategorized rows (incl.
  // label-only acct=0 rows, which the GL-number unmappedAccts list misses). The
  // denominator is the TRUE grand total (mapped + unmapped) — rollupSpread's
  // totals exclude unmapped, so adding it back keeps the % honest.
  if (source === 'import') {
    const total = grand + b.unmappedDollars
    const pct = total > 0 ? b.unmappedDollars / total : 0
    if (pct > 0.15 || b.unmappedCount >= 8) {
      const n = Math.max(1, Math.round(pct * 100))
      checks.push({
        id: 'large-unmapped',
        severity: 'warn',
        message: `About ${n}% of the lines couldn't be matched to a category.`,
      })
    }
  }

  // no-staff (driver only). Salaries are usually the biggest cost, so this must
  // fire whenever a guided budget has zero staff — NOT gated on total expenses
  // (a no-staff budget is exactly the lean-expenses case we want to flag).
  if (source === 'driver' && b.stats && !empty) {
    const sal = Number(b.stats.salariesTotal)
    if (Number.isFinite(sal) && sal < 1000) {
      checks.push({
        id: 'no-staff',
        severity: 'warn',
        message: 'No staff or salaries entered — salaries are usually the biggest cost.',
      })
    }
  }

  // split-not-100 (driver only; skip on an empty budget — empty-budget covers it).
  if (source === 'driver' && b.stats && b.stats.splitSum != null && !empty) {
    const split = Number(b.stats.splitSum)
    if (Number.isFinite(split) && Math.abs(split - 100) > 0.5) {
      checks.push({
        id: 'split-not-100',
        severity: 'warn',
        message: "Tuition payment split doesn't add up to 100%.",
      })
    }
  }

  // very-few-lines (info). Only when there IS something entered.
  if (!empty) {
    const lines = nonzeroLineCount(b)
    if (lines > 0 && lines < 4) {
      checks.push({
        id: 'very-few-lines',
        severity: 'info',
        message: 'Only a few budget lines — most schools have more.',
      })
    }
  }

  const status: 'ok' | 'attention' = checks.some((c) => c.severity === 'warn')
    ? 'attention'
    : 'ok'
  return { status, checks }
}

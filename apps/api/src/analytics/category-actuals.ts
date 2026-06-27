// ─────────────────────────────────────────────────────────────
// Shared, pure category-actuals helper.
//
// Extracted verbatim from AnalyticsService.categoryActuals so BOTH the annual
// dashboard/board-report AND the monthly-actuals service derive revenue/expense
// category rollups from a ReportBundle the EXACT same way (byte-identical keys
// and values). Reads the revenue_mix / expense_mix metric components — prior /
// operational are irrelevant to the mix values, so they pass null.
// ─────────────────────────────────────────────────────────────
import type { ReportBundle } from '@finrep/engine'
import { computeMetricsForPeriod } from '@finrep/analytics'

export interface CategoryActuals {
  revenue: Record<string, number>
  expense: Record<string, number>
}

/**
 * Category actuals ({catKey: amount}) from a bundle, via the revenue/expense mix
 * metric components. NO engine recompute beyond the pure metric pass. The output
 * is byte-identical to the legacy private AnalyticsService.categoryActuals.
 */
export function categoryActualsFromBundle(bundle: ReportBundle): CategoryActuals {
  const metrics = computeMetricsForPeriod({
    current: bundle,
    prior: null,
    currentOperational: null,
    priorOperational: null,
  })
  const mix = (key: string): Record<string, number> => {
    const m = metrics.find((x) => x.key === key)
    const out: Record<string, number> = {}
    for (const c of m?.components ?? []) out[c.key] = c.value
    return out
  }
  return { revenue: mix('revenue_mix'), expense: mix('expense_mix') }
}

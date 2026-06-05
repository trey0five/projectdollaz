// ─────────────────────────────────────────────────────────────
// StandardChart: versioned bundle of category definitions + the
// school->SCoA mapping, plus pure lookup/sum helpers that replace the
// legacy ACCT_MAP[r.acct] / sumA / sumC functions WITHOUT changing
// lookup semantics (numeric-key lookups, exact reduce order).
// ─────────────────────────────────────────────────────────────
import type { Dataset, NormalizedRow } from '../types/rows.js'
import {
  SCOA_CATEGORIES,
  type SCoaCategory,
  type ScoaCategoryDef,
} from './categories.js'
import { DEFAULT_MAPPING, type SchoolToScoaMapping } from './defaultMapping.js'

export interface StandardChart {
  standardChartVersion: string
  categories: Record<SCoaCategory, ScoaCategoryDef>
  mapping: SchoolToScoaMapping
}

export const DEFAULT_CHART: StandardChart = {
  standardChartVersion: 'scoa-v1',
  categories: SCOA_CATEGORIES,
  mapping: DEFAULT_MAPPING,
}

/** Category for an account number, or undefined (replaces ACCT_MAP[acct]). */
export function categoryOf(
  acct: number,
  chart: StandardChart = DEFAULT_CHART
): SCoaCategory | undefined {
  return chart.mapping.entries[acct]
}

/** Definition (sign/section/rollup) for a category. */
export function categoryDef(
  category: SCoaCategory,
  chart: StandardChart = DEFAULT_CHART
): ScoaCategoryDef | undefined {
  return chart.categories[category]
}

/** Sum totals for an explicit list of account numbers (legacy sumA). */
export function sumByAccts(data: Dataset, accts: number[]): number {
  return data
    .filter((r) => accts.includes(r.acct))
    .reduce((s, r) => s + r.total, 0)
}

/** Rows matching an explicit account list (for lineage capture). */
export function rowsByAccts(data: Dataset, accts: number[]): NormalizedRow[] {
  return data.filter((r) => accts.includes(r.acct))
}

/** Sum totals for every account mapped to a category (legacy sumC). */
export function sumByCategory(
  data: Dataset,
  category: SCoaCategory,
  chart: StandardChart = DEFAULT_CHART
): number {
  return data
    .filter((r) => chart.mapping.entries[r.acct] === category)
    .reduce((s, r) => s + r.total, 0)
}

/** Rows mapped to a category (for lineage capture). */
export function rowsByCategory(
  data: Dataset,
  category: SCoaCategory,
  chart: StandardChart = DEFAULT_CHART
): NormalizedRow[] {
  return data.filter((r) => chart.mapping.entries[r.acct] === category)
}

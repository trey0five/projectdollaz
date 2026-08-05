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
import { STANDARD_CHART_VERSION } from '../version.js'

/**
 * A rule that splits ONE account across categories by what its rows say.
 *
 * Two of these have always existed in the legacy chart, as code rather than
 * data: account 120 carries receivables AND reclassified cash AND prepaid, told
 * apart only by the description text, and account 200 carries payables with the
 * lease portion mixed in. They cannot be expressed as account→category, so if
 * they had stayed hard-coded the balance sheet could never have become
 * chart-driven. As DATA they survive the move intact — and, being part of the
 * chart, they are serialisable into the stored StandardChartVersion row.
 *
 * `otherwise: true` marks the fallback arm: rows of that account matching no
 * earlier rule. Rules are evaluated in order, first match wins.
 */
export interface DescriptionRule {
  acct: number
  /** Any of these substrings appearing in the row description matches. */
  includes?: string[]
  /** Compare case-insensitively (the legacy lease rule does; the TMS one does not). */
  caseInsensitive?: boolean
  /** The fallback arm for this account. Mutually exclusive with `includes`. */
  otherwise?: boolean
  category: SCoaCategory
}

export interface StandardChart {
  standardChartVersion: string
  categories: Record<SCoaCategory, ScoaCategoryDef>
  mapping: SchoolToScoaMapping
  /** Optional per-account description splits. See {@link DescriptionRule}. */
  descriptionRules?: DescriptionRule[]
}

/**
 * The legacy 120/200 splits, moved from code into data WITHOUT changing what
 * they do. Preserved exactly: the TMS predicates are case-SENSITIVE and the
 * lease predicate is case-insensitive, because that is what the ported legacy
 * code did and a "tidied" version would silently reclassify real balances.
 */
export const LEGACY_DESCRIPTION_RULES: DescriptionRule[] = [
  { acct: 120, includes: ['Suspense', 'Payment at Institution'], category: 'cash' },
  { acct: 120, includes: ['Prepaid'], category: 'prepaid' },
  { acct: 120, otherwise: true, category: 'tuitionRec' },
  { acct: 200, includes: ['lease'], caseInsensitive: true, category: 'leaseCurr' },
  { acct: 200, otherwise: true, category: 'apAccrued' },
]

export const DEFAULT_CHART: StandardChart = {
  standardChartVersion: STANDARD_CHART_VERSION,
  categories: SCOA_CATEGORIES,
  mapping: DEFAULT_MAPPING,
  descriptionRules: LEGACY_DESCRIPTION_RULES,
}

/**
 * The category for ONE ROW — the description rules first, then the account's own
 * mapping. This is the lookup every statement should use: `categoryOf` alone
 * cannot see that account 120 means three different things.
 */
export function categoryOfRow(
  row: Pick<NormalizedRow, 'acct' | 'desc'>,
  chart: StandardChart = DEFAULT_CHART
): SCoaCategory | undefined {
  const rules = chart.descriptionRules
  if (rules) {
    let fallback: SCoaCategory | undefined
    for (const rule of rules) {
      if (rule.acct !== row.acct) continue
      if (rule.otherwise) {
        // Remember it, but keep looking: an `includes` rule declared later still
        // wins over the fallback for this account.
        fallback ??= rule.category
        continue
      }
      const desc = row.desc ?? ''
      const hay = rule.caseInsensitive ? desc.toLowerCase() : desc
      const needles = rule.caseInsensitive
        ? (rule.includes ?? []).map((t) => t.toLowerCase())
        : (rule.includes ?? [])
      if (desc && needles.some((t) => hay.includes(t))) return rule.category
    }
    if (fallback) return fallback
  }
  return chart.mapping.entries[row.acct]
}

/** Sum every row whose ROW-level category matches (description rules included). */
export function sumByRowCategory(
  data: Dataset,
  category: SCoaCategory,
  chart: StandardChart = DEFAULT_CHART
): number {
  return data
    .filter((r) => categoryOfRow(r, chart) === category)
    .reduce((s, r) => s + r.total, 0)
}

/** Rows whose ROW-level category matches (for lineage capture). */
export function rowsByRowCategory(
  data: Dataset,
  category: SCoaCategory,
  chart: StandardChart = DEFAULT_CHART
): NormalizedRow[] {
  return data.filter((r) => categoryOfRow(r, chart) === category)
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

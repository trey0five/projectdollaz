// ─────────────────────────────────────────────────────────────
// Statement of Financial Position.
//
// WAS: a list of literal account numbers. Cash WAS "accounts 100, 101, 102,
// 105, 107, 109"; prepaid WAS "account 125"; payables WAS "account 200". That
// made the balance sheet work for exactly one chart of accounts — and a school
// whose cash sits in account 1010 reported no cash, no receivables and no
// liabilities, with nothing it could do about it: the mapping every other part
// of the product respected was never consulted here at all.
//
// NOW: every line is the sum of its CATEGORY. The legacy chart reaches the same
// numbers by the same accounts, because those accounts are now spelled out in
// DEFAULT_MAPPING (scoa/defaultMapping.ts) instead of in this file's source.
//
// The two accounts that carry more than one kind of balance — 120 (receivables
// vs reclassified cash vs prepaid) and 200 (payables vs the current lease
// portion) — are split by LEGACY_DESCRIPTION_RULES on the chart, applied by
// `categoryOfRow`. Same predicates, same case-sensitivity, same order.
//
// VALUES AND LINEAGE ARE BUILT FROM THE SAME LOOKUP. They used to be two
// separate copies of every account list, which is a standing invitation for the
// drill-down to disagree with the number it explains.
// ─────────────────────────────────────────────────────────────
import type { Dataset } from '../types/rows.js'
import type { SFPResult } from '../types/results.js'
import type { StatementLineage } from '../types/lineage.js'
import type { SCoaCategory } from '../scoa/categories.js'
import {
  DEFAULT_CHART,
  rowsByRowCategory,
  sumByRowCategory,
  type StandardChart,
} from '../scoa/chart.js'

export function calcSFP(
  data: Dataset,
  naEnd: number,
  chart: StandardChart = DEFAULT_CHART
): SFPResult | null {
  if (!data || data.length === 0) return null

  const sum = (category: SCoaCategory) => sumByRowCategory(data, category, chart)

  const cash = sum('cash')
  const restrictedCash = sum('restrictedCash')
  const tuitionRec = sum('tuitionRec')
  const prepaid = sum('prepaid')
  const totalCurrentA = cash + restrictedCash + tuitionRec + prepaid

  // Gross property & equipment plus accumulated depreciation, which carries a
  // credit balance — so this is the legacy `sumA([140,150,151,153,165]) + sumA([170])`
  // with each half named rather than positional.
  const ppNet = sum('ppGross') + sum('accumDepr')
  const rouAsset = sum('rouAsset')
  const restrictInvst = sum('restrictInvst')
  const totalAssets = totalCurrentA + ppNet + rouAsset + restrictInvst

  // Liabilities are reported positive; their natural balance is a credit.
  const apAccrued = Math.abs(sum('apAccrued'))
  const leaseCurr = Math.abs(sum('leaseCurr'))
  const studentClubs = Math.abs(sum('studentClubs'))
  const deferredIntl = Math.abs(sum('deferredIntl'))
  const totalCurrL = apAccrued + studentClubs + deferredIntl + leaseCurr
  const leaseNonCurr = Math.abs(sum('leaseNonCurr'))
  const totalLiab = totalCurrL + leaseNonCurr

  // Net assets — the ENDING balance comes from the SOA, never from the trial
  // balance's opening equity rows.
  const totalNA = naEnd
  // The donor-restricted split. The legacy chart has no account that says "net
  // assets with donor restrictions", so it inferred the split from restricted
  // INVESTMENTS (account 135) — and that inference is preserved exactly when no
  // account claims the category. A school that does classify its restricted net
  // assets gets the real figure instead of the proxy.
  // Negated: net assets carry CREDIT balances, like every revenue account, so
  // the raw sum is negative and the statement reports them positive.
  const naWithMapped = -sum('naWithDonor')
  const naWith = naWithMapped !== 0 ? naWithMapped : restrictInvst
  const naWithout = totalNA - naWith
  const totalLiabNA = totalLiab + totalNA

  return {
    cash, restrictedCash, tuitionRec, prepaid, totalCurrentA,
    ppNet, rouAsset, restrictInvst, totalAssets,
    apAccrued, leaseCurr, studentClubs, deferredIntl,
    totalCurrL, leaseNonCurr, totalLiab,
    naWithout, naWith, totalNA, totalLiabNA,
  }
}

/** Build SFP lineage from the SAME category lookup the values came from. */
export function buildSFPLineage(
  data: Dataset,
  result: SFPResult,
  chart: StandardChart = DEFAULT_CHART
): StatementLineage {
  const lineage: StatementLineage = {}
  const rows = (category: SCoaCategory) => rowsByRowCategory(data, category, chart)

  const add = (line: string, value: number, category: SCoaCategory | null) => {
    lineage[line] = {
      line,
      scoaCategory: category,
      statement: 'SFP',
      sign: 1,
      value,
      sources: category ? rows(category) : [],
    }
  }

  add('cash', result.cash, 'cash')
  add('restrictedCash', result.restrictedCash, 'restrictedCash')
  add('tuitionRec', result.tuitionRec, 'tuitionRec')
  add('prepaid', result.prepaid, 'prepaid')
  // One line, two categories — list both sets of rows behind it.
  lineage.ppNet = {
    line: 'ppNet',
    scoaCategory: 'ppGross',
    statement: 'SFP',
    sign: 1,
    value: result.ppNet,
    sources: [...rows('ppGross'), ...rows('accumDepr')],
  }
  add('rouAsset', result.rouAsset, 'rouAsset')
  add('restrictInvst', result.restrictInvst, 'restrictInvst')
  add('apAccrued', result.apAccrued, 'apAccrued')
  add('leaseCurr', result.leaseCurr, 'leaseCurr')
  add('studentClubs', result.studentClubs, 'studentClubs')
  add('deferredIntl', result.deferredIntl, 'deferredIntl')
  add('leaseNonCurr', result.leaseNonCurr, 'leaseNonCurr')

  // Subtotals (no direct sources).
  for (const line of [
    'totalCurrentA', 'totalAssets', 'totalCurrL', 'totalLiab',
    'naWithout', 'naWith', 'totalNA', 'totalLiabNA',
  ] as const) {
    add(line, result[line], null)
  }

  return lineage
}

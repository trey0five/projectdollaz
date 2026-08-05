// ─────────────────────────────────────────────────────────────
// Statement of Cash Flows.
// Requires a "beginning" dataset (audited preferred, else prior year).
//
// CHART-AGNOSTIC, WITH ONE DELIBERATE COMPATIBILITY SHIM.
//
// Every line below is derived from CATEGORIES, so a school on any chart of
// accounts gets a real cash-flow statement. But the legacy 3-digit chart cannot
// be expressed purely in categories, because the two statements genuinely
// disagree about one account: the balance sheet SPLITS account 120 (receivables
// vs reclassified cash vs prepaid, by description), while this statement has
// always treated the WHOLE of account 120 as receivables — and its cash balance
// excludes the suspense rows the balance sheet counts as cash.
//
// That disagreement is real, shipped behaviour on live schools' audited numbers.
// Rewriting it away would silently move their operating cash. So the legacy
// account lists survive as an explicit SHIM: when the dataset actually contains
// those accounts, the legacy derivation runs unchanged; otherwise every line
// resolves through the mapping. Which path ran is not guesswork — it is decided
// by whether the accounts are present, and both directions are spec'd.
// ─────────────────────────────────────────────────────────────
import type { Dataset } from '../types/rows.js'
import type { SOAResults, SFPResults, SCFResult } from '../types/results.js'
import type { StatementLineage } from '../types/lineage.js'
import type { SCoaCategory } from '../scoa/categories.js'
import {
  DEFAULT_CHART,
  categoryOfRow,
  rowsByRowCategory,
  type StandardChart,
} from '../scoa/chart.js'

/**
 * The legacy 3-digit chart's own account lists, kept ONLY to reproduce its
 * numbers exactly. See the header: this is a compatibility shim, not the
 * derivation. `receivables` is the whole of account 120 on purpose.
 */
const LEGACY_SCF_ACCOUNTS = {
  cash: [100, 101, 102, 105, 107, 109, 110, 111, 112, 113, 115],
  depreciation: [865],
  receivables: [120],
  prepaid: [125],
  payables: [200],
  deferred: [230],
  clubs: [240],
  ppe: [140, 150, 151, 153, 165],
  rou: [160],
  investments: [135],
  leaseNonCurr: [260],
} as const

/** Categories each cash-flow line resolves to when the legacy accounts are absent. */
const SCF_CATEGORIES: Record<keyof typeof LEGACY_SCF_ACCOUNTS, SCoaCategory[]> = {
  cash: ['cash', 'restrictedCash'],
  depreciation: ['deprExpense'],
  receivables: ['tuitionRec'],
  prepaid: ['prepaid'],
  payables: ['apAccrued'],
  deferred: ['deferredIntl'],
  clubs: ['studentClubs'],
  ppe: ['ppGross', 'accumDepr'],
  rou: ['rouAsset'],
  investments: ['restrictInvst'],
  leaseNonCurr: ['leaseNonCurr'],
}

export interface CalcSCFArgs {
  soaResults: SOAResults
  sfpResults: SFPResults
  cyData: Dataset
  pyData: Dataset
  auditData: Dataset
  chart?: StandardChart
}

export function calcSCF({
  soaResults,
  sfpResults,
  cyData,
  pyData,
  auditData,
  chart = DEFAULT_CHART,
}: CalcSCFArgs): SCFResult | null {
  if (!sfpResults || !sfpResults.cy) return null
  const beginData =
    auditData.length > 0 ? auditData : pyData.length > 0 ? pyData : null
  if (!beginData) return null

  // THE SHIM'S SWITCH. Legacy accounts present in either dataset ⇒ the legacy
  // derivation, verbatim. A chart that uses none of them ⇒ categories.
  const present = new Set<number>()
  for (const r of cyData) present.add(r.acct)
  for (const r of beginData) present.add(r.acct)
  const usesLegacyAccounts = Object.values(LEGACY_SCF_ACCOUNTS).some((accts) =>
    accts.some((a) => present.has(a)),
  )

  const sumOf = (data: Dataset, group: keyof typeof LEGACY_SCF_ACCOUNTS) => {
    if (usesLegacyAccounts) {
      const accts = LEGACY_SCF_ACCOUNTS[group] as readonly number[]
      return data.filter((r) => accts.includes(r.acct)).reduce((s, r) => s + r.total, 0)
    }
    const cats = SCF_CATEGORIES[group]
    return data
      .filter((r) => {
        const c = categoryOfRow(r, chart)
        return c != null && cats.includes(c)
      })
      .reduce((s, r) => s + r.total, 0)
  }

  // The current portion of the lease, which the legacy chart mixes into account
  // 200 and any other chart states outright.
  const leaseCurrent = (data: Dataset) =>
    usesLegacyAccounts
      ? data
          .filter((r) => r.acct === 200 && r.desc && r.desc.toLowerCase().includes('lease'))
          .reduce((s, r) => s + r.total, 0)
      : data
          .filter((r) => categoryOfRow(r, chart) === 'leaseCurr')
          .reduce((s, r) => s + r.total, 0)

  const netChange = soaResults.cy.netChange
  const depr = sumOf(cyData, 'depreciation')

  // Working-capital changes.
  const arAdj = -(sumOf(cyData, 'receivables') - sumOf(beginData, 'receivables'))
  const prepaidAdj = -(sumOf(cyData, 'prepaid') - sumOf(beginData, 'prepaid'))
  const apAdj = -(sumOf(cyData, 'payables') - sumOf(beginData, 'payables'))
  const deferredAdj = -(sumOf(cyData, 'deferred') - sumOf(beginData, 'deferred'))
  const clubsAdj = -(sumOf(cyData, 'clubs') - sumOf(beginData, 'clubs'))
  const operatingCash =
    netChange + depr + arAdj + prepaidAdj + apAdj + deferredAdj + clubsAdj

  // Investing — PP&E purchases (net of the ROU reclassification) and investments.
  const ppBegin = sumOf(beginData, 'ppe')
  const ppEnd = sumOf(cyData, 'ppe')
  const rouReclass = sumOf(beginData, 'rou')
  const ppePurchases = -(ppEnd - ppBegin - rouReclass)
  const investmentsCash = -(sumOf(cyData, 'investments') - sumOf(beginData, 'investments'))
  const investingCash = ppePurchases + investmentsCash

  // Financing — lease principal payments.
  const leaseBegin = sumOf(beginData, 'leaseNonCurr') + leaseCurrent(beginData)
  const leaseEnd = sumOf(cyData, 'leaseNonCurr') + leaseCurrent(cyData)
  const leasePayments = -(leaseEnd - leaseBegin)
  const financingCash = leasePayments

  const netCashChange = operatingCash + investingCash + financingCash
  const cashBegin = sumOf(beginData, 'cash')
  const cashEnd = sumOf(cyData, 'cash')

  return {
    netChange, depr,
    arAdj, prepaidAdj, apAdj, deferredAdj, clubsAdj, operatingCash,
    ppePurchases, investmentsCash, investingCash,
    leasePayments, financingCash,
    netCashChange, cashBegin, cashEnd,
    cashUnrestricted: sfpResults.cy.cash,
    cashRestricted: sfpResults.cy.restrictedCash,
  }
}

/** Build SCF lineage from the SAME selection the values came from. */
export function buildSCFLineage(
  cyData: Dataset,
  result: SCFResult,
  chart: StandardChart = DEFAULT_CHART
): StatementLineage {
  const lineage: StatementLineage = {}
  const present = new Set<number>()
  for (const r of cyData) present.add(r.acct)
  const usesLegacyAccounts = Object.values(LEGACY_SCF_ACCOUNTS).some((accts) =>
    accts.some((a) => present.has(a)),
  )
  const rowsOf = (group: keyof typeof LEGACY_SCF_ACCOUNTS) => {
    if (usesLegacyAccounts) {
      const accts = LEGACY_SCF_ACCOUNTS[group] as readonly number[]
      return cyData.filter((r) => accts.includes(r.acct))
    }
    return SCF_CATEGORIES[group].flatMap((c) => rowsByRowCategory(cyData, c, chart))
  }
  const add = (line: string, value: number, sources = [] as Dataset) => {
    lineage[line] = { line, scoaCategory: null, statement: 'SCF', sign: 1, value, sources }
  }
  add('depr', result.depr, rowsOf('depreciation'))
  add('arAdj', result.arAdj, rowsOf('receivables'))
  add('prepaidAdj', result.prepaidAdj, rowsOf('prepaid'))
  add('apAdj', result.apAdj, rowsOf('payables'))
  add('deferredAdj', result.deferredAdj, rowsOf('deferred'))
  add('clubsAdj', result.clubsAdj, rowsOf('clubs'))
  add('investmentsCash', result.investmentsCash, rowsOf('investments'))
  add('ppePurchases', result.ppePurchases, rowsOf('ppe'))
  add('leasePayments', result.leasePayments, rowsOf('leaseNonCurr'))
  for (const line of [
    'netChange', 'operatingCash', 'investingCash', 'financingCash',
    'netCashChange', 'cashBegin', 'cashEnd', 'cashUnrestricted', 'cashRestricted',
  ] as const) {
    add(line, result[line])
  }
  return lineage
}

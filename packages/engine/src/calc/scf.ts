// ─────────────────────────────────────────────────────────────
// Statement of Cash Flows. Ported VERBATIM from legacy calcSCF.
// Requires a "beginning" dataset (audited preferred, else prior year).
// ─────────────────────────────────────────────────────────────
import type { Dataset } from '../types/rows.js'
import type { SOAResults, SFPResults, SCFResult } from '../types/results.js'
import type { StatementLineage } from '../types/lineage.js'

export interface CalcSCFArgs {
  soaResults: SOAResults
  sfpResults: SFPResults
  cyData: Dataset
  pyData: Dataset
  auditData: Dataset
}

export function calcSCF({
  soaResults,
  sfpResults,
  cyData,
  pyData,
  auditData,
}: CalcSCFArgs): SCFResult | null {
  if (!sfpResults || !sfpResults.cy) return null
  const beginData =
    auditData.length > 0 ? auditData : pyData.length > 0 ? pyData : null
  if (!beginData) return null

  const sumBS = (data: Dataset, accts: number[]) =>
    data.filter((r) => accts.includes(r.acct)).reduce((s, r) => s + r.total, 0)
  const leaseIn200 = (data: Dataset) =>
    data
      .filter((r) => r.acct === 200 && r.desc && r.desc.toLowerCase().includes('lease'))
      .reduce((s, r) => s + r.total, 0)
  // All cash accounts (no TMS suspense) — matches the statement's cash definition.
  const totalCash = (data: Dataset) =>
    sumBS(data, [100, 101, 102, 105, 107, 109, 110, 111, 112, 113, 115])

  const netChange = soaResults.cy.netChange
  const depr = sumBS(cyData, [865]) // YTD balance of accumulated-depreciation expense

  // Working-capital changes (AR = all acct-120 items incl. TMS suspense)
  const arBegin = sumBS(beginData, [120])
  const arEnd = sumBS(cyData, [120])
  const arAdj = -(arEnd - arBegin)
  const prepaidAdj = -(sumBS(cyData, [125]) - sumBS(beginData, [125]))
  const apAdj = -(sumBS(cyData, [200]) - sumBS(beginData, [200]))
  const deferredAdj = -(sumBS(cyData, [230]) - sumBS(beginData, [230]))
  const clubsAdj = -(sumBS(cyData, [240]) - sumBS(beginData, [240]))
  const operatingCash =
    netChange + depr + arAdj + prepaidAdj + apAdj + deferredAdj + clubsAdj

  // Investing — PP&E purchases (net of ROU reclassification 160→150) and investments
  const ppBegin = sumBS(beginData, [140, 150, 151, 153, 165])
  const ppEnd = sumBS(cyData, [140, 150, 151, 153, 165])
  const rouReclass = sumBS(beginData, [160])
  const ppePurchases = -(ppEnd - ppBegin - rouReclass)
  const investmentsCash = -(sumBS(cyData, [135]) - sumBS(beginData, [135]))
  const investingCash = ppePurchases + investmentsCash

  // Financing — lease principal payments (acct 260 + lease items in acct 200)
  const leaseBegin = sumBS(beginData, [260]) + leaseIn200(beginData)
  const leaseEnd = sumBS(cyData, [260]) + leaseIn200(cyData)
  const leasePayments = -(leaseEnd - leaseBegin)
  const financingCash = leasePayments

  const netCashChange = operatingCash + investingCash + financingCash
  const cashBegin = totalCash(beginData)
  const cashEnd = totalCash(cyData)

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

/** Build SCF lineage in parallel (numbers unchanged). */
export function buildSCFLineage(cyData: Dataset, result: SCFResult): StatementLineage {
  const lineage: StatementLineage = {}
  const byAccts = (accts: number[]) => cyData.filter((r) => accts.includes(r.acct))
  const add = (line: string, value: number, sources = [] as ReturnType<typeof byAccts>) => {
    lineage[line] = { line, scoaCategory: null, statement: 'SCF', sign: 1, value, sources }
  }
  add('depr', result.depr, byAccts([865]))
  add('arAdj', result.arAdj, byAccts([120]))
  add('prepaidAdj', result.prepaidAdj, byAccts([125]))
  add('apAdj', result.apAdj, byAccts([200]))
  add('deferredAdj', result.deferredAdj, byAccts([230]))
  add('clubsAdj', result.clubsAdj, byAccts([240]))
  add('investmentsCash', result.investmentsCash, byAccts([135]))
  add('ppePurchases', result.ppePurchases, byAccts([140, 150, 151, 153, 165]))
  add('leasePayments', result.leasePayments, byAccts([260]))
  for (const line of [
    'netChange', 'operatingCash', 'investingCash', 'financingCash',
    'netCashChange', 'cashBegin', 'cashEnd', 'cashUnrestricted', 'cashRestricted',
  ] as const) {
    add(line, result[line])
  }
  return lineage
}

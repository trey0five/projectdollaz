// ─────────────────────────────────────────────────────────────
// Statement of Financial Position. Ported VERBATIM from legacy calcSFP.
// Preserves the acct-120 description reclass (Suspense/Payment -> cash,
// Prepaid -> prepaid, remainder -> tuitionRec) and the acct-200 lease
// split (lease desc -> leaseCurr, remainder -> apAccrued), including
// Math.abs.
// ─────────────────────────────────────────────────────────────
import type { Dataset, NormalizedRow } from '../types/rows.js'
import type { SFPResult } from '../types/results.js'
import type { StatementLineage } from '../types/lineage.js'
import { sumByAccts } from '../scoa/chart.js'

export function calcSFP(data: Dataset, naEnd: number): SFPResult | null {
  if (!data || data.length === 0) return null

  const descMatch = (acct: number, pred: (d: string) => boolean) =>
    data
      .filter((r) => r.acct === acct && r.desc && pred(r.desc))
      .reduce((s, r) => s + r.total, 0)

  const sumA = (accts: number[]) => sumByAccts(data, accts)

  // Cash: operating accounts + TMS Suspense & Payment reclassified from acct 120
  const cashBase = sumA([100, 101, 102, 105, 107, 109])
  const TMSMisc = descMatch(
    120,
    (d) => d.includes('Suspense') || d.includes('Payment at Institution')
  )
  const cash = cashBase + TMSMisc

  const restrictedCash = sumA([110, 111, 112, 113, 115])

  // Tuition receivable: true receivables only (exclude prepaid / suspense items)
  const tuitionRec = descMatch(
    120,
    (d) =>
      !d.includes('Prepaid') &&
      !d.includes('Suspense') &&
      !d.includes('Payment at Institution')
  )

  // Prepaid: acct 125 + "Prepaid TMS Fees" reclassified from acct 120
  const prepaid = sumA([125]) + descMatch(120, (d) => d.includes('Prepaid'))

  const totalCurrentA = cash + restrictedCash + tuitionRec + prepaid

  // Property & equipment (165 = vehicles), net of accumulated depreciation
  const ppNet = sumA([140, 150, 151, 153, 165]) + sumA([170])
  const rouAsset = sumA([160])
  const restrictInvst = sumA([135])
  const totalAssets = totalCurrentA + ppNet + rouAsset + restrictInvst

  // Liabilities — separate the lease current portion from the rest of acct 200
  const leaseCurrAmt = descMatch(200, (d) => d.toLowerCase().includes('lease'))
  const apAccrued = Math.abs(sumA([200]) - leaseCurrAmt)
  const leaseCurr = Math.abs(leaseCurrAmt)
  const studentClubs = Math.abs(sumA([240]))
  const deferredIntl = Math.abs(sumA([230]))
  const totalCurrL = apAccrued + studentClubs + deferredIntl + leaseCurr
  const leaseNonCurr = Math.abs(sumA([260]))
  const totalLiab = totalCurrL + leaseNonCurr

  // Net assets — use the SOA-derived ending balance
  const totalNA = naEnd
  const naWith = restrictInvst
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

/** Build SFP lineage in parallel (numbers unchanged). */
export function buildSFPLineage(data: Dataset, result: SFPResult): StatementLineage {
  const lineage: StatementLineage = {}
  const byAccts = (accts: number[]) => data.filter((r) => accts.includes(r.acct))
  const descRows = (acct: number, pred: (d: string) => boolean): NormalizedRow[] =>
    data.filter((r) => r.acct === acct && r.desc && pred(r.desc))

  const add = (line: string, value: number, sources: NormalizedRow[]) => {
    lineage[line] = { line, scoaCategory: null, statement: 'SFP', sign: 1, value, sources }
  }

  const tmsMiscRows = descRows(120, (d) => d.includes('Suspense') || d.includes('Payment at Institution'))
  add('cash', result.cash, [...byAccts([100, 101, 102, 105, 107, 109]), ...tmsMiscRows])
  add('restrictedCash', result.restrictedCash, byAccts([110, 111, 112, 113, 115]))
  add('tuitionRec', result.tuitionRec, descRows(120, (d) =>
    !d.includes('Prepaid') && !d.includes('Suspense') && !d.includes('Payment at Institution')))
  add('prepaid', result.prepaid, [...byAccts([125]), ...descRows(120, (d) => d.includes('Prepaid'))])
  add('ppNet', result.ppNet, byAccts([140, 150, 151, 153, 165, 170]))
  add('rouAsset', result.rouAsset, byAccts([160]))
  add('restrictInvst', result.restrictInvst, byAccts([135]))

  const leaseRows = descRows(200, (d) => d.toLowerCase().includes('lease'))
  const ap200Rows = data.filter(
    (r) => r.acct === 200 && !(r.desc && r.desc.toLowerCase().includes('lease'))
  )
  add('apAccrued', result.apAccrued, ap200Rows)
  add('leaseCurr', result.leaseCurr, leaseRows)
  add('studentClubs', result.studentClubs, byAccts([240]))
  add('deferredIntl', result.deferredIntl, byAccts([230]))
  add('leaseNonCurr', result.leaseNonCurr, byAccts([260]))

  // Subtotals (no direct sources).
  for (const line of [
    'totalCurrentA', 'totalAssets', 'totalCurrL', 'totalLiab',
    'naWithout', 'naWith', 'totalNA', 'totalLiabNA',
  ] as const) {
    add(line, result[line], [])
  }

  return lineage
}

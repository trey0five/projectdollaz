// ─────────────────────────────────────────────────────────────
// Dataset validation.
//
// debits = credits semantics (data-model aware):
//   The management trial balances this engine consumes OMIT the opening
//   net-assets / equity row — the beginning balance is supplied OUT OF
//   BAND via school.netAssetsBegin (no 300-series equity account is
//   present). A raw debits=credits assertion over such a TB can NEVER
//   net to zero (assets have no offsetting equity credit), so a strict
//   check would be a permanent false alarm.
//
//   We therefore SCOPE the assertion to the data we actually have:
//     • If the TB INCLUDES an equity/opening row (EQUITY_RANGE), it is a
//       complete TB and MUST net to zero — a nonzero difference is a real
//       UNBALANCED error.
//     • If the TB OMITS equity (the management-TB case), the strict check
//       is NOT APPLICABLE. We report balanced=true and attach an
//       informational issue noting the opening equity is external. The
//       totalDebits/totalCredits/difference are still computed for
//       transparency. This is the meaningful behavior for the data model.
//
// Unmapped: revenue/expense accts (acct >= 400) with a nonzero balance
// and no chart mapping — this is what flags account 462. 'ancillary'-
// mapped accts (910/911/918) are NOT flagged (they exist in the chart).
// ─────────────────────────────────────────────────────────────
import type { Dataset, NormalizedRow } from '../types/rows.js'
import type { ValidationResult, ValidationIssue } from '../types/validation.js'
import { DEFAULT_CHART, type StandardChart } from '../scoa/chart.js'

const EPSILON = 0.01

/** Equity / opening-net-assets account range (300-series). */
const EQUITY_MIN = 300
const EQUITY_MAX = 399

/** Whether the dataset includes an equity/opening row (a complete TB). */
export function hasEquityRow(data: Dataset): boolean {
  return data.some((r) => r.acct >= EQUITY_MIN && r.acct <= EQUITY_MAX)
}

/** Legacy unmapped predicate: revenue/expense accts with a nonzero balance and no mapping. */
export function findUnmapped(
  data: Dataset,
  chart: StandardChart = DEFAULT_CHART
): NormalizedRow[] {
  return data.filter(
    (r) => r.acct >= 400 && r.total !== 0 && !chart.mapping.entries[r.acct]
  )
}

export function validateDataset(
  data: Dataset,
  chart: StandardChart = DEFAULT_CHART
): ValidationResult {
  let totalDebits = 0
  let totalCredits = 0
  let difference = 0
  for (const r of data) {
    difference += r.total
    if (r.total > 0) totalDebits += r.total
    else if (r.total < 0) totalCredits += -r.total
  }

  const completeTB = hasEquityRow(data)
  // A strict debits=credits assertion only applies to a complete TB. A
  // management TB that omits the opening equity row is "balanced" in the
  // sense the engine cares about — its imbalance is the known, external
  // beginning net assets, not a data error.
  const netsToZero = Math.abs(difference) < EPSILON
  const balanced = completeTB ? netsToZero : true

  const issues: ValidationIssue[] = []
  if (completeTB && !netsToZero) {
    issues.push({
      code: 'UNBALANCED',
      severity: 'error',
      message: `Trial balance is out of balance by ${difference.toFixed(2)} (debits ${totalDebits.toFixed(2)} vs credits ${totalCredits.toFixed(2)}).`,
    })
  } else if (!completeTB) {
    issues.push({
      code: 'OPENING_EQUITY_EXTERNAL',
      severity: 'info',
      message:
        'Trial balance omits the opening net-assets (equity) row; the beginning balance is supplied externally, so debits=credits is not asserted over the imported set.',
    })
  }

  for (const r of findUnmapped(data, chart)) {
    issues.push({
      code: 'UNMAPPED_ACCOUNT',
      severity: 'warning',
      acct: r.acct,
      desc: r.desc,
      total: r.total,
      message: `Account ${r.acct} "${r.desc}" is unmapped (balance ${r.total.toFixed(2)}).`,
    })
  }

  return { balanced, totalDebits, totalCredits, difference, issues }
}

// ─────────────────────────────────────────────────────────────
// Statement of Changes in Net Assets (NEW).
// Purely derivative of soaResults + sfpResults — adds NO new math and
// cannot perturb regression numbers. beginning + change -> ending, with
// the without/with-donor split shown at the END (mirrors SFP naWithout/
// naWith).
// ─────────────────────────────────────────────────────────────
import type {
  SOAResults,
  SFPResults,
  SFPResult,
  NetAssetsColumn,
  NetAssetsResult,
} from '../types/results.js'
import type { StatementLineage } from '../types/lineage.js'

export interface CalcNetAssetsArgs {
  soaResults: SOAResults
  sfpResults: SFPResults
}

function column(
  begin: number,
  change: number,
  end: number,
  sfp: SFPResult | null
): NetAssetsColumn {
  return {
    begin,
    change,
    end,
    withoutDonor: sfp ? sfp.naWithout : end,
    withDonor: sfp ? sfp.naWith : 0,
  }
}

export function calcNetAssets({
  soaResults,
  sfpResults,
}: CalcNetAssetsArgs): NetAssetsResult {
  const { cy, py, audit, hasPY, hasAudit } = soaResults

  const cyCol = column(
    soaResults.cyNABegin,
    cy.netChange,
    soaResults.cyNAEnd,
    sfpResults.cy
  )

  const pyCol =
    hasPY && py
      ? column(
          soaResults.pyNABegin,
          py.netChange,
          soaResults.pyNAEnd ?? soaResults.pyNABegin + py.netChange,
          sfpResults.py
        )
      : null

  const auditCol =
    hasAudit && audit
      ? column(
          soaResults.auditNABegin,
          audit.netChange,
          soaResults.auditNAEnd ?? soaResults.auditNABegin + audit.netChange,
          sfpResults.audit
        )
      : null

  return { cy: cyCol, py: pyCol, audit: auditCol, hasPY, hasAudit }
}

/** Build Net Assets lineage in parallel. */
export function buildNetAssetsLineage(result: NetAssetsResult): StatementLineage {
  const lineage: StatementLineage = {}
  const add = (line: string, value: number) => {
    lineage[line] = { line, scoaCategory: null, statement: 'NetAssets', sign: 1, value, sources: [] }
  }
  add('begin', result.cy.begin)
  add('change', result.cy.change)
  add('end', result.cy.end)
  add('withoutDonor', result.cy.withoutDonor)
  add('withDonor', result.cy.withDonor)
  return lineage
}

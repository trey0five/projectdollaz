// ─────────────────────────────────────────────────────────────
// Regression truth: locks the SOA/SFP/SCF/netAssets/unmapped numbers
// produced by the engine on sample-data with CY+PY+Audit and
// school.netAssetsBegin = 1,000,000.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { generateReports, validateDataset } from '../src/index.js'
import { cyData, pyData, auditData, school } from './fixtures.js'

const out = generateReports({ cyData, pyData, auditData, school })

describe('SOA regression', () => {
  const { cy, py, audit, cyNAEnd } = out.soaResults
  it('cy totals', () => {
    expect(cy.totalRev).toBe(10342000)
    expect(cy.totalExp).toBe(8359000)
    expect(cy.netChange).toBe(1983000)
    expect(cyNAEnd).toBe(2983000)
  })
  it('py / audit net change', () => {
    expect(py!.netChange).toBe(1903680)
    expect(audit!.netChange).toBe(1824360)
  })
})

describe('SFP regression (cy)', () => {
  const cy = out.sfpResults.cy!
  it('asset/liability/NA lines', () => {
    expect(cy.cash).toBe(1450000)
    expect(cy.tuitionRec).toBe(480000)
    expect(cy.prepaid).toBe(121000)
    expect(cy.totalCurrentA).toBe(2433000)
    expect(cy.ppNet).toBe(8470000)
    expect(cy.totalAssets).toBe(13243000)
    expect(cy.totalLiab).toBe(1402000)
    expect(cy.totalNA).toBe(2983000)
  })
})

describe('SCF regression', () => {
  const s = out.scf!
  it('cash flow sections', () => {
    expect(s.operatingCash).toBe(2420100)
    expect(s.investingCash).toBe(-1061000)
    expect(s.financingCash).toBe(79000)
    expect(s.netCashChange).toBe(1438100)
    expect(s.cashBegin).toBe(1630800)
    expect(s.cashEnd).toBe(1812000)
  })
})

describe('Net Assets statement', () => {
  it('cy begin + change -> end with donor split', () => {
    const cy = out.netAssets.cy
    expect(cy.begin).toBe(1000000)
    expect(cy.change).toBe(1983000)
    expect(cy.end).toBe(2983000)
    expect(cy.withoutDonor + cy.withDonor).toBe(cy.end)
    expect(cy.end).toBe(out.sfpResults.cy!.totalNA)
  })
  it('py / audit change pulled from SOA net change', () => {
    expect(out.netAssets.py!.change).toBe(1903680)
    expect(out.netAssets.audit!.change).toBe(1824360)
  })
})

describe('unmapped + validation', () => {
  it('unmapped includes account 462', () => {
    expect(out.unmapped.some((r) => r.acct === 462)).toBe(true)
  })
  it('validation surfaces 462 as an unmapped issue', () => {
    expect(
      out.validation.issues.some(
        (i) => i.code === 'UNMAPPED_ACCOUNT' && i.acct === 462
      )
    ).toBe(true)
  })
  it('validation result is structured and lineage-locked', () => {
    const v = out.validation
    // The sample management TBs OMIT the opening net-assets/equity row
    // (beginning balance supplied out-of-band), so the engine does NOT
    // raise a false UNBALANCED alarm: balanced is TRUE and the banner stays
    // off. The raw debit/credit totals are still reported for transparency.
    expect(v.balanced).toBe(true)
    expect(v.totalDebits).toBe(26802000)
    expect(v.totalCredits).toBe(16959000)
    expect(v.difference).toBe(9843000)
    expect(v.difference).toBeCloseTo(v.totalDebits - v.totalCredits, 6)
    // No UNBALANCED issue; an informational note explains the external equity.
    expect(v.issues.some((i) => i.code === 'UNBALANCED')).toBe(false)
    expect(
      v.issues.some((i) => i.code === 'OPENING_EQUITY_EXTERNAL' && i.severity === 'info')
    ).toBe(true)
  })

  it('a COMPLETE TB (with an equity/opening row) IS strictly checked', () => {
    // Inject a 300-series equity credit that does NOT offset the imbalance,
    // proving the strict debits=credits assertion fires for complete TBs.
    const withEquity = [...cyData, { acct: 350, desc: 'Net assets — opening', total: -1 }]
    const v = validateDataset(withEquity)
    expect(v.balanced).toBe(false)
    expect(v.issues.some((i) => i.code === 'UNBALANCED' && i.severity === 'error')).toBe(true)

    // And it reports balanced=true when the equity row makes it net to zero.
    const balancedTB = [...cyData, { acct: 350, desc: 'Net assets — opening', total: -9843000 }]
    const vb = validateDataset(balancedTB)
    expect(vb.balanced).toBe(true)
    expect(vb.difference).toBeCloseTo(0, 6)
    expect(vb.issues.some((i) => i.code === 'UNBALANCED')).toBe(false)
  })
})

describe('engine determinism (pure function of inputs)', () => {
  it('two calls with identical inputs return deep-equal bundles', () => {
    const a = generateReports({ cyData, pyData, auditData, school })
    const b = generateReports({ cyData, pyData, auditData, school })
    expect(a).toEqual(b)
    // No clock read by default.
    expect(a.meta.generatedAt).toBeUndefined()
  })
  it('caller-supplied generatedAt is passed through unchanged', () => {
    const stamp = '2026-01-01T00:00:00.000Z'
    const r = generateReports({ cyData, pyData, auditData, school, generatedAt: stamp })
    expect(r.meta.generatedAt).toBe(stamp)
  })
})

describe('meta versions', () => {
  it('carries engine/mapping/chart versions', () => {
    expect(out.meta.engineVersion).toBeTruthy()
    expect(out.meta.mappingVersion).toBe('map-v1')
    expect(out.meta.standardChartVersion).toBe('scoa-v1')
  })
})

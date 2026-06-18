// ─────────────────────────────────────────────────────────────
// Hand-built minimal ReportBundle fixtures. We do NOT read sample-data files —
// these are deterministic, known-math inputs so each metric's arithmetic is
// asserted against numbers we control.
// ─────────────────────────────────────────────────────────────
import type {
  ReportBundle,
  SOAResult,
  SFPResult,
} from '@finrep/engine'

function makeSOA(over: Partial<SOAResult>): SOAResult {
  const base: SOAResult = {
    tuition: 0,
    dev: 0,
    studAct: 0,
    textbook: 0,
    other: 0,
    support: 0,
    intlRev: 0,
    investments: 0,
    interest: 0,
    totalRev: 0,
    instructional: 0,
    facilities: 0,
    fixedOther: 0,
    intlExp: 0,
    bus: 0,
    food: 0,
    studActExp: 0,
    athletics: 0,
    admin: 0,
    restricted: 0,
    totalExp: 0,
    netChange: 0,
  }
  return { ...base, ...over }
}

function makeSFP(over: Partial<SFPResult>): SFPResult {
  const base: SFPResult = {
    cash: 0,
    restrictedCash: 0,
    tuitionRec: 0,
    prepaid: 0,
    totalCurrentA: 0,
    ppNet: 0,
    rouAsset: 0,
    restrictInvst: 0,
    totalAssets: 0,
    apAccrued: 0,
    leaseCurr: 0,
    studentClubs: 0,
    deferredIntl: 0,
    totalCurrL: 0,
    leaseNonCurr: 0,
    totalLiab: 0,
    naWithout: 0,
    naWith: 0,
    totalNA: 0,
    totalLiabNA: 0,
  }
  return { ...base, ...over }
}

function makeBundle(soa: SOAResult, sfp: SFPResult | null): ReportBundle {
  return {
    soaResults: {
      cy: soa,
      py: null,
      audit: null,
      hasPY: false,
      hasAudit: false,
      cyNABegin: 0,
      cyNAEnd: 0,
      pyNABegin: 0,
      pyNAEnd: null,
      auditNABegin: 0,
      auditNAEnd: null,
    },
    sfpResults: { cy: sfp, py: null, audit: null, hasPY: false, hasAudit: false },
    scf: null,
    netAssets: {
      cy: { begin: 0, change: 0, end: 0, withoutDonor: 0, withDonor: 0 },
      py: null,
      audit: null,
      hasPY: false,
      hasAudit: false,
    },
    unmapped: [],
    validation: {
      balanced: true,
      totalDebits: 0,
      totalCredits: 0,
      difference: 0,
      issues: [],
    },
    meta: {
      engineVersion: 'test',
      mappingVersion: 'test',
      standardChartVersion: 'test',
    },
  }
}

// ── FULL bundle: every Tier-1 metric available, simple round math ────────────
// Revenue: tuition 700, dev 150, support 100, other 50 => totalRev 1000
// Expenses: instructional 600, admin 200, facilities 100 => totalExp 900
// netChange = 100. SFP: cash 1800, naWithout 1500.
//   operating_margin   = 100 / 1000           = 0.1
//   days_cash_on_hand  = 1800 / (900/365)     = 730
//   months_op_reserve  = 1500 / (900/12)      = 20
//   tuition_dependency = 700 / 1000           = 0.7
export const FULL_BUNDLE: ReportBundle = makeBundle(
  makeSOA({
    tuition: 700,
    dev: 150,
    support: 100,
    other: 50,
    totalRev: 1000,
    instructional: 600,
    admin: 200,
    facilities: 100,
    totalExp: 900,
    netChange: 100,
  }),
  makeSFP({ cash: 1800, restrictedCash: 200, naWithout: 1500, naWith: 300 }),
)

// ── PRIOR bundle: a worse prior period (drives PoP deltas) ───────────────────
// totalRev 1000, totalExp 950, netChange 50, tuition 800, cash 950, naWithout 950.
//   operating_margin   = 50 / 1000     = 0.05   (cur 0.10 => delta +0.05)
//   days_cash_on_hand  = 950 / (950/365) = 365  (cur 730  => delta +365)
//   months_op_reserve  = 950 / (950/12)  = 12   (cur 20   => delta +8)
//   tuition_dependency = 800 / 1000    = 0.8    (cur 0.7  => delta -0.1)
export const PRIOR_BUNDLE: ReportBundle = makeBundle(
  makeSOA({
    tuition: 800,
    dev: 100,
    support: 50,
    other: 50,
    totalRev: 1000,
    instructional: 650,
    admin: 200,
    facilities: 100,
    totalExp: 950,
    netChange: 50,
  }),
  makeSFP({ cash: 950, restrictedCash: 0, naWithout: 950, naWith: 0 }),
)

// ── MISSING-SFP bundle: SOA present, no current-year SFP ─────────────────────
// days_cash_on_hand + months_operating_reserve must be unavailable (inputs cash
// / naWithout), the SOA-only metrics stay available.
export const NO_SFP_BUNDLE: ReportBundle = makeBundle(
  makeSOA({
    tuition: 400,
    other: 100,
    totalRev: 500,
    instructional: 480,
    totalExp: 480,
    netChange: 20,
  }),
  null,
)

// ── ZERO-REVENUE bundle: totalRev 0 => ratio denominators unavailable ────────
// operating_margin, tuition_dependency, revenue_mix all unavailable (totalRev).
// expense_mix stays available (totalExp 100).
export const ZERO_REV_BUNDLE: ReportBundle = makeBundle(
  makeSOA({
    totalRev: 0,
    instructional: 100,
    totalExp: 100,
    netChange: -100,
  }),
  makeSFP({ cash: 500, naWithout: 400 }),
)

// ── ZERO-EXPENSE bundle: totalExp 0 => SFP metrics + expense_mix unavailable ─
export const ZERO_EXP_BUNDLE: ReportBundle = makeBundle(
  makeSOA({
    tuition: 100,
    totalRev: 100,
    totalExp: 0,
    netChange: 100,
  }),
  makeSFP({ cash: 500, naWithout: 400 }),
)

// ── A small multi-period series for trend tests (oldest -> newest by date) ───
export const SERIES = [
  { periodId: 'p2', label: 'FY25', periodEndDate: '2025-06-30', bundle: PRIOR_BUNDLE },
  { periodId: 'p1', label: 'FY26', periodEndDate: '2026-06-30', bundle: FULL_BUNDLE },
  { periodId: 'p3', label: 'FY24', periodEndDate: '2024-06-30', bundle: NO_SFP_BUNDLE },
]

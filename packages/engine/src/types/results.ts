// ─────────────────────────────────────────────────────────────
// Statement result types. Flat numeric field names are IDENTICAL to
// the legacy engine — the web UI reads these unchanged. Lineage is
// attached separately (see lineage.ts / ReportBundle.lineage).
// ─────────────────────────────────────────────────────────────
import type { Dataset, NormalizedRow } from './rows.js'
import type { SchoolConfig } from './school.js'
import type { ValidationResult } from './validation.js'
import type { ReportLineage } from './lineage.js'
import type { StandardChart } from '../scoa/chart.js'

// ── Statement of Activities ──
export interface SOAResult {
  tuition: number
  dev: number
  studAct: number
  textbook: number
  other: number
  support: number
  intlRev: number
  investments: number
  interest: number
  totalRev: number
  instructional: number
  facilities: number
  fixedOther: number
  intlExp: number
  bus: number
  food: number
  studActExp: number
  athletics: number
  admin: number
  restricted: number
  totalExp: number
  netChange: number
}

export interface SOAResults {
  cy: SOAResult
  py: SOAResult | null
  audit: SOAResult | null
  hasPY: boolean
  hasAudit: boolean
  cyNABegin: number
  cyNAEnd: number
  pyNABegin: number
  pyNAEnd: number | null
  auditNABegin: number
  auditNAEnd: number | null
}

// ── Statement of Financial Position ──
export interface SFPResult {
  cash: number
  restrictedCash: number
  tuitionRec: number
  prepaid: number
  totalCurrentA: number
  ppNet: number
  rouAsset: number
  restrictInvst: number
  totalAssets: number
  apAccrued: number
  leaseCurr: number
  studentClubs: number
  deferredIntl: number
  totalCurrL: number
  leaseNonCurr: number
  totalLiab: number
  naWithout: number
  naWith: number
  totalNA: number
  totalLiabNA: number
}

export interface SFPResults {
  cy: SFPResult | null
  py: SFPResult | null
  audit: SFPResult | null
  hasPY: boolean
  hasAudit: boolean
}

// ── Statement of Cash Flows ──
export interface SCFResult {
  netChange: number
  depr: number
  arAdj: number
  prepaidAdj: number
  apAdj: number
  deferredAdj: number
  clubsAdj: number
  operatingCash: number
  ppePurchases: number
  investmentsCash: number
  investingCash: number
  leasePayments: number
  financingCash: number
  netCashChange: number
  cashBegin: number
  cashEnd: number
  cashUnrestricted: number
  cashRestricted: number
}

// ── Statement of Changes in Net Assets (NEW) ──
export interface NetAssetsColumn {
  begin: number
  change: number
  end: number
  withoutDonor: number
  withDonor: number
}

export interface NetAssetsResult {
  cy: NetAssetsColumn
  py: NetAssetsColumn | null
  audit: NetAssetsColumn | null
  hasPY: boolean
  hasAudit: boolean
}

// ── Orchestrator I/O ──
export interface ReportMeta {
  engineVersion: string
  mappingVersion: string
  standardChartVersion: string
  generatedAt?: string
}

export interface GenerateReportsArgs {
  cyData: Dataset
  pyData: Dataset
  auditData: Dataset
  school: SchoolConfig
  chart?: StandardChart
  /**
   * Optional ISO timestamp stamped into meta.generatedAt. The engine is a
   * deterministic pure function of its inputs, so it does NOT read the clock
   * itself — the I/O boundary (web/ingestion caller) supplies this if wanted.
   * Omitted => meta.generatedAt is undefined.
   */
  generatedAt?: string
}

export interface ReportBundle {
  soaResults: SOAResults
  sfpResults: SFPResults
  scf: SCFResult | null
  netAssets: NetAssetsResult
  unmapped: NormalizedRow[]
  validation: ValidationResult
  meta: ReportMeta
  lineage?: ReportLineage
}

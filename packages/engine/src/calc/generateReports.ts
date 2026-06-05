// ─────────────────────────────────────────────────────────────
// Orchestrator: runs SOA → SFP → SCF → Net Assets for whatever datasets
// are present, validates the imported set, and surfaces unmapped
// accounts. Returns the same flat-field result objects as the legacy
// engine plus netAssets/validation/meta and parallel lineage.
// ─────────────────────────────────────────────────────────────
import type {
  GenerateReportsArgs,
  ReportBundle,
  SOAResults,
  SFPResults,
} from '../types/results.js'
import type { ReportLineage } from '../types/lineage.js'
import { DEFAULT_CHART } from '../scoa/chart.js'
import { calcSOA, buildSOALineage } from './soa.js'
import { calcSFP, buildSFPLineage } from './sfp.js'
import { calcSCF, buildSCFLineage } from './scf.js'
import { calcNetAssets, buildNetAssetsLineage } from './netAssets.js'
import { validateDataset, findUnmapped } from './validate.js'
import {
  ENGINE_VERSION,
  MAPPING_VERSION,
  STANDARD_CHART_VERSION,
} from '../version.js'

export function generateReports({
  cyData,
  pyData,
  auditData,
  school,
  chart = DEFAULT_CHART,
  generatedAt,
}: GenerateReportsArgs): ReportBundle {
  const hasPY = pyData.length > 0
  const hasAudit = auditData.length > 0

  const cy = calcSOA(cyData, chart)
  const py = hasPY ? calcSOA(pyData, chart) : null
  const audit = hasAudit ? calcSOA(auditData, chart) : null

  const cyNABegin = school.netAssetsBegin
  const cyNAEnd = cyNABegin + cy.netChange
  const pyNABegin = school.pyNetAssetsBegin
  const pyNAEnd = hasPY && py ? pyNABegin + py.netChange : null
  const auditNABegin = school.auditNetAssetsBegin
  const auditNAEnd = hasAudit && audit ? auditNABegin + audit.netChange : null

  const soaResults: SOAResults = {
    cy, py, audit, hasPY, hasAudit,
    cyNABegin, cyNAEnd, pyNABegin, pyNAEnd, auditNABegin, auditNAEnd,
  }

  const sfpCy = calcSFP(cyData, cyNAEnd)
  const sfpPy = hasPY && pyNAEnd != null ? calcSFP(pyData, pyNAEnd) : null
  const sfpAudit = hasAudit && auditNAEnd != null ? calcSFP(auditData, auditNAEnd) : null
  const sfpResults: SFPResults = {
    cy: sfpCy,
    py: sfpPy,
    audit: sfpAudit,
    hasPY,
    hasAudit,
  }

  const scf = calcSCF({ soaResults, sfpResults, cyData, pyData, auditData })

  const netAssets = calcNetAssets({ soaResults, sfpResults })

  const unmapped = findUnmapped(cyData, chart)
  const validation = validateDataset(cyData, chart)

  const lineage: ReportLineage = {
    soa: {
      cy: buildSOALineage(cyData, cy, chart),
      py: py ? buildSOALineage(pyData, py, chart) : null,
      audit: audit ? buildSOALineage(auditData, audit, chart) : null,
    },
    sfp: {
      cy: sfpCy ? buildSFPLineage(cyData, sfpCy) : null,
      py: sfpPy ? buildSFPLineage(pyData, sfpPy) : null,
      audit: sfpAudit ? buildSFPLineage(auditData, sfpAudit) : null,
    },
    scf: scf ? buildSCFLineage(cyData, scf) : null,
    netAssets: buildNetAssetsLineage(netAssets),
  }

  return {
    soaResults,
    sfpResults,
    scf,
    netAssets,
    unmapped,
    validation,
    meta: {
      engineVersion: ENGINE_VERSION,
      mappingVersion: MAPPING_VERSION,
      standardChartVersion: STANDARD_CHART_VERSION,
      // Deterministic by default: the engine never reads the clock. The
      // caller may pass an ISO `generatedAt` at the I/O boundary.
      ...(generatedAt !== undefined ? { generatedAt } : {}),
    },
    lineage,
  }
}

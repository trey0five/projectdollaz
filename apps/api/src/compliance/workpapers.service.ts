import { Injectable } from '@nestjs/common'
import type { ReportBundle, SOAResult, SFPResult, SCFResult, NetAssetsColumn } from '@finrep/engine'
import { FL_SCHOLARSHIP_AUP } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { ComplianceService, type ComplianceResponse } from './compliance.service.js'
import {
  ReconciliationService,
  type ReconciliationResponse,
} from './reconciliation.service.js'
import {
  CorrectiveActionService,
  type CorrectiveActionPlanResponse,
} from './corrective-action.service.js'
import { ChecklistService, type ChecklistRollup } from './checklist.service.js'

/** The single aggregated workpapers packet payload. */
export interface WorkpapersPacket {
  meta: {
    schoolName: string
    periodLabel: string
    periodEndDate: string
    rulesetVersion: string
    statuteYear: number
    /** Static disclaimer string (readiness packet, NOT the official AUP submission). */
    preparedContext: string
    /** API-boundary timestamp (the pure package never reads the clock). */
    generatedAt: string
  }
  statements: {
    hasSnapshot: boolean
    activities: SOAResult | null
    financialPosition: SFPResult | null
    cashFlows: SCFResult | null
    netAssets: NetAssetsColumn | null
  }
  reconciliation: {
    result: ReconciliationResponse['result']
    disbursementCount: number
    periodStart: string | null
    periodEnd: string | null
  }
  findings: {
    summary: ComplianceResponse['summary']
    sections: ComplianceResponse['sections']
  }
  cap: {
    entries: CorrectiveActionPlanResponse['entries']
    summary: CorrectiveActionPlanResponse['summary']
  }
  checklist: {
    rollup: ChecklistRollup
  }
}

const PREPARED_CONTEXT =
  'Readiness workpapers packet — NOT the official Agreed-Upon-Procedures (AUP) submission and not legal/audit advice.'

@Injectable()
export class WorkpapersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly compliance: ComplianceService,
    private readonly reconciliation: ReconciliationService,
    private readonly cap: CorrectiveActionService,
    private readonly checklist: ChecklistService,
  ) {}

  /** Latest snapshot's ReportBundle for a period, or null (READ ONLY — never recomputed). */
  private async latestBundle(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<ReportBundle | null> {
    const snap = await this.prisma.statementSnapshot.findFirst({
      where: { schoolId, fiscalPeriodId },
      orderBy: { createdAt: 'desc' },
    })
    return snap ? (snap.payload as unknown as ReportBundle) : null
  }

  /**
   * Assemble the workpapers packet server-side by REUSING the existing services:
   * the snapshot statement schedules are READ from the persisted ReportBundle
   * (never recomputed), the 2A findings, the 2B reconciliation, the 2D CAP, and the
   * checklist rollup are pulled from their services. Tenant-isolated via
   * getOwnedPeriod. Deterministic except for the meta.generatedAt timestamp.
   */
  async getPacket(schoolId: string, periodId: string): Promise<WorkpapersPacket> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })

    const bundle = await this.latestBundle(schoolId, period.id)

    const [compliance, reconciliation, capPlan, checklist] = await Promise.all([
      this.compliance.evaluateForPeriod(schoolId, period.id),
      this.reconciliation.reconcileForPeriod(schoolId, period.id),
      this.cap.getPlan(schoolId, period.id),
      this.checklist.getChecklist(schoolId, period.id),
    ])

    return {
      meta: {
        schoolName: school?.name ?? 'School',
        periodLabel: period.label,
        periodEndDate: period.periodEndDate.toISOString().slice(0, 10),
        rulesetVersion: FL_SCHOLARSHIP_AUP.version,
        statuteYear: FL_SCHOLARSHIP_AUP.statuteYear,
        preparedContext: PREPARED_CONTEXT,
        generatedAt: new Date().toISOString(),
      },
      statements: {
        hasSnapshot: bundle !== null,
        activities: bundle?.soaResults.cy ?? null,
        financialPosition: bundle?.sfpResults.cy ?? null,
        cashFlows: bundle?.scf ?? null,
        netAssets: bundle?.netAssets.cy ?? null,
      },
      reconciliation: {
        result: reconciliation.result,
        disbursementCount: reconciliation.disbursementCount,
        periodStart: reconciliation.periodStart,
        periodEnd: reconciliation.periodEnd,
      },
      findings: {
        summary: compliance.summary,
        sections: compliance.sections,
      },
      cap: {
        entries: capPlan.entries,
        summary: capPlan.summary,
      },
      checklist: {
        rollup: checklist.rollup,
      },
    }
  }
}

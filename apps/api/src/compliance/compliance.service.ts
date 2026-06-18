import { Injectable } from '@nestjs/common'
import type { ReportBundle } from '@finrep/engine'
import { computeMetricsRecord, fromBundle } from '@finrep/analytics'
import {
  evaluateCompliance,
  groupBySection,
  summarize,
  FL_SCHOLARSHIP_AUP,
  type ComplianceFacts,
  type ComplianceFinancials,
  type Finding,
  type Section,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { ComplianceInputsService } from './compliance-inputs.service.js'

/** The grouped findings response shape. */
export interface ComplianceResponse {
  periodId: string
  label: string
  rulesetVersion: string
  statuteYear: number
  summary: ReturnType<typeof summarize>
  findings: Finding[]
  sections: { section: Section; findings: Finding[] }[]
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly inputsService: ComplianceInputsService,
  ) {}

  /** Latest snapshot's ReportBundle for a period, or null. */
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
   * Project a ReportBundle into the pure ComplianceFinancials. §II reuses the
   * engine's bundle.validation.balanced (never recomputed). §V reads the
   * analytics-derived expenseLines (same keys the expense_mix donut uses).
   * daysCashOnHand reuses the analytics metric value (no new math). When there is
   * NO snapshot, hasSnapshot:false so the AUTO rules return needs_data — and the
   * endpoint still returns 200 (intake-only findings remain meaningful).
   */
  private deriveFinancials(bundle: ReportBundle | null): ComplianceFinancials {
    if (!bundle) {
      return {
        balanced: false,
        hasSnapshot: false,
        totalExpenses: 0,
        netAssets: null,
        cash: null,
        daysCashOnHand: null,
        operatingResult: 0,
        expenseLines: {
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
        },
      }
    }

    const fin = fromBundle(bundle)
    const netAssets =
      fin.naWithout !== null || fin.naWith !== null
        ? (fin.naWithout ?? 0) + (fin.naWith ?? 0)
        : null

    // Reuse the analytics days-cash-on-hand metric value (null when unavailable).
    const metrics = computeMetricsRecord({ current: bundle })
    const dch = metrics.days_cash_on_hand
    const daysCashOnHand = dch?.available ? dch.value : null

    return {
      balanced: bundle.validation.balanced,
      hasSnapshot: true,
      totalExpenses: fin.totalExp,
      netAssets,
      cash: fin.cash,
      daysCashOnHand,
      operatingResult: fin.netChange,
      expenseLines: fin.expenseLines,
    }
  }

  /**
   * Evaluate the Florida scholarship AUP readiness for one period. Loads the
   * latest snapshot (+ derived financials), the saved intake, runs the pure
   * @finrep/compliance package, and returns the summary + findings grouped by
   * section. Tenant-isolated via getOwnedPeriod. Deterministic (two GETs identical).
   */
  async evaluateForPeriod(schoolId: string, periodId: string): Promise<ComplianceResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    const bundle = await this.latestBundle(schoolId, period.id)
    const financials = this.deriveFinancials(bundle)
    const inputs = await this.inputsService.complianceInputsFor(schoolId, period.id)

    const facts: ComplianceFacts = {
      inputs,
      financials,
      programs: inputs.programs ?? [],
    }

    const findings = evaluateCompliance(facts)
    const summary = summarize(findings, facts)

    return {
      periodId: period.id,
      label: period.label,
      rulesetVersion: FL_SCHOLARSHIP_AUP.version,
      statuteYear: FL_SCHOLARSHIP_AUP.statuteYear,
      summary,
      findings,
      sections: groupBySection(findings),
    }
  }
}

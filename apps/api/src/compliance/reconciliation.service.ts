import { Injectable } from '@nestjs/common'
import { reconcileScholarships, type ReconciliationResult } from '@finrep/compliance'
import { PeriodsService } from '../periods/periods.service.js'
import { ComplianceInputsService } from './compliance-inputs.service.js'
import { DisbursementsService } from './disbursements.service.js'

/** The reconciliation response: the pure result + a small echo of the inputs used. */
export interface ReconciliationResponse {
  periodId: string
  label: string
  /** Where the recorded figure came from (the 2A intake's scholarshipFundsReceived). */
  recordedSource: 'compliance_inputs'
  periodStart: string | null
  periodEnd: string | null
  disbursementCount: number
  result: ReconciliationResult
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly periods: PeriodsService,
    private readonly inputsService: ComplianceInputsService,
    private readonly disbursements: DisbursementsService,
  ) {}

  /**
   * Run the pure reconciliation for one period. Loads the funding-org
   * disbursements + the school's RECORDED figure (period_compliance_inputs
   * .scholarshipFundsReceived — the SAME value the 2A $250k trigger / §V test
   * read) + the period date bounds, and compares them. Tenant-isolated via
   * getOwnedPeriod. Deterministic (two GETs identical). The recorded figure is
   * NEVER recomputed here — it is the authoritative 2A intake value.
   *
   * Period bounds: FiscalPeriod stores only the period-END date, so we derive a
   * window [end - span + 1day, end] purely for out-of-period date flagging. This
   * NEVER changes totals (only the date_outside_period anomaly) and is fully
   * deterministic. The span honors the period TYPE so sub-annual periods are
   * windowed correctly: month -> 1 month, quarter -> 3 months, everything else
   * (fiscal-year and unrecognized types) -> 1 year. For the live data — all
   * fiscal-year periods — this yields the exact prior behavior (a 1-year window).
   */
  async reconcileForPeriod(schoolId: string, periodId: string): Promise<ReconciliationResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    const rawRows = await this.disbursements.rawRows(schoolId, period.id)
    const inputs = await this.inputsService.complianceInputsFor(schoolId, period.id)

    const periodEnd = period.periodEndDate.toISOString().slice(0, 10)
    const start = new Date(period.periodEndDate)
    const t = String(period.periodType ?? '').toLowerCase()
    if (t === 'month' || t === 'monthly') {
      start.setUTCMonth(start.getUTCMonth() - 1)
    } else if (t === 'quarter' || t === 'quarterly') {
      start.setUTCMonth(start.getUTCMonth() - 3)
    } else {
      // Fiscal-year (fy/fye/fiscal_year) and any unrecognized type: 1-year window.
      start.setUTCFullYear(start.getUTCFullYear() - 1)
    }
    start.setUTCDate(start.getUTCDate() + 1)
    const periodStart = start.toISOString().slice(0, 10)

    const result = reconcileScholarships({
      disbursements: rawRows.map((r) => this.disbursements.toReconcileRow(r)),
      recordedScholarshipRevenue: inputs.scholarshipFundsReceived ?? null,
      periodStart,
      periodEnd,
    })

    return {
      periodId: period.id,
      label: period.label,
      recordedSource: 'compliance_inputs',
      periodStart,
      periodEnd,
      disbursementCount: rawRows.length,
      result,
    }
  }
}

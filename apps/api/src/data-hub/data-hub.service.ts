import { Injectable } from '@nestjs/common'
import { PeriodsService } from '../periods/periods.service.js'
import { MonthlySnapshotsService } from '../monthly/monthly-snapshots.service.js'
import { OperationalService } from '../analytics/operational.service.js'
import { BudgetService } from '../analytics/budget.service.js'
import { SchedulesService } from '../schedules/schedules.service.js'
import { ComplianceInputsService } from '../compliance/compliance-inputs.service.js'
import { QboService } from '../integrations/qbo.service.js'

/** One of the four readiness states a source can be in. */
export type SourceStatus = 'present' | 'partial' | 'missing' | 'optional'

/** STABLE checklist + mascot-pointing order. Shared by web cards + Penny. */
export const SOURCE_ORDER = [
  'trialBalances',
  'monthly',
  'operational',
  'budget',
  'schedules',
  'compliance',
] as const

export type SourceKey = (typeof SOURCE_ORDER)[number]

export interface SourceState {
  status: SourceStatus
  detail: string
  /** present only on trialBalances */
  roles?: { cy: boolean; py: boolean; audit: boolean }
  /** present only on monthly */
  count?: number
  total?: number
}

export interface DataStatusResponse {
  schoolId: string
  periodId: string
  periodLabel: string
  generatedAt: string
  quickbooks: {
    configured: boolean
    connected: boolean
    realmId: string | null
    environment: string | null
  }
  sources: Record<SourceKey, SourceState>
  summary: {
    order: readonly SourceKey[]
    nextStep: SourceKey | null
    needsYou: number
    inProgress: number
    total: number
    allReady: boolean
  }
}

@Injectable()
export class DataHubService {
  constructor(
    private readonly periods: PeriodsService,
    private readonly monthly: MonthlySnapshotsService,
    private readonly operational: OperationalService,
    private readonly budget: BudgetService,
    private readonly schedules: SchedulesService,
    private readonly compliance: ComplianceInputsService,
    private readonly qbo: QboService,
  ) {}

  /**
   * Aggregate readiness across all six ingestion sources for one period. Pure read
   * mapping — no writes, no audit. Tenant isolation: getOwnedPeriod runs FIRST and
   * throws 404 on a cross-tenant / unknown period before any source read. The six
   * source reads then run in parallel for a single round-trip.
   */
  async status(schoolId: string, periodId: string): Promise<DataStatusResponse> {
    // Tenant gate — must precede every read. listPeriods is school-scoped only, so
    // we still resolve the owned period explicitly for the 404 contract + label.
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    const [periodsList, monthlyList, operational, budget, capital, cash, campaign, compliance, qbo] =
      await Promise.all([
        this.periods.listPeriods(schoolId),
        this.monthly.list(schoolId, periodId),
        this.operational.get(schoolId, periodId),
        this.budget.get(schoolId, periodId),
        this.schedules.getCapital(schoolId, periodId),
        this.schedules.getCash(schoolId, periodId),
        this.schedules.getCampaign(schoolId, periodId),
        this.compliance.get(schoolId, periodId),
        this.qbo.status(schoolId),
      ])

    const periodRow = periodsList.find((p) => p.id === periodId)
    const periodLabel = periodRow?.label ?? period.label

    const sources: Record<SourceKey, SourceState> = {
      trialBalances: this.deriveTrialBalances(periodRow),
      monthly: this.deriveMonthly(monthlyList.months.length),
      operational: this.deriveOperational(operational),
      budget: this.deriveBudget(budget),
      schedules: this.deriveSchedules(capital, cash, campaign),
      compliance: this.deriveCompliance(compliance),
    }

    return {
      schoolId,
      periodId,
      periodLabel,
      generatedAt: new Date().toISOString(),
      quickbooks: {
        configured: qbo.configured,
        connected: qbo.connected,
        realmId: qbo.realmId,
        environment: qbo.environment,
      },
      sources,
      summary: this.deriveSummary(sources),
    }
  }

  // ---------------------------------------------------------------------------
  // Per-source derivation. Each maps an existing service's shape -> SourceState.
  // ---------------------------------------------------------------------------

  /**
   * present  = CY trial balance loaded AND statements generated (snapshot exists).
   * partial  = CY trial balance uploaded but statements not yet generated.
   * missing  = no CY trial balance (the one thing we truly need — "start here").
   */
  private deriveTrialBalances(
    periodRow:
      | { roles: { cy: boolean; py: boolean; audit: boolean }; hasSnapshot: boolean }
      | undefined,
  ): SourceState {
    const roles = periodRow?.roles ?? { cy: false, py: false, audit: false }
    const hasSnapshot = periodRow?.hasSnapshot ?? false

    if (roles.cy && hasSnapshot) {
      return {
        status: 'present',
        detail: 'Current year loaded · statements generated.',
        roles,
      }
    }
    if (roles.cy && !hasSnapshot) {
      return {
        status: 'partial',
        detail: 'Trial balance uploaded — generate your statements to finish.',
        roles,
      }
    }
    return {
      status: 'missing',
      detail: 'No trial balance loaded yet — start here.',
      roles,
    }
  }

  /**
   * optional when 0 months, partial 1–11, present 12+. total is always 12.
   */
  private deriveMonthly(count: number): SourceState {
    const total = 12
    if (count <= 0) {
      return { status: 'optional', detail: 'No months loaded yet.', count: 0, total }
    }
    if (count < total) {
      return {
        status: 'partial',
        detail: `${count} of ${total} months loaded.`,
        count,
        total,
      }
    }
    return { status: 'present', detail: 'All 12 months loaded.', count, total }
  }

  /**
   * present when enrollment, studentsOnAid and financialAidTotal are all set;
   * partial when any of them (or any other field) is set but not all three;
   * optional when nothing has been entered.
   */
  private deriveOperational(op: {
    enrollment: number | null
    enrollmentFte: number | null
    studentsOnAid: number | null
    financialAidTotal: number | null
    teachingFte: number | null
    totalStaffFte: number | null
    notes: string | null
    updatedAt: string | null
  }): SourceState {
    const core = {
      enrollment: op.enrollment != null,
      studentsOnAid: op.studentsOnAid != null,
      financialAidTotal: op.financialAidTotal != null,
    }
    const anyField =
      op.enrollment != null ||
      op.enrollmentFte != null ||
      op.studentsOnAid != null ||
      op.financialAidTotal != null ||
      op.teachingFte != null ||
      op.totalStaffFte != null ||
      (op.notes != null && op.notes.trim() !== '')

    if (core.enrollment && core.studentsOnAid && core.financialAidTotal) {
      return { status: 'present', detail: 'Enrollment, aid and staffing are in.' }
    }
    if (anyField) {
      const missing: string[] = []
      if (!core.enrollment) missing.push('enrollment')
      if (!core.financialAidTotal) missing.push('financial aid')
      if (!core.studentsOnAid) missing.push('students on aid')
      const detail = missing.length
        ? `Started — ${missing.join(' and ')} still missing.`
        : 'Started — a few details still missing.'
      return { status: 'partial', detail }
    }
    return { status: 'optional', detail: 'Not entered yet.' }
  }

  /**
   * present when a budget row carries revenue or expense lines; optional otherwise.
   * READ-ONLY: only BudgetService.get is called — budget.service.ts is never mutated.
   */
  private deriveBudget(budget: { lines: Record<string, unknown> | null }): SourceState {
    const lines = budget.lines
    const hasBudget = !!(lines && (lines.revenue || lines.expense))
    return hasBudget
      ? { status: 'present', detail: 'An annual budget is loaded for this period.' }
      : { status: 'optional', detail: 'No budget imported yet.' }
  }

  /**
   * present when ANY of the capital / cash / campaign schedule rows exists; the
   * three getters return a nullable Prisma row. Schedules are never required.
   */
  private deriveSchedules(
    capital: unknown | null,
    cash: unknown | null,
    campaign: unknown | null,
  ): SourceState {
    const any = capital != null || cash != null || campaign != null
    return any
      ? { status: 'present', detail: 'Supporting schedules entered.' }
      : {
          status: 'optional',
          detail: 'No supporting schedules yet — add them if your board packet needs them.',
        }
  }

  /**
   * present when the compliance-inputs row is materially filled (updatedAt set);
   * optional otherwise. Lightweight presence only — no readiness scoring.
   */
  private deriveCompliance(compliance: { updatedAt: string | null }): SourceState {
    return compliance.updatedAt != null
      ? { status: 'present', detail: 'Compliance inputs entered.' }
      : { status: 'optional', detail: 'No compliance inputs entered yet.' }
  }

  // ---------------------------------------------------------------------------
  // Summary rollup over the stable order.
  // ---------------------------------------------------------------------------

  /**
   * nextStep   = first source in `order` whose status is 'missing' (required),
   *              else the first 'partial', else null.
   * needsYou   = count of 'missing'.
   * inProgress = count of 'partial'.
   * total      = count of NON-optional sources (the ones that meaningfully count
   *              toward "ready": missing + partial + present).
   * allReady   = every non-optional source is 'present' (mascot celebrate trigger).
   */
  private deriveSummary(sources: Record<SourceKey, SourceState>): DataStatusResponse['summary'] {
    const ordered = SOURCE_ORDER.map((key) => ({ key, status: sources[key].status }))

    const firstMissing = ordered.find((s) => s.status === 'missing')
    const firstPartial = ordered.find((s) => s.status === 'partial')
    const nextStep: SourceKey | null = firstMissing?.key ?? firstPartial?.key ?? null

    const needsYou = ordered.filter((s) => s.status === 'missing').length
    const inProgress = ordered.filter((s) => s.status === 'partial').length
    const nonOptional = ordered.filter((s) => s.status !== 'optional')
    const total = nonOptional.length
    const allReady = total > 0 && nonOptional.every((s) => s.status === 'present')

    return {
      order: SOURCE_ORDER,
      nextStep,
      needsYou,
      inProgress,
      total,
      allReady,
    }
  }
}

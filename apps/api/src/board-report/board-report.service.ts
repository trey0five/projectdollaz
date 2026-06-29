import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import type { BoardReport } from '@finrep/db'
import type {
  ReportBundle,
  SFPResult,
  NetAssetsColumn,
  SCFResult,
} from '@finrep/engine'
import type { MetricResult } from '@finrep/analytics'
import { REVENUE_LINE_LABELS, EXPENSE_LINE_LABELS } from '@finrep/analytics'
import { MonthlyActualsService } from '../monthly/monthly-actuals.service.js'
import { fyMonthKeys, fyStartYearForPeriodEnd } from '../monthly/fy-elapsed.js'
import type { CategoryActuals } from '../analytics/category-actuals.js'
import {
  rollupMonthlyBudget,
  type MonthlyBudgetColumn,
} from './monthly-budget-rollup.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from '../analytics/analytics.service.js'
import { BudgetService } from '../analytics/budget.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { AssistantClient } from '../assistant/assistant.client.js'
import { SchedulesService } from '../schedules/schedules.service.js'
import {
  CAPITAL_GROUPS,
  CAPITAL_GROUP_LABELS,
  CASH_RESTRICTIONS,
  CASH_RESTRICTION_LABELS,
} from '../schedules/schedule.constants.js'
import type { SaveBoardReportDto } from './dto/save-board-report.dto.js'
import type { MdaBoardReportDto } from './dto/mda-board-report.dto.js'

// ── The sharedShapes contract (the seam with the web engineer) ─────────────────

type ExplanationMap = { revenue: Record<string, string>; expense: Record<string, string> }

interface OperationsLine {
  key: string
  label: string
  actual: number
  budget: number | null
  variance: number | null
  variancePct: number | null
  favorable: boolean
  /** Phase 5 — prior-year actual (informational reference column; no variance vs PY). null when no PY snapshot. */
  priorYear: number | null
  explanation: string | null
}
interface OperationsTotals {
  actual: number
  budget: number | null
  variance: number | null
  variancePct: number | null
  favorable: boolean
  /** Phase 5 — prior-year total; null when no PY snapshot. */
  priorYear: number | null
}
interface Operations {
  revenue: OperationsLine[]
  revenueTotals: OperationsTotals
  expense: OperationsLine[]
  expenseTotals: OperationsTotals
  netSurplus: {
    actual: number
    budget: number | null
    variance: number | null
    variancePct: number | null
    /** Phase 5 — prior-year net surplus/(deficit); null when no PY snapshot. */
    priorYear: number | null
  }
}

// ── Monthly column-group primitives (NBOA MTD + YTD) — additive sibling shape ──
// PURELY ADDITIVE: annual `operations` is never reshaped. Monthly responses carry
// a separate `monthlyOperations` field; annual responses OMIT the monthly-only
// keys entirely (byte-identity).

/** One MTD or YTD measurement for a line/total. */
interface OpCell {
  actual: number
  budget: number | null
  variance: number | null
  variancePct: number | null
  favorable: boolean
}
interface MonthlyOperationsLine {
  key: string
  label: string
  mtd: OpCell
  ytd: OpCell
  /** Phase 5 — DEFERRED for monthly (month bundles are CY-only) -> always null. */
  priorYear: number | null
  explanation: string | null
}
interface MonthlyOperationsTotals {
  mtd: OpCell
  ytd: OpCell
  priorYear: number | null
}
/** netSurplus cells OMIT favorable, mirroring the annual netSurplus shape. */
interface MonthlyNetCell {
  actual: number
  budget: number | null
  variance: number | null
  variancePct: number | null
}
interface MonthlyOperations {
  granularity: 'monthly'
  monthKey: string
  monthLabel: string
  priorMonthKey: string | null
  hasBudget: boolean
  revenue: MonthlyOperationsLine[]
  revenueTotals: MonthlyOperationsTotals
  expense: MonthlyOperationsLine[]
  expenseTotals: MonthlyOperationsTotals
  netSurplus: { mtd: MonthlyNetCell; ytd: MonthlyNetCell; priorYear: number | null }
}

// ── Quarterly column-group (NBOA QTD + YTD) — additive sibling of MonthlyOperations.
// REUSES MonthlyOperationsLine/MonthlyOperationsTotals/MonthlyNetCell verbatim; the
// `mtd` OpCell slot SEMANTICALLY CARRIES quarter-to-date (QTD). Field names are KEPT
// (not renamed to qtd) so buildMonthlyLines/opCell/monthlyTotals/netCell are reused
// with ZERO change — QTD/YTD is purely a label-string distinction in the print doc.
interface QuarterlyOperations {
  granularity: 'quarterly'
  quarterKey: string
  /** Long NBOA heading, e.g. 'For the quarter ended December 31, 2025'. */
  quarterLabel: string
  /** Short chip/cover label, e.g. 'Q2 FY2026'. */
  quarterShortLabel: string
  priorQuarterKey: string | null
  hasBudget: boolean
  revenue: MonthlyOperationsLine[]
  revenueTotals: MonthlyOperationsTotals
  expense: MonthlyOperationsLine[]
  expenseTotals: MonthlyOperationsTotals
  netSurplus: { mtd: MonthlyNetCell; ytd: MonthlyNetCell; priorYear: number | null }
}

interface KeyIndicator {
  key: string
  label: string
  value: number | null
  unit: 'count' | 'currency' | 'ratio' | 'days'
  available: boolean
}

// ── Forecast (Forecast vs Budget — clones the operations shape) ────────────────

interface ForecastLine {
  key: string
  label: string
  forecast: number
  budget: number | null
  variance: number | null
  variancePct: number | null
  favorable: boolean
  explanation: string | null
}
interface ForecastTotals {
  forecast: number
  budget: number | null
  variance: number | null
  variancePct: number | null
  favorable: boolean
}
interface ForecastSection {
  available: boolean
  computedAt: string
  revenue: ForecastLine[]
  revenueTotals: ForecastTotals
  expense: ForecastLine[]
  expenseTotals: ForecastTotals
  netSurplus: {
    forecast: number
    budget: number | null
    variance: number | null
    variancePct: number | null
  }
  assumptionsSummary: {
    enrollmentTotal: number
    feederTotal: number
    feederByGrade: Record<string, number>
    tuitionRates: { prek3: number; prek5: number; elem: number; middle: number }
    inflationPct: number
    programSplit: { parent: number; ftc: number; fes: number }
    /** Phase 4 — 'manual' (legacy/default) | 'rollforward'. */
    projectionMethod: 'manual' | 'rollforward'
    /** Phase 4 — default retention %, 0 when manual. feederTotal doubles as the new-entrants total. */
    retentionPct: number
  }
}

// ── Capital Budget Summary (Phase 3 — server-computed; null when no items) ─────

interface CapitalBudgetLine {
  id: string
  label: string
  actual: number
  budget: number
  overUnder: number
  comment: string
}
interface CapitalBudgetSubtotal {
  actual: number
  budget: number
  overUnder: number
}
interface CapitalBudgetGroup {
  key: string
  label: string
  lines: CapitalBudgetLine[]
  subtotal: CapitalBudgetSubtotal
}
interface CapitalBudgetSection {
  groups: CapitalBudgetGroup[]
  grandTotal: CapitalBudgetSubtotal
}

// ── Capital Campaign (Phase 6 — server-computed; null when no items) ───────────
// Mirrors CapitalBudget* with estimate replacing actual and difference (= budget
// − estimate; positive = UNDER budget = favorable) replacing overUnder. `group`
// is its own display label (free-text), so there is NO key/label split.

interface CapitalCampaignLine {
  id: string
  label: string
  budget: number
  estimate: number
  difference: number
  comment: string
}
interface CapitalCampaignTotal {
  budget: number
  estimate: number
  difference: number
}
interface CapitalCampaignGroup {
  group: string
  lines: CapitalCampaignLine[]
  subtotal: CapitalCampaignTotal
}
interface CapitalCampaignSection {
  campaignName: string | null
  groups: CapitalCampaignGroup[]
  grandTotal: CapitalCampaignTotal
}

// ── Cash & Investments Summary (Phase 3 — server-computed; null when no accounts) ─

interface CashInvestmentsAccount {
  id: string
  institution: string
  accountDescription: string
  vehicle: string
  maturity: string
  interestRate: number | null
  balance: number
  insuredPortion: number
  uninsuredPortion: number
  comment: string
}
interface CashInvestmentsSubtotal {
  balance: number
  insuredPortion: number
  uninsuredPortion: number
}
interface CashInvestmentsGroup {
  key: string
  label: string
  accounts: CashInvestmentsAccount[]
  subtotal: CashInvestmentsSubtotal
}
interface CashInvestmentsSection {
  groups: CashInvestmentsGroup[]
  grandTotal: CashInvestmentsSubtotal
  totalInsured: number
  totalUninsured: number
}

export interface BoardReportBundle {
  periodId: string
  label: string
  periodEndDate: string
  fiscalYearStart: string
  granularity: 'annual' | 'monthly' | 'quarterly'
  /** MONTHLY ONLY — OMITTED entirely on the annual/quarterly branches (byte-identity). */
  monthKey?: string
  /** MONTHLY ONLY — OMITTED entirely on the annual/quarterly branches (byte-identity). */
  monthsAvailable?: string[]
  /** QUARTERLY ONLY — OMITTED entirely on the annual/monthly branches (byte-identity). */
  quarterKey?: string
  /** QUARTERLY ONLY — long NBOA heading. OMITTED on annual/monthly. */
  quarterLabel?: string
  /** QUARTERLY ONLY — short chip/cover label ('Q2 FY2026'). OMITTED on annual/monthly. */
  quarterShortLabel?: string
  /** QUARTERLY ONLY — loadable quarterKeys ascending. OMITTED on annual/monthly. */
  quartersAvailable?: string[]
  availability: {
    hasSnapshot: boolean
    hasBudget: boolean
    hasOperational: boolean
    dataAsOf: string | null
  }
  branding: { schoolName: string; logoBase64: string | null; brandColor: string | null }
  settings: { reportTitle: string | null; committeeName: string | null; generatedAt: string | null }
  mda: { text: string | null; source: 'rule' | 'llm' | 'user' | null }
  /** ANNUAL ONLY — null when monthly. */
  operations: Operations | null
  /** MONTHLY ONLY — null/omitted when annual/quarterly. */
  monthlyOperations?: MonthlyOperations | null
  /** QUARTERLY ONLY — null/omitted when annual/monthly. */
  quarterlyOperations?: QuarterlyOperations | null
  forecast: ForecastSection | null
  capitalBudget: CapitalBudgetSection | null
  cashInvestments: CashInvestmentsSection | null
  capitalCampaign: CapitalCampaignSection | null
  keyIndicators: KeyIndicator[]
  financialPosition: { hasPY: boolean; cy: SFPResult; py: SFPResult | null } | null
  changesInNetAssets: { hasPY: boolean; cy: NetAssetsColumn; py: NetAssetsColumn | null } | null
  cashFlows:
    | ({
        available: boolean
      } & Partial<Record<keyof SCFResult, number>>)
    | null
}

/** The saved+merged row shape returned by PUT. */
export interface BoardReportSaved {
  reportTitle: string | null
  committeeName: string | null
  granularity: string
  mdaText: string | null
  mdaSource: string | null
  explanations: ExplanationMap
  generatedAt: string | null
  updatedAt: string
}

const MAX_EXPLANATION_CHARS = 2000

/** Jul–Jun fiscal year start (YYYY-MM) from a YYYY-MM-DD period-end date. */
function deriveFiscalYearStart(periodEndDate: string): string {
  const d = new Date(periodEndDate)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1 // 1..12
  const startYear = month <= 6 ? year - 1 : year
  return `${startYear}-07`
}

/** variance = actual - budget; variancePct = budget? variance/|budget|*100 : null. */
function computeVariance(
  actual: number,
  budget: number | null,
): { variance: number | null; variancePct: number | null } {
  if (budget === null) return { variance: null, variancePct: null }
  const variance = actual - budget
  const variancePct = budget !== 0 ? round1((variance / Math.abs(budget)) * 100) : null
  return { variance, variancePct }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Last calendar day of a 'YYYY-MM' monthKey as 'YYYY-MM-DD' (month-end, UTC). */
function monthEndIso(monthKey: string): string {
  const [y, m] = monthKey.split('-').map((s) => Number(s))
  // Day 0 of the NEXT month = last day of this month.
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

/** NBOA-style 'For the period ended <Month DD, YYYY>' for a 'YYYY-MM' monthKey. */
function monthLabel(monthKey: string): string {
  const iso = monthEndIso(monthKey)
  const [y, m, d] = iso.split('-').map((s) => Number(s))
  return `For the period ended ${MONTH_NAMES[m - 1]} ${d}, ${y}`
}

// ── Quarterly FY helpers (Jul–Jun) — FROZEN key = '<fyStartYear>-Q<n>' ──────────
// fyStartYear is the calendar year of the FY's July (so FY2026 = Jul 2025–Jun 2026
// -> fyStartYear 2025). FY label = 'FY<fyStartYear+1>'. Month math reuses
// fyMonthKeys (no hand-rolled arithmetic).

const QUARTER_KEY_RE = /^(\d{4})-Q([1-4])$/

/** Parse a quarterKey '<fyStartYear>-Q<n>' -> {fyStartYear, q} or null when malformed. */
function parseQuarterKey(key: string): { fyStartYear: number; q: 1 | 2 | 3 | 4 } | null {
  const m = QUARTER_KEY_RE.exec(key)
  if (!m) return null
  return { fyStartYear: Number(m[1]), q: Number(m[2]) as 1 | 2 | 3 | 4 }
}

/** The 3 'YYYY-MM' month keys of quarter q (1..4) for a fiscal year (Jul–Jun). */
function quarterMonthKeys(fyStartYear: number, q: 1 | 2 | 3 | 4): string[] {
  const all = fyMonthKeys(fyStartYear) // Jul..Jun ordered
  return all.slice((q - 1) * 3, (q - 1) * 3 + 3)
}

/** The quarter-END 'YYYY-MM' month key (3rd month of the quarter). */
function quarterEndMonthKey(fyStartYear: number, q: 1 | 2 | 3 | 4): string {
  return quarterMonthKeys(fyStartYear, q)[2]
}

/** The PRIOR quarter-end 'YYYY-MM' (Q1 has none -> null). */
function priorQuarterEndMonthKey(fyStartYear: number, q: 1 | 2 | 3 | 4): string | null {
  if (q === 1) return null
  return quarterEndMonthKey(fyStartYear, (q - 1) as 1 | 2 | 3)
}

/** FY display label, 'FY<fyStartYear+1>' (FY2026 for fyStartYear 2025). */
function fyLabel(fyStartYear: number): string {
  return `FY${fyStartYear + 1}`
}

/** Short chip/cover label, 'Q<n> FY<yyyy>'. */
function quarterShortLabel(fyStartYear: number, q: 1 | 2 | 3 | 4): string {
  return `Q${q} ${fyLabel(fyStartYear)}`
}

/** Long NBOA heading, 'For the quarter ended <Month DD, YYYY>' (quarter-end date). */
function quarterLabel(fyStartYear: number, q: 1 | 2 | 3 | 4): string {
  const iso = monthEndIso(quarterEndMonthKey(fyStartYear, q))
  const [y, m, d] = iso.split('-').map((s) => Number(s))
  return `For the quarter ended ${MONTH_NAMES[m - 1]} ${d}, ${y}`
}

@Injectable()
export class BoardReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly analytics: AnalyticsService,
    private readonly budget: BudgetService,
    private readonly audit: AuditService,
    private readonly schedules: SchedulesService,
    private readonly monthlyActuals: MonthlyActualsService,
    // Optional so the service constructs without the LLM (rule baseline only).
    @Optional() private readonly assistant?: AssistantClient,
  ) {}

  // ── Assemble (the single fully-computed read) ────────────────────────────────

  /**
   * The single server-side assemble: returns a fully-computed BoardReportBundle.
   * The web layer does ZERO math. NEVER 404s on missing snapshot/budget (returns
   * availability flags + null sections); ONLY 404s on cross-tenant/unknown period.
   */
  async assemble(
    schoolId: string,
    periodId: string,
    granularity = 'annual',
    monthKey?: string,
    quarter?: string,
  ): Promise<BoardReportBundle> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId) // 404 cross-tenant
    if (
      granularity !== 'annual' &&
      granularity !== 'monthly' &&
      granularity !== 'quarterly'
    ) {
      throw new BadRequestException({
        code: 'granularity_unsupported',
        message: 'Only annual, monthly, and quarterly granularities are supported.',
      })
    }
    if (granularity === 'monthly') {
      return this.assembleMonthly(schoolId, period, monthKey)
    }
    if (granularity === 'quarterly') {
      return this.assembleQuarterly(schoolId, period, quarter)
    }

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    const row = await this.findRow(schoolId, period.id)
    const explanations = this.readExplanations(row)

    const { bundle, dataAsOf, metrics, categoryActuals, categoryActualsPY } =
      await this.analytics.getBoardReportData(schoolId, period.id)
    const budgetPublic = await this.budget.get(schoolId, period.id)
    const budgetLines = (budgetPublic.lines as Record<string, unknown> | null) ?? null
    const budgetRevenue = (budgetLines?.revenue as Record<string, number> | undefined) ?? null
    const budgetExpense = (budgetLines?.expense as Record<string, number> | undefined) ?? null
    const hasBudget = !!(budgetRevenue || budgetExpense)

    const operationalRow = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })

    const capRow = await this.schedules.getCapital(schoolId, period.id)
    const cashRow = await this.schedules.getCash(schoolId, period.id)
    const campRow = await this.schedules.getCampaign(schoolId, period.id)

    const periodEndDate = period.periodEndDate.toISOString().slice(0, 10)

    const settingsCommittee =
      row?.committeeName ?? school?.defaultCommittee ?? null

    const bundleOut: BoardReportBundle = {
      periodId: period.id,
      label: period.label,
      periodEndDate,
      fiscalYearStart: deriveFiscalYearStart(periodEndDate),
      granularity: 'annual',
      availability: {
        hasSnapshot: !!bundle,
        hasBudget,
        hasOperational: !!operationalRow,
        dataAsOf,
      },
      branding: {
        schoolName: school?.name ?? '',
        logoBase64: school?.logoBase64 ?? null,
        brandColor: school?.brandColor ?? null,
      },
      settings: {
        reportTitle: row?.reportTitle ?? null,
        committeeName: settingsCommittee,
        generatedAt: row?.generatedAt ? row.generatedAt.toISOString() : null,
      },
      mda: {
        text: row?.mdaText ?? null,
        source: (row?.mdaSource as BoardReportBundle['mda']['source']) ?? null,
      },
      operations: bundle
        ? this.buildOperations(
            categoryActuals,
            categoryActualsPY,
            budgetRevenue,
            budgetExpense,
            explanations,
          )
        : null,
      forecast: this.buildForecastSection(
        (budgetLines?.forecast as Record<string, unknown> | undefined) ?? null,
      ),
      capitalBudget: this.buildCapitalBudget(capRow?.items ?? null),
      cashInvestments: this.buildCashInvestments(cashRow?.accounts ?? null),
      capitalCampaign: this.buildCapitalCampaign(
        campRow?.campaignName ?? null,
        campRow?.items ?? null,
      ),
      keyIndicators: bundle ? this.buildKeyIndicators(metrics, operationalRow) : [],
      financialPosition: bundle ? this.buildFinancialPosition(bundle) : null,
      changesInNetAssets: bundle ? this.buildChangesInNetAssets(bundle) : null,
      cashFlows: bundle ? this.buildCashFlows(bundle) : null,
    }
    return bundleOut
  }

  // ── Assemble (monthly — NBOA MTD + YTD column groups) ────────────────────────

  /**
   * Monthly branch. Actuals come from MonthlyActualsService (reused, never
   * recomputed); the monthly budget is rolled up INDEPENDENTLY from the persisted
   * lines.spread via rollupMonthlyBudget (engine ACCT_MAP). The annual `operations`
   * field is null; a separate `monthlyOperations` sibling carries the MTD/YTD
   * groups. monthKey/monthsAvailable are attached ONLY here (annual omits them).
   */
  private async assembleMonthly(
    schoolId: string,
    period: { id: string; label: string; periodEndDate: Date },
    monthKey?: string,
  ): Promise<BoardReportBundle> {
    if (!monthKey) {
      throw new BadRequestException({
        code: 'month_required',
        message: 'granularity=monthly requires a month (YYYY-MM).',
      })
    }

    // Actuals — MonthlyActualsService throws a PLAIN-message 400 when the month is
    // not loaded; CATCH and re-emit the coded {month_not_loaded, monthsAvailable}
    // contract shape so the inner message isn't leaked.
    let ma: Awaited<ReturnType<MonthlyActualsService['actuals']>>
    try {
      ma = await this.monthlyActuals.actuals(schoolId, period.id, monthKey)
    } catch (e) {
      // Only the "month not loaded" 400 is re-emitted with the coded contract
      // shape; any other error (DB 500, tenancy 404) must propagate untouched so
      // real faults aren't masked as a benign month_not_loaded.
      if (!(e instanceof BadRequestException)) throw e
      const available = await this.monthlyMonthsAvailable(schoolId, period.id)
      throw new BadRequestException({
        code: 'month_not_loaded',
        message: `Month ${monthKey} is not loaded for this period.`,
        monthsAvailable: available,
      })
    }
    // No months loaded at all => the service returns an empty-but-shaped response
    // (monthsAvailable=[]); treat as not-loaded for the requested month.
    if (ma.monthsAvailable.length === 0) {
      throw new BadRequestException({
        code: 'month_not_loaded',
        message: `Month ${monthKey} is not loaded for this period.`,
        monthsAvailable: [],
      })
    }

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    const row = await this.findRow(schoolId, period.id)
    const explanations = this.readExplanations(row)

    // Budget — read-only via the existing BudgetService.get; roll up INDEPENDENTLY.
    const budgetPublic = await this.budget.get(schoolId, period.id)
    const budgetLines = (budgetPublic.lines as Record<string, unknown> | null) ?? null
    const spread = (budgetLines?.spread as unknown) ?? null
    const mb = rollupMonthlyBudget(spread)
    const budgetYtd = mb?.budgetYtd(monthKey) ?? null
    const budgetMtd = mb?.budgetMtd(monthKey) ?? null
    const hasBudget = budgetYtd !== null

    const monthlyOperations = this.buildMonthlyOperations(
      ma.ytd,
      ma.mtd,
      budgetYtd,
      budgetMtd,
      explanations,
      monthKey,
      ma.priorMonthKey,
    )

    // periodEndDate = last-day-of-month derived from monthKey; monthLabel NBOA-style.
    const periodEndDate = monthEndIso(monthKey)

    // Non-Operations sections reuse the month-end bundle point-in-time data + the
    // partial-year metrics. priorYear/PY DEFERRED (month bundles are CY-only).
    const operationalRow = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    const capRow = await this.schedules.getCapital(schoolId, period.id)
    const cashRow = await this.schedules.getCash(schoolId, period.id)
    const campRow = await this.schedules.getCampaign(schoolId, period.id)

    const settingsCommittee = row?.committeeName ?? school?.defaultCommittee ?? null

    const bundleOut: BoardReportBundle = {
      periodId: period.id,
      label: period.label,
      periodEndDate,
      fiscalYearStart: deriveFiscalYearStart(periodEndDate),
      granularity: 'monthly',
      monthKey,
      monthsAvailable: ma.monthsAvailable,
      availability: {
        hasSnapshot: true,
        hasBudget,
        hasOperational: !!operationalRow,
        dataAsOf: periodEndDate,
      },
      branding: {
        schoolName: school?.name ?? '',
        logoBase64: school?.logoBase64 ?? null,
        brandColor: school?.brandColor ?? null,
      },
      settings: {
        reportTitle: row?.reportTitle ?? null,
        committeeName: settingsCommittee,
        generatedAt: row?.generatedAt ? row.generatedAt.toISOString() : null,
      },
      mda: {
        text: row?.mdaText ?? null,
        source: (row?.mdaSource as BoardReportBundle['mda']['source']) ?? null,
      },
      operations: null,
      monthlyOperations,
      forecast: this.buildForecastSection(
        (budgetLines?.forecast as Record<string, unknown> | undefined) ?? null,
      ),
      capitalBudget: this.buildCapitalBudget(capRow?.items ?? null),
      cashInvestments: this.buildCashInvestments(cashRow?.accounts ?? null),
      capitalCampaign: this.buildCapitalCampaign(
        campRow?.campaignName ?? null,
        campRow?.items ?? null,
      ),
      keyIndicators: this.buildMonthlyKeyIndicators(ma.metrics, operationalRow),
      financialPosition: this.buildMonthlyFinancialPosition(ma.balanceSheet),
      // CY-only month snapshots — no PY change-in-net-assets / cash-flow comparatives.
      changesInNetAssets: null,
      cashFlows: null,
    }
    return bundleOut
  }

  /** monthsAvailable for the coded month_not_loaded re-emit (cheap, ascending). */
  private async monthlyMonthsAvailable(schoolId: string, periodId: string): Promise<string[]> {
    const snaps = await this.prisma.monthlySnapshot.findMany({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { monthKey: 'asc' },
      select: { monthKey: true },
    })
    return snaps.map((s) => s.monthKey)
  }

  // ── Assemble (quarterly — NBOA QTD + YTD column groups) ──────────────────────

  /**
   * Quarterly branch. Mirrors assembleMonthly structurally but the QTD/YTD cells
   * are DIFFERENCED from the existing monthly YTD measurements at quarter-ends:
   *   YTD(quarter) = actuals(quarterEndMonth).ytd
   *   QTD(quarter) = YTD(quarterEndMonth) − YTD(priorQuarterEndMonth)  (Q1: QTD == YTD(Sep))
   * At most TWO actuals reads (the actuals .mtd is ignored). NEVER 404s: all data
   * gaps -> coded BadRequestException (quarter_required / quarter_not_loaded).
   * quarterKey/quarterLabel/quarterShortLabel/quartersAvailable + quarterlyOperations
   * are attached ONLY here; operations/monthlyOperations are null.
   */
  private async assembleQuarterly(
    schoolId: string,
    period: { id: string; label: string; periodEndDate: Date },
    quarter?: string,
  ): Promise<BoardReportBundle> {
    const fyStartYear = fyStartYearForPeriodEnd(period.periodEndDate)

    if (!quarter) {
      throw new BadRequestException({
        code: 'quarter_required',
        message: 'granularity=quarterly requires a quarter (<fyStartYear>-Q<n>).',
      })
    }

    // quartersAvailable is needed for BOTH the success bundle and the coded error.
    const quartersAvailable = await this.quarterlyQuartersAvailable(
      schoolId,
      period.id,
      fyStartYear,
    )

    const parsed = parseQuarterKey(quarter)
    // Malformed OR cross-FY (a key for a different fiscal year) -> coded, never 500.
    if (!parsed || parsed.fyStartYear !== fyStartYear) {
      throw new BadRequestException({
        code: 'quarter_not_loaded',
        message: `Quarter ${quarter} is not loadable for this period.`,
        quartersAvailable,
      })
    }
    const q = parsed.q
    if (!quartersAvailable.includes(quarter)) {
      throw new BadRequestException({
        code: 'quarter_not_loaded',
        message: `Quarter ${quarter} is not loaded for this period.`,
        quartersAvailable,
      })
    }

    const endMonth = quarterEndMonthKey(fyStartYear, q)
    const priorEnd = priorQuarterEndMonthKey(fyStartYear, q)

    // Read the quarter-end (and prior quarter-end for Q2..Q4) YTD actuals. Re-emit
    // the coded quarter_not_loaded on a not-loaded 400 (mirrors assembleMonthly).
    let endMa: Awaited<ReturnType<MonthlyActualsService['actuals']>>
    let priorMa: Awaited<ReturnType<MonthlyActualsService['actuals']>> | null = null
    try {
      endMa = await this.monthlyActuals.actuals(schoolId, period.id, endMonth)
      if (priorEnd) {
        priorMa = await this.monthlyActuals.actuals(schoolId, period.id, priorEnd)
      }
    } catch (e) {
      if (!(e instanceof BadRequestException)) throw e
      throw new BadRequestException({
        code: 'quarter_not_loaded',
        message: `Quarter ${quarter} is not loaded for this period.`,
        quartersAvailable,
      })
    }

    const ytd = endMa.ytd
    // QTD = YTD(end) − YTD(priorEnd); Q1 has no prior quarter-end -> QTD == YTD(Sep)
    // (deep-copy so the two cells are independent objects).
    const qtd: CategoryActuals = priorMa
      ? this.diffCategoryActuals(ytd, priorMa.ytd)
      : { revenue: { ...ytd.revenue }, expense: { ...ytd.expense } }

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    const row = await this.findRow(schoolId, period.id)
    const explanations = this.readExplanations(row)

    // Budget — read-only via BudgetService.get; roll up INDEPENDENTLY. YTD budget =
    // cumulative Jul..quarterEnd; QTD budget = sum of the quarter's 3 spread months.
    const budgetPublic = await this.budget.get(schoolId, period.id)
    const budgetLines = (budgetPublic.lines as Record<string, unknown> | null) ?? null
    const spread = (budgetLines?.spread as unknown) ?? null
    const mb = rollupMonthlyBudget(spread)
    const budgetYtd = mb?.budgetYtd(endMonth) ?? null
    const budgetQtd = mb?.budgetMonths(quarterMonthKeys(fyStartYear, q)) ?? null

    const quarterlyOperations = this.buildQuarterlyOperations(
      ytd,
      qtd,
      budgetYtd,
      budgetQtd,
      explanations,
      quarter,
      fyStartYear,
      q,
    )

    const periodEndDate = monthEndIso(endMonth)

    const operationalRow = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    const capRow = await this.schedules.getCapital(schoolId, period.id)
    const cashRow = await this.schedules.getCash(schoolId, period.id)
    const campRow = await this.schedules.getCampaign(schoolId, period.id)

    const settingsCommittee = row?.committeeName ?? school?.defaultCommittee ?? null

    const bundleOut: BoardReportBundle = {
      periodId: period.id,
      label: period.label,
      periodEndDate,
      fiscalYearStart: deriveFiscalYearStart(periodEndDate),
      granularity: 'quarterly',
      quarterKey: quarter,
      quarterLabel: quarterLabel(fyStartYear, q),
      quarterShortLabel: quarterShortLabel(fyStartYear, q),
      quartersAvailable,
      availability: {
        hasSnapshot: true,
        hasBudget: budgetYtd !== null,
        hasOperational: !!operationalRow,
        dataAsOf: periodEndDate,
      },
      branding: {
        schoolName: school?.name ?? '',
        logoBase64: school?.logoBase64 ?? null,
        brandColor: school?.brandColor ?? null,
      },
      settings: {
        reportTitle: row?.reportTitle ?? null,
        committeeName: settingsCommittee,
        generatedAt: row?.generatedAt ? row.generatedAt.toISOString() : null,
      },
      mda: {
        text: row?.mdaText ?? null,
        source: (row?.mdaSource as BoardReportBundle['mda']['source']) ?? null,
      },
      operations: null,
      monthlyOperations: null,
      quarterlyOperations,
      forecast: this.buildForecastSection(
        (budgetLines?.forecast as Record<string, unknown> | undefined) ?? null,
      ),
      capitalBudget: this.buildCapitalBudget(capRow?.items ?? null),
      cashInvestments: this.buildCashInvestments(cashRow?.accounts ?? null),
      capitalCampaign: this.buildCapitalCampaign(
        campRow?.campaignName ?? null,
        campRow?.items ?? null,
      ),
      keyIndicators: this.buildMonthlyKeyIndicators(endMa.metrics, operationalRow),
      financialPosition: this.buildMonthlyFinancialPosition(endMa.balanceSheet),
      // CY-only snapshots — no PY change-in-net-assets / cash-flow comparatives.
      changesInNetAssets: null,
      cashFlows: null,
    }
    return bundleOut
  }

  /**
   * The loadable quarterKeys (ascending Q1..Q4) for a fiscal year. A quarter is
   * loadable iff EVERY quarter-end snapshot it differences against is loaded:
   * Q1 needs Sep; Q2 needs Dec AND Sep; Q3 needs Mar AND Dec; Q4 needs Jun AND Mar.
   * Computed from the existing monthly snapshot list (no new query path).
   */
  private async quarterlyQuartersAvailable(
    schoolId: string,
    periodId: string,
    fyStartYear: number,
  ): Promise<string[]> {
    const loaded = new Set(await this.monthlyMonthsAvailable(schoolId, periodId))
    const out: string[] = []
    for (const q of [1, 2, 3, 4] as const) {
      const end = quarterEndMonthKey(fyStartYear, q)
      const prior = priorQuarterEndMonthKey(fyStartYear, q)
      if (loaded.has(end) && (prior === null || loaded.has(prior))) {
        out.push(`${fyStartYear}-Q${q}`)
      }
    }
    return out
  }

  /**
   * Key-union subtract of two CategoryActuals (end − prior), missing side 0. Local
   * copy of MonthlyActualsService.subtractFlow (kept private there) — used for the
   * QTD = YTD(end) − YTD(priorEnd) difference.
   */
  private diffCategoryActuals(
    end: CategoryActuals,
    prior: CategoryActuals,
  ): CategoryActuals {
    const diff = (
      a: Record<string, number>,
      b: Record<string, number>,
    ): Record<string, number> => {
      const out: Record<string, number> = {}
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        out[k] = (a[k] ?? 0) - (b[k] ?? 0)
      }
      return out
    }
    return {
      revenue: diff(end.revenue, prior.revenue),
      expense: diff(end.expense, prior.expense),
    }
  }

  /**
   * Build the QTD + YTD Operations group. REUSES buildMonthlyLines/monthlyTotals/
   * the netCell pattern verbatim with QTD in the `mtd` OpCell slot and YTD in the
   * `ytd` slot (field names KEPT — the FE reads r.mtd for the QTD column). budget
   * null sides => null variance, favorable:true (matches the monthly path).
   */
  private buildQuarterlyOperations(
    ytd: CategoryActuals,
    qtd: CategoryActuals,
    budgetYtd: MonthlyBudgetColumn | null,
    budgetQtd: MonthlyBudgetColumn | null,
    explanations: ExplanationMap,
    quarterKey: string,
    fyStartYear: number,
    q: 1 | 2 | 3 | 4,
  ): QuarterlyOperations {
    const revenue = this.buildMonthlyLines(
      qtd.revenue,
      ytd.revenue,
      budgetQtd?.revenue ?? null,
      budgetYtd?.revenue ?? null,
      REVENUE_LINE_LABELS as Record<string, string>,
      explanations.revenue,
      'revenue',
    )
    const expense = this.buildMonthlyLines(
      qtd.expense,
      ytd.expense,
      budgetQtd?.expense ?? null,
      budgetYtd?.expense ?? null,
      EXPENSE_LINE_LABELS as Record<string, string>,
      explanations.expense,
      'expense',
    )

    const revenueTotals = this.monthlyTotals(revenue, 'revenue', budgetQtd !== null, budgetYtd !== null)
    const expenseTotals = this.monthlyTotals(expense, 'expense', budgetQtd !== null, budgetYtd !== null)

    const netCell = (rev: OpCell, exp: OpCell): MonthlyNetCell => {
      const actual = rev.actual - exp.actual
      const hasB = rev.budget !== null && exp.budget !== null
      const budget = hasB ? (rev.budget as number) - (exp.budget as number) : null
      const { variance, variancePct } = computeVariance(actual, budget)
      return { actual, budget, variance, variancePct }
    }

    return {
      granularity: 'quarterly',
      quarterKey,
      quarterLabel: quarterLabel(fyStartYear, q),
      quarterShortLabel: quarterShortLabel(fyStartYear, q),
      priorQuarterKey: q === 1 ? null : `${fyStartYear}-Q${q - 1}`,
      hasBudget: budgetYtd !== null,
      revenue,
      revenueTotals,
      expense,
      expenseTotals,
      netSurplus: {
        mtd: netCell(revenueTotals.mtd, expenseTotals.mtd),
        ytd: netCell(revenueTotals.ytd, expenseTotals.ytd),
        priorYear: null,
      },
    }
  }

  /**
   * Build the MTD + YTD Operations groups. Mirrors buildOperations/buildLines but
   * emits an OpCell per side. Actuals from MonthlyActualsService; budget from the
   * per-month rollup (null when hasBudget:false => every budget/variance null,
   * favorable:true). priorYear DEFERRED -> null.
   *
   * NBOA MTD note: actuals MTD = YTD(M) - YTD(priorLoaded) (prior = largest LOADED
   * month < M, possibly sparse), whereas budget MTD uses the single calendar-month
   * column. For v1 this apples-to-oranges MTD on sparse months is ACCEPTED and
   * documented here; the YTD columns are always correct. Refining budget MTD to
   * sum priorLoaded+1..M is DEFERRED.
   */
  private buildMonthlyOperations(
    ytd: CategoryActuals,
    mtd: CategoryActuals,
    budgetYtd: MonthlyBudgetColumn | null,
    budgetMtd: MonthlyBudgetColumn | null,
    explanations: ExplanationMap,
    monthKey: string,
    priorMonthKey: string | null,
  ): MonthlyOperations {
    const revenue = this.buildMonthlyLines(
      mtd.revenue,
      ytd.revenue,
      budgetMtd?.revenue ?? null,
      budgetYtd?.revenue ?? null,
      REVENUE_LINE_LABELS as Record<string, string>,
      explanations.revenue,
      'revenue',
    )
    const expense = this.buildMonthlyLines(
      mtd.expense,
      ytd.expense,
      budgetMtd?.expense ?? null,
      budgetYtd?.expense ?? null,
      EXPENSE_LINE_LABELS as Record<string, string>,
      explanations.expense,
      'expense',
    )

    const revenueTotals = this.monthlyTotals(revenue, 'revenue', budgetMtd !== null, budgetYtd !== null)
    const expenseTotals = this.monthlyTotals(expense, 'expense', budgetMtd !== null, budgetYtd !== null)

    const netCell = (rev: OpCell, exp: OpCell): MonthlyNetCell => {
      const actual = rev.actual - exp.actual
      const hasB = rev.budget !== null && exp.budget !== null
      const budget = hasB ? (rev.budget as number) - (exp.budget as number) : null
      const { variance, variancePct } = computeVariance(actual, budget)
      return { actual, budget, variance, variancePct }
    }

    return {
      granularity: 'monthly',
      monthKey,
      monthLabel: monthLabel(monthKey),
      priorMonthKey,
      hasBudget: budgetYtd !== null,
      revenue,
      revenueTotals,
      expense,
      expenseTotals,
      netSurplus: {
        mtd: netCell(revenueTotals.mtd, expenseTotals.mtd),
        ytd: netCell(revenueTotals.ytd, expenseTotals.ytd),
        priorYear: null,
      },
    }
  }

  /**
   * One ordered set of monthly operations lines, each with an MTD + YTD OpCell.
   * Key union per section = actual(mtd∪ytd) ∪ budget(mtd∪ytd), sorted by the
   * canonical label ordering (same sort as buildLines). null budget side => null
   * variance/variancePct, favorable true (matches isFavorable(null)).
   */
  private buildMonthlyLines(
    mtdActual: Record<string, number>,
    ytdActual: Record<string, number>,
    mtdBudget: Record<string, number> | null,
    ytdBudget: Record<string, number> | null,
    labels: Record<string, string>,
    explanations: Record<string, string>,
    type: 'revenue' | 'expense',
  ): MonthlyOperationsLine[] {
    const keys = new Set<string>([
      ...Object.keys(mtdActual),
      ...Object.keys(ytdActual),
      ...Object.keys(mtdBudget ?? {}),
      ...Object.keys(ytdBudget ?? {}),
    ])
    const lines: MonthlyOperationsLine[] = []
    for (const key of keys) {
      lines.push({
        key,
        label: labels[key] ?? key,
        mtd: this.opCell(Number(mtdActual[key] ?? 0), mtdBudget ? Number(mtdBudget[key] ?? 0) : null, type),
        ytd: this.opCell(Number(ytdActual[key] ?? 0), ytdBudget ? Number(ytdBudget[key] ?? 0) : null, type),
        priorYear: null,
        explanation: explanations[key] ?? null,
      })
    }
    const order = Object.keys(labels)
    lines.sort((a, b) => {
      const ia = order.indexOf(a.key)
      const ib = order.indexOf(b.key)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.label.localeCompare(b.label)
    })
    return lines
  }

  /** One OpCell — variance/variancePct via computeVariance; favorable per column. */
  private opCell(actual: number, budget: number | null, type: 'revenue' | 'expense'): OpCell {
    const { variance, variancePct } = computeVariance(actual, budget)
    return { actual, budget, variance, variancePct, favorable: this.isFavorable(type, variance) }
  }

  private monthlyTotals(
    lines: MonthlyOperationsLine[],
    type: 'revenue' | 'expense',
    hasMtdBudget: boolean,
    hasYtdBudget: boolean,
  ): MonthlyOperationsTotals {
    const sum = (
      pick: (l: MonthlyOperationsLine) => OpCell,
      hasBudget: boolean,
    ): OpCell => {
      const actual = lines.reduce((s, l) => s + pick(l).actual, 0)
      const budget = hasBudget ? lines.reduce((s, l) => s + (pick(l).budget ?? 0), 0) : null
      const { variance, variancePct } = computeVariance(actual, budget)
      return { actual, budget, variance, variancePct, favorable: this.isFavorable(type, variance) }
    }
    return {
      mtd: sum((l) => l.mtd, hasMtdBudget),
      ytd: sum((l) => l.ytd, hasYtdBudget),
      priorYear: null,
    }
  }

  /** Point-in-time financial position from the month-end bundle (CY-only, no PY). */
  private buildMonthlyFinancialPosition(
    balanceSheet: import('../monthly/monthly-actuals.service.js').MonthlyBalanceSheet,
  ): BoardReportBundle['financialPosition'] {
    if (!balanceSheet) return null
    return { hasPY: false, cy: balanceSheet as unknown as SFPResult, py: null }
  }

  /** Monthly key indicators — straight from the partial-year-flagged ma.metrics. */
  private buildMonthlyKeyIndicators(
    metrics: import('../monthly/monthly-actuals.service.js').MonthlyMetric[],
    operationalRow:
      | {
          enrollment: number | null
          enrollmentFte: Prisma.Decimal | null
          teachingFte: Prisma.Decimal | null
          totalStaffFte: Prisma.Decimal | null
        }
      | null,
  ): KeyIndicator[] {
    return this.buildKeyIndicators(metrics, operationalRow)
  }

  // ── Operations (Statement of Operations — budget vs actual) ──────────────────

  private buildOperations(
    actuals: { revenue: Record<string, number>; expense: Record<string, number> },
    actualsPY: { revenue: Record<string, number>; expense: Record<string, number> } | null,
    budgetRevenue: Record<string, number> | null,
    budgetExpense: Record<string, number> | null,
    explanations: ExplanationMap,
  ): Operations {
    const revenue = this.buildLines(
      actuals.revenue,
      budgetRevenue,
      actualsPY?.revenue ?? null,
      REVENUE_LINE_LABELS as Record<string, string>,
      explanations.revenue,
      'revenue',
    )
    const expense = this.buildLines(
      actuals.expense,
      budgetExpense,
      actualsPY?.expense ?? null,
      EXPENSE_LINE_LABELS as Record<string, string>,
      explanations.expense,
      'expense',
    )

    // hasPY drives both totals and net (a PY map present ⇒ informational PY column).
    const hasPY = actualsPY !== null
    const revenueTotals = this.totals(revenue, 'revenue', budgetRevenue !== null, hasPY)
    const expenseTotals = this.totals(expense, 'expense', budgetExpense !== null, hasPY)

    const netActual = revenueTotals.actual - expenseTotals.actual
    const hasBudgetForNet = revenueTotals.budget !== null && expenseTotals.budget !== null
    const netBudget = hasBudgetForNet
      ? (revenueTotals.budget as number) - (expenseTotals.budget as number)
      : null
    const netVar = computeVariance(netActual, netBudget)
    const netPriorYear =
      revenueTotals.priorYear !== null && expenseTotals.priorYear !== null
        ? revenueTotals.priorYear - expenseTotals.priorYear
        : null

    return {
      revenue,
      revenueTotals,
      expense,
      expenseTotals,
      netSurplus: {
        actual: netActual,
        budget: netBudget,
        variance: netVar.variance,
        variancePct: netVar.variancePct,
        priorYear: netPriorYear,
      },
    }
  }

  /**
   * One ordered set of operations lines. Keyed by the UNION of actual + budget
   * categories so a budgeted-but-zero-actual line still appears. When the budget
   * map is null (no budget set) each line's budget/variance is null.
   */
  private buildLines(
    actuals: Record<string, number>,
    budget: Record<string, number> | null,
    priorYearMap: Record<string, number> | null,
    labels: Record<string, string>,
    explanations: Record<string, string>,
    type: 'revenue' | 'expense',
  ): OperationsLine[] {
    // Key union stays actual ∪ budget — the PY column does NOT introduce new line
    // keys (it is an informational reference only). A PY value for a key absent
    // from both actual and budget is intentionally dropped.
    const keys = new Set<string>([...Object.keys(actuals), ...Object.keys(budget ?? {})])
    const lines: OperationsLine[] = []
    for (const key of keys) {
      const actual = Number(actuals[key] ?? 0)
      const budgetVal = budget ? Number(budget[key] ?? 0) : null
      const { variance, variancePct } = computeVariance(actual, budgetVal)
      lines.push({
        key,
        label: labels[key] ?? key,
        actual,
        budget: budgetVal,
        variance,
        variancePct,
        favorable: this.isFavorable(type, variance),
        priorYear: priorYearMap ? Number(priorYearMap[key] ?? 0) : null,
        explanation: explanations[key] ?? null,
      })
    }
    // Stable order: by canonical label list ordering then alphabetical fallback.
    const order = Object.keys(labels)
    lines.sort((a, b) => {
      const ia = order.indexOf(a.key)
      const ib = order.indexOf(b.key)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.label.localeCompare(b.label)
    })
    return lines
  }

  /** revenue favorable = variance>=0; expense favorable = variance<=0 (spend-is-bad). */
  private isFavorable(type: 'revenue' | 'expense', variance: number | null): boolean {
    if (variance === null) return true
    return type === 'revenue' ? variance >= 0 : variance <= 0
  }

  private totals(
    lines: OperationsLine[],
    type: 'revenue' | 'expense',
    hasBudget: boolean,
    hasPY: boolean,
  ): OperationsTotals {
    const actual = lines.reduce((s, l) => s + l.actual, 0)
    const budget = hasBudget ? lines.reduce((s, l) => s + (l.budget ?? 0), 0) : null
    const priorYear = hasPY ? lines.reduce((s, l) => s + (l.priorYear ?? 0), 0) : null
    const { variance, variancePct } = computeVariance(actual, budget)
    return {
      actual,
      budget,
      variance,
      variancePct,
      favorable: this.isFavorable(type, variance),
      priorYear,
    }
  }

  // ── Forecast (Forecast vs Budget — read-only reshape of stored lines.forecast) ─

  /**
   * Reshape the STORED lines.forecast into a Forecast-vs-Budget section. NEVER
   * recomputes the forecast (that's BudgetService.upsertForecast's job) — it only
   * reshapes the persisted projected/baseBudget/variance into ordered table rows,
   * reusing computeVariance/round1/isFavorable + the canonical label ordering.
   * Returns null when no forecast has been saved.
   */
  private buildForecastSection(
    forecast: Record<string, unknown> | null,
  ): ForecastSection | null {
    if (!forecast) return null

    const projected = (forecast.projected as Record<string, unknown> | undefined) ?? {}
    const projectedRevenue = (projected.revenue as Record<string, number> | undefined) ?? {}
    const projectedExpense = (projected.expense as Record<string, number> | undefined) ?? {}
    const projectedKpis = (projected.kpis as Record<string, number> | undefined) ?? {}
    const baseBudget = (forecast.baseBudget as Record<string, unknown> | undefined) ?? {}
    const baseRevenue = (baseBudget.revenue as Record<string, number> | undefined) ?? {}
    const baseExpense = (baseBudget.expense as Record<string, number> | undefined) ?? {}
    const explanations = (forecast.explanations as Record<string, unknown> | undefined) ?? {}
    const explRevenue = this.coerceCatMap(explanations.revenue)
    const explExpense = this.coerceCatMap(explanations.expense)
    // A base budget existed at compute time iff either snapshot map has any keys.
    const hadBudget = Object.keys(baseRevenue).length > 0 || Object.keys(baseExpense).length > 0

    const revenue = this.buildForecastLines(
      projectedRevenue,
      baseRevenue,
      hadBudget,
      REVENUE_LINE_LABELS as Record<string, string>,
      explRevenue,
      'revenue',
    )
    const expense = this.buildForecastLines(
      projectedExpense,
      baseExpense,
      hadBudget,
      EXPENSE_LINE_LABELS as Record<string, string>,
      explExpense,
      'expense',
    )

    const revenueTotals = this.forecastTotals(revenue, 'revenue', hadBudget)
    const expenseTotals = this.forecastTotals(expense, 'expense', hadBudget)

    const netForecast = revenueTotals.forecast - expenseTotals.forecast
    const hasBudgetForNet = revenueTotals.budget !== null && expenseTotals.budget !== null
    const netBudget = hasBudgetForNet
      ? (revenueTotals.budget as number) - (expenseTotals.budget as number)
      : null
    const netVar = computeVariance(netForecast, netBudget)

    const assumptions = (forecast.assumptions as Record<string, unknown> | undefined) ?? {}
    const rates = (assumptions.tuitionRates as Record<string, number> | undefined) ?? {}
    const split = (assumptions.tuitionProgramSplit as Record<string, number> | undefined) ?? {}
    const feeder = (forecast.feederEnrollmentByGrade as Record<string, number> | undefined) ?? {}
    const feederTotal = Object.values(feeder).reduce((s, v) => s + (Number(v) || 0), 0)
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

    // Phase 4 — projection method (absent ⇒ 'manual' back-compat). retentionPct
    // 0 when manual. In rollforward context feederTotal IS the new-entrants total.
    const projectionMethod: 'manual' | 'rollforward' =
      forecast.projectionMethod === 'rollforward' ? 'rollforward' : 'manual'
    const rollForward =
      (forecast.rollForward as Record<string, unknown> | undefined) ?? {}
    const retentionPct = projectionMethod === 'rollforward' ? num(rollForward.retentionPct) : 0

    return {
      available: true,
      computedAt: typeof forecast.computedAt === 'string' ? forecast.computedAt : '',
      revenue,
      revenueTotals,
      expense,
      expenseTotals,
      netSurplus: {
        forecast: netForecast,
        budget: netBudget,
        variance: netVar.variance,
        variancePct: netVar.variancePct,
      },
      assumptionsSummary: {
        // POST-merge enrollment total (base+feeder) per the projected KPIs.
        enrollmentTotal: num(projectedKpis.enrollmentTotal),
        feederTotal,
        feederByGrade: feeder,
        tuitionRates: {
          prek3: num(rates.prek3),
          prek5: num(rates.prek5),
          elem: num(rates.elem),
          middle: num(rates.middle),
        },
        inflationPct: num(assumptions.inflationPct),
        programSplit: {
          parent: num(split.parent),
          ftc: num(split.ftc),
          fes: num(split.fes),
        },
        projectionMethod,
        retentionPct,
      },
    }
  }

  /** Forecast-vs-budget rows, keyed by the canonical label ordering. */
  private buildForecastLines(
    projected: Record<string, number>,
    budget: Record<string, number>,
    hadBudget: boolean,
    labels: Record<string, string>,
    explanations: Record<string, string>,
    type: 'revenue' | 'expense',
  ): ForecastLine[] {
    const keys = new Set<string>([
      ...Object.keys(labels),
      ...Object.keys(projected),
      ...Object.keys(budget),
    ])
    const lines: ForecastLine[] = []
    for (const key of keys) {
      const fc = Number(projected[key] ?? 0)
      const budgetVal = hadBudget ? Number(budget[key] ?? 0) : null
      const { variance, variancePct } = computeVariance(fc, budgetVal)
      lines.push({
        key,
        label: labels[key] ?? key,
        forecast: fc,
        budget: budgetVal,
        variance,
        variancePct,
        favorable: this.isFavorable(type, variance),
        explanation: explanations[key] ?? null,
      })
    }
    const order = Object.keys(labels)
    lines.sort((a, b) => {
      const ia = order.indexOf(a.key)
      const ib = order.indexOf(b.key)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.label.localeCompare(b.label)
    })
    return lines
  }

  private forecastTotals(
    lines: ForecastLine[],
    type: 'revenue' | 'expense',
    hadBudget: boolean,
  ): ForecastTotals {
    const forecast = lines.reduce((s, l) => s + l.forecast, 0)
    const budget = hadBudget ? lines.reduce((s, l) => s + (l.budget ?? 0), 0) : null
    const { variance, variancePct } = computeVariance(forecast, budget)
    return { forecast, budget, variance, variancePct, favorable: this.isFavorable(type, variance) }
  }

  // ── Capital Budget Summary (Phase 3 — reshape stored items → grouped totals) ──

  /**
   * Reshape the stored CapitalSchedule.items into grouped display rows with
   * server-computed over-under (= actual - budget per line/subtotal/grand total).
   * Groups emitted in canonical enum order; an empty group is OMITTED. grandTotal
   * sums ALL lines. Returns null when there are zero items at all. ZERO client math.
   */
  private buildCapitalBudget(items: unknown): CapitalBudgetSection | null {
    if (!Array.isArray(items) || items.length === 0) return null

    const groups: CapitalBudgetGroup[] = []
    let gActual = 0
    let gBudget = 0

    for (const key of CAPITAL_GROUPS) {
      const rows = items.filter(
        (r) => (r as Record<string, unknown>)?.group === key,
      ) as Record<string, unknown>[]
      if (rows.length === 0) continue

      let sActual = 0
      let sBudget = 0
      const lines: CapitalBudgetLine[] = rows.map((r) => {
        const actual = Number(r.actual) || 0
        const budget = Number(r.budget) || 0
        sActual += actual
        sBudget += budget
        return {
          id: typeof r.id === 'string' ? r.id : '',
          label: typeof r.label === 'string' ? r.label : '',
          actual,
          budget,
          overUnder: actual - budget,
          comment: typeof r.comment === 'string' ? r.comment : '',
        }
      })
      gActual += sActual
      gBudget += sBudget

      groups.push({
        key,
        label: CAPITAL_GROUP_LABELS[key],
        lines,
        subtotal: { actual: sActual, budget: sBudget, overUnder: sActual - sBudget },
      })
    }

    if (groups.length === 0) return null

    return {
      groups,
      grandTotal: { actual: gActual, budget: gBudget, overUnder: gActual - gBudget },
    }
  }

  // ── Cash & Investments Summary (Phase 3 — grouped by restriction) ─────────────

  /**
   * Reshape the stored CashSchedule.accounts into restriction-grouped display
   * rows with server-computed subtotals/grandTotal of balance/insured/uninsured.
   * totalInsured/totalUninsured are emitted as explicit top-level keys for the
   * board's uninsured-exposure callout. interestRate passes through verbatim
   * (PERCENT; null when absent — no weighted aggregation). Groups in canonical
   * order; empty groups omitted; null when zero accounts. ZERO client math.
   */
  private buildCashInvestments(accounts: unknown): CashInvestmentsSection | null {
    if (!Array.isArray(accounts) || accounts.length === 0) return null

    const groups: CashInvestmentsGroup[] = []
    let gBal = 0
    let gIns = 0
    let gUnins = 0

    for (const key of CASH_RESTRICTIONS) {
      const rows = accounts.filter(
        (r) => (r as Record<string, unknown>)?.restriction === key,
      ) as Record<string, unknown>[]
      if (rows.length === 0) continue

      let sBal = 0
      let sIns = 0
      let sUnins = 0
      const accts: CashInvestmentsAccount[] = rows.map((r) => {
        const balance = Number(r.balance) || 0
        const insuredPortion = Number(r.insuredPortion) || 0
        const uninsuredPortion = Number(r.uninsuredPortion) || 0
        sBal += balance
        sIns += insuredPortion
        sUnins += uninsuredPortion
        const rate =
          r.interestRate === undefined || r.interestRate === null || r.interestRate === ''
            ? null
            : Number(r.interestRate)
        return {
          id: typeof r.id === 'string' ? r.id : '',
          institution: typeof r.institution === 'string' ? r.institution : '',
          accountDescription: typeof r.accountDescription === 'string' ? r.accountDescription : '',
          vehicle: typeof r.vehicle === 'string' ? r.vehicle : '',
          maturity: typeof r.maturity === 'string' ? r.maturity : '',
          interestRate: rate !== null && Number.isFinite(rate) ? rate : null,
          balance,
          insuredPortion,
          uninsuredPortion,
          comment: typeof r.comment === 'string' ? r.comment : '',
        }
      })
      gBal += sBal
      gIns += sIns
      gUnins += sUnins

      groups.push({
        key,
        label: CASH_RESTRICTION_LABELS[key],
        accounts: accts,
        subtotal: { balance: sBal, insuredPortion: sIns, uninsuredPortion: sUnins },
      })
    }

    if (groups.length === 0) return null

    return {
      groups,
      grandTotal: { balance: gBal, insuredPortion: gIns, uninsuredPortion: gUnins },
      totalInsured: gIns,
      totalUninsured: gUnins,
    }
  }

  // ── Capital Campaign (Phase 6 — reshape stored items → grouped totals) ────────

  /**
   * Reshape the stored CampaignSchedule.items into grouped display rows with
   * server-computed difference (= budget − estimate per line/subtotal/grand
   * total). DIFFERENCE SIGN: positive = UNDER budget = favorable (NBOA
   * "Difference to Budget") — the OPPOSITE sense of capital's overUnder. Groups
   * are discovered from the items in FIRST-SEEN order (free-text group; NOT
   * iterated over a constant). grandTotal sums ALL lines. Returns null when there
   * are zero items. ZERO client math.
   */
  private buildCapitalCampaign(
    campaignName: string | null,
    items: unknown,
  ): CapitalCampaignSection | null {
    if (!Array.isArray(items) || items.length === 0) return null

    const order: string[] = []
    const byGroup = new Map<string, Record<string, unknown>[]>()
    for (const raw of items) {
      const r = (raw ?? {}) as Record<string, unknown>
      const group = typeof r.group === 'string' ? r.group : ''
      if (!byGroup.has(group)) {
        byGroup.set(group, [])
        order.push(group)
      }
      byGroup.get(group)!.push(r)
    }

    const groups: CapitalCampaignGroup[] = []
    let gBudget = 0
    let gEstimate = 0

    for (const group of order) {
      const rows = byGroup.get(group)!
      let sBudget = 0
      let sEstimate = 0
      const lines: CapitalCampaignLine[] = rows.map((r) => {
        const budget = Number(r.budget) || 0
        const estimate = Number(r.estimate) || 0
        sBudget += budget
        sEstimate += estimate
        return {
          id: typeof r.id === 'string' ? r.id : '',
          label: typeof r.label === 'string' ? r.label : '',
          budget,
          estimate,
          difference: budget - estimate,
          comment: typeof r.comment === 'string' ? r.comment : '',
        }
      })
      gBudget += sBudget
      gEstimate += sEstimate

      groups.push({
        group,
        lines,
        subtotal: { budget: sBudget, estimate: sEstimate, difference: sBudget - sEstimate },
      })
    }

    if (groups.length === 0) return null

    return {
      campaignName,
      groups,
      grandTotal: { budget: gBudget, estimate: gEstimate, difference: gBudget - gEstimate },
    }
  }

  // ── Key Indicators (the 6 sourceable now) ────────────────────────────────────

  private buildKeyIndicators(
    metrics: MetricResult[],
    operationalRow:
      | {
          enrollment: number | null
          enrollmentFte: Prisma.Decimal | null
          teachingFte: Prisma.Decimal | null
          totalStaffFte: Prisma.Decimal | null
        }
      | null,
  ): KeyIndicator[] {
    const enrollment = operationalRow?.enrollment ?? null
    const fte = operationalRow?.enrollmentFte != null ? Number(operationalRow.enrollmentFte) : null

    const rows: KeyIndicator[] = [
      {
        key: 'enrollment',
        label: 'Students Enrolled',
        value: enrollment,
        unit: 'count',
        available: enrollment != null,
      },
      {
        key: 'enrollmentFte',
        label: 'FTEs',
        value: fte,
        unit: 'count',
        available: fte != null,
      },
      this.indicatorFromMetric(
        metrics,
        'net_tuition_per_student',
        'net_tuition_per_student',
        'Avg Net Tuition / Student',
        'currency',
      ),
      this.indicatorFromMetric(
        metrics,
        'cost_per_pupil',
        'cost_per_pupil',
        'Avg Cost / Student',
        'currency',
      ),
      this.indicatorFromMetric(
        metrics,
        'operating_margin',
        'operating_margin',
        'Operating Margin',
        'ratio',
      ),
      this.indicatorFromMetric(
        metrics,
        'days_cash_on_hand',
        'days_cash_on_hand',
        'Days Cash on Hand',
        'days',
      ),
    ]

    // Phase 5 — STAFF-FTE KPIs (Teaching / Total Staff / Teacher Ratio), appended
    // AFTER the existing 6. available:false / value:null when inputs absent so the
    // web's `k.available && k.value != null` filter drops them and the prior 6 KPIs
    // stay byte-identical. teacherRatio unit:'ratio' renders as a percent via the
    // existing formatIndicator (same path as operating_margin — no web change).
    const teaching =
      operationalRow?.teachingFte != null ? Number(operationalRow.teachingFte) : null
    const totalStaff =
      operationalRow?.totalStaffFte != null ? Number(operationalRow.totalStaffFte) : null
    const teacherRatio =
      teaching != null && totalStaff != null && totalStaff > 0 ? teaching / totalStaff : null
    rows.push(
      {
        key: 'teachingFte',
        label: 'FTEs — Teaching',
        value: teaching,
        unit: 'count',
        available: teaching != null,
      },
      {
        key: 'totalStaffFte',
        label: 'FTEs — Total Staff',
        value: totalStaff,
        unit: 'count',
        available: totalStaff != null,
      },
      {
        key: 'teacherRatio',
        label: 'Teacher Ratio',
        value: teacherRatio,
        unit: 'ratio',
        available: teacherRatio != null,
      },
    )

    return rows
  }

  private indicatorFromMetric(
    metrics: MetricResult[],
    metricKey: string,
    outKey: string,
    label: string,
    unit: KeyIndicator['unit'],
  ): KeyIndicator {
    const m = metrics.find((x) => x.key === metricKey)
    const available = !!m?.available && m.value != null
    return { key: outKey, label, value: available ? (m!.value as number) : null, unit, available }
  }

  // ── Statements (VERBATIM engine keys off the snapshot payload) ───────────────

  private buildFinancialPosition(
    bundle: ReportBundle,
  ): { hasPY: boolean; cy: SFPResult; py: SFPResult | null } | null {
    const sfp = bundle.sfpResults
    if (!sfp?.cy) return null
    return { hasPY: !!sfp.hasPY && !!sfp.py, cy: sfp.cy, py: sfp.py ?? null }
  }

  private buildChangesInNetAssets(
    bundle: ReportBundle,
  ): { hasPY: boolean; cy: NetAssetsColumn; py: NetAssetsColumn | null } | null {
    const na = bundle.netAssets
    if (!na?.cy) return null
    return { hasPY: !!na.hasPY && !!na.py, cy: na.cy, py: na.py ?? null }
  }

  private buildCashFlows(
    bundle: ReportBundle,
  ): BoardReportBundle['cashFlows'] {
    const scf = bundle.scf
    if (!scf) return { available: false }
    return {
      available: true,
      operatingCash: scf.operatingCash,
      investingCash: scf.investingCash,
      financingCash: scf.financingCash,
      netCashChange: scf.netCashChange,
      cashBegin: scf.cashBegin,
      cashEnd: scf.cashEnd,
      netChange: scf.netChange,
      depr: scf.depr,
      ppePurchases: scf.ppePurchases,
      leasePayments: scf.leasePayments,
    }
  }

  // ── Save (upsert + deep-merge explanations) ──────────────────────────────────

  async save(
    schoolId: string,
    periodId: string,
    dto: SaveBoardReportDto,
    userId: string,
  ): Promise<BoardReportSaved> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    if (dto.granularity !== undefined && dto.granularity !== 'annual') {
      throw new BadRequestException({
        code: 'granularity_unsupported',
        message: 'Only annual granularity is supported.',
      })
    }

    const existing = await this.findRow(schoolId, period.id)

    const pick = <T>(dtoVal: T | undefined, current: T): T =>
      dtoVal === undefined ? current : dtoVal

    // Deep-merge explanations per category so saving one line never clobbers
    // siblings. undefined = keep existing; null = clear both maps.
    const mergedExplanations = this.mergeExplanations(
      this.readExplanations(existing),
      dto.explanations,
    )

    // Setting mdaText implies mdaSource='user' unless an explicit source is given.
    const nextMdaText = pick(dto.mdaText, existing?.mdaText ?? null)
    let nextMdaSource = pick(dto.mdaSource, existing?.mdaSource ?? null)
    if (dto.mdaText !== undefined && dto.mdaSource === undefined) {
      nextMdaSource = dto.mdaText === null ? null : 'user'
    }

    const data = {
      reportTitle: pick(dto.reportTitle, existing?.reportTitle ?? null),
      committeeName: pick(dto.committeeName, existing?.committeeName ?? null),
      granularity: dto.granularity ?? existing?.granularity ?? 'annual',
      mdaText: nextMdaText,
      mdaSource: nextMdaSource,
      explanations:
        mergedExplanations === null
          ? Prisma.JsonNull
          : (mergedExplanations as unknown as Prisma.InputJsonValue),
      ...(dto.markGenerated ? { generatedAt: new Date() } : {}),
      updatedByUserId: userId,
    }

    const row = await this.prisma.boardReport.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'board_report.saved',
      targetType: 'board_reports',
      targetId: row.id,
      metadata: {
        fiscalPeriodId: period.id,
        fields: Object.keys(dto),
        markGenerated: !!dto.markGenerated,
      },
    })

    return this.toSaved(row)
  }

  // ── MD&A generation (rule baseline + optional LLM, never hangs) ──────────────

  /**
   * Generate an MD&A narrative. ALWAYS returns a deterministic rule baseline from
   * the assembled totals; if the assistant is configured, races one no-tools
   * chat() against a 12s cap and degrades to the rule baseline on any
   * error/timeout/no-key. Does NOT persist (the web shows it, the user edits,
   * then PUT-saves). Mirrors BudgetService.advise().
   */
  async generateMda(
    schoolId: string,
    periodId: string,
    dto: MdaBoardReportDto,
  ): Promise<{ text: string; source: 'rule' | 'llm'; configured: boolean }> {
    await this.periods.getOwnedPeriod(schoolId, periodId) // tenant gate
    const data = await this.assemble(schoolId, periodId, 'annual')

    const rule = this.ruleMda(data)
    const configured = !!this.assistant?.isConfigured()
    if (!configured || !data.operations) {
      return { text: rule, source: 'rule', configured }
    }

    try {
      const facts = this.mdaFacts(data)
      const tone = dto.tone ?? 'standard'
      const messages = [
        {
          role: 'system',
          content:
            'You write a Management Discussion & Analysis paragraph for a private ' +
            `school's finance committee. Tone: ${tone}. In 3-5 plain-language sentences, ` +
            'narrate operating results, the largest favorable/unfavorable budget variances, ' +
            'and the key indicators. Use ONLY the numbers provided; never invent figures. ' +
            'No markdown, no headers, no lists, no bullet points.',
        },
        { role: 'user', content: facts },
      ]
      const llmPromise = this.assistant!
        .chat(messages, [])
        .then((m) => (m.content ?? '').trim().slice(0, 4000))
        .catch(() => '')
      const text = await Promise.race([
        llmPromise,
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 12_000)),
      ])
      return text
        ? { text, source: 'llm', configured: true }
        : { text: rule, source: 'rule', configured: true }
    } catch {
      return { text: rule, source: 'rule', configured: true }
    }
  }

  /** Token-lean facts for the LLM: rounded totals + variance flags + KPI values, no PII. */
  private mdaFacts(data: BoardReportBundle): string {
    const ops = data.operations!
    const usd = (n: number | null) => (n == null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`)
    const flag = (lines: OperationsLine[], type: 'revenue' | 'expense'): string => {
      const withBudget = lines.filter((l) => l.variance != null && l.variance !== 0)
      withBudget.sort((a, b) => Math.abs(b.variance as number) - Math.abs(a.variance as number))
      return (
        withBudget
          .slice(0, 3)
          .map(
            (l) =>
              `${l.label} ${(l.variance as number) >= 0 ? '+' : ''}${usd(l.variance)}` +
              ` (${l.favorable ? 'favorable' : 'unfavorable'})`,
          )
          .join(', ') || `no ${type} budget variances`
      )
    }
    const kpis = data.keyIndicators
      .filter((k) => k.available && k.value != null)
      .map((k) => {
        if (k.unit === 'ratio') return `${k.label}: ${(Number(k.value) * 100).toFixed(1)}%`
        if (k.unit === 'currency') return `${k.label}: ${usd(k.value)}`
        return `${k.label}: ${k.value}`
      })
      .join(', ')
    return [
      `Period: ${data.label} (ending ${data.periodEndDate}).`,
      `Total revenue: ${usd(ops.revenueTotals.actual)} (budget ${usd(ops.revenueTotals.budget)}).`,
      `Total expenses: ${usd(ops.expenseTotals.actual)} (budget ${usd(ops.expenseTotals.budget)}).`,
      `Net surplus/(deficit): ${usd(ops.netSurplus.actual)} (budget ${usd(ops.netSurplus.budget)}).`,
      `Top revenue variances: ${flag(ops.revenue, 'revenue')}.`,
      `Top expense variances: ${flag(ops.expense, 'expense')}.`,
      `Key indicators: ${kpis || 'none available'}.`,
    ].join('\n')
  }

  /** Deterministic rule baseline. Never blank — works even with no budget/snapshot. */
  private ruleMda(data: BoardReportBundle): string {
    const usd = (n: number | null) => (n == null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`)
    if (!data.operations) {
      return (
        `Financial statements for ${data.label} are not yet available. ` +
        'Generate the period statements to populate the Management Discussion & Analysis.'
      )
    }
    const ops = data.operations
    const sentences: string[] = []
    const margin = data.keyIndicators.find((k) => k.key === 'operating_margin')
    const marginStr =
      margin?.available && margin.value != null ? ` (${(Number(margin.value) * 100).toFixed(1)}% margin)` : ''
    const net = ops.netSurplus.actual
    sentences.push(
      `For ${data.label}, the school recorded total revenue of ${usd(ops.revenueTotals.actual)} against ` +
        `${usd(ops.expenseTotals.actual)} of expenses, ${net >= 0 ? 'an operating surplus' : 'an operating deficit'} ` +
        `of ${usd(Math.abs(net))}${marginStr}` +
        (ops.netSurplus.budget != null
          ? ` versus a budgeted ${ops.netSurplus.budget >= 0 ? 'surplus' : 'deficit'} of ${usd(Math.abs(ops.netSurplus.budget))}.`
          : '.'),
    )

    const topVar = (lines: OperationsLine[]): OperationsLine | null => {
      const withBudget = lines.filter((l) => l.variance != null && l.variance !== 0)
      if (!withBudget.length) return null
      return withBudget.reduce((a, b) =>
        Math.abs(b.variance as number) > Math.abs(a.variance as number) ? b : a,
      )
    }
    const topRev = topVar(ops.revenue)
    const topExp = topVar(ops.expense)
    if (topRev) {
      sentences.push(
        `${topRev.label} ${topRev.favorable ? 'beat' : 'fell short of'} budget by ${usd(Math.abs(topRev.variance as number))}.`,
      )
    }
    if (topExp) {
      sentences.push(
        `${topExp.label} ran ${topExp.favorable ? 'under' : 'over'} plan by ${usd(Math.abs(topExp.variance as number))}.`,
      )
    }
    const dch = data.keyIndicators.find((k) => k.key === 'days_cash_on_hand')
    if (dch?.available && dch.value != null) {
      sentences.push(`Days cash on hand: ${Math.round(Number(dch.value))}.`)
    }
    return sentences.join(' ')
  }

  // ── Explanations helpers (deep-merge + clamp + shape-validate) ───────────────

  private readExplanations(row: BoardReport | null): ExplanationMap {
    const raw = (row?.explanations as Record<string, unknown> | null) ?? null
    return {
      revenue: this.coerceCatMap(raw?.revenue),
      expense: this.coerceCatMap(raw?.expense),
    }
  }

  private coerceCatMap(v: unknown): Record<string, string> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, string> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string' && val.length > 0) out[k] = val.slice(0, MAX_EXPLANATION_CHARS)
    }
    return out
  }

  /**
   * Deep-merge incoming explanations over the existing map, per category. Returns
   * the merged map, or null to CLEAR when the client explicitly sends null.
   * undefined patch => the caller should keep existing (handled upstream).
   */
  private mergeExplanations(
    existing: ExplanationMap,
    patch: Record<string, unknown> | null | undefined,
  ): ExplanationMap | null {
    if (patch === undefined) return existing
    if (patch === null) return null
    const incoming: ExplanationMap = {
      revenue: this.coerceCatMap((patch as Record<string, unknown>).revenue),
      expense: this.coerceCatMap((patch as Record<string, unknown>).expense),
    }
    return {
      revenue: { ...existing.revenue, ...incoming.revenue },
      expense: { ...existing.expense, ...incoming.expense },
    }
  }

  private async findRow(schoolId: string, fiscalPeriodId: string): Promise<BoardReport | null> {
    return this.prisma.boardReport.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
    })
  }

  private toSaved(row: BoardReport): BoardReportSaved {
    return {
      reportTitle: row.reportTitle ?? null,
      committeeName: row.committeeName ?? null,
      granularity: row.granularity,
      mdaText: row.mdaText ?? null,
      mdaSource: row.mdaSource ?? null,
      explanations: this.readExplanations(row),
      generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

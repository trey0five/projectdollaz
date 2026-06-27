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
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from '../analytics/analytics.service.js'
import { BudgetService } from '../analytics/budget.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { AssistantClient } from '../assistant/assistant.client.js'
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
  explanation: string | null
}
interface OperationsTotals {
  actual: number
  budget: number | null
  variance: number | null
  variancePct: number | null
  favorable: boolean
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
  }
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
  }
}

export interface BoardReportBundle {
  periodId: string
  label: string
  periodEndDate: string
  fiscalYearStart: string
  granularity: 'annual'
  availability: {
    hasSnapshot: boolean
    hasBudget: boolean
    hasOperational: boolean
    dataAsOf: string | null
  }
  branding: { schoolName: string; logoBase64: string | null; brandColor: string | null }
  settings: { reportTitle: string | null; committeeName: string | null; generatedAt: string | null }
  mda: { text: string | null; source: 'rule' | 'llm' | 'user' | null }
  operations: Operations | null
  forecast: ForecastSection | null
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

@Injectable()
export class BoardReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly analytics: AnalyticsService,
    private readonly budget: BudgetService,
    private readonly audit: AuditService,
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
  ): Promise<BoardReportBundle> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId) // 404 cross-tenant
    if (granularity !== 'annual') {
      throw new BadRequestException({
        code: 'granularity_unsupported',
        message: 'Only annual granularity is supported.',
      })
    }

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    const row = await this.findRow(schoolId, period.id)
    const explanations = this.readExplanations(row)

    const { bundle, dataAsOf, metrics, categoryActuals } =
      await this.analytics.getBoardReportData(schoolId, period.id)
    const budgetPublic = await this.budget.get(schoolId, period.id)
    const budgetLines = (budgetPublic.lines as Record<string, unknown> | null) ?? null
    const budgetRevenue = (budgetLines?.revenue as Record<string, number> | undefined) ?? null
    const budgetExpense = (budgetLines?.expense as Record<string, number> | undefined) ?? null
    const hasBudget = !!(budgetRevenue || budgetExpense)

    const operationalRow = await this.prisma.periodOperationalData.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })

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
        ? this.buildOperations(categoryActuals, budgetRevenue, budgetExpense, explanations)
        : null,
      forecast: this.buildForecastSection(
        (budgetLines?.forecast as Record<string, unknown> | undefined) ?? null,
      ),
      keyIndicators: bundle ? this.buildKeyIndicators(metrics, operationalRow) : [],
      financialPosition: bundle ? this.buildFinancialPosition(bundle) : null,
      changesInNetAssets: bundle ? this.buildChangesInNetAssets(bundle) : null,
      cashFlows: bundle ? this.buildCashFlows(bundle) : null,
    }
    return bundleOut
  }

  // ── Operations (Statement of Operations — budget vs actual) ──────────────────

  private buildOperations(
    actuals: { revenue: Record<string, number>; expense: Record<string, number> },
    budgetRevenue: Record<string, number> | null,
    budgetExpense: Record<string, number> | null,
    explanations: ExplanationMap,
  ): Operations {
    const revenue = this.buildLines(
      actuals.revenue,
      budgetRevenue,
      REVENUE_LINE_LABELS as Record<string, string>,
      explanations.revenue,
      'revenue',
    )
    const expense = this.buildLines(
      actuals.expense,
      budgetExpense,
      EXPENSE_LINE_LABELS as Record<string, string>,
      explanations.expense,
      'expense',
    )

    const revenueTotals = this.totals(revenue, 'revenue', budgetRevenue !== null)
    const expenseTotals = this.totals(expense, 'expense', budgetExpense !== null)

    const netActual = revenueTotals.actual - expenseTotals.actual
    const hasBudgetForNet = revenueTotals.budget !== null && expenseTotals.budget !== null
    const netBudget = hasBudgetForNet
      ? (revenueTotals.budget as number) - (expenseTotals.budget as number)
      : null
    const netVar = computeVariance(netActual, netBudget)

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
    labels: Record<string, string>,
    explanations: Record<string, string>,
    type: 'revenue' | 'expense',
  ): OperationsLine[] {
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
  ): OperationsTotals {
    const actual = lines.reduce((s, l) => s + l.actual, 0)
    const budget = hasBudget ? lines.reduce((s, l) => s + (l.budget ?? 0), 0) : null
    const { variance, variancePct } = computeVariance(actual, budget)
    return { actual, budget, variance, variancePct, favorable: this.isFavorable(type, variance) }
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

  // ── Key Indicators (the 6 sourceable now) ────────────────────────────────────

  private buildKeyIndicators(
    metrics: MetricResult[],
    operationalRow: { enrollment: number | null; enrollmentFte: Prisma.Decimal | null } | null,
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

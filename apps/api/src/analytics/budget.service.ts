import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import type { PeriodBudget } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { UpsertBudgetDto } from './dto/upsert-budget.dto.js'
import type { ImportBudgetSpreadDto, AssessBudgetDto } from './dto/import-budget-spread.dto.js'
import { rollupSpread, type SpreadRollup } from './budget.spread.js'
import {
  assessBudget,
  sumMap,
  type NormalizedBudget,
  type AssessResult,
} from './budget.assess.js'
import type { BudgetSpread } from '@finrep/ingestion'
import {
  computeDriverBudget,
  toDriverPriorContext,
  effectiveEnrollment,
  REVENUE_LINE_KEYS,
  EXPENSE_LINE_KEYS,
  REVENUE_LINE_LABELS,
  EXPENSE_LINE_LABELS,
  type DriverBudgetResult,
  type GradeKey,
  type ProjectionMethod,
  type RollForwardConfig,
} from '@finrep/analytics'
import { AnalyticsService } from './analytics.service.js'
import { OperationalService } from './operational.service.js'
import { AssistantClient } from '../assistant/assistant.client.js'
import { buildDriverSpread, deriveFiscalYearStart } from './budget.driver.js'
import type { SaveDriverBudgetDto } from './dto/save-driver-budget.dto.js'
import type { SaveForecastDto } from './dto/save-forecast.dto.js'

export interface BudgetPublic {
  totalRevenue: number | null
  totalExpenses: number | null
  notes: string | null
  lines: Record<string, unknown> | null
}

export interface BudgetSpreadImportResult extends BudgetPublic {
  reconciliation: SpreadRollup['reconciliation']
  accountCount: number
  unmappedAccts: number[]
}

export interface DriverBudgetResultPublic extends BudgetPublic {
  kpis: DriverBudgetResult['kpis']
}

/** The stored lines.forecast object (sharedShapes SEAM 1). */
export interface ForecastObject {
  assumptions: Record<string, unknown>
  feederEnrollmentByGrade: Record<string, number>
  effectiveEnrollmentByGrade: Record<string, number>
  projected: {
    revenue: DriverBudgetResult['revenue']
    expense: DriverBudgetResult['expense']
    kpis: DriverBudgetResult['kpis']
  }
  baseBudget: { revenue: Record<string, number>; expense: Record<string, number> }
  variance: { revenue: Record<string, number>; expense: Record<string, number> }
  explanations: { revenue: Record<string, string>; expense: Record<string, string> }
  computedAt: string
  /**
   * Phase 4 — projection method. ALWAYS written ('manual' | 'rollforward');
   * absence on legacy forecasts is semantically identical to 'manual'.
   */
  projectionMethod?: ProjectionMethod
  /** Phase 4 — roll-forward config; present ONLY in rollforward mode. */
  rollForward?: RollForwardConfig
}

/** GET /budget/forecast envelope (sharedShapes SEAM 2). */
export interface ForecastEnvelope {
  forecast: ForecastObject | null
  feederEnrollmentByGrade: Record<string, number> | null
  hasBudget: boolean
  exists: boolean
}

/** PUT /budget/forecast response (sharedShapes SEAM 2). */
export interface ForecastSaveResult {
  forecast: ForecastObject
  kpis: DriverBudgetResult['kpis']
}

const MAX_FORECAST_EXPLANATION_CHARS = 2000

/** ASSESS endpoint response (the frozen ENG-API ↔ ENG-WEB contract). */
export interface AssessResponse {
  status: AssessResult['status']
  checks: AssessResult['checks']
  ai: { configured: boolean; summary?: string }
}

function dec(v: Prisma.Decimal | null | undefined): number | null {
  return v == null ? null : Number(v)
}

/**
 * Phase 3 budget intake (budget-vs-actual). Actuals come from the statement
 * snapshot via the metrics endpoint, so only the budget is persisted here. Same
 * tenant-isolation + merge-pick semantics as OperationalService.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly operational: OperationalService,
    // Optional so existing BudgetService unit tests (which don't provide it)
    // keep constructing; the advise() path guards on `?.isConfigured()`.
    @Optional() private readonly assistant?: AssistantClient,
  ) {}

  private toPublic(row: PeriodBudget | null): BudgetPublic {
    return {
      totalRevenue: dec(row?.totalRevenue),
      totalExpenses: dec(row?.totalExpenses),
      notes: row?.notes ?? null,
      lines: (row?.lines as Record<string, unknown> | null) ?? null,
    }
  }

  async get(schoolId: string, periodId: string): Promise<BudgetPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    return this.toPublic(row)
  }

  async upsert(
    schoolId: string,
    periodId: string,
    dto: UpsertBudgetDto,
    userId: string,
  ): Promise<BudgetPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const existing = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })

    const pick = <T>(dtoVal: T | undefined, current: T): T =>
      dtoVal === undefined ? current : dtoVal

    // Merge incoming `lines` over the existing row, carrying forward sibling fields
    // the caller omitted (spread, driverModel) so a category-level save — e.g.
    // Budget-vs-Actual or the manual builder, which only send revenue/expense/
    // methods — never wipes an imported spread or an applied driver model living
    // on the same period budget. undefined = don't touch; null = clear.
    const existingLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const nextLines = ((): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined => {
      if (dto.lines === undefined) return undefined
      if (dto.lines === null) return Prisma.JsonNull
      return {
        ...(existingLines.spread !== undefined ? { spread: existingLines.spread } : {}),
        ...(existingLines.driverModel !== undefined ? { driverModel: existingLines.driverModel } : {}),
        // Never silently drop a saved FY-End forecast on a budget edit — the
        // forecast value is only ever produced by an explicit upsertForecast.
        ...(existingLines.forecast !== undefined ? { forecast: existingLines.forecast } : {}),
        ...(dto.lines as Record<string, unknown>),
      } as Prisma.InputJsonValue
    })()

    const data = {
      totalRevenue: pick(dto.totalRevenue, existing ? dec(existing.totalRevenue) : null),
      totalExpenses: pick(dto.totalExpenses, existing ? dec(existing.totalExpenses) : null),
      notes: pick(dto.notes, existing?.notes ?? null),
      updatedByUserId: userId,
      ...(nextLines !== undefined ? { lines: nextLines } : {}),
    }

    const row = await this.prisma.periodBudget.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'budget.updated',
      targetType: 'period_budgets',
      metadata: { fiscalPeriodId: period.id },
    })

    return this.toPublic(row)
  }

  /**
   * Import a parsed budget spread. Re-maps + re-rolls SERVER-side (never trusts
   * a client rollup), OVERWRITES lines.revenue/lines.expense (keeping
   * Budget-vs-Actual working) and stores the raw annotated spread under
   * lines.spread, while PRESERVING the existing lines.methods/notes so the
   * per-line method builder is untouched. totalRevenue/totalExpenses use the
   * sheet's authoritative grand totals (else the computed rollup sum).
   */
  async upsertSpread(
    schoolId: string,
    periodId: string,
    dto: ImportBudgetSpreadDto,
    userId: string,
  ): Promise<BudgetSpreadImportResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const existing = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })

    const spread = dto.spread as unknown as BudgetSpread
    const rolled = rollupSpread(spread)

    // Preserve the manual per-line method builder state AND any applied driver
    // model (so importing a spread doesn't drop the round-trippable assumptions).
    const prevLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const methods = prevLines.methods
    const driverModel = prevLines.driverModel

    const lines: Record<string, unknown> = {
      ...(methods !== undefined ? { methods } : {}),
      ...(driverModel !== undefined ? { driverModel } : {}),
      // Preserve any saved FY-End forecast (never auto-carried, never dropped).
      ...(prevLines.forecast !== undefined ? { forecast: prevLines.forecast } : {}),
      revenue: rolled.revenue,
      expense: rolled.expense,
      spread: {
        format: spread.format,
        fileName: dto.fileName ?? null,
        importedAt: new Date().toISOString(),
        fiscalYearStart: spread.fiscalYearStart ?? null,
        monthKeys: spread.monthKeys,
        monthLabels: (spread as { monthLabels?: string[] }).monthLabels ?? [],
        accounts: rolled.accounts,
        unmappedAccts: rolled.unmappedAccts,
        reconciliation: rolled.reconciliation,
      },
    }

    const data = {
      totalRevenue: rolled.totalRevenue,
      totalExpenses: rolled.totalExpenses,
      notes: existing?.notes ?? null,
      updatedByUserId: userId,
      lines: lines as Prisma.InputJsonValue,
    }

    const row = await this.prisma.periodBudget.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'budget.spread.imported',
      targetType: 'period_budgets',
      metadata: {
        fiscalPeriodId: period.id,
        fileName: dto.fileName ?? null,
        format: spread.format,
        accountCount: rolled.accounts.length,
        unmappedCount: rolled.unmappedAccts.length,
        revenueDelta: rolled.reconciliation.revenueDelta,
        expenseDelta: rolled.reconciliation.expenseDelta,
      },
    })

    return {
      ...this.toPublic(row),
      reconciliation: rolled.reconciliation,
      accountCount: rolled.accounts.length,
      unmappedAccts: rolled.unmappedAccts,
    }
  }

  /**
   * Apply a Phase-2 DRIVER MODEL. Recomputes the category budget AUTHORITATIVELY
   * server-side via the pure computeDriverBudget (never trusts a client preview),
   * folding prior-year actuals (budgetContext) into the auto-grown non-driver
   * lines. OVERWRITES lines.revenue/lines.expense (so Budget-vs-Actual + Diocese
   * Roll-up read the driver numbers) and writes lines.spread (format:'driver',
   * 12 even months) so the Monthly Spread grid populates — while PRESERVING the
   * manual lines.methods builder state. Stores lines.driverModel (the assumptions
   * + computedAt + kpis) for round-tripping the form.
   */
  async upsertDriver(
    schoolId: string,
    periodId: string,
    dto: SaveDriverBudgetDto,
    userId: string,
  ): Promise<DriverBudgetResultPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    // Authoritative prior-actuals context (tenant-isolated; same path the builder uses).
    const ctx = await this.analytics.budgetContext(schoolId, periodId)
    const result = computeDriverBudget(
      dto.assumptions as unknown as Parameters<typeof computeDriverBudget>[0],
      toDriverPriorContext(ctx),
      { includeMonths: true },
    )

    const existing = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    const prevLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const methods = prevLines.methods

    const fiscalYearStart = deriveFiscalYearStart(ctx.periodEndDate)
    const spread = buildDriverSpread(result, fiscalYearStart)

    const lines: Record<string, unknown> = {
      ...(methods !== undefined ? { methods } : {}),
      // Preserve any saved FY-End forecast (never auto-carried, never dropped).
      ...(prevLines.forecast !== undefined ? { forecast: prevLines.forecast } : {}),
      revenue: result.revenue,
      expense: result.expense,
      spread,
      driverModel: {
        assumptions: dto.assumptions,
        computedAt: new Date().toISOString(),
        kpis: result.kpis,
      },
    }

    const data = {
      totalRevenue: result.kpis.totalRevenue,
      totalExpenses: result.kpis.totalExpense,
      notes: existing?.notes ?? null,
      updatedByUserId: userId,
      lines: lines as Prisma.InputJsonValue,
    }

    const row = await this.prisma.periodBudget.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'budget.driver.applied',
      targetType: 'period_budgets',
      metadata: {
        fiscalPeriodId: period.id,
        enrollmentTotal: result.kpis.enrollmentTotal,
        totalRevenue: result.kpis.totalRevenue,
        totalExpense: result.kpis.totalExpense,
      },
    })

    return { ...this.toPublic(row), kpis: result.kpis }
  }

  // ── FY-End Forecast (Phase 2 — assumption-driven re-projection) ──────────────

  /**
   * GET the saved forecast envelope. `forecast` is the stored lines.forecast
   * verbatim (or null). `feederEnrollmentByGrade` is read LIVE from the
   * operational row so the form prefills feeder even before any forecast is saved.
   * `hasBudget` = a base budget exists (so the web can warn 'variance is vs $0').
   */
  async getForecast(schoolId: string, periodId: string): Promise<ForecastEnvelope> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    const lines = (row?.lines as Record<string, unknown> | null) ?? {}
    const forecast = (lines.forecast as ForecastObject | undefined) ?? null
    const hasBudget = !!(lines.revenue || lines.expense)

    // Live feeder from the operational row (single source of truth for the input).
    const op = await this.operational.get(schoolId, periodId)

    return {
      forecast,
      feederEnrollmentByGrade: op.feederEnrollmentByGrade,
      hasBudget,
      exists: forecast !== null,
    }
  }

  /**
   * Apply / recompute the FY-End FORECAST. AUTHORITATIVE: re-projects via the pure
   * computeDriverBudget, deriving the effective per-grade roster through the SHARED
   * effectiveEnrollment helper (manual = feeder merged additively, byte-identical to
   * before; rollforward = cohort roll-forward + new entrants + overrides), compares
   * the result against the ACTIVE budget (lines.revenue/expense) for per-category
   * variance, and stores the result under lines.forecast — a sibling that NEVER
   * clobbers the official budget (lines.revenue/expense/spread/driverModel/methods
   * and totalRevenue/totalExpenses are untouched). When the DTO carries feeder
   * inline, it is ALSO persisted through to PeriodOperationalData so the two agree.
   */
  async upsertForecast(
    schoolId: string,
    periodId: string,
    dto: SaveForecastDto,
    userId: string,
  ): Promise<ForecastSaveResult> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    // 1. Resolve the feeder source: DTO inline (if present) else the operational row.
    let feeder: Record<string, number>
    if (dto.feederEnrollmentByGrade !== undefined && dto.feederEnrollmentByGrade !== null) {
      feeder = dto.feederEnrollmentByGrade as unknown as Record<string, number>
      // Persist the inline feeder through to the operational row (single source).
      await this.operational.upsert(
        schoolId,
        periodId,
        { feederEnrollmentByGrade: dto.feederEnrollmentByGrade },
        userId,
      )
    } else if (dto.feederEnrollmentByGrade === null) {
      feeder = {}
      await this.operational.upsert(
        schoolId,
        periodId,
        { feederEnrollmentByGrade: null },
        userId,
      )
    } else {
      const op = await this.operational.get(schoolId, periodId)
      feeder = op.feederEnrollmentByGrade ?? {}
    }

    // 2. Resolve projectionMethod (absent/unknown ⇒ 'manual', back-compat) and
    //    enforce the cross-field requirement class-validator cannot express.
    const method: ProjectionMethod =
      dto.projectionMethod === 'rollforward' ? 'rollforward' : 'manual'
    if (method === 'rollforward' && !dto.rollForward) {
      throw new BadRequestException(
        'rollForward config required for rollforward projection method.',
      )
    }

    // 3. Compute the effective per-grade roster via the SHARED helper — the ONE
    //    source of effectiveEnrollmentByGrade for BOTH this save and the web
    //    preview. Manual mode routes through mergeFeederEnrollment (unchanged);
    //    rollforward ages the current roster + new entrants (= feeder) + overrides.
    const assumptions = dto.assumptions as unknown as Parameters<typeof computeDriverBudget>[0]
    const effective = effectiveEnrollment({
      projectionMethod: method,
      enrollmentByGrade: assumptions.enrollmentByGrade as Partial<Record<GradeKey, number>>,
      feederEnrollmentByGrade: feeder as Partial<Record<GradeKey, number>>,
      rollForward: (dto.rollForward as unknown as RollForwardConfig | undefined) ?? null,
    })
    const mergedAssumptions = { ...assumptions, enrollmentByGrade: effective }

    const ctx = await this.analytics.budgetContext(schoolId, periodId)
    const projected = computeDriverBudget(mergedAssumptions, toDriverPriorContext(ctx))

    // 3. Snapshot the active budget + per-category variance over ALL line keys.
    const existing = await this.prisma.periodBudget.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
    })
    const prevLines = (existing?.lines as Record<string, unknown> | null) ?? {}
    const baseRevenue = (prevLines.revenue as Record<string, number> | undefined) ?? {}
    const baseExpense = (prevLines.expense as Record<string, number> | undefined) ?? {}

    const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
    const varRevenue: Record<string, number> = {}
    for (const k of REVENUE_LINE_KEYS) {
      varRevenue[k] = round2((projected.revenue[k] ?? 0) - (baseRevenue[k] ?? 0))
    }
    const varExpense: Record<string, number> = {}
    for (const k of EXPENSE_LINE_KEYS) {
      varExpense[k] = round2((projected.expense[k] ?? 0) - (baseExpense[k] ?? 0))
    }

    // 4. Deep-merge incoming explanations over the prior forecast's (undefined
    //    keeps, null clears) — a private copy of the board-report merge pattern.
    const prevForecast = (prevLines.forecast as ForecastObject | undefined) ?? null
    const explanations = this.mergeForecastExplanations(
      prevForecast?.explanations ?? { revenue: {}, expense: {} },
      dto.explanations as Record<string, unknown> | undefined,
    )

    // 5. Assemble lines.forecast — assumptions stored PRE-feeder (round-trips the
    //    form's base + feeder separately); effective is the audited post-merge grid.
    const forecast: ForecastObject = {
      assumptions: dto.assumptions as unknown as Record<string, unknown>,
      feederEnrollmentByGrade: feeder,
      effectiveEnrollmentByGrade: effective as Record<string, number>,
      projected: {
        revenue: projected.revenue,
        expense: projected.expense,
        kpis: projected.kpis,
      },
      baseBudget: { revenue: baseRevenue, expense: baseExpense },
      variance: { revenue: varRevenue, expense: varExpense },
      explanations,
      computedAt: new Date().toISOString(),
      // Phase 4 — projectionMethod ALWAYS written; rollForward ONLY in
      // rollforward mode (manual saves OMIT it → no shape churn vs. legacy).
      projectionMethod: method,
      ...(method === 'rollforward'
        ? { rollForward: dto.rollForward as unknown as RollForwardConfig }
        : {}),
    }

    // 6. Preserve EVERY sibling key verbatim; do NOT touch totalRevenue/Expenses
    //    (those track the OFFICIAL budget — never auto-carry the forecast forward).
    const nextLines: Record<string, unknown> = { ...prevLines, forecast }

    await this.prisma.periodBudget.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: {
        schoolId,
        fiscalPeriodId: period.id,
        totalRevenue: existing ? dec(existing.totalRevenue) : null,
        totalExpenses: existing ? dec(existing.totalExpenses) : null,
        notes: existing?.notes ?? null,
        updatedByUserId: userId,
        lines: nextLines as Prisma.InputJsonValue,
      },
      update: {
        updatedByUserId: userId,
        lines: nextLines as Prisma.InputJsonValue,
      },
    })

    const feederTotal = Object.values(feeder).reduce((s, v) => s + (Number(v) || 0), 0)
    await this.audit.write({
      schoolId,
      userId,
      action: 'budget.forecast.applied',
      targetType: 'period_budgets',
      metadata: {
        fiscalPeriodId: period.id,
        enrollmentTotal: projected.kpis.enrollmentTotal,
        feederTotal,
        projectionMethod: method,
        ...(method === 'rollforward'
          ? { retentionPct: Number(dto.rollForward?.retentionPct) || 0 }
          : {}),
        projectedRevenue: projected.kpis.totalRevenue,
        projectedExpense: projected.kpis.totalExpense,
      },
    })

    return { forecast, kpis: projected.kpis }
  }

  /**
   * Deep-merge incoming forecast explanations over the existing map, per category,
   * clamping to 2000 chars. undefined patch keeps existing; null clears both maps.
   * A PRIVATE copy of BoardReportService.mergeExplanations (no cross-import).
   */
  private mergeForecastExplanations(
    existing: { revenue: Record<string, string>; expense: Record<string, string> },
    patch: Record<string, unknown> | null | undefined,
  ): { revenue: Record<string, string>; expense: Record<string, string> } {
    if (patch === undefined) return existing
    if (patch === null) return { revenue: {}, expense: {} }
    const coerce = (v: unknown): Record<string, string> => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
      const out: Record<string, string> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string' && val.length > 0) {
          out[k] = val.slice(0, MAX_FORECAST_EXPLANATION_CHARS)
        }
      }
      return out
    }
    const incoming = {
      revenue: coerce((patch as Record<string, unknown>).revenue),
      expense: coerce((patch as Record<string, unknown>).expense),
    }
    return {
      revenue: { ...existing.revenue, ...incoming.revenue },
      expense: { ...existing.expense, ...incoming.expense },
    }
  }

  /**
   * ADVISORY budget sufficiency check. Read-only (no persistence, no audit) —
   * the only DB touch is the tenant gate getOwnedPeriod. Body is EXACTLY one of
   * { spread } or { draft }. Normalizes to category totals, runs the pure
   * deterministic assessBudget (Layer 1, always on), then an optional LLM
   * advisor (Layer 2) that degrades gracefully when not configured.
   */
  async assess(
    schoolId: string,
    periodId: string,
    dto: AssessBudgetDto,
  ): Promise<AssessResponse> {
    await this.periods.getOwnedPeriod(schoolId, periodId) // tenant gate; throws 404 cross-tenant

    const hasSpread = !!dto.spread
    const hasDraft = !!dto.draft
    if (hasSpread === hasDraft) {
      throw new BadRequestException('Provide exactly one of spread or draft.')
    }

    let normalized: NormalizedBudget
    let source: 'driver' | 'import'

    if (dto.spread) {
      const r = rollupSpread(dto.spread as unknown as BudgetSpread)
      // Unmapped dollars/count derived from annotated accounts (NOT unmappedAccts,
      // which is GL-number only and misses label-only acct=0 rows).
      const unmapped = r.accounts.filter((a) => a.category === 'unmapped')
      const unmappedDollars = unmapped.reduce((s, a) => s + Math.abs(a.annual || 0), 0)
      normalized = {
        revenue: r.revenue,
        expense: r.expense,
        totalRevenue: r.totalRevenue,
        totalExpenses: r.totalExpenses,
        unmappedDollars,
        unmappedCount: unmapped.length,
      }
      source = 'import'
    } else {
      const d = dto.draft!
      normalized = {
        revenue: d.revenue,
        expense: d.expense,
        totalRevenue: sumMap(d.revenue),
        totalExpenses: sumMap(d.expense),
        unmappedDollars: 0,
        unmappedCount: 0,
        stats: d.stats,
      }
      source = d.stats?.source ?? 'driver'
    }

    const det = assessBudget(normalized, source) // Layer 1 — always
    const ai = await this.advise(normalized, det) // Layer 2 — graceful
    return { status: det.status, checks: det.checks, ai }
  }

  /**
   * Optional LLM advisor (Layer 2). Single completion, NO tools. Sends only the
   * normalized category totals + the deterministic checks (no raw account labels
   * — token-lean, no PII) and asks for a 2–3 sentence board-appropriate verdict
   * that NARRATES the checks without inventing figures. Never throws: not
   * configured / error / timeout / empty all degrade to no summary.
   */
  private async advise(
    n: NormalizedBudget,
    det: AssessResult,
  ): Promise<{ configured: boolean; summary?: string }> {
    if (!this.assistant?.isConfigured()) return { configured: false }
    try {
      const labelize = (m: Record<string, number>, labels: Record<string, string>): string =>
        Object.entries(m)
          .filter(([, v]) => Number(v))
          .map(([k, v]) => `${labels[k] ?? k}: ${Math.round(Number(v))}`)
          .join(', ')

      const facts = [
        `Total revenue: ${Math.round(n.totalRevenue)}`,
        `Total expenses: ${Math.round(n.totalExpenses)}`,
        `Revenue lines: ${labelize(n.revenue, REVENUE_LINE_LABELS as Record<string, string>) || 'none'}`,
        `Expense lines: ${labelize(n.expense, EXPENSE_LINE_LABELS as Record<string, string>) || 'none'}`,
        `Automated checks: ${det.checks.map((c) => c.message).join(' | ') || 'none flagged'}`,
      ].join('\n')

      const messages = [
        {
          role: 'system',
          content:
            'You review a school operating budget for COMPLETENESS for a non-profit ' +
            'school board audience. In 2-3 short plain-language sentences, give a verdict ' +
            '(complete enough, or not) then name the top 1-2 concrete fixes. Use ONLY the ' +
            'numbers provided; never invent or restate figures that are not given. No ' +
            'markdown, no headers, no lists.',
        },
        { role: 'user', content: facts },
      ]

      // [] = no tools, single completion. Cap the wait at 12s so a slow LLM never
      // hangs the (advisory) assess response — Layer 1 already returned its checks.
      const summaryPromise = this.assistant
        .chat(messages, [])
        .then((m) => (m.content ?? '').trim().slice(0, 800))
        .catch(() => '')
      const summary = await Promise.race([
        summaryPromise,
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 12_000)),
      ])
      return summary ? { configured: true, summary } : { configured: true }
    } catch {
      // Any error/timeout: still "configured", just no summary. Layer 1 already returned.
      return { configured: true }
    }
  }
}

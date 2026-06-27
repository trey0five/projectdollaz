// Phase 4D+ — the agentic AI assistant. Runs a multi-turn tool-calling loop: the
// LLM picks read-only tools to fetch the school's real numbers (metrics, compliance,
// reconciliation, budget, trends) and can call render_chart to visualize them; we
// execute each tool, feed results back, and repeat until it answers. Tenant-scoped
// to the school (the controller's RolesGuard) and the period (getOwnedPeriod).
import { Injectable, Logger } from '@nestjs/common'
import {
  computeDriverBudget,
  defaultAssumptions,
  mergeFeederEnrollment,
  toDriverPriorContext,
  GRADE_KEYS,
  type DriverAssumptions,
  type GradeKey,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AnalyticsService } from '../analytics/analytics.service.js'
import { BudgetService } from '../analytics/budget.service.js'
import { OperationalService } from '../analytics/operational.service.js'
import { BudgetRollupService } from '../analytics/budget-rollup.service.js'
import { deriveFiscalYearStart } from '../analytics/budget.driver.js'
import { ComplianceService } from '../compliance/compliance.service.js'
import { ReconciliationService } from '../compliance/reconciliation.service.js'
import { CorrectiveActionService } from '../compliance/corrective-action.service.js'
import { BoardReportService } from '../board-report/board-report.service.js'
import { AssistantClient } from './assistant.client.js'
import { TOOL_SCHEMAS } from './assistant.tools.js'

const MAX_TURNS = 6

const TOOL_LABELS: Record<string, string> = {
  list_periods: 'Looking up periods…',
  get_metrics: 'Reading the financial metrics…',
  get_compliance: 'Checking compliance findings…',
  get_reconciliation: 'Reviewing the reconciliation…',
  get_budget_vs_actual: 'Pulling budget vs. actual…',
  get_budget: 'Reading the budget…',
  get_budget_rollup: 'Consolidating your organization budget…',
  get_corrective_action_plan: 'Reading the corrective action plan…',
  get_trend: 'Loading the trend…',
  set_budget: 'Preparing a budget change…',
  apply_driver_budget: 'Building a driver budget…',
  draft_cap_entry: 'Drafting a corrective action…',
  get_board_report: 'Reading the board report…',
  generate_board_narrative: 'Drafting the board narrative…',
  set_explanation: 'Preparing a variance explanation…',
  get_forecast: 'Reading the FY-end forecast…',
  get_capital_schedule: 'Reading the capital budget…',
  get_cash_schedule: 'Reading cash & investments…',
  get_campaign_schedule: 'Reading the capital campaign…',
  apply_forecast: 'Re-projecting the FY-end forecast…',
  set_feeder_enrollment: 'Preparing the feeder enrollment…',
  render_chart: 'Drawing a chart…',
}

// Tools that propose a write — never applied in the loop; the user confirms first.
const WRITE_TOOLS = new Set([
  'set_budget',
  'draft_cap_entry',
  'apply_driver_budget',
  'set_explanation',
  'apply_forecast',
  'set_feeder_enrollment',
])

export interface ProposedAction {
  kind:
    | 'set_budget'
    | 'draft_cap_entry'
    | 'apply_driver_budget'
    | 'set_explanation'
    | 'apply_forecast'
    | 'set_feeder_enrollment'
  periodId: string
  summary: string
  payload: Record<string, unknown>
}

// Driver-assumption fields the LLM may supply (anything else is ignored).
const DRIVER_FIELDS = [
  'enrollmentByGrade',
  'tuitionRates',
  'tuitionProgramSplit',
  'feePerStudent',
  'staffing',
  'inflationPct',
  'overrides',
] as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Deep-merge `override` onto a clone of `base` (plain objects recurse; arrays/scalars replace). */
function deepMerge<T>(base: T, override: Record<string, unknown>): T {
  const out: Record<string, unknown> = isPlainObject(base) ? { ...(base as Record<string, unknown>) } : {}
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v
  }
  return out as T
}

/** Keep only known driver-assumption fields from arbitrary LLM args. */
function pickDriverFields(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of DRIVER_FIELDS) if (args[f] !== undefined) out[f] = args[f]
  return out
}

/** Clamp arbitrary LLM feeder args to the 14 GRADE_KEYS with non-negative ints. */
function clampFeeder(v: unknown): Record<string, number> {
  if (!isPlainObject(v)) return {}
  const out: Record<string, number> = {}
  for (const g of GRADE_KEYS) {
    const n = v[g]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[g] = Math.round(n)
  }
  return out
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'chart'; spec: ChartSpec }
  | { type: 'proposal'; action: ProposedAction }
  | { type: 'error'; text: string }
  | { type: 'done' }

interface Ctx {
  schoolId: string
  periodId: string | null
  userId?: string | null
}

export interface ChartSpec {
  title: string
  chartType: 'bar' | 'line' | 'pie'
  data: { label: string; value: number }[]
}
export interface AssistantReply {
  configured: boolean
  answer: string
  charts: ChartSpec[]
  proposals: ProposedAction[]
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly analytics: AnalyticsService,
    private readonly budget: BudgetService,
    private readonly rollup: BudgetRollupService,
    private readonly compliance: ComplianceService,
    private readonly reconciliation: ReconciliationService,
    private readonly correctiveAction: CorrectiveActionService,
    private readonly boardReport: BoardReportService,
    private readonly operational: OperationalService,
    private readonly client: AssistantClient,
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured()
  }

  async chat(
    schoolId: string,
    periodId: string | null,
    history: { role: 'user' | 'assistant'; content: string }[],
    userId?: string | null,
  ): Promise<AssistantReply> {
    if (!this.client.isConfigured()) {
      return { configured: false, answer: '', charts: [], proposals: [] }
    }
    const ctx: Ctx = { schoolId, periodId, userId: userId ?? null }
    const system = await this.systemPrompt(ctx)
    const messages: unknown[] = [{ role: 'system', content: system }, ...history]
    const charts: ChartSpec[] = []
    const proposals: ProposedAction[] = []
    const sinks = {
      onChart: (c: ChartSpec) => charts.push(c),
      onProposal: (a: ProposedAction) => proposals.push(a),
    }

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const msg = await this.client.chat(messages, TOOL_SCHEMAS)
      messages.push({
        role: 'assistant',
        content: msg.content ?? '',
        ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
      })
      if (!msg.tool_calls?.length) {
        return { configured: true, answer: msg.content ?? '', charts, proposals }
      }
      for (const tc of msg.tool_calls) {
        const result = await this.runToolCall(tc, ctx, sinks)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 8000),
        })
      }
    }
    return {
      configured: true,
      answer: 'I gathered the data but ran out of steps — try asking something more specific.',
      charts,
      proposals,
    }
  }

  /** Streaming variant — emits content tokens, tool-status, and chart events. */
  async chatStream(
    schoolId: string,
    periodId: string | null,
    history: { role: 'user' | 'assistant'; content: string }[],
    emit: (ev: StreamEvent) => void,
    userId?: string | null,
  ): Promise<void> {
    if (!this.client.isConfigured()) {
      emit({ type: 'error', text: 'The assistant isn’t configured on this server yet.' })
      emit({ type: 'done' })
      return
    }
    const ctx: Ctx = { schoolId, periodId, userId: userId ?? null }
    const system = await this.systemPrompt(ctx)
    const messages: unknown[] = [{ role: 'system', content: system }, ...history]

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const msg = await this.client.streamChat(messages, TOOL_SCHEMAS, (text) =>
          emit({ type: 'delta', text }),
        )
        messages.push({
          role: 'assistant',
          content: msg.content ?? '',
          ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
        })
        if (!msg.tool_calls?.length) {
          emit({ type: 'done' })
          return
        }
        for (const tc of msg.tool_calls) {
          emit({ type: 'status', text: TOOL_LABELS[tc.function.name] ?? 'Working…' })
          const result = await this.runToolCall(tc, ctx, {
            onChart: (c) => emit({ type: 'chart', spec: c }),
            onProposal: (a) => emit({ type: 'proposal', action: a }),
          })
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 8000),
          })
        }
      }
      emit({ type: 'done' })
    } catch (e) {
      this.logger.warn(`assistant stream failed: ${e instanceof Error ? e.message : String(e)}`)
      emit({ type: 'error', text: 'Sorry — I hit an error answering that.' })
      emit({ type: 'done' })
    }
  }

  /** Execute one tool call. Write tools are NOT applied — they emit a proposal. */
  private async runToolCall(
    tc: { id: string; function: { name: string; arguments: string } },
    ctx: Ctx,
    sinks: { onChart: (c: ChartSpec) => void; onProposal: (a: ProposedAction) => void },
  ): Promise<unknown> {
    const name = tc.function.name
    try {
      const args = this.parseArgs(tc.function.arguments)
      if (WRITE_TOOLS.has(name)) {
        const action = await this.buildProposal(name, args, ctx)
        sinks.onProposal(action)
        return {
          proposed: action.summary,
          note: 'NOT applied yet — pending the user’s confirmation. Tell the user exactly what you will change and that they can confirm or cancel.',
        }
      }
      const result = await this.execute(name, args, ctx)
      if (name === 'render_chart' && result && !(result as { error?: unknown }).error) {
        sinks.onChart(result as ChartSpec)
      }
      return result
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** Validate a write tool's args into a confirmable ProposedAction (no mutation). */
  private async buildProposal(
    name: string,
    args: Record<string, unknown>,
    ctx: Ctx,
  ): Promise<ProposedAction> {
    const periodId = await this.resolvePeriod(args, ctx)
    if (name === 'set_budget') {
      const amount = typeof args.amount === 'number' ? args.amount : undefined
      const key = typeof args.categoryKey === 'string' ? args.categoryKey : undefined
      const type = args.categoryType === 'expense' ? 'expense' : 'revenue'
      const totalRevenue = typeof args.totalRevenue === 'number' ? args.totalRevenue : undefined
      const totalExpenses = typeof args.totalExpenses === 'number' ? args.totalExpenses : undefined
      const parts: string[] = []
      if (key && amount != null) parts.push(`${type} “${key}” budget to $${amount.toLocaleString('en-US')}`)
      if (totalRevenue != null) parts.push(`budgeted revenue to $${totalRevenue.toLocaleString('en-US')}`)
      if (totalExpenses != null) parts.push(`budgeted expenses to $${totalExpenses.toLocaleString('en-US')}`)
      if (parts.length === 0) throw new Error('set_budget needs a category+amount or a total.')
      return {
        kind: 'set_budget',
        periodId,
        summary: `Set ${parts.join(', ')}.`,
        payload: { categoryKey: key, categoryType: type, amount, totalRevenue, totalExpenses },
      }
    }
    if (name === 'apply_driver_budget') {
      const merged = await this.mergedDriverAssumptions(ctx.schoolId, periodId, args)
      const prior = toDriverPriorContext(await this.analytics.budgetContext(ctx.schoolId, periodId))
      const r = computeDriverBudget(merged, prior)
      const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
      return {
        kind: 'apply_driver_budget',
        periodId,
        summary:
          `Build a driver budget for ${r.kpis.enrollmentTotal} students — revenue ${usd(r.kpis.totalRevenue)}, ` +
          `expenses ${usd(r.kpis.totalExpense)}, net ${usd(r.kpis.netIncome)}.`,
        payload: { assumptions: merged as unknown as Record<string, unknown> },
      }
    }
    if (name === 'set_explanation') {
      const categoryType = args.categoryType === 'expense' ? 'expense' : 'revenue'
      const categoryKey = typeof args.categoryKey === 'string' ? args.categoryKey.trim() : ''
      const text = typeof args.text === 'string' ? args.text.trim() : ''
      if (!categoryKey || !text) {
        throw new Error('set_explanation needs a categoryKey and explanation text.')
      }
      return {
        kind: 'set_explanation',
        periodId,
        summary: `Add a board-report explanation for ${categoryType} “${categoryKey}”: “${text.slice(0, 120)}”.`,
        payload: { categoryType, categoryKey, text },
      }
    }
    if (name === 'apply_forecast') {
      // Base assumptions come from the saved forecast (then driverModel, then
      // defaults); the LLM's levers merge on top, feeder is merged additively.
      const merged = await this.mergedForecastAssumptions(ctx.schoolId, periodId, args)
      const op = await this.operational.get(ctx.schoolId, periodId)
      const feeder =
        args.feederEnrollmentByGrade !== undefined
          ? clampFeeder(args.feederEnrollmentByGrade)
          : op.feederEnrollmentByGrade ?? {}
      const effective = mergeFeederEnrollment(
        merged.enrollmentByGrade as Partial<Record<GradeKey, number>>,
        feeder as Partial<Record<GradeKey, number>>,
      )
      const prior = toDriverPriorContext(await this.analytics.budgetContext(ctx.schoolId, periodId))
      const r = computeDriverBudget({ ...merged, enrollmentByGrade: effective }, prior)
      const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
      const feederTotal = Object.values(feeder).reduce((s, v) => s + (Number(v) || 0), 0)
      return {
        kind: 'apply_forecast',
        periodId,
        summary:
          `Re-project the FY-end forecast for ${r.kpis.enrollmentTotal} students ` +
          `(incl. ${feederTotal} anticipated feeder) — revenue ${usd(r.kpis.totalRevenue)}, ` +
          `expenses ${usd(r.kpis.totalExpense)}, net ${usd(r.kpis.netIncome)}.`,
        payload: {
          assumptions: merged as unknown as Record<string, unknown>,
          feederEnrollmentByGrade: feeder,
        },
      }
    }
    if (name === 'set_feeder_enrollment') {
      const feeder = clampFeeder(args.feederEnrollmentByGrade)
      if (Object.keys(feeder).length === 0) {
        throw new Error('set_feeder_enrollment needs feederEnrollmentByGrade with at least one grade.')
      }
      const total = Object.values(feeder).reduce((s, v) => s + v, 0)
      const grades = Object.entries(feeder)
        .map(([g, n]) => `${g}: ${n}`)
        .join(', ')
      return {
        kind: 'set_feeder_enrollment',
        periodId,
        summary: `Set anticipated feeder enrollment to ${total} incoming students (${grades}).`,
        payload: { feederEnrollmentByGrade: feeder },
      }
    }
    // draft_cap_entry
    const ruleId = typeof args.ruleId === 'string' ? args.ruleId : ''
    if (!ruleId) throw new Error('draft_cap_entry needs a ruleId (from get_corrective_action_plan).')
    const fields = ['rootCause', 'correctiveAction', 'responsibleParty', 'targetDate', 'status']
    const filled = fields.filter((f) => typeof args[f] === 'string' && args[f])
    return {
      kind: 'draft_cap_entry',
      periodId,
      summary: `Draft the corrective action plan for ${ruleId} (${filled.join(', ') || 'fields'}).`,
      payload: {
        ruleId,
        rootCause: args.rootCause,
        correctiveAction: args.correctiveAction,
        responsibleParty: args.responsibleParty,
        targetDate: args.targetDate,
        status: args.status,
      },
    }
  }

  /**
   * Build a COMPLETE DriverAssumptions from the LLM's partial args: defaults <-
   * the period's saved driver assumptions (if any) <- the user's specified levers.
   * `enrollmentTotal` is a convenience that spreads evenly across grades when no
   * per-grade map is given. Always returns a full, valid shape for computeDriverBudget.
   */
  private async mergedDriverAssumptions(
    schoolId: string,
    periodId: string,
    args: Record<string, unknown>,
  ): Promise<DriverAssumptions> {
    const b = await this.budget.get(schoolId, periodId)
    const lines = (b.lines as Record<string, unknown> | null) ?? {}
    const saved = (lines.driverModel as { assumptions?: Record<string, unknown> } | undefined)?.assumptions
    const base = deepMerge(defaultAssumptions(), saved ?? {})

    const overrides = pickDriverFields(args)
    // enrollmentTotal → even per-grade distribution (only when no explicit grid).
    if (typeof args.enrollmentTotal === 'number' && overrides.enrollmentByGrade === undefined) {
      const keys = Object.keys((base as { enrollmentByGrade: Record<string, number> }).enrollmentByGrade)
      const total = Math.max(0, Math.round(args.enrollmentTotal))
      const per = Math.floor(total / keys.length)
      let rem = total - per * keys.length
      const ebg: Record<string, number> = {}
      for (const k of keys) {
        ebg[k] = per + (rem > 0 ? 1 : 0)
        if (rem > 0) rem -= 1
      }
      overrides.enrollmentByGrade = ebg
    }
    return deepMerge(base, overrides)
  }

  /**
   * Like mergedDriverAssumptions but seeds from the saved FORECAST assumptions
   * first (so re-projecting keeps the last forecast's levers), falling back to the
   * driver model, then defaults. The LLM's specified levers merge on top.
   */
  private async mergedForecastAssumptions(
    schoolId: string,
    periodId: string,
    args: Record<string, unknown>,
  ): Promise<DriverAssumptions> {
    const b = await this.budget.get(schoolId, periodId)
    const lines = (b.lines as Record<string, unknown> | null) ?? {}
    const forecast = lines.forecast as { assumptions?: Record<string, unknown> } | undefined
    const driver = lines.driverModel as { assumptions?: Record<string, unknown> } | undefined
    const saved = forecast?.assumptions ?? driver?.assumptions
    const base = deepMerge(defaultAssumptions(), saved ?? {})

    const overrides = pickDriverFields(args)
    if (typeof args.enrollmentTotal === 'number' && overrides.enrollmentByGrade === undefined) {
      const keys = Object.keys((base as { enrollmentByGrade: Record<string, number> }).enrollmentByGrade)
      const total = Math.max(0, Math.round(args.enrollmentTotal))
      const per = Math.floor(total / keys.length)
      let rem = total - per * keys.length
      const ebg: Record<string, number> = {}
      for (const k of keys) {
        ebg[k] = per + (rem > 0 ? 1 : 0)
        if (rem > 0) rem -= 1
      }
      overrides.enrollmentByGrade = ebg
    }
    return deepMerge(base, overrides)
  }

  /** Apply a user-confirmed proposal. Deterministic — no LLM. owner/accountant only. */
  async applyAction(
    schoolId: string,
    userId: string,
    action: ProposedAction,
  ): Promise<{ applied: boolean; summary: string }> {
    const periodId = action.periodId
    const p = action.payload ?? {}
    if (action.kind === 'apply_driver_budget') {
      const assumptions = (p.assumptions ?? {}) as Record<string, unknown>
      await this.budget.upsertDriver(
        schoolId,
        periodId,
        { assumptions } as unknown as Parameters<BudgetService['upsertDriver']>[2],
        userId,
      )
      return { applied: true, summary: action.summary }
    }
    if (action.kind === 'set_budget') {
      const dto: Record<string, unknown> = {}
      if (typeof p.totalRevenue === 'number') dto.totalRevenue = p.totalRevenue
      if (typeof p.totalExpenses === 'number') dto.totalExpenses = p.totalExpenses
      if (typeof p.categoryKey === 'string' && typeof p.amount === 'number') {
        const existing = await this.budget.get(schoolId, periodId)
        const lines = (existing.lines as Record<string, Record<string, number>>) ?? {}
        const type = p.categoryType === 'expense' ? 'expense' : 'revenue'
        dto.lines = {
          revenue: { ...(lines.revenue ?? {}) },
          expense: { ...(lines.expense ?? {}) },
          ...(typeof lines.growthPct === 'number' ? { growthPct: lines.growthPct } : {}),
        }
        ;(dto.lines as Record<string, Record<string, number>>)[type][p.categoryKey] = p.amount
      }
      await this.budget.upsert(schoolId, periodId, dto, userId)
      return { applied: true, summary: action.summary }
    }
    if (action.kind === 'set_explanation') {
      const type = p.categoryType === 'expense' ? 'expense' : 'revenue'
      const key = String(p.categoryKey)
      const text = String(p.text)
      // Single-key merged patch — the service deep-merges per category so siblings survive.
      await this.boardReport.save(
        schoolId,
        periodId,
        { explanations: { [type]: { [key]: text } } },
        userId,
      )
      return { applied: true, summary: action.summary }
    }
    if (action.kind === 'apply_forecast') {
      const assumptions = (p.assumptions ?? {}) as Record<string, unknown>
      const feeder = (p.feederEnrollmentByGrade ?? {}) as Record<string, number>
      await this.budget.upsertForecast(
        schoolId,
        periodId,
        { assumptions, feederEnrollmentByGrade: feeder } as unknown as Parameters<
          BudgetService['upsertForecast']
        >[2],
        userId,
      )
      return { applied: true, summary: action.summary }
    }
    if (action.kind === 'set_feeder_enrollment') {
      const feeder = (p.feederEnrollmentByGrade ?? {}) as Record<string, number>
      await this.operational.upsert(
        schoolId,
        periodId,
        { feederEnrollmentByGrade: feeder } as unknown as Parameters<
          OperationalService['upsert']
        >[2],
        userId,
      )
      return { applied: true, summary: action.summary }
    }
    // draft_cap_entry
    await this.correctiveAction.upsertEntries(
      schoolId,
      periodId,
      {
        entries: [
          {
            ruleId: String(p.ruleId),
            rootCause: (p.rootCause as string) ?? undefined,
            correctiveAction: (p.correctiveAction as string) ?? undefined,
            responsibleParty: (p.responsibleParty as string) ?? undefined,
            targetDate: (p.targetDate as string) ?? undefined,
            status: (p.status as 'open' | 'in_progress' | 'complete') ?? undefined,
          },
        ],
      },
      userId,
    )
    return { applied: true, summary: action.summary }
  }

  private parseArgs(raw: string): Record<string, unknown> {
    try {
      const v = JSON.parse(raw || '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  }

  private async systemPrompt(ctx: Ctx): Promise<string> {
    const school = await this.prisma.school.findUnique({ where: { id: ctx.schoolId } })
    let periodLabel = 'none selected'
    if (ctx.periodId) {
      try {
        const p = await this.periods.getOwnedPeriod(ctx.schoolId, ctx.periodId)
        periodLabel = p.label ?? periodLabel
      } catch {
        /* ignore */
      }
    }
    return (
      `You are FinRep's financial assistant for ${school?.name ?? 'this school'}, a private school. ` +
      `The user is currently viewing fiscal period "${periodLabel}". ` +
      'Answer questions about this school’s finances, KPIs, AUP scholarship-compliance readiness, ' +
      'budget vs. actual, and scholarship reconciliation. ALWAYS use the tools to fetch real numbers ' +
      'before answering — never invent or estimate figures. When a comparison, breakdown, or trend ' +
      'would help, call render_chart to visualize it. ' +
      'For budget questions use get_budget (this school’s budget plan — imported spread, driver model, or ' +
      'manual), get_budget_vs_actual (budget vs. actuals), and get_budget_rollup (the organization-wide ' +
      'consolidation across the organization’s schools). ' +
      'You may also help make changes: set_budget (set a budget figure), apply_driver_budget (build the ' +
      'budget from enrollment / tuition / staffing assumptions — provide ONLY the levers the user mentions; ' +
      'the rest keep their current values), and draft_cap_entry (fill a corrective-action-plan entry). ' +
      'For the board report (finance-committee packet) use get_board_report (its settings, MD&A, budget-vs-actual ' +
      'variances and key indicators) and generate_board_narrative (draft the MD&A narrative — returns text, does not ' +
      'save). set_explanation proposes a per-line variance explanation/comment (provide categoryType + categoryKey + text). ' +
      'These do NOT apply immediately — they propose a change the user confirms; after calling one, tell the ' +
      'user what you’ve prepared and that they can confirm or cancel. ' +
      'For the FY-end forecast (a forward re-projection vs the budget) use get_forecast (read the saved ' +
      'forecast, its KPIs and forecast-vs-budget variances); apply_forecast re-projects it from revised ' +
      'driver assumptions plus anticipated feeder enrollment (net-new incoming students ADDED ON TOP of ' +
      'projected enrollment, which raises forecast tuition); set_feeder_enrollment sets only that feeder ' +
      'input (run apply_forecast afterwards to re-project). Call get_forecast (and get_budget) before ' +
      'proposing a forecast change. These also propose-then-confirm. ' +
      'For draft_cap_entry, first call get_corrective_action_plan to get the ruleId. ' +
      'For set_explanation, first call get_board_report to see the category keys. ' +
      'For capital spend use get_capital_schedule; for cash/liquidity & insured exposure use get_cash_schedule. ' +
      'For capital-campaign tracking / budget-vs-estimate (is the campaign tracking to budget?) use get_campaign_schedule. ' +
      'Be concise and board-appropriate; format money as USD. Only this school’s data is available. ' +
      'If a tool returns an error or needs data, say so plainly.'
    )
  }

  private async resolvePeriod(args: Record<string, unknown>, ctx: Ctx): Promise<string> {
    // Validate each candidate as a real owned period. The LLM often passes a label
    // (e.g. "FY2024") as periodId, which is not a UUID — verify before trusting it so
    // a write never reaches Prisma with a bad id; fall back to the on-screen period.
    const candidates = [
      typeof args.periodId === 'string' && args.periodId ? args.periodId : null,
      ctx.periodId,
    ].filter((v): v is string => Boolean(v))
    for (const id of candidates) {
      try {
        const p = await this.periods.getOwnedPeriod(ctx.schoolId, id)
        if (p) return p.id
      } catch {
        /* not a real owned period (e.g. a label, not a UUID) — try the next candidate */
      }
    }
    const periods = await this.periods.listPeriods(ctx.schoolId)
    const withSnap = periods.find((p) => p.hasSnapshot) ?? periods[0]
    if (!withSnap) throw new Error('This school has no fiscal periods yet.')
    return withSnap.id
  }

  private async execute(name: string, args: Record<string, unknown>, ctx: Ctx): Promise<unknown> {
    switch (name) {
      case 'list_periods': {
        const periods = await this.periods.listPeriods(ctx.schoolId)
        return periods.map((p) => ({
          id: p.id,
          label: p.label,
          periodEndDate: p.periodEndDate,
          hasStatements: p.hasSnapshot,
        }))
      }
      case 'get_metrics': {
        const pid = await this.resolvePeriod(args, ctx)
        const { metrics } = await this.analytics.computeMetricsResponse(ctx.schoolId, pid)
        return metrics
          .filter((m) => m.available && m.value != null)
          .map((m) => ({
            key: m.key,
            label: m.label,
            value: m.value,
            unit: m.unit,
            status: m.status,
            changeVsPrior: m.periodOverPeriodDelta,
            ...(m.components ? { breakdown: m.components.map((c) => ({ label: c.label, value: c.value })) } : {}),
          }))
      }
      case 'get_compliance': {
        const pid = await this.resolvePeriod(args, ctx)
        const c = await this.compliance.evaluateForPeriod(ctx.schoolId, pid)
        const flagged = (c.sections ?? [])
          .flatMap((s) => s.findings ?? [])
          .filter((f) => f.status === 'material' || f.status === 'reportable')
          .map((f) => ({ title: f.title, status: f.status, citation: f.citation }))
        return { counts: c.summary?.counts ?? {}, flagged }
      }
      case 'get_reconciliation': {
        const pid = await this.resolvePeriod(args, ctx)
        const r = await this.reconciliation.reconcileForPeriod(ctx.schoolId, pid)
        return r.result
      }
      case 'get_budget_vs_actual': {
        const pid = await this.resolvePeriod(args, ctx)
        const b = await this.budget.get(ctx.schoolId, pid)
        const { metrics } = await this.analytics.computeMetricsResponse(ctx.schoolId, pid)
        const rev = metrics.find((m) => m.key === 'revenue_mix')
        const exp = metrics.find((m) => m.key === 'expense_mix')
        return {
          budget: b,
          actualRevenue: rev?.available ? rev.value : null,
          actualExpenses: exp?.available ? exp.value : null,
          actualRevenueByCategory: rev?.components?.map((c) => ({ label: c.label, value: c.value })) ?? [],
          actualExpenseByCategory: exp?.components?.map((c) => ({ label: c.label, value: c.value })) ?? [],
        }
      }
      case 'get_budget': {
        const pid = await this.resolvePeriod(args, ctx)
        const b = await this.budget.get(ctx.schoolId, pid)
        const lines = (b.lines as Record<string, unknown> | null) ?? {}
        const driverModel = lines.driverModel as
          | { kpis?: unknown; assumptions?: unknown }
          | undefined
        const spread = lines.spread as
          | { format?: unknown; fileName?: unknown; monthKeys?: unknown[]; accounts?: unknown[] }
          | undefined
        const source = driverModel
          ? 'driver model'
          : spread
            ? `imported spread (${String(spread.format)})`
            : lines.revenue || lines.expense
              ? 'manual'
              : 'none'
        return {
          source,
          totalRevenue: b.totalRevenue,
          totalExpenses: b.totalExpenses,
          surplus: (b.totalRevenue ?? 0) - (b.totalExpenses ?? 0),
          revenueByCategory: lines.revenue ?? {},
          expenseByCategory: lines.expense ?? {},
          ...(driverModel
            ? { driver: { kpis: driverModel.kpis, assumptions: driverModel.assumptions } }
            : {}),
          ...(spread
            ? {
                spread: {
                  format: spread.format,
                  fileName: spread.fileName ?? null,
                  months: spread.monthKeys?.length ?? 0,
                  accountCount: spread.accounts?.length ?? 0,
                },
              }
            : {}),
        }
      }
      case 'get_budget_rollup': {
        if (!ctx.userId) return { error: 'No user context for the organization roll-up.' }
        const school = await this.prisma.school.findUnique({ where: { id: ctx.schoolId } })
        if (!school?.organizationId) return { error: 'This school is not part of an organization.' }
        const user = await this.prisma.user.findUnique({ where: { id: ctx.userId } })
        if (!user) return { error: 'User not found.' }
        let fys: string | null = null
        try {
          const pid = await this.resolvePeriod(args, ctx)
          const p = await this.periods.getOwnedPeriod(ctx.schoolId, pid)
          fys = deriveFiscalYearStart(p.periodEndDate.toISOString().slice(0, 10))
        } catch {
          /* fall back to each school's most-recent budget */
        }
        const r = await this.rollup.getRollup(user, school.organizationId, fys)
        return { fiscalYearStart: r.fiscalYearStart, schools: r.schools, consolidated: r.consolidated }
      }
      case 'get_corrective_action_plan': {
        const pid = await this.resolvePeriod(args, ctx)
        const plan = await this.correctiveAction.getPlan(ctx.schoolId, pid)
        return {
          entries: plan.entries.map((e) => ({
            ruleId: e.ruleId,
            title: e.title,
            severity: e.severity,
            status: e.status,
            isResolved: e.isResolved,
            rootCause: e.rootCause,
            correctiveAction: e.correctiveAction,
            suggestedRootCause: e.suggestedRootCause,
            suggestedCorrectiveAction: e.suggestedCorrectiveAction,
          })),
        }
      }
      case 'get_trend': {
        const metricKey = typeof args.metricKey === 'string' ? args.metricKey : ''
        const t = await this.analytics.trends(ctx.schoolId, metricKey)
        return t
      }
      case 'get_board_report': {
        const pid = await this.resolvePeriod(args, ctx)
        const b = await this.boardReport.assemble(ctx.schoolId, pid, 'annual')
        // Trim to the parts the assistant reasons over (settings, mda, variances, KPIs).
        return {
          settings: b.settings,
          mda: b.mda,
          availability: b.availability,
          operations: b.operations,
          keyIndicators: b.keyIndicators.filter((k) => k.available),
        }
      }
      case 'generate_board_narrative': {
        const pid = await this.resolvePeriod(args, ctx)
        const tone = ['concise', 'standard', 'detailed'].includes(String(args.tone))
          ? (args.tone as 'concise' | 'standard' | 'detailed')
          : undefined
        const r = await this.boardReport.generateMda(ctx.schoolId, pid, { tone })
        return r
      }
      case 'get_forecast': {
        const pid = await this.resolvePeriod(args, ctx)
        const env = await this.budget.getForecast(ctx.schoolId, pid)
        const feederTotal = Object.values(env.feederEnrollmentByGrade ?? {}).reduce(
          (s, v) => s + (Number(v) || 0),
          0,
        )
        if (!env.forecast) {
          return {
            exists: false,
            hasBudget: env.hasBudget,
            feederTotal,
            note: 'No FY-end forecast has been saved yet. Use apply_forecast to create one.',
          }
        }
        const f = env.forecast
        // Top forecast-vs-budget variances by absolute magnitude (across both types).
        const variances = [
          ...Object.entries(f.variance.revenue).map(([key, v]) => ({ type: 'revenue', key, variance: v })),
          ...Object.entries(f.variance.expense).map(([key, v]) => ({ type: 'expense', key, variance: v })),
        ]
          .filter((x) => Number(x.variance) !== 0)
          .sort((a, b) => Math.abs(Number(b.variance)) - Math.abs(Number(a.variance)))
          .slice(0, 6)
        const a = (f.assumptions ?? {}) as Record<string, unknown>
        return {
          exists: true,
          hasBudget: env.hasBudget,
          computedAt: f.computedAt,
          projectedKpis: f.projected.kpis,
          topVariances: variances,
          feederTotal,
          feederByGrade: f.feederEnrollmentByGrade,
          assumptionsSummary: {
            tuitionRates: a.tuitionRates ?? {},
            inflationPct: a.inflationPct ?? 0,
            tuitionProgramSplit: a.tuitionProgramSplit ?? {},
          },
        }
      }
      case 'get_capital_schedule': {
        const pid = await this.resolvePeriod(args, ctx)
        const b = await this.boardReport.assemble(ctx.schoolId, pid, 'annual')
        return (
          b.capitalBudget ?? {
            exists: false,
            note: 'No capital budget entered for this period.',
          }
        )
      }
      case 'get_cash_schedule': {
        const pid = await this.resolvePeriod(args, ctx)
        const b = await this.boardReport.assemble(ctx.schoolId, pid, 'annual')
        return (
          b.cashInvestments ?? {
            exists: false,
            note: 'No cash & investment accounts entered for this period.',
          }
        )
      }
      case 'get_campaign_schedule': {
        const pid = await this.resolvePeriod(args, ctx)
        const b = await this.boardReport.assemble(ctx.schoolId, pid, 'annual')
        return (
          b.capitalCampaign ?? {
            exists: false,
            note: 'No capital campaign entered for this period.',
          }
        )
      }
      case 'render_chart': {
        const chartType = ['bar', 'line', 'pie'].includes(String(args.chartType))
          ? (args.chartType as ChartSpec['chartType'])
          : 'bar'
        const data = Array.isArray(args.data)
          ? (args.data as unknown[])
              .map((d) => {
                const o = d as { label?: unknown; value?: unknown }
                return { label: String(o?.label ?? ''), value: Number(o?.value) }
              })
              .filter((d) => d.label && Number.isFinite(d.value))
          : []
        return { title: String(args.title ?? 'Chart'), chartType, data }
      }
      default:
        return { error: `Unknown tool: ${name}` }
    }
  }
}

import { Injectable, Logger } from '@nestjs/common'
import {
  DEFAULT_COLLECTION_RATE,
  DEFAULT_PLAN_MIX,
  addDays,
  addMonths,
  committedShare,
  deriveCollectionRate,
  expandCommitments,
  projectCash,
  spreadDisbursements,
  spreadReceipts,
  tuitionReceipts,
} from '@finrep/analytics'
import type {
  CashCommitmentInput,
  CashEvent,
  CashProjectionResult,
  ConfidenceClass,
  Granularity,
  PaymentPlanMix,
  SpreadAccountLike,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// The cash-flow projection service — assembly, not arithmetic.
//
// EVERY FIGURE THIS RETURNS IS COMPUTED BY @finrep/analytics. This file gathers
// the school's commitments, assumptions, budget phasing and opening balance,
// hands them to the pure engine, and stores what came back. It does no cash maths
// of its own, which is what keeps the projection reproducible: the same inputs
// give the same output on every run, and the run is recorded so a school can be
// shown later what it was told and when.
//
// THE OPENING BALANCE IS THE WHOLE FOUNDATION and it is the one thing KYRO cannot
// derive. There is no bank feed — QuickBooks and trial-balance uploads only — and
// the trial-balance cash total is NOT available operating cash. A school can hold
// $600,000 on the balance sheet with $125,000 that operations may actually spend;
// the rest is restricted, board-designated, or already committed. So the school
// states the number and this service returns the trial-balance figure beside it
// as a cross-check, recording which was used. Overstating the start overstates
// every week that follows it.
// ─────────────────────────────────────────────────────────────────────────────

/** How good the inputs are — NOT how healthy the school is. */
export type DataTier = 'high' | 'moderate' | 'limited'

/**
 * Frozen. Rendered verbatim wherever a tier is shown.
 *
 * Without it, a school reads "limited confidence" as a judgement on its finances
 * rather than on its data feed, and the two are unrelated: a school with immaculate
 * reserves and no QuickBooks connection is a limited-DATA school in excellent health.
 */
export const CONFIDENCE_DISCLAIMER =
  'Forecast confidence reflects the completeness and timeliness of the underlying data, not the financial health of the school.'

/**
 * An opening balance keyed a long time ago is a silently compounding error — every
 * week after it inherits the drift. Past this many days the surface says so.
 */
export const STALE_OPENING_DAYS = 30

export interface OpeningCashView {
  /** What the projection actually started from. */
  openingCash: number | null
  asOfDate: string | null
  source: 'keyed' | 'trial_balance' | null
  /** The trial-balance cash total, for the cross-check. Null when none is on file. */
  tbCash: number | null
  /** Days since the balance was stated. Null when never stated. */
  ageDays: number | null
  stale: boolean
}

export interface ProjectionResponse {
  projection: CashProjectionResult | null
  opening: OpeningCashView
  dataTier: DataTier
  dataTierReason: string
  disclaimer: string
  /** Share of horizon movement resting on known dates AND amounts. */
  committedShare: number | null
  assumptions: {
    planMix: PaymentPlanMix
    collectionRate: number
    collectionRateSource: 'derived' | 'entered'
    /** A rate suggested from receivable aging, when history allows one. NEVER applied. */
    collectionRateSuggestion: { rate: number; basis: { billed: number; over90: number } } | null
    reserveThreshold: number | null
    firstBillingDate: string | null
  }
  /** Why the school cannot be projected yet, when it cannot. */
  blockedReason: string | null
  /**
   * WHAT IS MISSING FROM THIS FORECAST, named.
   *
   * Live-caught on the first real run: a school with commitments recorded and no
   * budget on file got a projection containing every outflow and NONE of its
   * tuition — a catastrophic-looking trough that was an artefact of absent data,
   * with nothing on screen to say so. A forecast quietly missing a school's
   * largest receipt is worse than no forecast, because the number looks complete.
   *
   * Each entry names the missing input and what to do about it. Empty is the
   * ordinary case and renders nothing.
   */
  omissions: { key: string; message: string }[]
}

const ISO = (d: Date): string => d.toISOString().slice(0, 10)

@Injectable()
export class CashFlowService {
  private readonly log = new Logger(CashFlowService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ── Commitments ────────────────────────────────────────────────────────────

  async listCommitments(schoolId: string) {
    const rows = await this.prisma.cashCommitment.findMany({
      where: { schoolId, active: true },
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    })
    return { commitments: rows.map((r) => this.publicCommitment(r)) }
  }

  async createCommitment(schoolId: string, userId: string, body: Record<string, unknown>) {
    const row = await this.prisma.cashCommitment.create({
      data: {
        schoolId,
        label: String(body.label),
        category: String(body.category),
        direction: String(body.direction),
        amount: Number(body.amount),
        confidence: String(body.confidence),
        recurrence: String(body.recurrence),
        startDate: new Date(String(body.startDate)),
        endDate: body.endDate ? new Date(String(body.endDate)) : null,
        dayRule: (body.dayRule as number[] | undefined) ?? undefined,
        notes: body.notes ? String(body.notes) : null,
        createdByUserId: userId,
      },
    })
    return this.publicCommitment(row)
  }

  async updateCommitment(
    schoolId: string,
    commitmentId: string,
    body: Record<string, unknown>,
  ) {
    // Tenant-scoped update — a foreign id updates nothing rather than 500ing.
    const { count } = await this.prisma.cashCommitment.updateMany({
      where: { id: commitmentId, schoolId },
      data: {
        ...(body.label !== undefined ? { label: String(body.label) } : {}),
        ...(body.category !== undefined ? { category: String(body.category) } : {}),
        ...(body.direction !== undefined ? { direction: String(body.direction) } : {}),
        ...(body.amount !== undefined ? { amount: Number(body.amount) } : {}),
        ...(body.confidence !== undefined ? { confidence: String(body.confidence) } : {}),
        ...(body.recurrence !== undefined ? { recurrence: String(body.recurrence) } : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(String(body.startDate)) } : {}),
        ...(body.endDate !== undefined
          ? { endDate: body.endDate ? new Date(String(body.endDate)) : null }
          : {}),
        ...(body.dayRule !== undefined ? { dayRule: body.dayRule as number[] } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
      },
    })
    return { updated: count }
  }

  /** Soft delete — a removed commitment must not vanish from a stored run's history. */
  async removeCommitment(schoolId: string, commitmentId: string) {
    const { count } = await this.prisma.cashCommitment.updateMany({
      where: { id: commitmentId, schoolId },
      data: { active: false },
    })
    return { removed: count }
  }

  private publicCommitment(r: {
    id: string
    label: string
    category: string
    direction: string
    amount: unknown
    confidence: string
    recurrence: string
    startDate: Date
    endDate: Date | null
    dayRule: unknown
    notes: string | null
  }) {
    return {
      id: r.id,
      label: r.label,
      category: r.category,
      direction: r.direction,
      amount: Number(r.amount),
      confidence: r.confidence,
      recurrence: r.recurrence,
      startDate: ISO(r.startDate),
      endDate: r.endDate ? ISO(r.endDate) : null,
      dayRule: Array.isArray(r.dayRule) ? (r.dayRule as number[]) : null,
      notes: r.notes,
    }
  }

  // ── Assumptions ────────────────────────────────────────────────────────────

  async getAssumptions(schoolId: string) {
    const row = await this.prisma.cashAssumptions.findUnique({ where: { schoolId } })
    const suggestion = await this.collectionSuggestion(schoolId)
    return {
      planMix: (row?.planMix as PaymentPlanMix | undefined) ?? DEFAULT_PLAN_MIX,
      collectionRate: row ? Number(row.collectionRate) : DEFAULT_COLLECTION_RATE,
      collectionRateSource: (row?.collectionRateSource as 'derived' | 'entered') ?? 'entered',
      collectionRateSuggestion: suggestion,
      reserveThreshold: row?.reserveThreshold == null ? null : Number(row.reserveThreshold),
      firstBillingDate: row?.firstBillingDate ? ISO(row.firstBillingDate) : null,
    }
  }

  async saveAssumptions(schoolId: string, userId: string, body: Record<string, unknown>) {
    const planMix = (body.planMix as PaymentPlanMix | undefined) ?? DEFAULT_PLAN_MIX
    const data = {
      planMix: planMix as never,
      collectionRate: Number(body.collectionRate ?? DEFAULT_COLLECTION_RATE),
      // The school says whether it accepted a suggestion or chose its own; the
      // server does not infer it. A derived rate presented as entered (or the
      // reverse) misstates who made the call.
      collectionRateSource: String(body.collectionRateSource ?? 'entered'),
      reserveThreshold:
        body.reserveThreshold == null ? null : Number(body.reserveThreshold),
      firstBillingDate: body.firstBillingDate ? new Date(String(body.firstBillingDate)) : null,
      updatedByUserId: userId,
    }
    await this.prisma.cashAssumptions.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    })
    return this.getAssumptions(schoolId)
  }

  /**
   * A collection rate suggested from the school's own receivable aging. Read-only
   * and fail-soft: no aging on file simply means no suggestion, never an error.
   */
  private async collectionSuggestion(schoolId: string) {
    try {
      const snap = await this.prisma.arApAgingSnapshot.findFirst({
        where: { schoolId },
        orderBy: { asOfDate: 'desc' },
      })
      if (!snap?.arBuckets) return null
      return deriveCollectionRate(snap.arBuckets as Record<string, number>)
    } catch (e) {
      this.log.warn(`collection suggestion failed for ${schoolId}: ${(e as Error).message}`)
      return null
    }
  }

  // ── Opening cash ───────────────────────────────────────────────────────────

  /**
   * The last stated opening balance, with the trial-balance figure beside it.
   *
   * `tbCash` comes from the most recent CashFlowSnapshot, which carries the
   * balance-sheet Bank total. It is shown, never substituted: the gap between it
   * and available operating cash is the point, not an error to be reconciled away.
   */
  async getOpening(schoolId: string, today: string): Promise<OpeningCashView> {
    const [run, snap] = await Promise.all([
      this.prisma.cashProjectionRun.findFirst({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cashFlowSnapshot.findFirst({
        where: { schoolId },
        orderBy: { updatedAt: 'desc' },
      }),
    ])
    const tbCash = snap?.openingCash == null ? null : Number(snap.openingCash)
    if (!run) {
      return { openingCash: null, asOfDate: null, source: null, tbCash, ageDays: null, stale: false }
    }
    const asOfDate = ISO(run.asOfDate)
    const ageDays = daysBetweenIso(asOfDate, today)
    return {
      openingCash: Number(run.openingCash),
      asOfDate,
      source: run.openingSource as 'keyed' | 'trial_balance',
      tbCash,
      ageDays,
      stale: ageDays != null && ageDays > STALE_OPENING_DAYS,
    }
  }

  // ── Data tier ──────────────────────────────────────────────────────────────

  /**
   * How good the inputs are. A limited-tier school must never render like a
   * high-tier one — the first time somebody acts on a number that looked more
   * certain than it was, the feature is finished.
   */
  private async dataTier(schoolId: string): Promise<{ tier: DataTier; reason: string }> {
    const [qbo, monthly, aging] = await Promise.all([
      this.prisma.qboConnection.findFirst({ where: { schoolId } }).catch(() => null),
      this.prisma.monthlySnapshot.count({ where: { schoolId } }).catch(() => 0),
      this.prisma.arApAgingSnapshot.count({ where: { schoolId } }).catch(() => 0),
    ])
    if (qbo && monthly > 0) {
      return {
        tier: 'high',
        reason: `QuickBooks is connected and ${monthly} month-end${monthly === 1 ? '' : 's'} are on file${aging > 0 ? ', with receivable aging' : ''}.`,
      }
    }
    if (monthly > 0) {
      return {
        tier: 'moderate',
        reason: `${monthly} month-end${monthly === 1 ? '' : 's'} are on file, but no accounting system is connected — timing within the month is modelled rather than observed.`,
      }
    }
    return {
      tier: 'limited',
      reason:
        'Only a keyed opening balance and your own commitments are on file. The shape of this forecast is your calendar, not your accounting.',
    }
  }

  // ── The projection ─────────────────────────────────────────────────────────

  async project(
    schoolId: string,
    userId: string | null,
    opts: {
      openingCash: number
      asOfDate: string
      openingSource?: 'keyed' | 'trial_balance'
      granularity?: Granularity
      horizonWeeks?: number
      persist?: boolean
    },
  ): Promise<ProjectionResponse> {
    const granularity: Granularity = opts.granularity ?? 'week'
    const horizonEnd =
      granularity === 'week'
        ? addDays(opts.asOfDate, 7 * (opts.horizonWeeks ?? 13))
        : addMonths(opts.asOfDate, 12)

    const [assumptions, commitments, tierInfo, tbCash] = await Promise.all([
      this.getAssumptions(schoolId),
      this.prisma.cashCommitment.findMany({ where: { schoolId, active: true } }),
      this.dataTier(schoolId),
      this.tbCash(schoolId),
    ])

    if (!horizonEnd) {
      return this.blocked(opts, assumptions, tierInfo, tbCash, 'That as-of date is not a valid date.')
    }

    const commitmentInputs: CashCommitmentInput[] = commitments.map((c) => ({
      id: c.id,
      label: c.label,
      category: c.category,
      direction: c.direction as 'in' | 'out',
      amount: Number(c.amount),
      confidence: c.confidence as ConfidenceClass,
      recurrence: c.recurrence as CashCommitmentInput['recurrence'],
      startDate: ISO(c.startDate),
      endDate: c.endDate ? ISO(c.endDate) : null,
      dayRule: Array.isArray(c.dayRule) ? (c.dayRule as number[]) : null,
    }))

    const omissions: { key: string; message: string }[] = []
    const tuition = await this.tuitionEvents(schoolId, assumptions, omissions)
    const budgeted = await this.budgetEvents(schoolId, commitmentInputs, omissions)
    const events: CashEvent[] = [
      ...expandCommitments(commitmentInputs, opts.asOfDate, horizonEnd),
      ...tuition,
      ...budgeted,
    ]
    if (commitmentInputs.length === 0) {
      omissions.push({
        key: 'no_commitments',
        message:
          'No commitments are recorded, so payroll, debt service and insurance are not in this forecast. Add them below — they are usually most of a school\u2019s outflow.',
      })
    }

    const annualExpense = await this.annualOperatingExpense(schoolId)

    const projection = projectCash({
      openingCash: opts.openingCash,
      asOfDate: opts.asOfDate,
      horizonEnd,
      events,
      granularity,
      reserveThreshold: assumptions.reserveThreshold,
      annualOperatingExpense: annualExpense,
    })

    // FROZEN ON CREATION. Nothing reads these yet — the forecast-vs-actual
    // comparison is a later phase — but back-testing cannot be added
    // retroactively: without a record of what was forecast when, there is nothing
    // for an actual to be compared against.
    if (opts.persist !== false) {
      try {
        await this.prisma.cashProjectionRun.create({
          data: {
            schoolId,
            asOfDate: new Date(opts.asOfDate),
            horizonEnd: new Date(horizonEnd),
            granularity,
            openingCash: opts.openingCash,
            openingSource: opts.openingSource ?? 'keyed',
            tbCashAtAsOf: tbCash,
            assumptions: assumptions as never,
            result: projection as never,
            dataTier: tierInfo.tier,
            createdByUserId: userId,
          },
        })
      } catch (e) {
        // A failed archive must never fail the forecast the user asked for.
        this.log.warn(`could not store projection run for ${schoolId}: ${(e as Error).message}`)
      }
    }

    return {
      projection,
      opening: {
        openingCash: opts.openingCash,
        asOfDate: opts.asOfDate,
        source: opts.openingSource ?? 'keyed',
        tbCash,
        ageDays: 0,
        stale: false,
      },
      dataTier: tierInfo.tier,
      dataTierReason: tierInfo.reason,
      disclaimer: CONFIDENCE_DISCLAIMER,
      committedShare: committedShare(projection),
      assumptions,
      blockedReason: null,
      omissions,
    }
  }

  private blocked(
    opts: { openingCash: number; asOfDate: string; openingSource?: 'keyed' | 'trial_balance' },
    assumptions: ProjectionResponse['assumptions'],
    tierInfo: { tier: DataTier; reason: string },
    tbCash: number | null,
    reason: string,
  ): ProjectionResponse {
    return {
      projection: null,
      opening: {
        openingCash: opts.openingCash,
        asOfDate: opts.asOfDate,
        source: opts.openingSource ?? 'keyed',
        tbCash,
        ageDays: null,
        stale: false,
      },
      dataTier: tierInfo.tier,
      dataTierReason: tierInfo.reason,
      disclaimer: CONFIDENCE_DISCLAIMER,
      committedShare: null,
      assumptions,
      blockedReason: reason,
      omissions: [],
    }
  }

  private async tbCash(schoolId: string): Promise<number | null> {
    const snap = await this.prisma.cashFlowSnapshot
      .findFirst({ where: { schoolId }, orderBy: { updatedAt: 'desc' } })
      .catch(() => null)
    return snap?.openingCash == null ? null : Number(snap.openingCash)
  }

  /** Tuition receipts from the enrollment the school already reports. */
  private async tuitionEvents(
    schoolId: string,
    assumptions: ProjectionResponse['assumptions'],
    omissions: { key: string; message: string }[],
  ): Promise<CashEvent[]> {
    const miss = (key: string, message: string) => {
      omissions.push({ key, message })
      return [] as CashEvent[]
    }
    if (!assumptions.firstBillingDate) {
      return miss(
        'tuition_no_billing_date',
        'Tuition is not in this forecast: no first billing date is set. Tuition is usually a school\u2019s largest receipt, so the low point below is deeper than reality until you set one.',
      )
    }
    const op = await this.prisma.periodOperationalData
      .findFirst({
        where: { fiscalPeriod: { schoolId } },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
        include: { fiscalPeriod: true },
      })
      .catch(() => null)
    const enrollment = op?.enrollment ?? null
    if (!enrollment || enrollment <= 0) {
      return miss(
        'tuition_no_enrollment',
        'Tuition is not in this forecast: no enrollment figure is on file for the latest period. The low point below is deeper than reality until one is.',
      )
    }

    const aid = op?.financialAidTotal == null ? 0 : Number(op.financialAidTotal)
    // Gross tuition per student is derived from the school's own aid and
    // enrollment where a rate is not separately recorded. Returning nothing beats
    // inventing a rate — an invented tuition line would dominate the forecast.
    const gross = await this.grossTuitionPerStudent(schoolId, enrollment, aid)
    if (gross == null) {
      return miss(
        'tuition_no_rate',
        'Tuition is not in this forecast: no tuition revenue figure is on file to derive a rate from. Import or enter a budget and it will be included \u2014 until then the low point below is deeper than reality.',
      )
    }

    return tuitionReceipts({
      enrollment,
      grossTuitionPerStudent: gross,
      financialAidTotal: aid,
      planMix: assumptions.planMix,
      collectionRate: assumptions.collectionRate,
      firstBillingDate: assumptions.firstBillingDate,
    })
  }

  private async grossTuitionPerStudent(
    schoolId: string,
    enrollment: number,
    aid: number,
  ): Promise<number | null> {
    const budget = await this.prisma.periodBudget
      .findFirst({
        where: { fiscalPeriod: { schoolId } },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
      })
      .catch(() => null)
    const lines = (budget?.lines ?? null) as { revenue?: Record<string, number> } | null
    const tuition = lines?.revenue?.tuition
    if (!Number.isFinite(tuition) || !(tuition as number > 0)) return null
    return ((tuition as number) + aid) / enrollment
  }

  /**
   * Budget spread phasing, MINUS every category a commitment already covers.
   *
   * The exclusion is the important half. A school with payroll recorded as a
   * commitment and salaries still in the spread would have its payroll counted
   * twice and its trough drawn twice as deep as the truth — worse than no
   * forecast, because it looks authoritative.
   */
  private async budgetEvents(
    schoolId: string,
    commitments: readonly CashCommitmentInput[],
    omissions: { key: string; message: string }[],
  ): Promise<CashEvent[]> {
    const budget = await this.prisma.periodBudget
      .findFirst({
        where: { fiscalPeriod: { schoolId } },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
      })
      .catch(() => null)
    const lines = (budget?.lines ?? null) as {
      spread?: { accounts?: SpreadAccountLike[]; fiscalYearStart?: string }
    } | null
    const spread = lines?.spread
    if (!spread?.accounts?.length || !spread.fiscalYearStart) {
      omissions.push({
        key: 'no_budget_spread',
        message:
          'Only your recorded commitments are in this forecast \u2014 no monthly budget phasing is on file, so day-to-day operating spend and receipts are missing from it.',
      })
      return []
    }

    const excludeCategories = [...new Set(commitments.map((c) => c.category))]
    // Tuition is always excluded from spread revenue: the driver produces it, and
    // counting a school's largest receipt twice is the same error in the other
    // direction.
    const input = {
      accounts: spread.accounts,
      fiscalYearStart: spread.fiscalYearStart,
    }
    return [
      ...spreadDisbursements({ ...input, excludeCategories }),
      ...spreadReceipts({ ...input, excludeCategories: [...excludeCategories, 'tuition'] }),
    ]
  }

  /** Annual operating expense — the months-of-cash denominator. Null when unknown. */
  private async annualOperatingExpense(schoolId: string): Promise<number | null> {
    const budget = await this.prisma.periodBudget
      .findFirst({
        where: { fiscalPeriod: { schoolId } },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
      })
      .catch(() => null)
    const total = budget?.totalExpenses == null ? null : Number(budget.totalExpenses)
    return total != null && total > 0 ? total : null
  }
}

/** Local ISO day difference — the service may use the clock; the engine may not. */
function daysBetweenIso(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  return Math.round((tb - ta) / 86_400_000)
}

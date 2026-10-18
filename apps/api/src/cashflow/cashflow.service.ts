import { BadRequestException, Injectable, Logger } from '@nestjs/common'
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
  parseFiscalYearStart,
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
import { QboEventsService } from './qbo-events.service.js'
import {
  benefitsLeftBesidePayroll,
  coveredCategories,
  coveredSet,
  isCoveredExpense,
  isNonCashExpense,
  NON_CASH_CATEGORIES,
  PAYROLL_BENEFITS_NOTE,
} from './covered-categories.js'

/**
 * The spread's LAST month key ('YYYY-MM'): the first month plus the longest
 * month column any row carries (or the stored monthKeys, when longer). Null when
 * the start is unreadable or no row has a month column.
 */
function spreadLastMonth(
  fiscalYearStart: string,
  accounts: readonly SpreadAccountLike[],
  monthKeys: readonly string[] | undefined,
): string | null {
  const start = parseFiscalYearStart(fiscalYearStart)
  if (!start) return null
  let n = Array.isArray(monthKeys) ? monthKeys.length : 0
  for (const row of accounts) {
    if (Array.isArray(row?.months)) n = Math.max(n, row.months.length)
  }
  if (n === 0) return null
  const total = start.y * 12 + (start.m - 1) + (n - 1)
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
/** The 'YYYY-MM' key of a spread start in either stored shape. */
function monthKeyOf(fiscalYearStart: string): string | null {
  const start = parseFiscalYearStart(fiscalYearStart)
  return start ? `${start.y}-${String(start.m).padStart(2, '0')}` : null
}

/** '2027-06' → '2027-06-30'. */
function lastDayOfMonthKey(key: string): string {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate()
  return `${key}-${String(d).padStart(2, '0')}`
}

/** '2027-06' → 'June 2027'. */
function monthLabel(key: string): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

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
  source: 'keyed' | 'trial_balance' | 'quickbooks' | null
  /** The trial-balance cash total, for the cross-check. Null when none is on file. */
  tbCash: number | null
  /** Days since the balance was stated. Null when never stated. */
  ageDays: number | null
  stale: boolean
}

/** Where a flow's figures came from — which source family produced its events. */
export type FlowOrigin =
  | 'commitment'
  | 'tuition_driver'
  | 'budget'
  | 'qbo_ar'
  | 'qbo_ap'
  | 'qbo_history'

/**
 * ONE LINE OF THE FORECAST, grouped by provenance key — the unit a reader can
 * point at and say "that's wrong". Raw events are the engine's atoms (hundreds
 * over a year); flows are the ten-to-forty rows a person actually reasons
 * about: "payroll", "the Jones invoice", "cafeteria from history".
 */
export interface FlowRow {
  /** The engine's provenance key — the adjustment handle. */
  sourceRef: string
  origin: FlowOrigin
  /**
   * How true the figures are:
   *   observed — a real invoice or bill in QuickBooks (qbo_ar / qbo_ap)
   *   derived  — modelled from the school's own history, budget or driver
   *   assumed  — the school's own entry (a commitment)
   */
  provenance: 'observed' | 'derived' | 'assumed'
  label: string
  category: string
  direction: 'in' | 'out'
  confidence: ConfidenceClass
  eventCount: number
  /** What the sources derived for this line, before any adjustment. */
  derivedTotal: number
  /** Signed net cash effect (in − out) — ±derivedTotal for single-direction
   *  groups; the honest override target for mixed seasonal groups. */
  derivedNet: number
  /** What actually entered the projection. Equals derivedTotal when untouched. */
  appliedTotal: number
  /** ISO dates of the group's first and last events. */
  firstDate: string
  lastDate: string
  /**
   * How this line is changed: 'direct' = edit the commitment itself
   * (commitments have their own editor); 'adjustable' = via a line adjustment.
   */
  editable: 'direct' | 'adjustable'
  /** The commitment behind a direct line, for the editor to open. */
  commitmentId: string | null
  /** The active adjustment on this line, when one applied. */
  adjustment: PublicAdjustment | null
}

export interface PublicAdjustment {
  id: string
  sourceRef: string
  kind: 'exclude' | 'override'
  overrideAmount: number | null
  note: string | null
}

/** A stored adjustment row, as composition consumes it. */
interface AdjustmentRow {
  id: string
  sourceRef: string
  kind: string
  overrideAmount: unknown
  note: string | null
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
   * WHERE THE EVENTS CAME FROM — per-origin counts and totals, so the screen
   * can say which parts of a forecast are the school's own entries, which are
   * its budget, and which are live from QuickBooks. Provenance is the price of
   * a zero-entry forecast being trusted: a number nobody can attribute is a
   * number nobody schedules payroll around.
   */
  sources: Record<string, { count: number; total: number }>
  /** The QuickBooks opening-balance OFFER, when the school is connected. */
  qboOpeningCash: { amount: number; asOf: string; source: 'live' | 'snapshot' } | null
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
  /**
   * THE FORECAST'S LINES, grouped by provenance key — what a reader edits.
   * Built from the PRE-adjustment event list so an excluded line stays visible
   * at appliedTotal 0 rather than vanishing (a line that disappears cannot be
   * un-excluded). Empty when the projection is blocked.
   */
  flows: FlowRow[]
  /** True when the flows list was capped (largest + all adjusted lines kept). */
  flowsTruncated: boolean
}

const ISO = (d: Date): string => d.toISOString().slice(0, 10)

@Injectable()
export class CashFlowService {
  private readonly log = new Logger(CashFlowService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly qboEvents: QboEventsService,
  ) {}

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

  // ── Line adjustments ───────────────────────────────────────────────────────
  //
  // The school's tunings of its DERIVED lines — exclude a modelled flow that is
  // wrong, or override a group's total. The source data (QuickBooks, budget,
  // driver) is never mutated; adjustments are applied at assembly time in
  // project(), so clearing one restores the derived line exactly.

  async listAdjustments(schoolId: string) {
    const rows = await this.prisma.cashFlowLineAdjustment.findMany({
      where: { schoolId, active: true },
      orderBy: { sourceRef: 'asc' },
    })
    return { adjustments: rows.map((r) => this.publicAdjustment(r)) }
  }

  /** Upsert by (school, sourceRef) — one adjustment per line, latest wins. */
  async saveAdjustment(schoolId: string, userId: string, body: Record<string, unknown>) {
    const sourceRef = String(body.sourceRef)
    const kind = String(body.kind) as 'exclude' | 'override'
    const overrideAmount = body.overrideAmount == null ? null : Number(body.overrideAmount)
    // The iff the DTO cannot express. An override with no amount has nothing to
    // apply; an exclude WITH an amount is a caller confused about which of the
    // two it asked for — both fail loudly rather than being half-honored.
    if (kind === 'override' && overrideAmount == null) {
      throw new BadRequestException('overrideAmount is required when kind is "override".')
    }
    if (kind === 'exclude' && overrideAmount != null) {
      throw new BadRequestException('overrideAmount only applies when kind is "override".')
    }
    const row = await this.prisma.cashFlowLineAdjustment.upsert({
      where: { schoolId_sourceRef: { schoolId, sourceRef } },
      create: {
        schoolId,
        sourceRef,
        kind,
        overrideAmount,
        note: body.note ? String(body.note) : null,
        active: true,
        createdByUserId: userId,
      },
      update: {
        kind,
        overrideAmount,
        note: body.note ? String(body.note) : null,
        // Re-saving a cleared adjustment revives the same row — the (school,
        // sourceRef) unique means a soft-deleted row would otherwise block the
        // line from ever being adjusted again.
        active: true,
      },
    })
    return this.publicAdjustment(row)
  }

  /** Soft delete — frozen runs reference applied adjustments by id. */
  async removeAdjustment(schoolId: string, adjustmentId: string) {
    // Tenant-scoped like commitment removal: a foreign id removes nothing.
    const { count } = await this.prisma.cashFlowLineAdjustment.updateMany({
      where: { id: adjustmentId, schoolId },
      data: { active: false },
    })
    return { removed: count }
  }

  private publicAdjustment(r: AdjustmentRow): PublicAdjustment {
    return {
      id: r.id,
      sourceRef: r.sourceRef,
      kind: r.kind as 'exclude' | 'override',
      overrideAmount: r.overrideAmount == null ? null : Number(r.overrideAmount),
      note: r.note,
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
      source: run.openingSource as 'keyed' | 'trial_balance' | 'quickbooks',
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
      openingSource?: 'keyed' | 'trial_balance' | 'quickbooks'
      granularity?: Granularity
      horizon?: '13w' | '1m' | '3m' | '6m' | '12m'
      horizonWeeks?: number
      useQuickBooks?: boolean
      persist?: boolean
    },
  ): Promise<ProjectionResponse> {
    // Preset → window + grain. Weekly while the window reads week by week,
    // monthly beyond; an explicit granularity overrides the preset's grain.
    const preset = opts.horizon ?? null
    const presetGranularity: Granularity =
      preset === '6m' || preset === '12m' ? 'month' : 'week'
    const granularity: Granularity = opts.granularity ?? (preset ? presetGranularity : 'week')
    // Ends are INCLUSIVE, so a preset's window stops the day BEFORE the next
    // period begins — six months from July 1st ends December 31st, not on a
    // January 1st that drags a seventh month into the grid.
    const monthsEnd = (n: number) => {
      const next = addMonths(opts.asOfDate, n)
      return next ? addDays(next, -1) : null
    }
    const horizonEnd = preset
      ? preset === '13w'
        ? addDays(opts.asOfDate, 7 * 13 - 1)
        : monthsEnd(preset === '1m' ? 1 : preset === '3m' ? 3 : preset === '6m' ? 6 : 12)
      : granularity === 'week'
        ? addDays(opts.asOfDate, 7 * (opts.horizonWeeks ?? 13))
        : addMonths(opts.asOfDate, 12)

    const [assumptions, commitments, tierInfo, tbCash, adjustmentRows] = await Promise.all([
      this.getAssumptions(schoolId),
      this.prisma.cashCommitment.findMany({ where: { schoolId, active: true } }),
      this.dataTier(schoolId),
      this.tbCash(schoolId),
      this.prisma.cashFlowLineAdjustment.findMany({ where: { schoolId, active: true } }),
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

    // ── The QuickBooks source, blended MANUAL-WINS ──────────────────────────
    // A connected school gets a forecast with zero entry: open invoices and
    // bills as dated near-term events, and a seasonal year modelled from its
    // own monthly P&L history. Anything the school entered by hand suppresses
    // the derived version of that same category — a business manager's payroll
    // calendar beats an average of last year's payroll, every time.
    const manualCategories = coveredCategories(commitmentInputs.map((c) => c.category))
    const qbo =
      opts.useQuickBooks === false
        ? null
        : await this.qboEvents
            .eventsFor(schoolId, {
              asOfDate: opts.asOfDate,
              horizonEnd,
              collectionRate: assumptions.collectionRate,
              excludeCategories: manualCategories,
              tuitionDriverActive: tuition.length > 0,
            })
            .catch(() => null)
    if (qbo) omissions.push(...qbo.omissions)

    // Budget spread is the phasing source only where QBO history is absent —
    // both derive "the shape of the year" and stacking them doubles it.
    const qboHistoryActive = (qbo?.sources.qbo_history.count ?? 0) > 0
    const budgeted = qboHistoryActive
      ? []
      : await this.budgetEvents(schoolId, commitmentInputs, omissions, {
          asOfDate: opts.asOfDate,
          horizonEnd,
        })

    const commitmentEvents = expandCommitments(commitmentInputs, opts.asOfDate, horizonEnd)
    const assembled: CashEvent[] = [
      ...commitmentEvents,
      ...tuition,
      ...budgeted,
      ...(qbo?.events ?? []),
    ]

    // ── The school's line adjustments, applied at assembly time ─────────────
    // AFTER every source has contributed (and after manual-wins suppression,
    // which happened inside the sources above — an adjustment can never
    // resurrect a suppressed line), BEFORE anything is summed or projected: the
    // engine and every figure downstream see only the adjusted events, so the
    // chart, the workbook and the flows list cannot disagree about what a line
    // contributes. An adjustment whose ref matches nothing is silently inert —
    // a settled invoice or a renumbered budget row is not an error.
    // Compose over the engine's admission window only (events strictly after the
    // as-of date): month-end history outflows and same-day commitments CAN land
    // exactly ON the as-of date, and projectCash drops those — composing over the
    // raw list would overstate flows totals, breaking "exclude moves the ending
    // balance by exactly derivedTotal" (review finding, as-of on a month end).
    const inWindow = assembled.filter((e) => e.date > opts.asOfDate)
    const { events, flows, flowsTruncated, applied, adjustmentNet } = this.composeFlows(inWindow, adjustmentRows)

    const sum = (evs: readonly CashEvent[]) => evs.reduce((t, e) => t + Math.abs(e.amount), 0)
    const sources: Record<string, { count: number; total: number }> = {
      commitments: { count: commitmentEvents.length, total: sum(commitmentEvents) },
      tuition_driver: { count: tuition.length, total: sum(tuition) },
      budget: { count: budgeted.length, total: sum(budgeted) },
      qbo_ar: qbo?.sources.qbo_ar ?? { count: 0, total: 0 },
      qbo_ap: qbo?.sources.qbo_ap ?? { count: 0, total: 0 },
      qbo_history: qbo?.sources.qbo_history ?? { count: 0, total: 0 },
      // The adjustments' own provenance entry: how many lines the school tuned
      // and the NET effect on cash across the horizon (signed — excluding an
      // outflow raises it, excluding a receipt lowers it).
      adjustments: { count: applied.length, total: adjustmentNet },
    }

    // "No commitments" stops being an omission when QuickBooks carries the
    // forecast — for a connected school an empty commitment list is the happy
    // path, and warning about it would teach the reader to ignore the band.
    if (commitmentInputs.length === 0 && !(qbo && qbo.connected && qbo.events.length > 0)) {
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
            // The adjustments that ACTUALLY APPLIED, copied in like the
            // assumptions: the school can edit or clear an adjustment later
            // and this run must still explain why its numbers differ from
            // what the sources derived. Omitted (null) when none applied.
            ...(applied.length > 0 ? { adjustments: applied as never } : {}),
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

    const qboOpeningCash =
      qbo?.connected === true
        ? await this.qboEvents.openingCashOffer(schoolId, opts.asOfDate).catch(() => null)
        : null

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
      dataTier: qbo?.connected && qbo.events.length > 0 ? 'high' : tierInfo.tier,
      dataTierReason:
        qbo?.connected && qbo.events.length > 0
          ? `Live from QuickBooks: ${sources.qbo_ar.count} open invoice${sources.qbo_ar.count === 1 ? '' : 's'}, ${sources.qbo_ap.count} bill${sources.qbo_ap.count === 1 ? '' : 's'}, ${sources.qbo_history.count > 0 ? 'and a seasonal year modelled from your monthly history' : 'plus your recorded inputs'}.`
          : tierInfo.reason,
      disclaimer: CONFIDENCE_DISCLAIMER,
      committedShare: committedShare(projection),
      assumptions,
      blockedReason: null,
      sources,
      qboOpeningCash,
      omissions,
      flows,
      flowsTruncated,
    }
  }

  private blocked(
    opts: { openingCash: number; asOfDate: string; openingSource?: 'keyed' | 'trial_balance' | 'quickbooks' },
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
      sources: {},
      qboOpeningCash: null,
      omissions: [],
      flows: [],
      flowsTruncated: false,
    }
  }

  /**
   * Group the assembled events by sourceRef, apply the school's adjustments,
   * and describe every line — ONE pass so the flows list, the adjusted event
   * set and the frozen "what applied" record can never disagree.
   *
   * exclude  → the group's events are dropped; the flow row stays, at
   *            appliedTotal 0, so the line remains visible and un-excludable.
   * override → every event in the group scales by overrideAmount/derivedTotal,
   *            preserving the group's timing shape while retotalling it. A
   *            group that derived zero cannot be scaled and the adjustment is
   *            inert (there is nothing honest to distribute the amount over).
   *
   * Adjustments matching no group — or targeting commitment:* refs, which the
   * DTO rejects but old rows might hold — are silently inert.
   */
  private composeFlows(
    assembled: readonly CashEvent[],
    adjustmentRows: readonly AdjustmentRow[],
  ): {
    events: CashEvent[]
    flows: FlowRow[]
    /** True when the flows list was capped (largest lines + all adjusted kept). */
    flowsTruncated: boolean
    applied: (PublicAdjustment & { derivedTotal: number; appliedTotal: number })[]
    adjustmentNet: number
  } {
    const groups = new Map<string, CashEvent[]>()
    for (const e of assembled) {
      const group = groups.get(e.sourceRef)
      if (group) group.push(e)
      else groups.set(e.sourceRef, [e])
    }
    const adjBySource = new Map<string, AdjustmentRow>()
    for (const row of adjustmentRows) {
      if (row.sourceRef.startsWith('commitment:')) continue
      adjBySource.set(row.sourceRef, row)
    }

    const signed = (evs: readonly CashEvent[]) =>
      evs.reduce((t, e) => t + (e.direction === 'in' ? e.amount : -e.amount), 0)

    const events: CashEvent[] = []
    const flows: FlowRow[] = []
    const applied: (PublicAdjustment & { derivedTotal: number; appliedTotal: number })[] = []
    let adjustmentNet = 0

    for (const [sourceRef, group] of groups) {
      const derivedTotal = group.reduce((t, e) => t + Math.abs(e.amount), 0)
      const adj = adjBySource.get(sourceRef) ?? null

      let kept: readonly CashEvent[] = group
      let appliedTotal = derivedTotal
      let didApply = false
      if (adj?.kind === 'exclude') {
        kept = []
        appliedTotal = 0
        didApply = true
      } else if (adj?.kind === 'override') {
        const target = adj.overrideAmount == null ? null : Number(adj.overrideAmount)
        if (target != null && Number.isFinite(target) && target >= 0 && derivedTotal > 0) {
          const scale = target / derivedTotal
          kept = group.map((e) => ({ ...e, amount: e.amount * scale }))
          appliedTotal = target
          didApply = true
        }
      }
      if (didApply && adj) {
        adjustmentNet += signed(kept) - signed(group)
        applied.push({ ...this.publicAdjustment(adj), derivedTotal, appliedTotal })
      }
      events.push(...kept)

      // The row describes the PRE-adjustment group: an excluded line keeps its
      // label, dates and derived figure — what changed is appliedTotal.
      const inTotal = group.reduce(
        (t, e) => t + (e.direction === 'in' ? Math.abs(e.amount) : 0),
        0,
      )
      let firstDate = group[0].date
      let lastDate = group[0].date
      for (const e of group) {
        if (e.date < firstDate) firstDate = e.date
        if (e.date > lastDate) lastDate = e.date
      }
      const origin = originOf(sourceRef)
      flows.push({
        sourceRef,
        origin,
        provenance:
          origin === 'qbo_ar' || origin === 'qbo_ap'
            ? 'observed'
            : origin === 'commitment'
              ? 'assumed'
              : 'derived',
        label: group[0].label,
        category: group[0].category,
        // A group is single-direction in practice; a mixed one (a seasonal
        // category that flips sign across months) reads as its dominant side.
        direction: inTotal * 2 >= derivedTotal ? 'in' : 'out',
        confidence: group[0].confidence,
        eventCount: group.length,
        derivedTotal,
        // Signed net cash effect (in − out). For single-direction groups this
        // equals ±derivedTotal; for mixed seasonal groups it is the honest
        // number an override caller must read (review finding: overriding a
        // mixed group's |Σ| total misstates the cash effect).
        derivedNet: inTotal - (derivedTotal - inTotal),
        appliedTotal,
        firstDate,
        lastDate,
        editable: origin === 'commitment' ? 'direct' : 'adjustable',
        commitmentId: origin === 'commitment' ? sourceRef.slice('commitment:'.length) : null,
        adjustment: didApply && adj ? this.publicAdjustment(adj) : null,
      })
    }

    // Largest lines first — the order a reader scans a forecast in.
    flows.sort((a, b) => b.derivedTotal - a.derivedTotal)
    // Cap the payload for pathological rosters (hundreds of open AR invoices):
    // keep the largest 200 lines PLUS any adjusted line (an exclusion must stay
    // visible to be un-excludable), and say so rather than truncating silently.
    const FLOWS_CAP = 200
    let flowsTruncated = false
    let cappedFlows = flows
    if (flows.length > FLOWS_CAP) {
      const kept = new Set(flows.slice(0, FLOWS_CAP))
      for (const f of flows) if (f.adjustment) kept.add(f)
      cappedFlows = flows.filter((f) => kept.has(f))
      flowsTruncated = cappedFlows.length < flows.length
    }
    return { events, flows: cappedFlows, flowsTruncated, applied, adjustmentNet }
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
    window: { asOfDate: string; horizonEnd: string },
  ): Promise<CashEvent[]> {
    const budget = await this.prisma.periodBudget
      .findFirst({
        where: { fiscalPeriod: { schoolId } },
        orderBy: { fiscalPeriod: { periodEndDate: 'desc' } },
      })
      .catch(() => null)
    const lines = (budget?.lines ?? null) as {
      spread?: { accounts?: SpreadAccountLike[]; fiscalYearStart?: string | null; monthKeys?: string[] }
    } | null
    const spread = lines?.spread
    // An imported spread stores its first month as a 'YYYY-MM' key (and the
    // same key leads monthKeys); the phasing helper reads that shape directly.
    const fiscalYearStart =
      parseFiscalYearStart(spread?.fiscalYearStart) != null
        ? spread!.fiscalYearStart!
        : parseFiscalYearStart(spread?.monthKeys?.[0]) != null
          ? spread!.monthKeys![0]
          : null
    if (!spread?.accounts?.length || !fiscalYearStart) {
      omissions.push({
        key: 'no_budget_spread',
        message:
          'Only your recorded commitments are in this forecast \u2014 no monthly budget phasing is on file, so day-to-day operating spend and receipts are missing from it.',
      })
      return []
    }

    // Every category a commitment already covers (crosswalked into the spread's
    // SCoA vocabulary — 'payroll' covers the salary lines), plus the non-cash
    // lines: depreciation is budgeted but never paid.
    const excludeCategories = [
      ...coveredCategories(commitments.map((c) => c.category)),
      ...NON_CASH_CATEGORIES,
    ]
    // …and the same two rules LINE by line, because a spread row's category is
    // fixed at import: a chart that filed "Depreciation" or "Payroll Taxes" under
    // fixedOther stores them that way forever, and the category rule alone
    // phases depreciation as cash and pays the payroll taxes twice.
    const covered = coveredSet(commitments.map((c) => c.category))
    const accounts = spread.accounts.filter(
      (row) =>
        !row ||
        row.section !== 'expense' ||
        !(isNonCashExpense(row) || isCoveredExpense(row, covered)),
    )
    if (
      benefitsLeftBesidePayroll(
        accounts.filter((r) => r?.section === 'expense' && r.includedInTotals !== false),
        covered,
      )
    ) {
      omissions.push({ ...PAYROLL_BENEFITS_NOTE })
    }
    // Tuition is always excluded from spread revenue: the driver produces it, and
    // counting a school's largest receipt twice is the same error in the other
    // direction.
    const input = {
      accounts,
      fiscalYearStart,
    }
    const events = [
      ...spreadDisbursements({ ...input, excludeCategories }),
      ...spreadReceipts({ ...input, excludeCategories: [...excludeCategories, 'tuition'] }),
    ]

    // A spread on file is not phasing IN THE WINDOW. The latest budget can be a
    // year that has already ended (every event before the as-of date, all of
    // them dropped by the projection), or a year that ends before the horizon
    // does. Either way part of the forecast runs without operating spend and
    // receipts, and it must say so rather than claim phasing it does not have.
    const lastMonth = spreadLastMonth(fiscalYearStart, spread.accounts, spread.monthKeys)
    const firstMonth = monthKeyOf(fiscalYearStart)
    if (lastMonth && firstMonth) {
      const asOfMonth = window.asOfDate.slice(0, 7)
      const lastDay = lastDayOfMonthKey(lastMonth)
      if (lastDay <= window.asOfDate || firstMonth > window.horizonEnd.slice(0, 7)) {
        omissions.push({
          key: 'budget_spread_out_of_window',
          message: `Your latest monthly budget runs ${monthLabel(firstMonth)} to ${monthLabel(lastMonth)}, outside this forecast \u2014 so day-to-day operating spend and receipts are missing from it. Import the budget for these months to phase them in.`,
        })
      } else {
        if (firstMonth > asOfMonth) {
          omissions.push({
            key: 'budget_spread_starts_late',
            message: `Budget phasing starts ${monthLabel(firstMonth)} \u2014 before that, day-to-day operating spend and receipts are missing from this forecast.`,
          })
        }
        if (lastDay < window.horizonEnd) {
          omissions.push({
            key: 'budget_spread_ends',
            message: `Budget phasing ends ${monthLabel(lastMonth)} \u2014 after that, day-to-day operating spend and receipts are missing from this forecast. Import next year\u2019s budget to carry them through.`,
          })
        }
      }
    }
    return events
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

/** Which source family a provenance key belongs to. */
function originOf(sourceRef: string): FlowOrigin {
  if (sourceRef.startsWith('commitment:')) return 'commitment'
  if (sourceRef.startsWith('driver:')) return 'tuition_driver'
  if (sourceRef.startsWith('budget:')) return 'budget'
  if (sourceRef.startsWith('qbo:ar:')) return 'qbo_ar'
  if (sourceRef.startsWith('qbo:ap:')) return 'qbo_ap'
  return 'qbo_history'
}

/** Local ISO day difference — the service may use the clock; the engine may not. */
function daysBetweenIso(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  return Math.round((tb - ta) / 86_400_000)
}

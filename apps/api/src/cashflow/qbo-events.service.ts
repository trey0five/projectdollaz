import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { addDays, addMonths } from '@finrep/analytics'
import type { CashEvent } from '@finrep/analytics'
import { QboAgingService } from '../integrations/qbo-aging.service.js'
import { QboService } from '../integrations/qbo.service.js'
import { QboClient } from '../integrations/qbo.client.js'
import {
  flattenRows,
  matchMonthColumns,
  type QboSummarizedReport,
} from '../integrations/qbo-company.synth.js'
import { suggestCategory } from '../integrations/qbo-review.suggest.js'
import {
  benefitsLeftBesidePayroll,
  isCoveredExpense,
  isNonCashExpense,
  PAYROLL_BENEFITS_NOTE,
} from './covered-categories.js'
import { parseBalanceSheetCash } from '../integrations/qbo-cashflow.js'
import { PrismaService } from '../prisma/prisma.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// The QuickBooks EVENT SOURCE for the cash forecast — dated events, no manual
// entry.
//
// Three families, all deterministic (the engine's discipline is untouched —
// QBO is a new source of dated events, never a new kind of arithmetic):
//
//   AR   open invoices → receipt events. A due date on an invoice IS a dated
//        cash event; the only estimated part is whether it arrives, which is
//        the school's collection rate — the same single estimated input the
//        tuition driver isolates.
//   AP   open bills → disbursement events at their due dates, full amount. A
//        bill is an obligation the school has already accepted: 'committed'.
//   HIST trailing-12-month monthly P&L → a per-category seasonal profile,
//        projected forward one year as month-end 'modelled' events. This is
//        Layer 2 of the advisor design ("recurring receipts modelled from
//        history — a seasonal index per entity"), built from the school's own
//        books rather than a guess.
//
// LAZY ModuleRef RESOLUTION, deliberately. QboService / QboAgingService as
// constructor paramtypes boot-crash under ESM (the import graph resolves a
// partially-initialised module) — the aging service documents this at length
// and every QBO consumer in this repo follows it. Copy the discipline, not the
// temptation to "clean it up".
//
// NEVER THROWS. A school without QuickBooks, an expired token, or a QBO outage
// all yield empty results — the forecast proceeds on its other sources and the
// omissions system says what was missing. A cash forecast that 500s because a
// third party had a bad morning is a forecast nobody schedules their payroll
// around.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overdue invoices get this many days from the as-of date. A STATED assumption,
 * surfaced in the UI, not a hidden one: an invoice already past due has no
 * honest date, and "two weeks from now" is a conservative, explainable default
 * a business manager can reason about.
 */
export const OVERDUE_COLLECTION_DAYS = 14

/**
 * Open-AR/AP events own this many days from the as-of date; modelled history
 * stays out of the window. The invoices ARE the near-term truth — layering the
 * historical average of receipts on top of the actual receivables due in the
 * same weeks would count the same cash twice.
 */
export const AR_AP_WINDOW_DAYS = 45

/** Below this many usable months, seasonal history is refused (+ an omission). */
export const MIN_HISTORY_MONTHS = 6

export interface QboEventsResult {
  events: CashEvent[]
  /** Per-family totals, for the provenance panel. */
  sources: {
    qbo_ar: { count: number; total: number }
    qbo_ap: { count: number; total: number }
    qbo_history: { count: number; total: number }
  }
  omissions: { key: string; message: string }[]
  connected: boolean
}

const EMPTY: QboEventsResult = {
  events: [],
  sources: {
    qbo_ar: { count: 0, total: 0 },
    qbo_ap: { count: 0, total: 0 },
    qbo_history: { count: 0, total: 0 },
  },
  omissions: [],
  connected: false,
}

@Injectable()
export class QboEventsService {
  private readonly log = new Logger(QboEventsService.name)

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    private readonly qboClient: QboClient,
  ) {}

  private aging(): QboAgingService {
    return this.moduleRef.get(QboAgingService, { strict: false })
  }

  private qbo(): QboService {
    return this.moduleRef.get(QboService, { strict: false })
  }

  /**
   * The one-click opening balance OFFER — the live balance-sheet Bank total,
   * falling back to the last persisted snapshot. An offer, never a
   * substitution: v1 proved red that the keyed balance is what the school said
   * is AVAILABLE, and the bank total routinely includes restricted funds.
   */
  async openingCashOffer(
    schoolId: string,
    asOfDate: string,
  ): Promise<{ amount: number; asOf: string; source: 'live' | 'snapshot' } | null> {
    try {
      const connection = await this.qbo().connectionForSchool(schoolId)
      if (connection) {
        const { conn, token } = connection
        const raw = await this.qboClient.getBalanceSheet(
          conn.realmId,
          token,
          asOfDate,
          asOfDate,
        )
        const cash = parseBalanceSheetCash(raw)
        if (cash != null) return { amount: cash, asOf: asOfDate, source: 'live' }
      }
    } catch (e) {
      this.log.warn(`live QBO balance unavailable for ${schoolId}: ${(e as Error).message}`)
    }
    const snap = await this.prisma.cashFlowSnapshot
      .findFirst({ where: { schoolId }, orderBy: { updatedAt: 'desc' } })
      .catch(() => null)
    if (snap?.openingCash == null) return null
    return {
      amount: Number(snap.openingCash),
      asOf: snap.updatedAt.toISOString().slice(0, 10),
      source: 'snapshot',
    }
  }

  /**
   * The full event set QuickBooks can contribute for [asOfDate, horizonEnd].
   *
   * @param excludeCategories categories a MANUAL commitment already covers —
   *        manual wins, so QBO history for those categories is suppressed.
   * @param tuitionDriverActive suppresses 'tuition' from history — the driver
   *        owns it, and history on top would double the school's largest receipt.
   * @param collectionRate applied to AR receipts and NEVER to AP — a bill is
   *        owed in full; an invoice is collected at the school's real rate.
   */
  async eventsFor(
    schoolId: string,
    opts: {
      asOfDate: string
      horizonEnd: string
      collectionRate: number
      excludeCategories: readonly string[]
      tuitionDriverActive: boolean
    },
  ): Promise<QboEventsResult> {
    const connection = await this.qbo()
      .connectionForSchool(schoolId)
      .catch(() => null)
    if (!connection) return EMPTY

    const result: QboEventsResult = {
      ...EMPTY,
      connected: true,
      events: [],
      sources: {
        qbo_ar: { count: 0, total: 0 },
        qbo_ap: { count: 0, total: 0 },
        qbo_history: { count: 0, total: 0 },
      },
      omissions: [],
    }

    const [arap, history] = await Promise.all([
      this.arApEvents(schoolId, opts),
      this.historyEvents(schoolId, connection, opts),
    ])
    result.events.push(...arap.events, ...history.events)
    result.sources.qbo_ar = arap.ar
    result.sources.qbo_ap = arap.ap
    result.sources.qbo_history = history.source
    result.omissions.push(...history.omissions)
    return result
  }

  // ── AR / AP — the near-term truth ──────────────────────────────────────────

  private async arApEvents(
    schoolId: string,
    opts: { asOfDate: string; horizonEnd: string; collectionRate: number },
  ): Promise<{
    events: CashEvent[]
    ar: { count: number; total: number }
    ap: { count: number; total: number }
  }> {
    const items = await this.aging()
      .getItems(schoolId)
      .catch(() => null)
    const out: CashEvent[] = []
    const ar = { count: 0, total: 0 }
    const ap = { count: 0, total: 0 }
    if (!items) return { events: out, ar, ap }

    const overdueDate = addDays(opts.asOfDate, OVERDUE_COLLECTION_DAYS)
    const rate =
      Number.isFinite(opts.collectionRate) && opts.collectionRate > 0
        ? Math.min(1, opts.collectionRate)
        : 1

    for (const inv of items.ar) {
      const open = Math.abs(inv.amount)
      if (!(open > 0)) continue
      // Future due date → that date. Overdue → the stated two-week assumption.
      const date =
        inv.dueDate && inv.dueDate > opts.asOfDate ? inv.dueDate : overdueDate
      if (!date || date > opts.horizonEnd) continue
      const amount = open * rate
      out.push({
        date,
        amount,
        direction: 'in',
        label: `Collection — ${inv.party || 'billed invoice'}`,
        category: 'receivables',
        // The DATE is the invoice's own; the AMOUNT rests on the collection
        // rate. That is the definition of 'scheduled'.
        confidence: 'scheduled',
        sourceRef: `qbo:ar:${inv.docNumber ?? inv.txnId ?? 'invoice'}`,
      })
      ar.count += 1
      ar.total += amount
    }

    for (const bill of items.ap) {
      const open = Math.abs(bill.amount)
      if (!(open > 0)) continue
      const date =
        bill.dueDate && bill.dueDate > opts.asOfDate ? bill.dueDate : overdueDate
      if (!date || date > opts.horizonEnd) continue
      out.push({
        date,
        amount: open,
        direction: 'out',
        label: `Bill — ${bill.party || 'payable'}`,
        category: 'payables',
        // A bill is an obligation already accepted, at full face value.
        confidence: 'committed',
        sourceRef: `qbo:ap:${bill.docNumber ?? bill.txnId ?? 'bill'}`,
      })
      ap.count += 1
      ap.total += open
    }
    return { events: out, ar, ap }
  }

  // ── Seasonal history — the modelled year ──────────────────────────────────

  private async historyEvents(
    schoolId: string,
    connection: { conn: { realmId: string }; token: string },
    opts: {
      asOfDate: string
      horizonEnd: string
      excludeCategories: readonly string[]
      tuitionDriverActive: boolean
    },
  ): Promise<{
    events: CashEvent[]
    source: { count: number; total: number }
    omissions: { key: string; message: string }[]
  }> {
    const none = { events: [] as CashEvent[], source: { count: 0, total: 0 }, omissions: [] as { key: string; message: string }[] }
    try {
      const end = opts.asOfDate
      const start = addMonths(opts.asOfDate, -12)
      if (!start) return none

      const raw = (await this.qboClient.getSummarizedReport(
        connection.conn.realmId,
        connection.token,
        'ProfitAndLoss',
        start,
        end,
        'month',
      )) as QboSummarizedReport

      const columns = raw?.Columns?.Column ?? []
      const { monthByIndex } = matchMonthColumns(columns)
      if (monthByIndex.size < MIN_HISTORY_MONTHS) {
        return {
          ...none,
          omissions: [
            {
              key: 'qbo_short_history',
              message: `QuickBooks holds ${monthByIndex.size} month${monthByIndex.size === 1 ? '' : 's'} of history — at least ${MIN_HISTORY_MONTHS} are needed to model a seasonal year, so recurring receipts and spend are not in this forecast yet.`,
            },
          ],
        }
      }

      // Per-category seasonal profile: calendar month (1-12) → net amount.
      const { profile, benefitsOverlap } = this.seasonalProfile(raw, monthByIndex, opts)

      // Project forward: for each month in [asOf, horizonEnd], emit the
      // profile's figure for that CALENDAR month at month-end — seasonality is
      // a property of the month of year, which is the entire reason a flat
      // twelfth hides a summer trough.
      const events: CashEvent[] = []
      const source = { count: 0, total: 0 }
      const arApBoundary = addDays(opts.asOfDate, AR_AP_WINDOW_DAYS) ?? opts.asOfDate
      let cursor = opts.asOfDate
      for (let i = 0; i < 13; i += 1) {
        const monthEnd = endOfMonthOf(cursor)
        if (!monthEnd || monthEnd > opts.horizonEnd) break
        const calMonth = Number(monthEnd.slice(5, 7))
        for (const [category, byMonth] of profile) {
          const amount = byMonth.get(calMonth)
          if (!amount || !(Math.abs(amount) > 0.005)) continue
          const direction = amount > 0 ? 'in' : 'out'
          // The AR/AP window: history stays out of the first 45 days on the
          // RECEIPTS side and out of 'payables'-like spend — the open invoices
          // and bills already carry that cash, dated better than an average.
          if (monthEnd <= arApBoundary && direction === 'in') continue
          events.push({
            date: monthEnd,
            amount: Math.abs(amount),
            direction,
            label: `${categoryTitle(category)} (from your QuickBooks history)`,
            category,
            confidence: 'modelled',
            sourceRef: `qbo:history:${category}`,
          })
          source.count += 1
          source.total += Math.abs(amount)
        }
        const next = addMonths(cursor, 1)
        if (!next) break
        cursor = next
      }
      return { events, source, omissions: benefitsOverlap ? [{ ...PAYROLL_BENEFITS_NOTE }] : [] }
    } catch (e) {
      this.log.warn(`QBO history unavailable for ${schoolId}: ${(e as Error).message}`)
      // Say so. Live-caught: a transient QBO failure here returned an empty
      // family with NO omission, so the forecast quietly lost its seasonal year
      // and looked complete — the exact silence the omissions system exists to
      // prevent.
      return {
        ...none,
        omissions: [
          {
            key: 'qbo_history_unavailable',
            message:
              'QuickBooks did not return your monthly history just now, so recurring receipts and spend are not in this forecast. Rebuild in a minute \u2014 open invoices and bills are still included.',
          },
        ],
      }
    }
  }

  /**
   * Category → (calendar month → signed net). Revenue positive, expense
   * negative; categories the caller excluded (manual commitments, the tuition
   * driver's 'tuition') never enter the map at all.
   */
  private seasonalProfile(
    raw: QboSummarizedReport,
    monthByIndex: Map<number, string>,
    opts: { excludeCategories: readonly string[]; tuitionDriverActive: boolean },
  ): { profile: Map<string, Map<number, number>>; benefitsOverlap: boolean } {
    const excluded = new Set(opts.excludeCategories.map((c) => c.toLowerCase()))
    if (opts.tuitionDriverActive) excluded.add('tuition')
    // AR/AP categories are never modelled from history — they are observed live.
    excluded.add('receivables')
    excluded.add('payables')

    const profile = new Map<string, Map<number, number>>()
    const expenseLines: { label: string; category: string }[] = []
    for (const row of flattenRows(raw)) {
      const section = sectionOfGroups(row.groups)
      if (!section) continue
      const category =
        suggestCategory(row.name, section) ?? (section === 'revenue' ? 'other_income' : 'other_expense')
      if (excluded.has(category.toLowerCase())) continue
      // Line by line, as the budget-spread source does: the name heuristic files
      // Depreciation under fixedOther and Payroll Taxes under nothing at all, so
      // the category rule alone modelled depreciation as monthly cash and paid
      // employer taxes beside the school's own payroll calendar.
      if (section === 'expense') {
        const line = { label: row.name, category }
        if (isNonCashExpense(line) || isCoveredExpense(line, excluded)) continue
        expenseLines.push(line)
      }
      const sign = section === 'revenue' ? 1 : -1
      let byMonth = profile.get(category)
      if (!byMonth) {
        byMonth = new Map<number, number>()
        profile.set(category, byMonth)
      }
      for (const [colIdx, monthKey] of monthByIndex) {
        const v = row.values[colIdx]
        if (typeof v !== 'number' || !Number.isFinite(v) || v === 0) continue
        const cal = Number(monthKey.slice(5, 7))
        byMonth.set(cal, (byMonth.get(cal) ?? 0) + sign * v)
      }
    }
    return { profile, benefitsOverlap: benefitsLeftBesidePayroll(expenseLines, excluded) }
  }
}

/** P&L section from the flattened row's group path. */
function sectionOfGroups(groups: string[]): 'revenue' | 'expense' | null {
  const g = groups.map((x) => x.toLowerCase().replace(/\s+/g, ''))
  if (g.some((x) => x === 'income' || x === 'otherincome')) return 'revenue'
  if (g.some((x) => x === 'expenses' || x === 'otherexpenses' || x === 'cogs')) return 'expense'
  return null
}

/** 'YYYY-MM-DD' → the last day of that month, as ISO. */
function endOfMonthOf(iso: string): string | null {
  const first = `${iso.slice(0, 7)}-01`
  const next = addMonths(first, 1)
  return next ? addDays(next, -1) : null
}

// EXPORTED (behaviour unchanged): the briefing's STEP 2.18 narration speaks the
// same category labels these events carry, through this one function — a local
// re-titler there would drift the day either copy changes.
export function categoryTitle(category: string): string {
  const s = String(category).replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}


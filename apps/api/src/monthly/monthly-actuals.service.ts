import { BadRequestException, Injectable } from '@nestjs/common'
import type { ReportBundle, SFPResult } from '@finrep/engine'
import {
  computeMetricsForPeriod,
  type MetricResult,
} from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import {
  categoryActualsFromBundle,
  type CategoryActuals,
} from '../analytics/category-actuals.js'
import { fyElapsed, fyStartYearForPeriodEnd } from './fy-elapsed.js'

/** Point-in-time balance sheet — the REAL engine SFPResult keys (CY side). null when no CY SFP. */
export type MonthlyBalanceSheet = Pick<
  SFPResult,
  | 'cash'
  | 'restrictedCash'
  | 'totalAssets'
  | 'totalLiab'
  | 'naWithout'
  | 'naWith'
  | 'totalNA'
  | 'totalLiabNA'
> | null

/** A metric plus the additive partialYear presentational hint. */
export type MonthlyMetric = MetricResult & { partialYear: boolean }

export interface MonthlyActualsResponse {
  monthKey: string | null
  fiscalYearStart: string
  monthsAvailable: string[]
  priorMonthKey: string | null
  monthsElapsed: number
  daysElapsed: number
  ytd: CategoryActuals
  mtd: CategoryActuals
  balanceSheet: MonthlyBalanceSheet
  metrics: MonthlyMetric[]
}

/** Metrics whose denominator assumes a FULL year — flagged partialYear at month-end. */
const PARTIAL_YEAR_METRIC_KEYS = new Set(['days_cash_on_hand', 'months_operating_reserve'])

/**
 * Derives MTD/YTD category actuals + point-in-time balance sheet + partial-year-
 * correct metrics for ONE month, from already-computed MonthlySnapshot bundles.
 *
 * YTD(M) = the month's own bundle category rollups (no engine recompute).
 * MTD(M) = YTD(M) - YTD(priorAvailable) for FLOW accounts only (revenue/expense);
 * first loaded month => MTD === YTD. Balance-sheet items are point-in-time
 * (YTD == month-end balance; MTD N/A, excluded). Loads at most TWO bundles (M +
 * priorAvailable) for the arithmetic.
 */
@Injectable()
export class MonthlyActualsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
  ) {}

  async actuals(
    schoolId: string,
    periodId: string,
    month?: string,
  ): Promise<MonthlyActualsResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const fyStartYear = fyStartYearForPeriodEnd(period.periodEndDate)
    const fiscalYearStart = `${fyStartYear}-07`

    // monthKey + payload only; ascending Jul->Jun.
    const snaps = await this.prisma.monthlySnapshot.findMany({
      where: { schoolId, fiscalPeriodId: periodId },
      orderBy: { monthKey: 'asc' },
      select: { monthKey: true, payload: true },
    })

    const monthsAvailable = snaps.map((s) => s.monthKey)

    // No months loaded => 200 empty-but-shaped (mirrors analytics empty case).
    if (snaps.length === 0) {
      return {
        monthKey: null,
        fiscalYearStart,
        monthsAvailable: [],
        priorMonthKey: null,
        monthsElapsed: 0,
        daysElapsed: 0,
        ytd: { revenue: {}, expense: {} },
        mtd: { revenue: {}, expense: {} },
        balanceSheet: null,
        metrics: [],
      }
    }

    const byMonth = new Map<string, ReportBundle>()
    for (const s of snaps) byMonth.set(s.monthKey, s.payload as unknown as ReportBundle)

    // Resolve target M: explicit `month` (400 if not loaded) or latest loaded.
    let targetMonth: string
    if (month) {
      if (!byMonth.has(month)) {
        throw new BadRequestException(
          `Month ${month} is not loaded for this period. Available: ${monthsAvailable.join(', ')}.`,
        )
      }
      targetMonth = month
    } else {
      targetMonth = monthsAvailable[monthsAvailable.length - 1]
    }

    const targetBundle = byMonth.get(targetMonth) as ReportBundle

    // priorAvailableMonth = largest LOADED monthKey strictly < target (NOT
    // necessarily calendar M-1 — months can be sparse).
    const idx = monthsAvailable.indexOf(targetMonth)
    const priorMonthKey = idx > 0 ? monthsAvailable[idx - 1] : null

    // YTD straight off the month's bundle.
    const ytd = categoryActualsFromBundle(targetBundle)

    // MTD (flow only). First month => deep copy of YTD; else key-union subtract.
    const mtd: CategoryActuals = priorMonthKey
      ? this.subtractFlow(ytd, categoryActualsFromBundle(byMonth.get(priorMonthKey) as ReportBundle))
      : { revenue: { ...ytd.revenue }, expense: { ...ytd.expense } }

    // Balance sheet — point-in-time CY side, REAL engine keys; null when no CY SFP.
    const balanceSheet = this.balanceSheetFrom(targetBundle)

    // Partial-year metric basis from the target monthKey's FY.
    const { elapsedDays, elapsedMonths } = fyElapsed(targetMonth)
    const metrics = computeMetricsForPeriod({
      current: targetBundle,
      elapsedDays,
      elapsedMonths,
    }).map<MonthlyMetric>((m) => ({
      ...m,
      partialYear: PARTIAL_YEAR_METRIC_KEYS.has(m.key),
    }))

    return {
      monthKey: targetMonth,
      fiscalYearStart,
      monthsAvailable,
      priorMonthKey,
      monthsElapsed: elapsedMonths,
      daysElapsed: elapsedDays,
      ytd,
      mtd,
      balanceSheet,
      metrics,
    }
  }

  /** MTD = ytd(M) - ytd(prior), per catKey union, missing side treated as 0. */
  private subtractFlow(cur: CategoryActuals, prior: CategoryActuals): CategoryActuals {
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
      revenue: diff(cur.revenue, prior.revenue),
      expense: diff(cur.expense, prior.expense),
    }
  }

  /** Project the bundle's CY SFP into the point-in-time balance sheet, or null. */
  private balanceSheetFrom(bundle: ReportBundle): MonthlyBalanceSheet {
    const sfp = bundle.sfpResults?.cy
    if (!sfp) return null
    return {
      cash: sfp.cash,
      restrictedCash: sfp.restrictedCash,
      totalAssets: sfp.totalAssets,
      totalLiab: sfp.totalLiab,
      naWithout: sfp.naWithout,
      naWith: sfp.naWith,
      totalNA: sfp.totalNA,
      totalLiabNA: sfp.totalLiabNA,
    }
  }
}

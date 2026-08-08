// ─────────────────────────────────────────────────────────────────────────────
// THE SUMMER TROUGH, DATED.
//
// A school runs negative from June through August: payroll and benefits continue
// while tuition receipts stop. Most heads feel that rather than see it coming,
// and KYRO could not tell them — it holds enrollment, budget, trial balance and
// receivables, and had no way to answer "on what date do we run out".
//
// These tests are built around a fixture school with a real trough, because a
// cash engine that passes on synthetic flat data and gets July wrong is worse
// than no engine. The assertions are about the things a business manager would
// be harmed by: a breach detected late, a payroll date that drifts, a receipt
// counted twice, and two horizons that disagree.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  projectCash,
  expandCommitments,
  committedShare,
  tuitionReceipts,
  deriveCollectionRate,
  netTuitionBilled,
  spreadDisbursements,
  DEFAULT_PLAN_MIX,
  addMonths,
  addDays,
  startOfWeek,
  isoToDays,
} from '../src/index.js'
import type { CashCommitmentInput, CashEvent } from '../src/index.js'

// ── The fixture school ───────────────────────────────────────────────────────
// 300 students, $12,000 gross tuition, $600k aid → $3.0m billed, $2.85m
// collected at 95%. Semi-monthly payroll, monthly debt service, quarterly
// insurance, sized so the YEAR ROUGHLY BREAKS EVEN — a fixture that ran a $1m
// annual deficit would put its low point at the horizon end for arithmetic
// reasons and prove nothing about seasonality, which is the thing under test.
const PAYROLL: CashCommitmentInput = {
  id: 'payroll',
  label: 'Payroll',
  category: 'payroll',
  direction: 'out',
  amount: 102_000,
  confidence: 'committed',
  recurrence: 'semimonthly',
  startDate: '2026-07-15',
}
const DEBT: CashCommitmentInput = {
  id: 'debt',
  label: 'Debt service',
  category: 'debt_service',
  direction: 'out',
  amount: 22_000,
  confidence: 'committed',
  recurrence: 'monthly',
  startDate: '2026-07-01',
}
const INSURANCE: CashCommitmentInput = {
  id: 'ins',
  label: 'Insurance',
  category: 'insurance',
  direction: 'out',
  amount: 31_000,
  confidence: 'committed',
  recurrence: 'quarterly',
  startDate: '2026-07-10',
}

const TUITION = tuitionReceipts({
  enrollment: 300,
  grossTuitionPerStudent: 12_000,
  financialAidTotal: 600_000,
  planMix: DEFAULT_PLAN_MIX,
  collectionRate: 0.95,
  firstBillingDate: '2026-08-01',
})

const YEAR_EVENTS: CashEvent[] = [
  ...expandCommitments([PAYROLL, DEBT, INSURANCE], '2026-07-01', '2027-06-30'),
  ...TUITION,
]

const project = (over: Partial<Parameters<typeof projectCash>[0]> = {}) =>
  projectCash({
    openingCash: 400_000,
    asOfDate: '2026-06-30',
    horizonEnd: '2027-06-30',
    events: YEAR_EVENTS,
    granularity: 'month',
    reserveThreshold: 250_000,
    annualOperatingExpense: 2_836_000,
    ...over,
  })

describe('the trough lands where the calendar says it does', () => {
  it('finds a low point in the summer, before tuition arrives', () => {
    const r = project()
    expect(r.lowestDate).not.toBeNull()
    // July or August — payroll and debt with no tuition behind them yet.
    expect(r.lowestDate!.slice(0, 7)).toMatch(/^2026-0[78]$/)
    expect(r.lowestBalance).toBeLessThan(400_000)
  })

  it('reports a DATED shortfall, its size and the notice it gives', () => {
    // The whole point of the feature: not "you may have a problem" but a date.
    const r = project()
    expect(r.firstShortfallDate).not.toBeNull()
    expect(r.shortfallAmount).toBeGreaterThan(0)
    expect(r.daysOfNotice).toBeGreaterThan(0)
    expect(isoToDays(r.firstShortfallDate!)).toBeGreaterThan(isoToDays('2026-06-30')!)
  })

  it('DELAYING TUITION DEEPENS THE TROUGH — the model is actually coupled', () => {
    // If pushing every receipt a month later did not move the low point, the
    // engine would not be reading the tuition calendar at all.
    const later = tuitionReceipts({
      enrollment: 300,
      grossTuitionPerStudent: 12_000,
      financialAidTotal: 600_000,
      planMix: DEFAULT_PLAN_MIX,
      collectionRate: 0.95,
      firstBillingDate: '2026-09-01',
    })
    const base = project()
    const delayed = project({
      events: [...expandCommitments([PAYROLL, DEBT, INSURANCE], '2026-07-01', '2027-06-30'), ...later],
    })
    expect(delayed.lowestBalance).toBeLessThan(base.lowestBalance)
  })

  it('invents NO threshold — no reserve set means no shortfall claimed', () => {
    // Manufacturing a floor would manufacture an alarm the school never set, on
    // the one screen whose entire value is being trusted.
    const r = project({ reserveThreshold: null })
    expect(r.firstShortfallDate).toBeNull()
    expect(r.shortfallAmount).toBeNull()
    expect(r.daysOfNotice).toBeNull()
    // The low point is still computed — that is a fact, not a judgement.
    expect(r.lowestDate).not.toBeNull()
  })
})

describe('ONE ENGINE, two horizons', () => {
  it('weekly and monthly reconcile to the same ending balance', () => {
    // Two models would eventually disagree and somebody would have to tell a
    // board which one to believe. This is the pin that keeps it one.
    const w = project({ granularity: 'week' })
    const m = project({ granularity: 'month' })
    expect(w.endingBalance).toBeCloseTo(m.endingBalance, 6)
    expect(w.totalReceipts).toBeCloseTo(m.totalReceipts, 6)
    expect(w.totalDisbursements).toBeCloseTo(m.totalDisbursements, 6)
  })

  it('…and to the same low point and shortfall date', () => {
    const w = project({ granularity: 'week' })
    const m = project({ granularity: 'month' })
    expect(w.lowestBalance).toBeCloseTo(m.lowestBalance, 6)
    expect(w.firstShortfallDate).toBe(m.firstShortfallDate)
  })

  it('a bucket chain is continuous — each opens where the last closed', () => {
    const r = project({ granularity: 'week' })
    expect(r.buckets.length).toBeGreaterThan(40)
    for (let i = 1; i < r.buckets.length; i += 1) {
      expect(r.buckets[i].openingBalance).toBeCloseTo(r.buckets[i - 1].closingBalance, 6)
    }
    expect(r.buckets[0].openingBalance).toBe(400_000)
  })

  it('detects a breach at the EVENT, not at the bucket edge', () => {
    // A school that dips under its reserve on Tuesday and recovers by Friday has
    // still breached. A week-end-only check hides the exact moment the business
    // manager needed to act.
    const dip: CashEvent[] = [
      { date: '2026-07-08', amount: 300_000, direction: 'out', label: 'Big', category: 'x', confidence: 'committed', sourceRef: 't' },
      { date: '2026-07-09', amount: 300_000, direction: 'in', label: 'Back', category: 'x', confidence: 'committed', sourceRef: 't' },
    ]
    const r = projectCash({
      openingCash: 400_000,
      asOfDate: '2026-07-01',
      horizonEnd: '2026-07-31',
      events: dip,
      granularity: 'week',
      reserveThreshold: 250_000,
    })
    expect(r.firstShortfallDate).toBe('2026-07-08')
    // …even though the week closed healthy.
    const week = r.buckets.find((b) => (b.start <= '2026-07-08' && b.end >= '2026-07-08'))
    expect(week!.closingBalance).toBe(400_000)
  })
})

describe('the payroll calendar does not drift', () => {
  it('semi-monthly lands on the 15th and the LAST day, month by month', () => {
    const ev = expandCommitments([PAYROLL], '2026-07-01', '2026-10-31')
    const dates = ev.map((e) => e.date)
    expect(dates).toContain('2026-07-15')
    expect(dates).toContain('2026-07-31')
    expect(dates).toContain('2026-09-30') // 30-day month, not the 31st
    expect(dates).toContain('2026-08-31')
  })

  it('a monthly 31st clamps to February and RETURNS to the 31st', () => {
    // Stepping from the clamped date instead of the original would walk the
    // payment backwards down the calendar for the rest of the year.
    const c: CashCommitmentInput = {
      id: 'x', label: 'Rent', category: 'lease', direction: 'out', amount: 1000,
      confidence: 'committed', recurrence: 'monthly', startDate: '2027-01-31',
    }
    const dates = expandCommitments([c], '2027-01-01', '2027-05-31').map((e) => e.date)
    expect(dates).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
  })

  it('respects an end date', () => {
    const c: CashCommitmentInput = { ...DEBT, endDate: '2026-09-30' }
    const dates = expandCommitments([c], '2026-07-01', '2027-06-30').map((e) => e.date)
    expect(dates).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
  })

  it('a malformed commitment yields NO events rather than throwing', () => {
    // One bad row must not take down a school's whole forecast.
    const bad: CashCommitmentInput = { ...DEBT, startDate: '2026-13-45' }
    expect(() => expandCommitments([bad], '2026-07-01', '2027-06-30')).not.toThrow()
    expect(expandCommitments([bad], '2026-07-01', '2027-06-30')).toEqual([])
  })
})

describe('tuition is a cash driver, not a twelfth of revenue', () => {
  it('bills enrollment × rate − aid', () => {
    expect(
      netTuitionBilled({
        enrollment: 300, grossTuitionPerStudent: 12_000, financialAidTotal: 600_000,
        planMix: DEFAULT_PLAN_MIX, collectionRate: 1, firstBillingDate: '2026-08-01',
      }),
    ).toBe(3_000_000)
  })

  it('collects less than it bills, and the rate is what does it', () => {
    const at95 = tuitionReceipts({
      enrollment: 300, grossTuitionPerStudent: 12_000, financialAidTotal: 600_000,
      planMix: DEFAULT_PLAN_MIX, collectionRate: 0.95, firstBillingDate: '2026-08-01',
    }).reduce((s, e) => s + e.amount, 0)
    expect(at95).toBeCloseTo(3_000_000 * 0.95, 4)
  })

  it('PLAN MIX CHANGES THE SUMMER, not just the total', () => {
    // Two schools with identical revenue and different mixes have completely
    // different Julys. This is the reason the driver exists.
    const allAnnual = tuitionReceipts({
      enrollment: 300, grossTuitionPerStudent: 12_000, financialAidTotal: 600_000,
      planMix: { annual: 1, semiannual: 0, monthly10: 0, monthly12: 0 },
      collectionRate: 1, firstBillingDate: '2026-08-01',
    })
    const allMonthly = tuitionReceipts({
      enrollment: 300, grossTuitionPerStudent: 12_000, financialAidTotal: 600_000,
      planMix: { annual: 0, semiannual: 0, monthly10: 1, monthly12: 0 },
      collectionRate: 1, firstBillingDate: '2026-08-01',
    })
    const inAugust = (evs: CashEvent[]) =>
      evs.filter((e) => e.date.startsWith('2026-08')).reduce((s, e) => s + e.amount, 0)
    expect(inAugust(allAnnual)).toBeCloseTo(3_000_000, 4)
    expect(inAugust(allMonthly)).toBeCloseTo(300_000, 4)
  })

  it('is SCHEDULED, never committed — the date is known, the amount is not', () => {
    // Calling these committed would overstate exactly the input carrying the most
    // uncertainty in the whole model.
    expect(TUITION.every((e) => e.confidence === 'scheduled')).toBe(true)
  })

  it('an all-zero plan mix yields nothing rather than dividing by zero', () => {
    expect(
      tuitionReceipts({
        enrollment: 300, grossTuitionPerStudent: 12_000, financialAidTotal: 600_000,
        planMix: { annual: 0, semiannual: 0, monthly10: 0, monthly12: 0 },
        collectionRate: 1, firstBillingDate: '2026-08-01',
      }),
    ).toEqual([])
  })
})

describe('the collection rate is SUGGESTED, never assumed', () => {
  it('derives a rate from aging, and shows its working', () => {
    const s = deriveCollectionRate({ current: 800_000, d1_30: 100_000, d31_60: 50_000, d61_90: 30_000, d90_plus: 20_000 })
    expect(s).not.toBeNull()
    expect(s!.rate).toBeCloseTo(1 - 20_000 / 1_000_000, 6)
    expect(s!.basis).toEqual({ billed: 1_000_000, over90: 20_000 })
  })

  it('clamps rather than handing a school an absurd assumption', () => {
    // One stale invoice on a tiny book should not produce a 10% collection rate.
    const bad = deriveCollectionRate({ current: 1_000, d90_plus: 9_000 })
    expect(bad!.rate).toBe(0.5)
    const perfect = deriveCollectionRate({ current: 1_000_000, d90_plus: 0 })
    expect(perfect!.rate).toBe(0.99)
  })

  it('says nothing when there is no receivable history to say it from', () => {
    expect(deriveCollectionRate(null)).toBeNull()
    expect(deriveCollectionRate({})).toBeNull()
    expect(deriveCollectionRate({ current: 0, d90_plus: 0 })).toBeNull()
  })
})

describe('budget phasing is MODELLED, and never double counted', () => {
  const accounts = [
    { acct: '6100', label: 'Salaries', category: 'payroll', section: 'expense' as const, months: [100, 100, 100] },
    { acct: '6200', label: 'Supplies', category: 'supplies', section: 'expense' as const, months: [500, 400, 0] },
    { acct: '4100', label: 'Tuition', category: 'tuition', section: 'revenue' as const, months: [900, 0, 0] },
  ]

  it('phases expense by the month the budget says, not a flat twelfth', () => {
    const ev = spreadDisbursements({ accounts, fiscalYearStart: '2026-07-01' })
    const supplies = ev.filter((e) => e.category === 'supplies')
    expect(supplies.map((e) => e.amount)).toEqual([500, 400])
    expect(supplies[0].date).toBe('2026-07-31')
    expect(supplies[1].date).toBe('2026-08-31')
  })

  it('EXCLUDES a category already covered by a commitment', () => {
    // A school with payroll as a commitment AND salaries in the spread would see
    // its payroll twice and a trough twice as deep as the truth — worse than no
    // forecast, because it looks authoritative.
    const ev = spreadDisbursements({ accounts, fiscalYearStart: '2026-07-01', excludeCategories: ['payroll'] })
    expect(ev.some((e) => e.category === 'payroll')).toBe(false)
    expect(ev.some((e) => e.category === 'supplies')).toBe(true)
  })

  it('never claims committed for a budget row', () => {
    const ev = spreadDisbursements({ accounts, fiscalYearStart: '2026-07-01' })
    expect(ev.every((e) => e.confidence === 'modelled')).toBe(true)
  })

  it('keeps revenue and expense apart', () => {
    expect(spreadDisbursements({ accounts, fiscalYearStart: '2026-07-01' }).every((e) => e.direction === 'out')).toBe(true)
  })
})

describe('the engine explains its own trough', () => {
  it('names what dug the hole, largest first', () => {
    // The surface above has to explain the low point and cannot be handed
    // hundreds of events to do it. Reporting the breakdown here keeps the
    // explanation attached to the same event set the balance came from.
    const r = project()
    expect(r.driversToLowPoint.length).toBeGreaterThan(0)
    expect(r.driversToLowPoint[0].category).toBe('payroll')
    for (let i = 1; i < r.driversToLowPoint.length; i += 1) {
      expect(r.driversToLowPoint[i - 1].amount).toBeGreaterThanOrEqual(
        r.driversToLowPoint[i].amount,
      )
    }
  })

  it('counts only outflows BEFORE the low point', () => {
    // Counting the whole horizon would attribute the trough to money that had not
    // moved yet — a plausible explanation of the wrong cause.
    const r = project()
    const total = r.driversToLowPoint.reduce((s, d) => s + d.amount, 0)
    expect(total).toBeLessThan(r.totalDisbursements)
  })

  it('names the next receipt after the low point — what the school is waiting for', () => {
    const r = project()
    expect(r.nextReceiptAfterLow?.category).toBe('tuition')
    expect(r.nextReceiptAfterLow!.date > r.lowestDate!).toBe(true)
  })

  it('reports ZERO receipts before the trough as the distinct case it is', () => {
    const r = projectCash({
      openingCash: 400_000,
      asOfDate: '2026-06-30',
      horizonEnd: '2026-07-31',
      events: expandCommitments([PAYROLL, DEBT], '2026-07-01', '2026-07-31'),
      granularity: 'week',
    })
    expect(r.receiptsBeforeLowPoint).toBe(0)
    expect(r.nextReceiptAfterLow).toBeNull()
  })
})

describe('the reader can see how much of this is calendar and how much is estimate', () => {
  it('reports movement per confidence class', () => {
    const r = project()
    expect(r.byConfidence.committed).toBeLessThan(0) // payroll, debt, insurance
    expect(r.byConfidence.scheduled).toBeGreaterThan(0) // tuition
    expect(r.byConfidence.assumption).toBe(0)
  })

  it('committedShare measures ABSOLUTE movement, not the net', () => {
    // A receipt and a disbursement of equal size are two facts, not zero.
    const share = committedShare(project())
    expect(share).not.toBeNull()
    expect(share!).toBeGreaterThan(0)
    expect(share!).toBeLessThan(1)
  })

  it('is null when nothing moves at all', () => {
    expect(committedShare(projectCash({
      openingCash: 100, asOfDate: '2026-07-01', horizonEnd: '2026-07-31',
      events: [], granularity: 'week',
    }))).toBeNull()
  })
})

describe('total and never-throws', () => {
  it('an event ON the as-of date is NOT counted — the opening balance holds it', () => {
    const r = projectCash({
      openingCash: 1_000, asOfDate: '2026-07-01', horizonEnd: '2026-07-31',
      events: [{ date: '2026-07-01', amount: 500, direction: 'out', label: 'x', category: 'x', confidence: 'committed', sourceRef: 't' }],
      granularity: 'month',
    })
    expect(r.endingBalance).toBe(1_000)
  })

  it('returns a complete SHAPE for an impossible window', () => {
    const r = projectCash({
      openingCash: 100, asOfDate: '2026-07-31', horizonEnd: '2026-07-01',
      events: [], granularity: 'week',
    })
    expect(r.buckets).toEqual([])
    expect(r.endingBalance).toBe(100)
    expect(r.firstShortfallDate).toBeNull()
  })

  it('survives a non-finite opening balance', () => {
    expect(() => projectCash({
      openingCash: Number.NaN, asOfDate: '2026-07-01', horizonEnd: '2026-08-01',
      events: YEAR_EVENTS, granularity: 'month',
    })).not.toThrow()
  })

  it('months of cash is measured AT THE LOW POINT, not today', () => {
    // Quoting today's coverage over a summer trough is the reassuring half of a
    // two-part truth.
    const r = project()
    expect(r.monthsCashAtLowPoint).toBeCloseTo(r.lowestBalance / (2_836_000 / 12), 6)
    expect(r.monthsCashAtLowPoint!).toBeLessThan(400_000 / (2_836_000 / 12))
  })

  it('leaves months-of-cash null rather than guessing a denominator', () => {
    expect(project({ annualOperatingExpense: null }).monthsCashAtLowPoint).toBeNull()
  })
})

describe('date maths without a clock', () => {
  it('addMonths clamps to the month end', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29') // leap year
  })

  it('startOfWeek is the Monday on or before', () => {
    expect(startOfWeek('2026-07-01')).toBe('2026-06-29') // a Wednesday
    expect(startOfWeek('2026-06-29')).toBe('2026-06-29')
    expect(startOfWeek('2026-07-05')).toBe('2026-06-29') // Sunday belongs back
  })

  it('rejects malformed dates instead of coercing them', () => {
    expect(isoToDays('2026-02-30')).toBeNull()
    expect(isoToDays('not-a-date')).toBeNull()
    expect(addDays('2026-13-01', 1)).toBeNull()
  })
})

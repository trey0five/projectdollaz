import { describe, it, expect } from 'vitest'
import {
  fyEndOfMonth,
  monthLong,
  monthShort,
  monthList,
  routeVerdict,
  shortDate,
  shortLabelFor,
  verdictCoverage,
  yearHeading,
} from './financeInventory.js'

// Mid-day UTC timestamps so "Oct 3" holds in any US timezone.
const THIS_YEAR = new Date().getFullYear()
const at = (md, y = THIS_YEAR) => `${y}-${md}T15:00:00.000Z`

let k = 0
const cand = (over) => ({
  key: `c${(k += 1)}`,
  sourceName: over.sourceName || `file-${k}.xlsx`,
  status: over.partial ? 'partial' : 'ready',
  partial: null,
  isMonthly: false,
  periodType: 'fy',
  metadata: {},
  ...over,
})
const annual = (end) => cand({ periodEndDate: end, year: Number(end.slice(0, 4)) })
const month = (key) => cand({ periodEndDate: `${key}-28`, isMonthly: true, metadata: { monthKey: key } })
const half = (end, partial) => cand({ periodEndDate: end, partial })

const v = (kind, candidates = [], destination) => ({
  kind,
  destination:
    destination ??
    { annual: 'tb-single', 'multi-year': 'tb-bulk', half: 'tb-single', monthly: 'monthly', budget: 'budget' }[kind] ??
    'tb-single',
  title: kind,
  detail: '',
  candidates,
})

const tb = (over = {}) => ({
  role: 'cy',
  importId: 'imp-1',
  sourceName: 'TB.xlsx',
  source: 'upload',
  rowCount: 40,
  uploadedAt: at('10-03'),
  uploadedBy: { id: 'u1', name: 'Jacqui Lee' },
  half: null,
  versions: 1,
  hiddenHalf: null,
  ...over,
})
const year = (over) => ({
  periodType: 'fy',
  hasStatements: true,
  hasBoardReport: false,
  trialBalances: [],
  monthly: null,
  budget: null,
  ...over,
})
const FY24 = { periodId: 'p24', label: 'FY 2024', shortLabel: 'FY24', periodEndDate: '2024-06-30' }
const FY25 = { periodId: 'p25', label: 'FY 2025', shortLabel: 'FY25', periodEndDate: '2025-06-30' }
const FY26 = { periodId: 'p26', label: 'FY 2026', shortLabel: 'FY26', periodEndDate: '2026-06-30' }
const periods = [
  { id: 'p26', label: 'FY 2026', periodEndDate: '2026-06-30' },
  { id: 'p25', label: 'FY 2025', periodEndDate: '2025-06-30' },
  { id: 'p24', label: 'FY 2024', periodEndDate: '2024-06-30' },
]
const onFileOf = (...years) => ({ restoreDays: 30, years, recentlyRemoved: [] })

describe('labels and dates', () => {
  it('shortLabelFor: FY25 for a June 30 end, the label otherwise', () => {
    expect(shortLabelFor({ label: 'FY 2025', periodEndDate: '2025-06-30' })).toBe('FY25')
    expect(shortLabelFor({ label: 'Q3 2026', periodEndDate: '2026-03-31' })).toBe('Q3 2026')
  })

  it('yearHeading reads the date by its parts (no timezone drift)', () => {
    expect(yearHeading({ label: 'FY 2025', periodEndDate: '2025-06-30' })).toBe('FY25 · year ending June 30, 2025')
    expect(yearHeading({ label: 'Q3 2026', periodEndDate: '2026-03-31' })).toBe('Q3 2026 · through March 31, 2026')
    // Jan 1 is the classic UTC→local drift victim.
    expect(yearHeading({ label: 'Cal 2025', periodEndDate: '2026-01-01' })).toBe('Cal 2025 · through January 1, 2026')
  })

  it('months', () => {
    expect(monthLong('2026-03')).toBe('March 2026')
    expect(monthShort('2026-03')).toBe('Mar 2026')
    expect(monthList(['2026-03', '2026-01', '2026-02'])).toBe('January, February and March 2026')
    expect(monthList(['2025-12', '2026-01'])).toBe('December 2025 and January 2026')
  })

  it('fyEndOfMonth: July starts the next fiscal year, June ends this one', () => {
    expect(fyEndOfMonth('2025-07')).toBe('2026-06-30')
    expect(fyEndOfMonth('2026-06')).toBe('2026-06-30')
    expect(fyEndOfMonth('2026-01')).toBe('2026-06-30')
  })

  it('shortDate: no year this year, the year otherwise', () => {
    expect(shortDate(at('10-03'))).toBe('Oct 3')
    expect(shortDate(at('10-03', 2024))).toBe('Oct 3, 2024')
    expect(shortDate(null)).toBe('')
  })
})

describe('verdictCoverage', () => {
  it('annual / multi-year → the dated years', () => {
    expect(verdictCoverage(v('annual', [annual('2025-06-30')]))).toMatchObject({
      family: 'trial_balance',
      trialBalances: [{ periodEndDate: '2025-06-30', half: null }],
      undated: false,
    })
    expect(verdictCoverage(v('multi-year', [annual('2024-06-30'), annual('2025-06-30')])).trialBalances).toHaveLength(2)
    expect(verdictCoverage(v('annual', [cand({ periodEndDate: null })]))).toMatchObject({ trialBalances: [], undated: true })
  })

  it('half → the half and its year', () => {
    expect(verdictCoverage(v('half', [half('2025-06-30', 'bs')])).trialBalances).toEqual([
      { periodEndDate: '2025-06-30', half: 'bs' },
    ])
  })

  it('monthly → month keys; budget → no year of its own', () => {
    expect(verdictCoverage(v('monthly', [month('2026-03'), month('2026-01')])).months).toEqual(['2026-01', '2026-03'])
    expect(verdictCoverage(v('budget'))).toMatchObject({ family: 'budget', budgetMonthKeys: [] })
    expect(verdictCoverage(v('unread')).family).toBeNull()
  })
})

describe('routeVerdict', () => {
  const ctx = (onFile, extra = {}) => ({ onFile, periods, activePeriodId: 'p26', target: null, ...extra })

  it('no inventory → the verdict as it was, no notes', () => {
    const r = routeVerdict(v('annual', [annual('2025-06-30')]), ctx(null))
    expect(r).toEqual({ destination: 'tb-single', periodId: null, focus: false, notes: [] })
  })

  it('an annual file for a year with a saved trial balance goes to Add years and says what it replaces', () => {
    const r = routeVerdict(v('annual', [annual('2025-06-30')]), ctx(onFileOf(year({ ...FY25, trialBalances: [tb()] }))))
    expect(r.destination).toBe('tb-bulk')
    expect(r.notes).toEqual([{ tone: 'watch', text: 'Replaces your FY25 trial balance (uploaded Oct 3)' }])
  })

  it('an annual file over a saved half names the half', () => {
    const r = routeVerdict(
      v('annual', [annual('2025-06-30')]),
      ctx(onFileOf(year({ ...FY25, trialBalances: [tb({ half: 'pl' })] }))),
    )
    expect(r.notes[0].text).toBe('Replaces your saved FY25 Profit and Loss (uploaded Oct 3)')
  })

  it('an annual file for a new year is unchanged', () => {
    const r = routeVerdict(v('annual', [annual('2026-06-30')]), ctx(onFileOf(year({ ...FY25, trialBalances: [tb()] }))))
    expect(r.destination).toBe('tb-single')
    expect(r.notes).toEqual([])
  })

  it('multi-year names every year it replaces', () => {
    const files = onFileOf(year({ ...FY25, trialBalances: [tb()] }), year({ ...FY24, trialBalances: [tb()] }))
    const r = routeVerdict(v('multi-year', [annual('2024-06-30'), annual('2025-06-30'), annual('2026-06-30')]), ctx(files))
    expect(r.destination).toBe('tb-bulk')
    expect(r.notes[0].text).toBe('Replaces your FY24 and FY25 trial balances')
    const one = routeVerdict(v('multi-year', [annual('2025-06-30'), annual('2026-06-30')]), ctx(files))
    expect(one.notes[0].text).toBe('Replaces your FY25 trial balance (uploaded Oct 3)')
  })

  it('the other half of a saved year opens that year, to combine', () => {
    const files = onFileOf(year({ ...FY25, trialBalances: [tb({ half: 'pl' })] }))
    const r = routeVerdict(v('half', [half('2025-06-30', 'bs')]), ctx(files))
    expect(r).toMatchObject({ destination: 'tb-single', periodId: 'p25', focus: true })
    expect(r.notes).toEqual([
      {
        tone: 'info',
        text: 'Goes with your saved FY25 Profit and Loss (uploaded Oct 3). You can combine them on the next screen.',
      },
    ])
  })

  it('the same half, or a half over a full trial balance, says to remove the saved one first', () => {
    const msg =
      'You already have an FY25 trial balance (uploaded Oct 3). To use this file instead, remove that one above first.'
    const same = routeVerdict(v('half', [half('2025-06-30', 'pl')]), ctx(onFileOf(year({ ...FY25, trialBalances: [tb({ half: 'pl' })] }))))
    expect(same).toMatchObject({ destination: 'tb-single', focus: false })
    expect(same.notes[0]).toEqual({ tone: 'watch', text: msg })
    const full = routeVerdict(v('half', [half('2025-06-30', 'bs')]), ctx(onFileOf(year({ ...FY25, trialBalances: [tb()] }))))
    expect(full.notes[0].text).toBe(msg)
  })

  it('monthly: goes to the first month’s year and names what it replaces', () => {
    const months = (keys) => ({
      count: keys.length,
      total: 12,
      months: keys.map((monthKey) => ({ monthKey, sourceName: `${monthKey}.xlsx`, uploadedAt: at('04-02') })),
    })
    const files = onFileOf(year({ ...FY26, monthly: months(['2026-01', '2026-02', '2026-03']) }))
    const one = routeVerdict(v('monthly', [month('2026-03')]), ctx(files))
    expect(one).toMatchObject({ destination: 'monthly', periodId: 'p26' })
    expect(one.notes[0]).toEqual({ tone: 'watch', text: 'Replaces your March 2026 numbers (uploaded Apr 2)' })
    const three = routeVerdict(v('monthly', [month('2026-01'), month('2026-02'), month('2026-03'), month('2026-04')]), ctx(files))
    expect(three.notes[0].text).toBe('Replaces 3 months you already added: January, February and March 2026')
    const fresh = routeVerdict(v('monthly', [month('2025-08')]), ctx(files))
    expect(fresh).toMatchObject({ periodId: 'p26', notes: [] })
  })

  it('budget: the Replace target sets the year and the note names that year’s budget', () => {
    const files = onFileOf(year({ ...FY25, budget: { kind: 'spread', hasForecast: false, updatedAt: at('10-03'), updatedBy: null } }))
    const r = routeVerdict(v('budget'), ctx(files, { target: { kind: 'budget', periodId: 'p25', shortLabel: 'FY25' } }))
    expect(r).toMatchObject({ destination: 'budget', periodId: 'p25' })
    expect(r.notes).toEqual([{ tone: 'watch', text: 'Replaces your FY25 budget (saved Oct 3)' }])
    // Without a target the budget tile opens on the page's year.
    expect(routeVerdict(v('budget'), ctx(files, { activePeriodId: 'p25' })).notes[0].text).toBe(
      'Replaces your FY25 budget (saved Oct 3)',
    )
    expect(routeVerdict(v('budget'), ctx(files, { activePeriodId: 'p25' })).periodId).toBe('p25') // warning and save agree
    expect(routeVerdict(v('budget'), ctx(files)).notes).toEqual([])
  })

  it('an undated file picked for a Replace goes to Add years, where the year is chosen', () => {
    const r = routeVerdict(
      v('annual', [cand({ periodEndDate: null })]),
      ctx(onFileOf(year({ ...FY25, trialBalances: [tb()] })), {
        target: { kind: 'trial_balance', periodId: 'p25', shortLabel: 'FY25' },
      }),
    )
    expect(r.destination).toBe('tb-bulk')
    expect(r.notes).toEqual([
      { tone: 'info', text: "This file doesn't say which year it's for. You'll pick FY25 on the next screen." },
    ])
  })

  it('a Replace for one year with a file for another says where it goes', () => {
    const r = routeVerdict(
      v('annual', [annual('2026-06-30')]),
      ctx(onFileOf(year({ ...FY25, trialBalances: [tb()] })), {
        target: { kind: 'trial_balance', periodId: 'p25', shortLabel: 'FY25' },
      }),
    )
    expect(r.notes).toContainEqual({
      tone: 'watch',
      text: 'You chose to replace FY25, but this file is for FY26. It will go to FY26.',
    })
  })

  it('a Replace for a budget with a trial balance says it goes where it belongs', () => {
    const r = routeVerdict(
      v('annual', [annual('2026-06-30')]),
      ctx(onFileOf(year({ ...FY25, trialBalances: [tb()] })), {
        target: { kind: 'budget', periodId: 'p25', shortLabel: 'FY25' },
      }),
    )
    expect(r.destination).toBe('tb-single')
    expect(r.notes).toEqual([
      {
        tone: 'watch',
        text: 'You chose to replace the FY25 budget, but this file looks like a trial balance. It will go where it belongs.',
      },
    ])
  })

  it('unread and unsupported files are left alone', () => {
    const files = onFileOf(year({ ...FY25, trialBalances: [tb()] }))
    expect(routeVerdict(v('unread'), ctx(files)).notes).toEqual([])
    expect(routeVerdict({ kind: 'unsupported', destination: null }, ctx(files))).toMatchObject({ destination: null, notes: [] })
  })
})

describe('splitFocusGroups', () => {
  const item = (route) => ({ route })
  it('leaves groups alone when no half needs its own year, or the half is alone', async () => {
    const { splitFocusGroups } = await import('./financeInventory.js')
    const plain = new Map([['tb-single', [item({ focus: false })]], ['budget', [item({})]]])
    expect(splitFocusGroups(plain)).toBe(plain)
    const alone = new Map([['tb-single', [item({ focus: true, periodId: 'p25' })]]])
    expect(splitFocusGroups(alone)).toBe(alone)
  })

  it('gives a saved year’s other half its own group, in the original place', async () => {
    const { splitFocusGroups, destinationKeyOf } = await import('./financeInventory.js')
    const a = item({ focus: false })
    const b = item({ focus: true, periodId: 'p25' })
    const out = splitFocusGroups(new Map([['monthly', []], ['tb-single', [a, b]], ['budget', []]]))
    expect([...out.keys()]).toEqual(['monthly', 'tb-single', 'tb-single@p25', 'budget'])
    expect(out.get('tb-single')).toEqual([a])
    expect(out.get('tb-single@p25')).toEqual([b])
    expect(destinationKeyOf('tb-single@p25')).toBe('tb-single')
  })
})

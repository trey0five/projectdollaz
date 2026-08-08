/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// A CASH FORECAST GETS ACTED ON.
//
// A business manager arranges a line of credit, or does not, on the strength of
// a date this screen prints. That makes every overstatement here expensive in a
// way an ordinary dashboard error is not — and the two ways to overstate are to
// invent a figure, or to present an estimate with the confidence of a fact.
//
// The sentence logic is pure and tested as behaviour; the page's honesty rules
// are source-pinned, following this tree's own precedent for surfaces whose
// context stack makes mounting fragile.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { whyLine, potentialActions } from './whyLine.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const money = (n) => `$${Math.round(n).toLocaleString()}`

const PROJECTION = {
  openingCash: 400_000,
  lowestBalance: 143_000,
  lowestDate: '2026-07-31',
  endingBalance: 380_000,
  firstShortfallDate: '2026-07-15',
  shortfallAmount: 107_000,
  daysOfNotice: 15,
  asOfDate: '2026-06-30',
}

// The engine's own breakdown, which is what the sentence reads.
const WITH_DRIVERS = {
  ...PROJECTION,
  driversToLowPoint: [
    { category: 'payroll', amount: 204_000 },
    { category: 'debt_service', amount: 22_000 },
  ],
  nextReceiptAfterLow: { category: 'tuition', date: '2026-08-01', amount: 831_000 },
  receiptsBeforeLowPoint: 0,
}

describe('the Why sentence explains the trough it is attached to', () => {
  it('names the drivers, the date, and what the school is waiting for', () => {
    const s = whyLine(WITH_DRIVERS, money)
    expect(s).toContain('payroll')
    expect(s).toContain('2026-07-31')
    expect(s).toContain('tuition receipts')
    expect(s).toContain('2026-08-01')
  })

  it('states the total of the drivers it named, not the whole horizon', () => {
    // Quoting a figure larger than the categories it lists would attribute the
    // trough to money that is not in the sentence.
    const s = whyLine(WITH_DRIVERS, money)
    expect(s).toContain(money(204_000 + 22_000))
  })

  it('says when NOTHING is received before the low point — a distinct situation', () => {
    expect(whyLine(WITH_DRIVERS, money)).toContain('Nothing is received at all before that date')
    // …and does NOT say it when receipts were arriving.
    const wet = whyLine({ ...WITH_DRIVERS, receiptsBeforeLowPoint: 5_000 }, money)
    expect(wet).not.toContain('Nothing is received at all')
  })

  it('INVENTS NO DRIVER when the engine reported none', () => {
    const s = whyLine({ ...PROJECTION, driversToLowPoint: [] }, money)
    expect(s).toContain('2026-07-31')
    expect(s).toMatch(/Record your payroll, debt service and insurance/)
  })

  it('is null when there is no low point to explain', () => {
    expect(whyLine(null, money)).toBeNull()
    expect(whyLine({ ...WITH_DRIVERS, lowestDate: null }, money)).toBeNull()
  })

  it('uses the CALLER’s formatter so a sentence cannot disagree with a card', () => {
    const s = whyLine(WITH_DRIVERS, () => 'FORMATTED')
    expect(s).toContain('FORMATTED')
  })
})

describe('actions are recommendations, never steps taken for you', () => {
  it('offers none when there is no shortfall', () => {
    // A school in the clear should not be handed remedies for a problem it does
    // not have.
    expect(potentialActions({ ...PROJECTION, firstShortfallDate: null }, money)).toEqual([])
    expect(potentialActions(null, money)).toEqual([])
  })

  it('every action is somewhere to GO, not something performed', () => {
    const a = potentialActions(PROJECTION, money)
    expect(a.length).toBeGreaterThan(0)
    for (const x of a) {
      expect(x.to).toMatch(/^\//)
      expect(x.label).not.toMatch(/^(Move|Transfer|Cancel|Pay|Send)\b/)
    }
  })

  it('names the size of the gap rather than gesturing at it', () => {
    expect(potentialActions(PROJECTION, money).some((x) => x.detail.includes(money(107_000)))).toBe(true)
  })
})

describe('the page does not overstate what it knows', () => {
  const page = read('pages/CashFlowPage.jsx')
  const rail = read('components/cashflow/CashRail.jsx')

  it('shows the trial-balance cash BESIDE the keyed figure, never instead', () => {
    // A school can hold $600k on the balance sheet with $125k available to
    // operations. The gap is the point, not an error to reconcile away.
    expect(page).toMatch(/Your trial balance shows/)
    expect(page).toMatch(/it is the part that is not available to operations/)
  })

  it('warns when the opening balance is stale', () => {
    expect(page).toMatch(/cf\.opening\?\.stale \?/)
    expect(page).toContain('inherits its drift')
  })

  it('carries the server’s confidence disclaimer verbatim', () => {
    // Composed server-side and rendered, never retyped here — a second spelling
    // of this sentence is how two versions of it end up in the product.
    expect(page).toMatch(/\{cf\.projection\.disclaimer\}/)
    expect(page).not.toMatch(/not the financial health of the school/)
  })

  it('says "Not set" for an absent reserve rather than showing a zero floor', () => {
    // A zero threshold would read as "you are fine", which is the opposite of
    // "you have not told us what you need to hold".
    expect(page).toMatch(/reserveThreshold == null\s*\?\s*'Not set'/)
  })

  it('reports what share of the forecast is actually committed', () => {
    expect(page).toMatch(/committedShare \* 100/)
    expect(page).toContain('dates and amounts you already know')
  })

  it('the chart draws the reserve line ON the chart, not beside it', () => {
    // A cash line without the floor it must not cross is decoration.
    expect(rail).toMatch(/Minimum reserve/)
    expect(rail).toMatch(/y\(reserveThreshold\)/)
  })

  it('the chart does not clamp its floor at zero', () => {
    // A school already overdrawn is exactly the school that needs this screen.
    expect(rail).toMatch(/const rawLo = Math\.min\(\.\.\.all\)/)
    expect(rail).not.toMatch(/Math\.max\(0,\s*Math\.min/)
  })
})

describe('the nav match does not swallow its neighbour', () => {
  it('/cash no longer prefix-matches /cash-flow', () => {
    // `startsWith('/cash')` also matches '/cash-flow' and would light Cash &
    // Collections while the reader is on the forecast.
    const nav = read('components/nav/sidebarNav.js')
    expect(nav).toMatch(/p === '\/cash' \|\| p\.startsWith\('\/cash\/'\)/)
    expect(nav).toMatch(/navId: 'nav-cash-flow'/)
  })
})

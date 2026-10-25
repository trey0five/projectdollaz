import { describe, it, expect } from 'vitest'
import {
  entryNoun,
  previewCopy,
  recentlyRemovedRow,
  removedToast,
  restoredToast,
  swapCopy,
} from './removalCopy.js'

const THIS_YEAR = new Date().getFullYear()
const at = (md) => `${THIS_YEAR}-${md}T15:00:00.000Z`
const UNDO = 'You can undo this for 30 days from Recently removed.'

const file = (over = {}) => ({
  importId: 'i1',
  sourceName: 'TB FY25.xlsx',
  uploadedAt: at('10-03'),
  half: null,
  source: 'upload',
  active: true,
  ...over,
})
const fx = (over = {}) => ({
  statements: 'emptied',
  boardReport: true,
  budgetVsActual: false,
  quickbooks: false,
  self: null,
  laterYears: [],
  ...over,
})
const tbPreview = (over = {}) => ({
  kind: 'trial_balance',
  periodId: 'p25',
  periodLabel: 'FY 2025',
  shortLabel: 'FY25',
  periodEndDate: '2025-06-30',
  role: 'cy',
  activeImportId: 'i1',
  files: [file()],
  monthKeys: [],
  monthsOnFile: 0,
  budget: null,
  restoreDays: 30,
  ...over,
  effects: fx(over.effects),
})
const FY26_PY = { periodId: 'p26', shortLabel: 'FY26', comparison: 'prior-year', after: null }

describe('previewCopy — this year’s trial balance', () => {
  it('the approved sentence: one later year loses its comparison', () => {
    expect(previewCopy(tbPreview({ effects: { laterYears: [FY26_PY] } }))).toEqual({
      title: 'Remove the FY25 trial balance?',
      lines: [
        'Your FY25 statements and board report will be emptied, and FY26 loses its prior-year comparison.',
        UNDO,
      ],
      confirmLabel: 'Remove trial balance',
    })
  })

  it('falls back to an earlier year', () => {
    const p = tbPreview({ effects: { laterYears: [{ ...FY26_PY, after: { periodId: 'p24', shortLabel: 'FY24' } }] } })
    expect(previewCopy(p).lines[0]).toBe(
      'Your FY25 statements and board report will be emptied, and FY26 will compare against FY24 instead.',
    )
  })

  it('two later changes get their own lines; no board report', () => {
    const p = tbPreview({
      effects: {
        boardReport: false,
        laterYears: [FY26_PY, { periodId: 'p26', shortLabel: 'FY26', comparison: 'audited', after: { periodId: 'p24', shortLabel: 'FY24' } }],
      },
    })
    expect(previewCopy(p).lines).toEqual([
      'Your FY25 statements will be emptied.',
      'FY26 loses its prior-year comparison.',
      "FY26 will use FY24's audited figures instead.",
      UNDO,
    ])
  })

  it('budget, QuickBooks and earlier uploads', () => {
    const p = tbPreview({
      files: [file({ source: 'quickbooks' }), file({ importId: 'i0', active: false }), file({ importId: 'i-1', active: false })],
      effects: { budgetVsActual: true, quickbooks: true },
    })
    expect(previewCopy(p).lines).toEqual([
      'Your FY25 statements and board report will be emptied.',
      'Budget vs. actual for FY25 will have no actuals to compare.',
      'This also removes 2 earlier uploads of this file.',
      'This came from QuickBooks, so a later QuickBooks sync may bring it back.',
      UNDO,
    ])
  })

  it('a hidden half is named, and the title names the active half', () => {
    const p = tbPreview({
      files: [file({ half: 'bs' }), file({ importId: 'i0', half: 'pl', active: false, uploadedAt: at('09-12') })],
    })
    const c = previewCopy(p)
    expect(c.title).toBe('Remove the FY25 Balance Sheet?')
    expect(c.confirmLabel).toBe('Remove Balance Sheet')
    expect(c.lines).toContain(
      "It also removes the Profit and Loss you uploaded on Sep 12, which isn't in your statements right now.",
    )
    expect(c.lines.some((l) => l.includes('earlier upload'))).toBe(false)
  })
})

describe('previewCopy — comparatives, months, budget', () => {
  it('last year’s trial balance, with and without a fallback', () => {
    const p = (after) =>
      tbPreview({ shortLabel: 'FY26', role: 'py', effects: { statements: 'rebuilt', self: { comparison: 'prior-year', after } } })
    expect(previewCopy(p({ periodId: 'p25', shortLabel: 'FY25' }))).toEqual({
      title: "Remove last year's trial balance saved with FY26?",
      lines: ["FY26's statements will be rebuilt without it.", 'FY26 will compare against your FY25 trial balance instead.', UNDO],
      confirmLabel: 'Remove',
    })
    expect(previewCopy(p(null)).lines[1]).toBe('FY26 will have no prior-year column.')
  })

  it('audited figures', () => {
    const c = previewCopy(
      tbPreview({ shortLabel: 'FY26', role: 'audit', effects: { statements: 'rebuilt', self: { comparison: 'audited', after: null } } }),
    )
    expect(c.title).toBe('Remove the audited figures saved with FY26?')
    expect(c.lines).toEqual(["FY26's statements will be rebuilt without them.", 'FY26 will have no audited column.', UNDO])
  })

  const monthly = (keys, monthsOnFile) => ({
    kind: 'monthly',
    shortLabel: 'FY26',
    role: null,
    files: [],
    monthKeys: keys,
    monthsOnFile,
    budget: null,
    effects: fx({ statements: 'none' }),
    restoreDays: 30,
  })

  it('one month', () => {
    expect(previewCopy(monthly(['2026-03'], 8))).toEqual({
      title: 'Remove the March 2026 numbers?',
      lines: [
        'Your FY26 month-by-month board report will no longer show March 2026.',
        "Your FY26 trial balance and statements don't change.",
        UNDO,
      ],
      confirmLabel: 'Remove month',
    })
  })

  it('all months, and some months', () => {
    const all = previewCopy(monthly(['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'], 8))
    expect(all.title).toBe('Remove all 8 months of FY26 numbers?')
    expect(all.lines[0]).toBe('Your FY26 month-by-month board report will be empty.')
    expect(all.confirmLabel).toBe('Remove 8 months')
    const some = previewCopy(monthly(['2026-01', '2026-02', '2026-03'], 8))
    expect(some.title).toBe('Remove 3 months of FY26 numbers?')
    expect(some.lines[0]).toBe('Your FY26 month-by-month board report will no longer show January, February and March 2026.')
  })

  it('a budget with a forecast', () => {
    expect(
      previewCopy({ kind: 'budget', shortLabel: 'FY26', role: null, files: [], monthKeys: [], budget: { kind: 'spread', hasForecast: true }, effects: fx({ statements: 'none' }) }),
    ).toEqual({
      title: 'Remove the FY26 budget?',
      lines: [
        'Budget vs. actual for FY26, in your reports and board report, will be empty.',
        'Your saved year-end forecast goes with it.',
        "Your trial balance and statements don't change.",
        UNDO,
      ],
      confirmLabel: 'Remove budget',
    })
  })
})

describe('toasts and rows', () => {
  const entry = (over) => ({
    id: 'r1',
    periodId: 'p25',
    periodLabel: 'FY 2025',
    shortLabel: 'FY25',
    periodEndDate: '2025-06-30',
    role: null,
    monthKeys: [],
    files: [],
    budgetKind: null,
    removedAt: at('10-25'),
    removedBy: null,
    expiresAt: at('11-24'),
    conflict: null,
    ...over,
  })
  const cy = entry({ kind: 'trial_balance', role: 'cy', files: [{ sourceName: 'TB.xlsx', uploadedAt: at('10-03'), half: null }] })

  it('every kind', () => {
    expect(removedToast(cy)).toBe('FY25 trial balance removed.')
    expect(restoredToast(cy)).toBe('Brought back the FY25 trial balance.')
    const pl = entry({ kind: 'trial_balance', role: 'cy', files: [{ sourceName: 'PL.xlsx', uploadedAt: at('10-03'), half: 'pl' }] })
    expect(removedToast(pl)).toBe('FY25 Profit and Loss removed.')
    const py = entry({ kind: 'trial_balance', role: 'py', shortLabel: 'FY26' })
    expect(removedToast(py)).toBe("Last year's trial balance saved with FY26 removed.")
    expect(restoredToast(py)).toBe("Brought back last year's trial balance saved with FY26.")
    const audit = entry({ kind: 'trial_balance', role: 'audit', shortLabel: 'FY26' })
    expect(removedToast(audit)).toBe('Audited figures saved with FY26 removed.')
    const one = entry({ kind: 'monthly', shortLabel: 'FY26', monthKeys: ['2026-03'] })
    expect(removedToast(one)).toBe('March 2026 numbers removed.')
    expect(restoredToast(one)).toBe('Brought back the March 2026 numbers.')
    const eight = entry({ kind: 'monthly', shortLabel: 'FY26', monthKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })
    expect(removedToast(eight)).toBe('8 months of FY26 numbers removed.')
    expect(restoredToast(eight)).toBe('Brought back 8 months of FY26 numbers.')
    const budget = entry({ kind: 'budget', shortLabel: 'FY26' })
    expect(removedToast(budget)).toBe('FY26 budget removed.')
    expect(restoredToast(budget)).toBe('Brought back the FY26 budget.')
    expect(entryNoun(budget)).toBe('the FY26 budget')
  })

  it('the Recently removed row says who', () => {
    expect(recentlyRemovedRow({ ...cy, removedBy: { id: 'u2', name: 'Jacqui' } }, 'u1')).toBe(
      'FY25 trial balance · removed Oct 25 by Jacqui',
    )
    expect(recentlyRemovedRow({ ...cy, removedBy: { id: 'u1', name: 'Me' } }, 'u1')).toBe('FY25 trial balance · removed Oct 25 by you')
    expect(recentlyRemovedRow(cy, 'u1')).toBe('FY25 trial balance · removed Oct 25')
  })

  it('the swap popup', () => {
    expect(swapCopy(cy, { sourceName: 'New.xlsx', uploadedAt: at('10-24'), monthKeys: [] })).toEqual({
      title: 'Bring back the FY25 trial balance from Oct 3?',
      lines: ['It takes the place of the one added Oct 24, which moves to Recently removed.'],
      keepLabel: 'Keep the newer one',
      confirmLabel: 'Swap them',
    })
    const m = entry({ kind: 'monthly', shortLabel: 'FY26', monthKeys: ['2026-03'] })
    expect(swapCopy(m, { sourceName: null, uploadedAt: null, monthKeys: ['2026-03'] }).lines[0]).toBe(
      'It takes the place of the March 2026 numbers you added since, which move to Recently removed.',
    )
  })
})

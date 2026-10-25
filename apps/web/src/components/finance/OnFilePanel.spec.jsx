import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const api = vi.hoisted(() => ({ previewRemoval: vi.fn(), remove: vi.fn(), restore: vi.fn(), onFile: vi.fn() }))
const persistence = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('../../lib/api.js', () => ({
  financeFilesApi: api,
  apiErrorMessage: (e, fallback) => e?.response?.data?.message || fallback,
}))
vi.mock('../../context/PersistenceContext.jsx', () => ({ usePersistence: () => persistence }))
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

import OnFilePanel from './OnFilePanel.jsx'

const Y = new Date().getFullYear()
const at = (md) => `${Y}-${md}T15:00:00.000Z`
const tb = (over = {}) => ({
  role: 'cy',
  importId: 'imp-25',
  sourceName: 'TB FY25.xlsx',
  source: 'upload',
  rowCount: 40,
  uploadedAt: at('10-03'),
  uploadedBy: { id: 'u2', name: 'Jacqui Lee' },
  half: null,
  versions: 1,
  hiddenHalf: null,
  ...over,
})
const year = (end, over = {}) => {
  const yy = end.slice(2, 4)
  return {
    periodId: `p${yy}`,
    label: `FY 20${yy}`,
    shortLabel: `FY${yy}`,
    periodEndDate: end,
    periodType: 'fy',
    hasStatements: true,
    hasBoardReport: false,
    trialBalances: [],
    monthly: null,
    budget: null,
    ...over,
  }
}
const months = (keys) => ({
  count: keys.length,
  total: 12,
  months: keys.map((monthKey) => ({ monthKey, sourceName: `${monthKey}.xlsx`, uploadedAt: at('03-02') })),
})
const DATA = {
  restoreDays: 30,
  years: [
    year('2026-06-30', {
      trialBalances: [tb({ importId: 'imp-26', source: 'quickbooks', uploadedAt: at('10-24') })],
      monthly: months(['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']),
      budget: { kind: 'spread', hasForecast: false, updatedAt: at('10-03'), updatedBy: { id: 'u2', name: 'Jacqui Lee' } },
    }),
    year('2025-06-30', {
      trialBalances: [
        tb({ half: 'pl', hiddenHalf: { half: 'bs', sourceName: 'BS.xlsx', uploadedAt: at('09-12') } }),
        tb({ role: 'py', importId: 'imp-25py', sourceName: 'PY.xlsx' }),
      ],
    }),
  ],
  recentlyRemoved: [],
}
const removed = (over = {}) => ({
  id: 'r1',
  kind: 'trial_balance',
  periodId: 'p24',
  periodLabel: 'FY 2024',
  shortLabel: 'FY24',
  periodEndDate: '2024-06-30',
  role: 'cy',
  monthKeys: [],
  files: [{ sourceName: 'TB FY24.xlsx', uploadedAt: at('10-01'), half: null }],
  budgetKind: null,
  removedAt: at('10-25'),
  removedBy: { id: 'u1', name: 'Me' },
  expiresAt: at('11-24'),
  conflict: null,
  ...over,
})

const show = (props = {}) => {
  const onFile = { data: DATA, loading: false, error: null, reload: vi.fn(), ...(props.onFile || {}) }
  const onReplace = vi.fn()
  const onManageMonths = vi.fn()
  render(
    <OnFilePanel
      schoolId="s1"
      canEdit={props.canEdit ?? true}
      onFile={onFile}
      onReplace={onReplace}
      onManageMonths={onManageMonths}
    />,
  )
  return { onFile, onReplace, onManageMonths }
}

beforeEach(() => {
  persistence.refresh.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

describe('OnFilePanel', () => {
  it('lists the years newest first with what each holds', () => {
    show()
    const years = screen.getAllByTestId('on-file-year')
    expect(years.map((y) => y.querySelector('h3').textContent)).toEqual([
      'FY26 · year ending June 30, 2026',
      'FY25 · year ending June 30, 2025',
    ])
    expect(screen.getByText('2 years')).toBeTruthy()
    const fy26 = within(years[0])
    expect(fy26.getByText('From QuickBooks · synced Oct 24')).toBeTruthy()
    expect(fy26.getByText('8 of 12 months · Jul 2025 – Feb 2026')).toBeTruthy()
    expect(fy26.getByText('Month by month · saved Oct 3 by Jacqui Lee')).toBeTruthy()
    const fy25 = within(years[1])
    expect(fy25.getByText('Profit and Loss only')).toBeTruthy()
    expect(fy25.getByText('TB FY25.xlsx · uploaded Oct 3 by Jacqui Lee')).toBeTruthy()
    expect(fy25.getByText('An earlier Balance Sheet (Sep 12) was replaced by this file and isn’t used.')).toBeTruthy()
    expect(fy25.getByText('Last year’s trial balance (for comparison)')).toBeTruthy()
    expect(fy25.getByText('Not added: monthly numbers, budget')).toBeTruthy()
  })

  it('empty, loading and error states', () => {
    show({ onFile: { data: { restoreDays: 30, years: [], recentlyRemoved: [] } } })
    expect(screen.getByText('Nothing on file yet. Files you add show up here, one row per year.')).toBeTruthy()
    cleanup()
    show({ onFile: { data: null, loading: true } })
    expect(screen.getByLabelText("Loading what's already on file")).toBeTruthy()
    cleanup()
    const { onFile } = show({ onFile: { data: null, error: new Error('x') } })
    expect(screen.getByText('We couldn’t load what’s already on file.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onFile.reload).toHaveBeenCalled()
  })

  it('viewers see the rows but no buttons and no Recently removed', () => {
    show({ canEdit: false, onFile: { data: { ...DATA, recentlyRemoved: [removed()] } } })
    expect(screen.getAllByTestId('on-file-year')).toHaveLength(2)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByTestId('recently-removed')).toBeNull()
  })

  it('shows three years, the rest behind "Show 2 more years"', () => {
    const many = ['2026', '2025', '2024', '2023', '2022'].map((y) => year(`${y}-06-30`, { trialBalances: [tb({ importId: `i${y}` })] }))
    show({ onFile: { data: { ...DATA, years: many } } })
    expect(screen.getAllByTestId('on-file-year')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more years' }))
    expect(screen.getAllByTestId('on-file-year')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getAllByTestId('on-file-year')).toHaveLength(3)
  })

  it('Replace and Manage months hand back the year', () => {
    const { onReplace, onManageMonths } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Replace the FY25 Profit and Loss' }))
    expect(onReplace).toHaveBeenCalledWith({ kind: 'trial_balance', periodId: 'p25', shortLabel: 'FY25' })
    fireEvent.click(screen.getByRole('button', { name: 'Replace the FY26 budget' }))
    expect(onReplace).toHaveBeenLastCalledWith({ kind: 'budget', periodId: 'p26', shortLabel: 'FY26' })
    fireEvent.click(screen.getByRole('button', { name: 'Manage FY26 months' }))
    expect(onManageMonths).toHaveBeenCalledWith('p26')
  })

  it('Remove opens the popup for that item', async () => {
    api.previewRemoval.mockReturnValue(new Promise(() => {}))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Remove the FY26 trial balance' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(api.previewRemoval).toHaveBeenCalledWith('s1', { kind: 'trial_balance', importId: 'imp-26' })
    cleanup()
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Remove all FY26 monthly numbers' }))
    await waitFor(() =>
      expect(api.previewRemoval).toHaveBeenLastCalledWith('s1', {
        kind: 'monthly',
        periodId: 'p26',
        monthKeys: ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'],
      }),
    )
  })

  it('Restore without a conflict brings it back straight away', async () => {
    api.restore.mockResolvedValue({ data: {} })
    show({ onFile: { data: { ...DATA, recentlyRemoved: [removed()] } } })
    expect(screen.getByText('Recently removed (1)')).toBeTruthy()
    expect(screen.getByText('FY24 trial balance · removed Oct 25 by you')).toBeTruthy()
    expect(screen.getByText('Kept for 30 days, then erased for good.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('Brought back the FY24 trial balance.')).toBeTruthy()
    expect(api.restore).toHaveBeenCalledWith('s1', 'r1', {})
    await waitFor(() => expect(persistence.refresh).toHaveBeenCalled())
  })

  it('Restore over newer data asks to swap, and swapping sends replaceCurrent', async () => {
    api.restore.mockResolvedValue({ data: {} })
    const conflict = { sourceName: 'New FY24.xlsx', uploadedAt: at('10-24'), monthKeys: [] }
    show({ onFile: { data: { ...DATA, recentlyRemoved: [removed({ conflict })] } } })
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(api.restore).not.toHaveBeenCalled()
    expect(await screen.findByText('Bring back the FY24 trial balance from Oct 1?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Swap them' }))
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith('s1', 'r1', { replaceCurrent: true }))
  })

  it('a restore that finds newer data (409) opens the swap popup', async () => {
    api.restore.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'SLOT_FILLED', current: { sourceName: 'X.xlsx', uploadedAt: at('10-24'), monthKeys: [] } } },
    })
    show({ onFile: { data: { ...DATA, recentlyRemoved: [removed()] } } })
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('It takes the place of the one added Oct 24, which moves to Recently removed.')).toBeTruthy()
  })
})

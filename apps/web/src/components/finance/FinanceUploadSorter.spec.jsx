import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({ onFile: vi.fn(), previewRemoval: vi.fn(), remove: vi.fn(), restore: vi.fn() }))
const sort = vi.hoisted(() => ({ verdict: null }))
const order = vi.hoisted(() => [])
const persistence = vi.hoisted(() => ({
  periods: [
    { id: 'p26', label: 'FY 2026', periodEndDate: '2026-06-30' },
    { id: 'p25', label: 'FY 2025', periodEndDate: '2025-06-30' },
  ],
  activePeriod: { id: 'p26', label: 'FY 2026', periodEndDate: '2026-06-30' },
  hydrationToken: 1,
  refresh: vi.fn(),
  focusPeriod: vi.fn(),
}))

vi.mock('../../lib/api.js', () => ({
  financeFilesApi: api,
  apiErrorMessage: (e, fallback) => fallback,
}))
vi.mock('../../context/PersistenceContext.jsx', () => ({ usePersistence: () => persistence }))
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../lib/intakeMemory.js', () => ({ getIntakeMemory: async () => ({}) }))
vi.mock('../../lib/financeSort.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, sortFinanceFile: vi.fn(async () => sort.verdict) }
})

import FinanceUploadSorter from './FinanceUploadSorter.jsx'
import { clearPending, takePending } from '../../lib/pendingUploads.js'

const Y = new Date().getFullYear()
const at = (md) => `${Y}-${md}T15:00:00.000Z`
const tb = (over = {}) => ({
  role: 'cy',
  importId: 'imp-25',
  sourceName: 'TB FY25.xlsx',
  source: 'upload',
  rowCount: 40,
  uploadedAt: at('10-03'),
  uploadedBy: null,
  half: null,
  versions: 1,
  hiddenHalf: null,
  ...over,
})
const FY25 = {
  periodId: 'p25',
  label: 'FY 2025',
  shortLabel: 'FY25',
  periodEndDate: '2025-06-30',
  periodType: 'fy',
  hasStatements: true,
  hasBoardReport: false,
  trialBalances: [tb()],
  monthly: null,
  budget: null,
}
const inventory = (years) => ({ data: { restoreDays: 30, years, recentlyRemoved: [] } })
const cand = (over) => ({ key: Math.random().toString(36), sourceName: 'f.xlsx', status: 'ready', partial: null, isMonthly: false, periodType: 'fy', metadata: {}, ...over })

const drop = (name) => {
  const file = new File(['x'], name)
  const zone = screen.getByText('Upload your financial files').closest('div')
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
  return file
}

beforeEach(() => {
  order.length = 0
  clearPending()
  persistence.focusPeriod.mockImplementation(async (id) => order.push(['focusPeriod', id]))
})
afterEach(() => cleanup())

const mount = (props = {}) => {
  const goToOption = vi.fn((...args) => order.push(['goToOption', ...args]))
  render(<FinanceUploadSorter schoolId="s1" canEdit goToOption={goToOption} {...props} />)
  return goToOption
}

describe('FinanceUploadSorter with Already on file', () => {
  it('shows what is on file above the drop zone', async () => {
    api.onFile.mockResolvedValue(inventory([FY25]))
    mount()
    expect(await screen.findByText('FY25 · year ending June 30, 2025')).toBeTruthy()
    const panel = screen.getByTestId('on-file-panel')
    const zone = screen.getByText('Upload your financial files')
    expect(panel.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('an FY25 file with FY25 on file says it replaces it, and goes to Add years', async () => {
    api.onFile.mockResolvedValue(inventory([FY25]))
    sort.verdict = {
      kind: 'annual',
      destination: 'tb-single',
      title: 'Trial balance',
      detail: '40 accounts · fiscal year 2025.',
      candidates: [cand({ periodEndDate: '2025-06-30', year: 2025 })],
    }
    const goToOption = mount()
    await screen.findByText('FY25 · year ending June 30, 2025')
    const file = drop('TB FY25 v2.xlsx')
    expect((await screen.findByTestId('replace-note')).textContent).toBe('Replaces your FY25 trial balance (uploaded Oct 3)')
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Add years' }))
    await waitFor(() => expect(goToOption).toHaveBeenCalledWith('tb', undefined))
    expect(takePending('tb-bulk')).toEqual([file])
  })

  it('a monthly file opens Monthly numbers on its own year', async () => {
    api.onFile.mockResolvedValue(inventory([FY25]))
    sort.verdict = {
      kind: 'monthly',
      destination: 'monthly',
      title: 'Monthly trial balance',
      detail: 'Month-end numbers for 2025-03.',
      candidates: [cand({ periodEndDate: '2025-03-31', isMonthly: true, metadata: { monthKey: '2025-03' } })],
    }
    const goToOption = mount()
    await screen.findByText('FY25 · year ending June 30, 2025')
    drop('Mar.xlsx')
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to Monthly numbers' }))
    await waitFor(() => expect(goToOption).toHaveBeenCalledWith('monthly', { periodId: 'p25' }))
  })

  it('the other half of a saved year opens that year before the trial balance step', async () => {
    api.onFile.mockResolvedValue(inventory([{ ...FY25, trialBalances: [tb({ half: 'pl' })] }]))
    sort.verdict = {
      kind: 'half',
      destination: 'tb-single',
      title: 'Balance Sheet',
      detail: 'Half a trial balance.',
      candidates: [cand({ periodEndDate: '2025-06-30', partial: 'bs', status: 'partial' })],
    }
    mount()
    await screen.findByText('FY25 · year ending June 30, 2025')
    drop('BS FY25.xlsx')
    expect((await screen.findByTestId('replace-note')).textContent).toMatch(/^Goes with your saved FY25 Profit and Loss/)
    fireEvent.click(screen.getByRole('button', { name: /Continue to This year/ }))
    await waitFor(() => expect(order.some((o) => o[0] === 'goToOption')).toBe(true))
    expect(order).toEqual([
      ['focusPeriod', 'p25'],
      ['goToOption', 'tb', undefined],
    ])
    expect(takePending('tb-single')).toHaveLength(1)
  })
  it('a budget file warns about, and opens on, the page’s year — not the intake’s last year', async () => {
    const BUDGET = { kind: 'spread', hasForecast: false, updatedAt: at('10-03'), updatedBy: null }
    const FY26 = { ...FY25, periodId: 'p26', label: 'FY 2026', shortLabel: 'FY26', periodEndDate: '2026-06-30', budget: BUDGET }
    api.onFile.mockResolvedValue(inventory([FY26, FY25]))
    persistence.activePeriod = { id: 'p25', label: 'FY 2025', periodEndDate: '2025-06-30' } // intake last on FY25
    sort.verdict = { kind: 'budget', destination: 'budget', title: 'Budget', detail: 'A budget.', candidates: [] }
    try {
      const goToOption = mount({ pagePeriodId: 'p26' })
      await screen.findByText('FY26 · year ending June 30, 2026')
      drop('Budget FY26.xlsx')
      expect((await screen.findByTestId('replace-note')).textContent).toBe('Replaces your FY26 budget (saved Oct 3)')
      fireEvent.click(screen.getByRole('button', { name: 'Continue to Budget' }))
      await waitFor(() => expect(goToOption).toHaveBeenCalledWith('budget', { periodId: 'p26' }))
    } finally {
      persistence.activePeriod = { id: 'p26', label: 'FY 2026', periodEndDate: '2026-06-30' }
    }
  })

  it('Continue waits until we know what is already on file', async () => {
    let release
    api.onFile.mockReturnValue(new Promise((r) => (release = r)))
    sort.verdict = {
      kind: 'annual',
      destination: 'tb-single',
      title: 'Trial balance',
      detail: '40 accounts · fiscal year 2025.',
      candidates: [cand({ periodEndDate: '2025-06-30', year: 2025 })],
    }
    mount()
    drop('TB FY25 v2.xlsx')
    const btn = await screen.findByRole('button', { name: /Continue to/ })
    expect(btn.disabled).toBe(true)
    expect(screen.getByText('Checking what’s already on file…')).toBeTruthy()
    release(inventory([FY25]))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to Add years' }).disabled).toBe(false))
  })

  it('when the list fails to load, a dated annual file still goes to Add years (it can replace there)', async () => {
    api.onFile.mockRejectedValue(new Error('down'))
    sort.verdict = {
      kind: 'annual',
      destination: 'tb-single',
      title: 'Trial balance',
      detail: '40 accounts · fiscal year 2025.',
      candidates: [cand({ periodEndDate: '2025-06-30', year: 2025 })],
    }
    const goToOption = mount()
    await screen.findByText('We couldn’t load what’s already on file.')
    const file = drop('TB FY25 v2.xlsx')
    expect((await screen.findByTestId('replace-note')).textContent).toMatch(/^We couldn't check what's already on file for FY25/)
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Add years' }))
    await waitFor(() => expect(goToOption).toHaveBeenCalledWith('tb', undefined))
    expect(takePending('tb-bulk')).toEqual([file])
  })

  it('a saved year’s other half gets its own Continue, which opens that year', async () => {
    api.onFile.mockResolvedValue(inventory([{ ...FY25, trialBalances: [tb({ half: 'pl' })] }]))
    const annual26 = {
      kind: 'annual',
      destination: 'tb-single',
      title: 'Trial balance',
      detail: '40 accounts · fiscal year 2026.',
      candidates: [cand({ periodEndDate: '2026-06-30', year: 2026 })],
    }
    const half25 = {
      kind: 'half',
      destination: 'tb-single',
      title: 'Balance Sheet',
      detail: 'Half a trial balance.',
      candidates: [cand({ periodEndDate: '2025-06-30', partial: 'bs', status: 'partial' })],
    }
    mount()
    await screen.findByText('FY25 · year ending June 30, 2025')
    sort.verdict = annual26
    drop('TB FY26.xlsx')
    await screen.findByText(/fiscal year 2026/)
    sort.verdict = half25
    const bs = drop('BS FY25.xlsx')
    fireEvent.click(await screen.findByRole('button', { name: 'FY25 trial balance (1 file)' }))
    await waitFor(() => expect(order.some((o) => o[0] === 'goToOption')).toBe(true))
    expect(order).toEqual([
      ['focusPeriod', 'p25'],
      ['goToOption', 'tb', undefined],
    ])
    expect(takePending('tb-single')).toEqual([bs])
    expect(screen.getByRole('button', { name: 'This year’s trial balance (1 file)' })).toBeTruthy()
  })

  it('a Replace remembers the year it was for, and says when the file is for another', async () => {
    api.onFile.mockResolvedValue(inventory([FY25]))
    sort.verdict = {
      kind: 'annual',
      destination: 'tb-single',
      title: 'Trial balance',
      detail: '40 accounts · fiscal year 2026.',
      candidates: [cand({ periodEndDate: '2026-06-30', year: 2026 })],
    }
    mount()
    await screen.findByText('FY25 · year ending June 30, 2025')
    fireEvent.click(screen.getByRole('button', { name: 'Replace the FY25 trial balance' }))
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [new File(['x'], 'TB FY26.xlsx')] } })
    const notes = await screen.findAllByTestId('replace-note')
    expect(notes.map((n) => n.textContent)).toEqual([
      'You chose to replace FY25, but this file is for FY26. It will go to FY26.',
    ])
  })
})

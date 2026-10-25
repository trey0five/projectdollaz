import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

const api = vi.hoisted(() => ({ previewRemoval: vi.fn(), remove: vi.fn(), restore: vi.fn(), onFile: vi.fn() }))
const persistence = vi.hoisted(() => ({ refresh: vi.fn() }))
const order = vi.hoisted(() => [])

vi.mock('../../lib/api.js', () => ({
  financeFilesApi: api,
  apiErrorMessage: (e, fallback) => e?.response?.data?.message || fallback,
}))
vi.mock('../../context/PersistenceContext.jsx', () => ({ usePersistence: () => persistence }))
vi.mock('../../lib/undoToast.js', () => ({ showUndo: vi.fn((x) => order.push(['showUndo', x])) }))

import RemoveDataDialog from './RemoveDataDialog.jsx'
import { showUndo } from '../../lib/undoToast.js'

const THIS_YEAR = new Date().getFullYear()
const PREVIEW = {
  kind: 'trial_balance',
  periodId: 'p25',
  periodLabel: 'FY 2025',
  shortLabel: 'FY25',
  periodEndDate: '2025-06-30',
  role: 'cy',
  activeImportId: 'imp-new',
  files: [{ importId: 'imp-new', sourceName: 'TB.xlsx', uploadedAt: `${THIS_YEAR}-10-03T15:00:00Z`, half: null, source: 'upload', active: true }],
  monthKeys: [],
  monthsOnFile: 0,
  budget: null,
  effects: {
    statements: 'emptied',
    boardReport: true,
    budgetVsActual: false,
    quickbooks: false,
    self: null,
    laterYears: [{ periodId: 'p26', shortLabel: 'FY26', comparison: 'prior-year', after: null }],
  },
  restoreDays: 30,
}
const REMOVAL = { id: 'r1', kind: 'trial_balance', shortLabel: 'FY25', role: 'cy', files: [], monthKeys: [] }

const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  order.length = 0
  persistence.refresh.mockImplementation(async () => order.push(['refresh']))
  api.remove.mockResolvedValue({ data: { removal: REMOVAL, effects: { statements: 'cleared', rebuilt: [], failed: [] } } })
})
afterEach(() => cleanup())

const open = (props = {}) =>
  render(
    <RemoveDataDialog
      open
      schoolId="s1"
      target={{ kind: 'trial_balance', importId: 'imp-old' }}
      onClose={props.onClose || vi.fn()}
      onRemoved={props.onRemoved}
    />,
  )

describe('RemoveDataDialog', () => {
  it('checks what it affects first; confirm waits for the preview', async () => {
    const d = deferred()
    api.previewRemoval.mockReturnValue(d.promise)
    open()
    expect(screen.getByText('Checking what this affects…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' }).disabled).toBe(true)
    await act(async () => d.resolve({ data: PREVIEW }))
    expect(api.previewRemoval).toHaveBeenCalledWith('s1', { kind: 'trial_balance', importId: 'imp-old' })
    expect(screen.getByRole('alertdialog').getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Remove the FY25 trial balance?')).toBeTruthy()
    expect(
      screen.getByText('Your FY25 statements and board report will be emptied, and FY26 loses its prior-year comparison.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove trial balance' }).disabled).toBe(false)
  })

  it('focus starts on Keep it; Esc closes', async () => {
    api.previewRemoval.mockResolvedValue({ data: PREVIEW })
    const onClose = vi.fn()
    open({ onClose })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep it' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('confirm sends the target plus the version it showed, then offers Undo and refreshes', async () => {
    api.previewRemoval.mockResolvedValue({ data: PREVIEW })
    const onClose = vi.fn(() => order.push(['close']))
    const onRemoved = vi.fn()
    open({ onClose, onRemoved })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove trial balance' }))
    await waitFor(() => expect(persistence.refresh).toHaveBeenCalled())
    expect(api.remove).toHaveBeenCalledWith('s1', {
      kind: 'trial_balance',
      importId: 'imp-old',
      expectedImportId: 'imp-new',
    })
    expect(showUndo).toHaveBeenCalledWith({ schoolId: 's1', entry: REMOVAL })
    expect(onRemoved).toHaveBeenCalled()
    expect(order.map((o) => o[0])).toEqual(['showUndo', 'close', 'refresh'])
  })

  it('does not send expectedImportId for months or a budget', async () => {
    api.previewRemoval.mockResolvedValue({
      data: { ...PREVIEW, kind: 'budget', role: null, activeImportId: null, files: [], budget: { kind: 'spread', hasForecast: false }, effects: { ...PREVIEW.effects, statements: 'none', laterYears: [] } },
    })
    render(<RemoveDataDialog open schoolId="s1" target={{ kind: 'budget', periodId: 'p25' }} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove budget' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('s1', { kind: 'budget', periodId: 'p25' }))
  })

  it('a 409 CHANGED says so and checks again', async () => {
    api.previewRemoval.mockResolvedValue({ data: PREVIEW })
    api.remove.mockRejectedValue({
      response: { status: 409, data: { code: 'CHANGED', message: 'This changed since you opened it. Have another look.' } },
    })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove trial balance' }))
    expect(await screen.findByText('This changed since you opened it. Have another look.')).toBeTruthy()
    await waitFor(() => expect(api.previewRemoval).toHaveBeenCalledTimes(2))
    expect(showUndo).not.toHaveBeenCalled()
  })

  it('any other failure shows the callout and keeps the dialog', async () => {
    api.previewRemoval.mockResolvedValue({ data: PREVIEW })
    api.remove.mockRejectedValue({ response: { status: 500, data: {} } })
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove trial balance' }))
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't remove it. Please try again.")
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a failed preview offers Try again', async () => {
    api.previewRemoval.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ data: PREVIEW })
    open()
    expect(await screen.findByText("We couldn't check what this affects.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Remove the FY25 trial balance?')).toBeTruthy()
  })

  it('a file that is already gone says so, offers no retry, and reloads the lists', async () => {
    api.previewRemoval.mockRejectedValueOnce({
      response: { status: 404, data: { code: 'IMPORT_NOT_FOUND', message: "That trial balance isn't on file anymore." } },
    })
    open()
    expect(await screen.findByText("That trial balance isn't on file anymore.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    await waitFor(() => expect(persistence.refresh).toHaveBeenCalled())
  })

  it('swap mode brings back the removed data in place of the newer one', async () => {
    const onClose = vi.fn()
    api.restore.mockResolvedValue({ data: { restored: REMOVAL, replaced: null, effects: {} } })
    render(
      <RemoveDataDialog
        open
        mode="swap"
        schoolId="s1"
        entry={{ ...REMOVAL, files: [{ sourceName: 'TB.xlsx', uploadedAt: `${THIS_YEAR}-10-03T15:00:00Z`, half: null }] }}
        current={{ sourceName: 'New.xlsx', uploadedAt: `${THIS_YEAR}-10-24T15:00:00Z`, monthKeys: [] }}
        onClose={onClose}
      />,
    )
    expect(screen.getByText('Bring back the FY25 trial balance from Oct 3?')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep the newer one' }))
    fireEvent.click(screen.getByRole('button', { name: 'Swap them' }))
    await waitFor(() => expect(persistence.refresh).toHaveBeenCalled())
    expect(api.restore).toHaveBeenCalledWith('s1', 'r1', { replaceCurrent: true })
    expect(onClose).toHaveBeenCalled()
    expect(showUndo).not.toHaveBeenCalled()
  })
})

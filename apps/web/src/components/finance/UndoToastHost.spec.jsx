import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const api = vi.hoisted(() => ({ restore: vi.fn() }))
const persistence = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal()
  // Exit animations would keep a dismissed toast in the DOM under fake timers.
  return { ...actual, useReducedMotion: () => true, AnimatePresence: ({ children }) => <>{children}</> }
})
vi.mock('../../lib/api.js', () => ({
  financeFilesApi: api,
  apiErrorMessage: (e, fallback) => e?.response?.data?.message || fallback,
}))
vi.mock('../../context/PersistenceContext.jsx', () => ({ usePersistence: () => persistence }))

import UndoToastHost from './UndoToastHost.jsx'
import { dismissUndo, showUndo, UNDO_MS } from '../../lib/undoToast.js'

const ENTRY = {
  id: 'r1',
  kind: 'trial_balance',
  periodId: 'p25',
  shortLabel: 'FY25',
  role: 'cy',
  monthKeys: [],
  files: [{ sourceName: 'TB.xlsx', uploadedAt: '2026-10-03T15:00:00Z', half: null }],
}

beforeEach(() => {
  vi.useFakeTimers()
  persistence.refresh.mockResolvedValue(undefined)
})
afterEach(() => {
  act(() => dismissUndo())
  cleanup()
  vi.useRealTimers()
})

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('UndoToastHost', () => {
  it('shows the removal, then hides after 10 seconds', () => {
    render(<UndoToastHost />)
    expect(screen.queryByTestId('undo-toast')).toBeNull()
    act(() => showUndo({ schoolId: 's1', entry: ENTRY }))
    expect(screen.getByText('FY25 trial balance removed.')).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => vi.advanceTimersByTime(UNDO_MS - 100))
    expect(screen.queryByTestId('undo-toast')).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByTestId('undo-toast')).toBeNull()
  })

  it('pauses the countdown while the pointer is on it', () => {
    render(<UndoToastHost />)
    act(() => showUndo({ schoolId: 's1', entry: ENTRY }))
    act(() => vi.advanceTimersByTime(4000))
    fireEvent.mouseEnter(screen.getByTestId('undo-toast'))
    act(() => vi.advanceTimersByTime(30000))
    expect(screen.queryByTestId('undo-toast')).not.toBeNull()
    fireEvent.mouseLeave(screen.getByTestId('undo-toast'))
    act(() => vi.advanceTimersByTime(5900))
    expect(screen.queryByTestId('undo-toast')).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByTestId('undo-toast')).toBeNull()
  })

  it('Undo restores on the server, says so, and refreshes', async () => {
    let resolve
    api.restore.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<UndoToastHost />)
    act(() => showUndo({ schoolId: 's1', entry: ENTRY }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Bringing it back…')).toBeTruthy()
    expect(api.restore).toHaveBeenCalledWith('s1', 'r1')
    // Nothing hides it while the restore is running.
    act(() => vi.advanceTimersByTime(UNDO_MS * 2))
    expect(screen.queryByTestId('undo-toast')).not.toBeNull()
    await act(async () => resolve({ data: {} }))
    await flush()
    expect(screen.getByText('Brought back the FY25 trial balance.')).toBeTruthy()
    expect(persistence.refresh).toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(3600))
    expect(screen.queryByTestId('undo-toast')).toBeNull()
  })

  it('Undo pressed from the keyboard still lets the result toast time out', async () => {
    api.restore.mockResolvedValueOnce({ data: {} })
    render(<UndoToastHost />)
    act(() => showUndo({ schoolId: 's1', entry: ENTRY }))
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.focus(undo) // focus pauses the countdown…
    fireEvent.click(undo) // …and Enter unmounts the button with no blur
    await flush()
    expect(screen.getByText('Brought back the FY25 trial balance.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(3600))
    expect(screen.queryByTestId('undo-toast')).toBeNull()
  })

  it('a filled slot and an expired removal say so in plain words', async () => {
    api.restore.mockRejectedValueOnce({ response: { status: 409, data: { code: 'SLOT_FILLED', message: 'FY25 has newer data now.' } } })
    render(<UndoToastHost />)
    act(() => showUndo({ schoolId: 's1', entry: ENTRY }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await flush()
    expect(
      screen.getByText(
        "FY25 has newer data now, so we didn't bring this back. You can swap them from Recently removed.",
      ),
    ).toBeTruthy()
    expect(persistence.refresh).not.toHaveBeenCalled()

    api.restore.mockRejectedValueOnce({ response: { status: 410, data: { code: 'REMOVAL_EXPIRED' } } })
    act(() => showUndo({ schoolId: 's1', entry: ENTRY }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await flush()
    expect(screen.getByText("That was removed more than 30 days ago, so it can't be brought back.")).toBeTruthy()
    act(() => vi.advanceTimersByTime(6100))
    expect(screen.queryByTestId('undo-toast')).toBeNull()
  })
})

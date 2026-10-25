// ─────────────────────────────────────────────────────────────────────────────
// IN-INTAKE DROP TARGETS ARE REACHABLE UNDER THE FULL-WINDOW OVERLAY.
//
// The trial-balance intake mounts DragOverlay: on the first file dragenter it
// covers the window ("Release to import trial balances") and auto-classifies
// whatever is dropped. That overlay used to take every pointer event, so the
// "Add its Balance Sheet" link (and every EmptySlotCard) could never receive a
// drop — the file was auto-sorted instead of pinned to the card's slot.
// Pinned here: over a [data-drop-zone] the overlay steps aside (fades,
// pointer-events-none), the zone's drop lands in its slot, and the overlay does
// NOT also load the file; a drop anywhere else is still auto-classified.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import DragOverlay from '../DragOverlay.jsx'
import StatementNotes from './StatementNotes.jsx'

let app = {}
vi.mock('../../context/AppContext.jsx', () => ({ useApp: () => app }))

afterEach(() => {
  cleanup()
  delete document.elementsFromPoint
})

const plFile = {
  id: 'pl',
  status: 'ready',
  role: 'cy',
  metadata: { statement: { partial: 'pl' } },
  warnings: [],
}
const dt = (...files) => ({ dataTransfer: { types: ['Files'], files, dropEffect: 'none' } })

function setup() {
  const loadFiles = vi.fn()
  const onAddHalf = vi.fn()
  app = { loadFiles, canEdit: true }
  render(
    <>
      <DragOverlay />
      <p data-testid="elsewhere">Somewhere else on the page</p>
      <StatementNotes file={plFile} canEdit onAddHalf={onAddHalf} />
    </>,
  )
  return { loadFiles, onAddHalf, link: screen.getByRole('button', { name: 'Add its Balance Sheet' }) }
}

describe('a drop on "Add its Balance Sheet" under the intake overlay', () => {
  it('the overlay steps aside over the link, and the drop is pinned to this card’s slot', () => {
    const { loadFiles, onAddHalf, link } = setup()
    const f = new File(['x'], 'Balance Sheet 6-30-26.xlsx')

    fireEvent.dragEnter(screen.getByTestId('elsewhere'), dt(f))
    const overlay = screen.getByTestId('drag-overlay')
    expect(overlay.getAttribute('data-over-zone')).toBeNull()
    expect(overlay.className).not.toMatch(/pointer-events-none/)

    fireEvent.dragEnter(link, dt(f))
    fireEvent.dragOver(link, dt(f))
    expect(overlay.getAttribute('data-over-zone')).toBe('true')
    expect(overlay.className).toMatch(/pointer-events-none/)
    expect(link.getAttribute('data-over')).toBe('true')
    // The label stays put while a file is over it (no shrink-and-flicker).
    expect(link.textContent).toBe('Add its Balance Sheet')

    fireEvent.drop(link, dt(f))
    expect(onAddHalf).toHaveBeenCalledTimes(1)
    expect(onAddHalf.mock.calls[0][0]).toBe('cy')
    expect(onAddHalf.mock.calls[0][1]).toEqual([f])
    expect(loadFiles).not.toHaveBeenCalled()
  })

  it('hit-tests BENEATH the overlay when the drag is over the overlay itself', () => {
    const { link } = setup()
    const f = new File(['x'], 'Balance Sheet.xlsx')
    fireEvent.dragEnter(screen.getByTestId('elsewhere'), dt(f))
    const overlay = screen.getByTestId('drag-overlay')
    // The browser reports the overlay as the target; underneath it is the link.
    document.elementsFromPoint = () => [overlay.firstChild, overlay, link, document.body]
    fireEvent.dragOver(overlay, dt(f))
    expect(overlay.getAttribute('data-over-zone')).toBe('true')
    document.elementsFromPoint = () => [overlay, screen.getByTestId('elsewhere'), document.body]
    fireEvent.dragOver(overlay, dt(f))
    expect(overlay.getAttribute('data-over-zone')).toBeNull()
  })

  it('a drop anywhere else is still auto-classified by the overlay', () => {
    const { loadFiles, onAddHalf } = setup()
    const f = new File(['x'], 'TB FY26.xlsx')
    const elsewhere = screen.getByTestId('elsewhere')
    fireEvent.dragEnter(elsewhere, dt(f))
    fireEvent.dragOver(elsewhere, dt(f))
    expect(screen.getByTestId('drag-overlay').getAttribute('data-over-zone')).toBeNull()
    fireEvent.drop(elsewhere, dt(f))
    expect(loadFiles).toHaveBeenCalledTimes(1)
    expect(onAddHalf).not.toHaveBeenCalled()
  })

  it('a file the link does not take is refused in words, not auto-sorted', () => {
    const { loadFiles, onAddHalf, link } = setup()
    fireEvent.drop(link, dt(new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })))
    expect(onAddHalf).not.toHaveBeenCalled()
    expect(loadFiles).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('That’s a PDF — this takes Excel or CSV.')
  })
})

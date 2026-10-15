// The save-status slot says "Saved" whenever this year's file is stored and
// nothing new is owed — not a greyed "Save" on re-entry, after a review
// Approve, or after a column re-read that already autosaved.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let app = {}
vi.mock('../context/AppContext.jsx', () => ({ useApp: () => app }))
const { default: SaveBar } = await import('./SaveBar.jsx')
afterEach(() => cleanup())
const base = { canEdit: true, canGenerate: true, save: () => {}, saveState: 'idle', dirty: false }
const show = () =>
  render(
    <MemoryRouter>
      <SaveBar />
    </MemoryRouter>,
  )

describe('SaveBar', () => {
  it('re-entering a step whose file is stored → "Saved"', () => {
    app = { ...base, byRole: { cy: { id: 'a', persisted: true } } }
    show()
    expect(screen.getByText('Saved')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull()
  })
  it('new work owed → the Save button', () => {
    app = { ...base, dirty: true, byRole: { cy: { id: 'a', persisted: false } } }
    show()
    expect(screen.getByRole('button', { name: /Save/ })).toBeTruthy()
  })
  it('while saving → "Saving…", never "Saved"', () => {
    app = { ...base, saveState: 'saving', byRole: { cy: { id: 'a', persisted: true } } }
    show()
    expect(screen.getByText(/Saving/)).toBeTruthy()
    expect(screen.queryByText('Saved')).toBeNull()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useFileDrop, describeAccept, fileMatchesAccept, rejectionMessage } from './useFileDrop.js'

afterEach(cleanup)

function Zone(props) {
  const { dragging, dropProps, rejection } = useFileDrop(props)
  return (
    <div>
      <div data-testid="zone" {...dropProps}>
        <span data-testid="child">{dragging ? 'over' : 'idle'}</span>
      </div>
      {rejection ? <p role="alert">{rejection}</p> : null}
    </div>
  )
}

const files = (...list) => ({ dataTransfer: { types: ['Files'], files: list, dropEffect: 'none' } })
const csv = (name = 'marks.csv') => new File(['a,b'], name, { type: 'text/csv' })
const pdf = (name = 'report.pdf') => new File(['%PDF'], name, { type: 'application/pdf' })

describe('useFileDrop', () => {
  it('lights up while a file is over the zone, and crossing a child does not flicker it off', () => {
    render(<Zone onFiles={vi.fn()} />)
    const zone = screen.getByTestId('zone')
    expect(zone.getAttribute('data-over')).toBeNull()
    fireEvent.dragEnter(zone, files(csv()))
    fireEvent.dragOver(zone, files(csv()))
    expect(zone.getAttribute('data-over')).toBe('true')
    expect(screen.getByTestId('child').textContent).toBe('over')
    // Into the child: enter(child) fires before leave(zone) — depth stays > 0.
    fireEvent.dragEnter(screen.getByTestId('child'), files(csv()))
    fireEvent.dragLeave(zone, files(csv()))
    expect(zone.getAttribute('data-over')).toBe('true')
    fireEvent.dragLeave(screen.getByTestId('child'), files(csv()))
    expect(zone.getAttribute('data-over')).toBeNull()
  })

  it('cancels dragover (so the browser will fire drop) only for file drags', () => {
    render(<Zone onFiles={vi.fn()} />)
    const zone = screen.getByTestId('zone')
    expect(fireEvent.dragOver(zone, files(csv()))).toBe(false) // default prevented
    expect(fireEvent.dragOver(zone, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true)
  })

  it('ignores a drag that carries no files (selected text, a link)', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} />)
    const zone = screen.getByTestId('zone')
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(zone.getAttribute('data-over')).toBeNull()
    fireEvent.drop(zone, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('a drop with an accepted file calls the handler once, and clears the highlight', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} accept=".csv,text/csv" />)
    const zone = screen.getByTestId('zone')
    const f = csv()
    fireEvent.dragEnter(zone, files(f))
    fireEvent.drop(zone, files(f))
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0]).toEqual([f])
    expect(zone.getAttribute('data-over')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses a type the picker does not take, in plain language', () => {
    const onFiles = vi.fn()
    const onReject = vi.fn()
    render(<Zone onFiles={onFiles} onReject={onReject} accept=".xlsx,.xls,.csv,text/csv" />)
    fireEvent.drop(screen.getByTestId('zone'), files(pdf()))
    expect(onFiles).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('That’s a PDF — this takes Excel or CSV.')
    expect(onReject).toHaveBeenCalledTimes(1)
    // …and a good file afterwards clears the message.
    fireEvent.drop(screen.getByTestId('zone'), files(csv()))
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does nothing at all while disabled', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} disabled />)
    const zone = screen.getByTestId('zone')
    fireEvent.dragEnter(zone, files(csv()))
    expect(zone.getAttribute('data-over')).toBeNull()
    fireEvent.drop(zone, files(csv()))
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('single-file pickers get the first ACCEPTED file only', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} accept=".csv" />)
    const a = csv('a.csv')
    const b = csv('b.csv')
    fireEvent.drop(screen.getByTestId('zone'), files(pdf(), a, b))
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0]).toEqual([a])
  })

  it('a single-file picker given several files says it took only the first (after handing it over)', () => {
    const onFiles = vi.fn()
    const onReject = vi.fn()
    render(<Zone onFiles={onFiles} onReject={onReject} />)
    const a = pdf('report.pdf')
    const b = pdf('minutes.pdf')
    const c = csv('budget.csv')
    fireEvent.drop(screen.getByTestId('zone'), files(a, b, c))
    expect(onFiles.mock.calls[0][0]).toEqual([a])
    expect(screen.getByRole('alert').textContent).toBe('Only one file at a time — took report.pdf, left out 2 others.')
    expect(onReject).toHaveBeenCalledWith('Only one file at a time — took report.pdf, left out 2 others.', [b, c])
    // onReject runs AFTER onFiles, so a picker that clears its error on a new
    // file (the logo pickers) keeps this note.
    expect(onReject.mock.invocationCallOrder[0]).toBeGreaterThan(onFiles.mock.invocationCallOrder[0])
    // One extra → singular.
    fireEvent.drop(screen.getByTestId('zone'), files(a, b))
    expect(screen.getByRole('alert').textContent).toBe('Only one file at a time — took report.pdf, left out 1 other.')
    // One file → no note.
    fireEvent.drop(screen.getByTestId('zone'), files(a))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('marks itself as a drop zone (so a full-window overlay steps aside) — unless disabled', () => {
    const { rerender } = render(<Zone onFiles={vi.fn()} />)
    expect(screen.getByTestId('zone').getAttribute('data-drop-zone')).toBe('true')
    rerender(<Zone onFiles={vi.fn()} disabled />)
    expect(screen.getByTestId('zone').getAttribute('data-drop-zone')).toBeNull()
  })

  it('off every zone the page shows not-allowed; a zone keeps its copy cursor', () => {
    render(<Zone onFiles={vi.fn()} />)
    const outside = files(csv())
    expect(fireEvent.dragOver(document.body, outside)).toBe(false)
    expect(outside.dataTransfer.dropEffect).toBe('none')
    const inside = files(csv())
    fireEvent.dragOver(screen.getByTestId('zone'), inside)
    expect(inside.dataTransfer.dropEffect).toBe('copy')
  })

  it('multiple pickers get every accepted file and are told what was skipped', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} accept=".csv" multiple />)
    const a = csv('a.csv')
    const b = csv('b.csv')
    fireEvent.drop(screen.getByTestId('zone'), files(a, pdf(), b))
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0]).toEqual([a, b])
    expect(screen.getByRole('alert').textContent).toBe('Skipped one file: That’s a PDF — this takes CSV.')
  })

  it('stops the drop reaching page-level catchers, and guards the rest of the page while mounted', () => {
    const windowDrop = vi.fn()
    window.addEventListener('drop', windowDrop)
    const { unmount } = render(<Zone onFiles={vi.fn()} />)
    fireEvent.drop(screen.getByTestId('zone'), files(csv()))
    expect(windowDrop).not.toHaveBeenCalled()
    // Outside every zone: the default (the browser opening the file) is cancelled.
    expect(fireEvent.drop(document.body, files(csv()))).toBe(false)
    unmount()
    expect(fireEvent.drop(document.body, files(csv()))).toBe(true)
    window.removeEventListener('drop', windowDrop)
  })
})

describe('accept matching + words', () => {
  it('matches by extension, exact type and wildcard', () => {
    expect(fileMatchesAccept(csv('A.CSV'), '.csv')).toBe(true)
    expect(fileMatchesAccept(new File([''], 'x.csv', { type: '' }), 'text/csv,.csv')).toBe(true)
    expect(fileMatchesAccept(new File([''], 'logo.png', { type: 'image/png' }), 'image/*')).toBe(true)
    expect(fileMatchesAccept(pdf(), 'image/png,image/jpeg,image/svg+xml')).toBe(false)
    expect(fileMatchesAccept(pdf(), '')).toBe(true)
  })

  it('describes the accept lists these pickers use', () => {
    expect(describeAccept('.csv,text/csv,text/plain')).toBe('CSV')
    expect(describeAccept('.csv,.tsv,.txt,.xlsx,.xls,.pdf,text/csv,text/plain')).toBe('Excel, CSV, text or PDF')
    expect(describeAccept('image/png,image/jpeg,image/svg+xml')).toBe('PNG, JPG or SVG')
    expect(rejectionMessage(new File([''], 'a.docx'), 'image/png')).toBe('That’s a Word document — this takes PNG.')
  })
})

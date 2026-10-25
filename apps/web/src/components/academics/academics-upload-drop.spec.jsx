// Owner 2026-10-25: "why don't these sections allow drag and drop as well? it
// should be like the finance module in that aspect". A file DROPPED on Course
// marks / Assessment results must run exactly the code path a CHOSEN file runs —
// the same preview call, with the same form fields.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
  gradebookPreview: vi.fn(),
  gradebookCommit: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  orgPreview: vi.fn(),
  orgCommit: vi.fn(),
}))
vi.mock('../../lib/api.js', () => ({ academicsApi: api }))

import GradebookUpload from './GradebookUpload.jsx'
import AssessmentUpload from './AssessmentUpload.jsx'
import OrgAssessmentUpload from './OrgAssessmentUpload.jsx'

const drop = (el, ...list) =>
  fireEvent.drop(el, { dataTransfer: { types: ['Files'], files: list } })
/** What a FormData carried, as plain pairs (File → its name). */
const sent = (fd) => [...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v.name])

beforeEach(() => {
  api.gradebookPreview.mockResolvedValue({ data: { shape: 'long', rows: 3, courses: ['Math'], terms: ['Q1'], warnings: [] } })
  api.preview.mockResolvedValue({ data: { scope: 'school', testType: 'act', years: [2026], rows: 2, subjects: ['math'], columns: [], warnings: [] } })
  api.orgPreview.mockResolvedValue({ data: { testType: 'act', years: [2026], rows: 2, schools: [] } })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Course marks (GradebookUpload) takes a drop', () => {
  it('says you can drop, and a dropped CSV runs the same preview as choosing it', async () => {
    render(<GradebookUpload schoolId="s1" canEdit />)
    expect(screen.getByText('Drop an Excel or CSV file here, or choose one')).toBeTruthy()
    const f = new File(['student,course,mark'], 'marks.csv', { type: 'text/csv' })

    // Choose it…
    fireEvent.change(screen.getByLabelText('Choose a gradebook file (Excel or CSV)'), { target: { files: [f] } })
    await waitFor(() => expect(api.gradebookPreview).toHaveBeenCalledTimes(1))
    const chosen = api.gradebookPreview.mock.calls[0]
    await screen.findByText('Save these marks') // the read finished — the zone takes drops again

    // …then drop it: the identical call.
    drop(screen.getByTestId('gradebook-drop'), f)
    await waitFor(() => expect(api.gradebookPreview).toHaveBeenCalledTimes(2))
    const dropped = api.gradebookPreview.mock.calls[1]
    expect(dropped[0]).toBe('s1')
    expect(sent(dropped[1])).toEqual(sent(chosen[1]))
    expect(sent(dropped[1])).toEqual([['file', 'marks.csv']])
    expect(await screen.findByText('Save these marks')).toBeTruthy()
    expect(screen.getByText('marks.csv')).toBeTruthy()
  })

  it('choose A, drop B, choose A again: the third choice still runs (the input never holds a stale file)', async () => {
    render(<GradebookUpload schoolId="s1" canEdit />)
    const input = screen.getByLabelText('Choose a gradebook file (Excel or CSV)')
    const a = new File(['a'], 'marks.csv', { type: 'text/csv' })
    const b = new File(['b'], 'other.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [a] } })
    await screen.findByText('Save these marks')
    // The input is emptied straight after a choice — re-picking marks.csv is a
    // real change for the browser, not a silent no-op.
    expect(input.value).toBe('')
    drop(screen.getByTestId('gradebook-drop'), b)
    await waitFor(() => expect(api.gradebookPreview).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { files: [a] } })
    await waitFor(() => expect(api.gradebookPreview).toHaveBeenCalledTimes(3))
    expect(sent(api.gradebookPreview.mock.calls[2][1])).toEqual([['file', 'marks.csv']])
    expect(await screen.findByText('marks.csv')).toBeTruthy()
  })

  it('takes no drop while a file is being read or saved', async () => {
    let finish
    api.gradebookPreview.mockReturnValueOnce(new Promise((r) => (finish = r)))
    render(<GradebookUpload schoolId="s1" canEdit />)
    const a = new File(['a'], 'marks.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Choose a gradebook file (Excel or CSV)'), { target: { files: [a] } })
    await waitFor(() => expect(api.gradebookPreview).toHaveBeenCalledTimes(1))
    const zone = screen.getByTestId('gradebook-drop')
    drop(zone, new File(['b'], 'other.csv', { type: 'text/csv' }))
    expect(api.gradebookPreview).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Choose a gradebook file (Excel or CSV)').disabled).toBe(true)
    finish({ data: { shape: 'long', rows: 3, courses: ['Math'], terms: ['Q1'], warnings: [] } })
    await screen.findByText('Save these marks')
    expect(screen.getByText('marks.csv')).toBeTruthy()
  })

  it('lights up while a file is over it', () => {
    render(<GradebookUpload schoolId="s1" canEdit />)
    const zone = screen.getByTestId('gradebook-drop')
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [] } })
    expect(zone.getAttribute('data-over')).toBe('true')
  })

  it('refuses a file it does not take without calling the server', () => {
    render(<GradebookUpload schoolId="s1" canEdit />)
    drop(screen.getByTestId('gradebook-drop'), new File(['x'], 'marks.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
    expect(api.gradebookPreview).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('That’s a Word document — this takes Excel, CSV, text or PDF.')
  })

  it('takes an Excel gradebook by drop', async () => {
    render(<GradebookUpload schoolId="s1" canEdit />)
    drop(screen.getByTestId('gradebook-drop'), new File(['x'], 'marks.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    await waitFor(() => expect(api.gradebookPreview).toHaveBeenCalledTimes(1))
  })
})

describe('Assessment results (AssessmentUpload) takes a drop', () => {
  it('says you can drop, and a dropped file runs the same preview as choosing it', async () => {
    render(<AssessmentUpload schoolId="s1" canEdit />)
    expect(screen.getByText('Drop an Excel or CSV file here, or choose one')).toBeTruthy()
    const f = new File(['x'], 'ACT 2026.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    fireEvent.change(screen.getByLabelText('Choose an assessment results file'), { target: { files: [f] } })
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1))
    const chosen = api.preview.mock.calls[0]
    await screen.findByText('Save these results')

    drop(screen.getByTestId('assessment-drop'), f)
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2))
    const dropped = api.preview.mock.calls[1]
    expect(dropped[0]).toBe('s1')
    expect(sent(dropped[1])).toEqual(sent(chosen[1]))
    expect(await screen.findByText('Save these results')).toBeTruthy()
  })

  it('a dropped Word document is refused in plain language', () => {
    render(<AssessmentUpload schoolId="s1" canEdit />)
    drop(screen.getByTestId('assessment-drop'), new File(['x'], 'notes.docx'))
    expect(api.preview).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('That’s a Word document — this takes Excel, CSV, text or PDF.')
  })
})

describe('Network results (OrgAssessmentUpload) takes a drop', () => {
  it('a dropped file runs the same org preview as choosing it', async () => {
    render(<OrgAssessmentUpload orgId="o1" />)
    const f = new File(['x'], 'diocese.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Choose the network results file'), { target: { files: [f] } })
    await waitFor(() => expect(api.orgPreview).toHaveBeenCalledTimes(1))
    const input = screen.getByLabelText('Choose the network results file')
    await waitFor(() => expect(input.disabled).toBe(false))
    drop(screen.getByTestId('org-assessment-drop'), f)
    await waitFor(() => expect(api.orgPreview).toHaveBeenCalledTimes(2))
    expect(sent(api.orgPreview.mock.calls[1][1])).toEqual(sent(api.orgPreview.mock.calls[0][1]))
  })
})

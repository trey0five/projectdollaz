// goToOption(key, { periodId }) — an embed (the upload sorter's Already on
// file) opens Monthly numbers / Budget on a year other than the page's.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Upload, Wallet } from 'lucide-react'

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useReducedMotion: () => true, AnimatePresence: ({ children }) => <>{children}</> }
})

import AddDataWizard from './AddDataWizard.jsx'

afterEach(() => cleanup())

const PERIODS = [
  { id: 'p-fy26', label: 'FY 2026', periodEndDate: '2026-06-30' },
  { id: 'p-fy25', label: 'FY 2025', periodEndDate: '2025-06-30' },
]

const config = {
  module: 'finance',
  hue: '#2563EB',
  defaultOption: 'upload',
  options: [
    {
      key: 'upload',
      kind: 'embed',
      Icon: Upload,
      label: 'Upload your financial files',
      ownFinish: true,
      renderEmbed: (_ctx, nav) => (
        <>
          <button type="button" onClick={() => nav.goToOption('budget', { periodId: 'p-fy25' })}>
            budget fy25
          </button>
          <button type="button" onClick={() => nav.goToOption('budget', { periodId: 'nope' })}>
            budget unknown
          </button>
        </>
      ),
    },
    {
      key: 'budget',
      kind: 'embed',
      needsPeriod: true,
      Icon: Wallet,
      label: 'Budget',
      blurb: 'Budget',
      cta: 'Set up budget',
      renderEmbed: (ctx) => (
        <p data-testid="embed-ctx">{`${ctx.periodId}|${ctx.periodLabel}|${ctx.periodOverride?.id ?? 'none'}`}</p>
      ),
    },
  ],
}

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/finance?tab=add']}>
      <AddDataWizard
        config={config}
        ctx={{ schoolId: 's1', periodId: 'p-fy26', periodLabel: 'FY 2026', periods: PERIODS, canEdit: true }}
      />
    </MemoryRouter>,
  )

describe('AddDataWizard period override', () => {
  it('goToOption with a periodId opens the option on that year', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'budget fy25' }))
    expect(screen.getByTestId('embed-ctx').textContent).toBe('p-fy25|FY 2025|p-fy25')
  })

  it('an unknown period id is ignored', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'budget unknown' }))
    expect(screen.getByTestId('embed-ctx').textContent).toBe('p-fy26|FY 2026|none')
  })

  it('going back clears it', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'budget fy25' }))
    fireEvent.click(screen.getByRole('button', { name: /Options/ }))
    fireEvent.click(screen.getByRole('button', { name: /Set up budget|Budget/ }))
    expect(screen.getByTestId('embed-ctx').textContent).toBe('p-fy26|FY 2026|none')
  })
})

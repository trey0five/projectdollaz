// The × on a SAVED trial balance asks first (and can be undone); a file only
// added in this session still goes straight away.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const api = vi.hoisted(() => ({ previewRemoval: vi.fn(), remove: vi.fn(), restore: vi.fn(), onFile: vi.fn() }))
let app = {}
vi.mock('../context/AppContext.jsx', () => ({ useApp: () => app }))
vi.mock('../lib/api.js', async (importOriginal) => ({ ...(await importOriginal()), financeFilesApi: api }))
vi.mock('../context/PersistenceContext.jsx', () => ({ usePersistence: () => ({ refresh: vi.fn() }) }))

import FileStatusCard from './FileStatusCard.jsx'

afterEach(() => cleanup())

const rows = [
  { acct: 1000, desc: 'Cash', amount: 100 },
  { acct: 3000, desc: 'Net assets', amount: -100 },
]
const file = (over = {}) => ({
  id: 'f1',
  fileName: 'TB FY25.xlsx',
  status: 'ready',
  rows,
  metadata: {},
  role: 'cy',
  roleConfirmed: true,
  balance: { balanced: true, difference: 0, debits: 100, credits: 100 },
  ...over,
})
const baseApp = () => ({ setFileRole: vi.fn(), removeFile: vi.fn(), canEdit: true, schoolId: 's1' })

describe('FileStatusCard ×', () => {
  it('on a saved file opens the remove popup instead of deleting', async () => {
    api.previewRemoval.mockReturnValue(new Promise(() => {}))
    app = baseApp()
    render(<FileStatusCard file={file({ persisted: true, importId: 'imp-1' })} needsReview={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove TB FY25.xlsx' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(api.previewRemoval).toHaveBeenCalledWith('s1', { kind: 'trial_balance', importId: 'imp-1' })
    expect(app.removeFile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('on an unsaved file removes it straight away', () => {
    app = baseApp()
    render(<FileStatusCard file={file()} needsReview={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove TB FY25.xlsx' }))
    expect(app.removeFile).toHaveBeenCalledWith('f1')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('a combined P&L + Balance Sheet card still removes straight away', () => {
    app = baseApp()
    render(<FileStatusCard file={file({ id: 'pair:a:b', persisted: true, importId: 'imp-1', mergedFrom: ['a', 'b'] })} needsReview={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove TB FY25.xlsx' }))
    expect(app.removeFile).toHaveBeenCalledWith('pair:a:b')
  })

  it('a file from saved history has no ×', () => {
    app = baseApp()
    render(
      <FileStatusCard
        file={file({ persisted: true, importId: 'imp-0', fromHistory: true, historyPeriodLabel: 'FY 2024' })}
        needsReview={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Remove TB FY25.xlsx' })).toBeNull()
  })
})

// Two re-hydrates in flight (remove → Undo straight away): only the NEWEST may
// write state. Before the sequence guard, the pre-restore read could settle last
// and show the restored trial balance as gone.
import { describe, it, expect, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'

const listForPeriod = vi.fn()
vi.mock('../lib/api.js', () => ({
  periodsApi: {
    list: vi.fn(async () => ({
      data: [{ id: 'p25', label: 'FY 2025', periodEndDate: '2025-06-30', roles: { cy: true }, hasSnapshot: false }],
    })),
  },
  importsApi: {
    listForPeriod: (...a) => listForPeriod(...a),
    get: vi.fn(async (_s, id) => ({ data: { id, role: 'cy', sourceName: `${id}.xlsx`, rows: [] } })),
  },
  statementsApi: { latest: vi.fn(), generate: vi.fn() },
  isPaymentRequired: () => false,
}))
vi.mock('./SchoolContext.jsx', () => ({ useSchools: () => ({ activeSchool: { id: 's1' } }) }))
vi.mock('./BillingContext.jsx', () => ({ useBilling: () => ({ refresh: vi.fn() }) }))

import { PersistenceProvider, usePersistence } from './PersistenceContext.jsx'

const handle = { current: null }
function Probe() {
  const p = usePersistence()
  useEffect(() => {
    handle.current = p
  })
  return <div data-testid="files">{p.hydratedFiles.map((f) => f.fileName).join(',') || 'none'}</div>
}

describe('PersistenceProvider re-hydrate', () => {
  it('a slower, OLDER refresh never overwrites a newer one', async () => {
    let releaseSlow
    const slow = new Promise((r) => {
      releaseSlow = r
    })
    listForPeriod
      .mockImplementationOnce(async () => ({ data: [{ id: 'tb', active: true }] })) // mount
      .mockImplementationOnce(async () => {
        await slow // refresh #1: read before the restore, settles LAST
        return { data: [] }
      })
      .mockImplementationOnce(async () => ({ data: [{ id: 'tb', active: true }] })) // refresh #2

    render(
      <PersistenceProvider>
        <Probe />
      </PersistenceProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('files').textContent).toBe('tb.xlsx'))

    let first
    await act(async () => {
      first = handle.current.refresh() // reaches its imports read, then stalls
    })
    await waitFor(() => expect(listForPeriod).toHaveBeenCalledTimes(2))
    await act(async () => {
      await handle.current.refresh() // the post-restore read settles FIRST
    })
    expect(screen.getByTestId('files').textContent).toBe('tb.xlsx')
    await act(async () => {
      releaseSlow()
      await first
    })
    expect(screen.getByTestId('files').textContent).toBe('tb.xlsx')
  })
})

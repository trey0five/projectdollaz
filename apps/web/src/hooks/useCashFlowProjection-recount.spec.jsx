// ─────────────────────────────────────────────────────────────────────────────
// The cash forecast recounts when KYRO applies a change.
//
// Live-caught (demo v4): KYRO confirmed a cash commitment and the forecast on
// screen stayed exactly as it was — useCashFlowProjection never listened for
// 'penny:data-changed'. Pinned: a 'cashflow' (or sync 'cash') broadcast
// re-reads the settings and re-runs the on-screen forecast as a persist:false
// preview; a burst coalesces into one recount; an unrelated key does nothing;
// and mounting alone fetches the settings exactly once.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'

const api = {
  getOpening: vi.fn(),
  getAssumptions: vi.fn(),
  listCommitments: vi.fn(),
  listAdjustments: vi.fn(),
  project: vi.fn(),
}
vi.mock('../lib/api.js', () => ({
  cashFlowApi: new Proxy({}, { get: (_, k) => (...a) => api[k](...a) }),
  isModuleNotLicensed: () => false,
}))

const { useCashFlowProjection } = await import('./useCashFlowProjection.js')

const fire = (key) => window.dispatchEvent(new CustomEvent('penny:data-changed', { detail: { key } }))

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.getOpening.mockResolvedValue({ data: { openingCash: 1000, asOfDate: '2026-10-01' } })
  api.getAssumptions.mockResolvedValue({ data: {} })
  api.listCommitments.mockResolvedValue({ data: { commitments: [] } })
  api.listAdjustments.mockResolvedValue({ data: { adjustments: [] } })
  api.project.mockResolvedValue({ data: { projection: { totalReceipts: 1 } } })
})
afterEach(cleanup)

describe('useCashFlowProjection — KYRO recount', () => {
  it('mounting fetches the settings once and never projects on its own', async () => {
    const { result } = renderHook(() => useCashFlowProjection('s1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => new Promise((r) => setTimeout(r, 600)))
    expect(api.listCommitments).toHaveBeenCalledTimes(1)
    expect(api.project).not.toHaveBeenCalled()
  })

  it('a cashflow broadcast re-reads the settings and replays the forecast as a preview — once per burst', async () => {
    const { result } = renderHook(() => useCashFlowProjection('s1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.project({ openingCash: 1000, horizon: 13 })
    })
    expect(api.project).toHaveBeenCalledTimes(1)

    api.listCommitments.mockResolvedValue({ data: { commitments: [{ id: 'c1' }] } })
    act(() => {
      fire('cashflow')
      fire('cashflow')
      fire('cash')
    })
    await waitFor(() => expect(api.project).toHaveBeenCalledTimes(2))
    expect(api.project.mock.calls[1]).toEqual(['s1', { openingCash: 1000, horizon: 13, persist: false }])
    await waitFor(() => expect(result.current.commitments).toEqual([{ id: 'c1' }]))
    expect(api.listCommitments).toHaveBeenCalledTimes(2)
    await act(async () => new Promise((r) => setTimeout(r, 600)))
    expect(api.project).toHaveBeenCalledTimes(2)
  })

  it('an unrelated key does nothing; with no forecast built it only re-reads the settings', async () => {
    const { result } = renderHook(() => useCashFlowProjection('s1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => fire('governance'))
    await act(async () => new Promise((r) => setTimeout(r, 600)))
    expect(api.listCommitments).toHaveBeenCalledTimes(1)

    act(() => fire('cashflow'))
    await waitFor(() => expect(api.listCommitments).toHaveBeenCalledTimes(2))
    expect(api.project).not.toHaveBeenCalled()
  })

  it('stops listening on unmount', async () => {
    const { result, unmount } = renderHook(() => useCashFlowProjection('s1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => fire('cashflow'))
    unmount()
    await act(async () => new Promise((r) => setTimeout(r, 600)))
    expect(api.listCommitments).toHaveBeenCalledTimes(1)
  })
})

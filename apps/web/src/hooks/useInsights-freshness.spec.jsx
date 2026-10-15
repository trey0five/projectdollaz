// ─────────────────────────────────────────────────────────────────────────────
// KYRO's read follows the figures (stale warnings after a re-save).
//
// Live-caught: a P&L saved alone, then its Balance Sheet for the SAME year —
// the Warnings kept "Days Cash on Hand is a risk at 0 days" over a card showing
// 152 days, and after the review popup's Approve rebuilt the statements they
// kept "Not enough data to summarize…". useInsights fetched once per
// school+period. Pinned: a changed freshness.dataAsOf asks again; an unchanged
// one does not; an older answer landing late never overwrites a newer one.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const insights = vi.fn()
vi.mock('../lib/api.js', () => ({
  analyticsApi: { insights: (...a) => insights(...a) },
  isPaymentRequired: () => false,
}))

const { useInsights } = await import('./useAnalytics.js')

beforeEach(() => insights.mockReset())

describe('useInsights — refetch on fresher figures', () => {
  it('a changed dataAsOf asks again; the same one does not', async () => {
    insights.mockResolvedValueOnce({ data: { text: '[RISK] Days Cash on Hand is a risk at 0 days', dataAsOf: 'T1' } })
    const { result, rerender } = renderHook(({ asOf }) => useInsights('s1', 'p1', asOf), {
      initialProps: { asOf: null },
    })
    await waitFor(() => expect(result.current.text).toMatch(/0 days/))
    expect(insights).toHaveBeenCalledTimes(1)

    // The metrics arrive for the SAME snapshot the read describes: no new ask.
    rerender({ asOf: 'T1' })
    await act(async () => {})
    expect(insights).toHaveBeenCalledTimes(1)

    // The statements were rebuilt (BS added / Approve): ask again.
    insights.mockResolvedValueOnce({ data: { text: '[GOOD] Cash on hand of 152 days', dataAsOf: 'T2' } })
    rerender({ asOf: 'T2' })
    await waitFor(() => expect(result.current.text).toMatch(/152 days/))
    expect(insights).toHaveBeenCalledTimes(2)

    // Unchanged again → nothing.
    rerender({ asOf: 'T2' })
    await act(async () => {})
    expect(insights).toHaveBeenCalledTimes(2)
  })

  it('an older answer landing after a newer one never puts the stale read back', async () => {
    let resolveOld
    insights.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
    insights.mockResolvedValueOnce({ data: { text: 'NEW', dataAsOf: 'T2' } })
    const { result, rerender } = renderHook(({ asOf }) => useInsights('s1', 'p1', asOf), {
      initialProps: { asOf: 'T1' },
    })
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(1))
    rerender({ asOf: 'T2' })
    await waitFor(() => expect(result.current.text).toBe('NEW'))
    await act(async () => resolveOld({ data: { text: 'OLD', dataAsOf: 'T1' } }))
    expect(result.current.text).toBe('NEW')
  })

  it('a new period always asks', async () => {
    insights.mockResolvedValue({ data: { text: 'x', dataAsOf: 'T1' } })
    const { rerender } = renderHook(({ pid }) => useInsights('s1', pid, 'T1'), { initialProps: { pid: 'p1' } })
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(1))
    rerender({ pid: 'p2' })
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(2))
    expect(insights.mock.calls[1]).toEqual(['s1', 'p2'])
  })

  it('the Finance page hands it the figures’ freshness', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    // eslint-disable-next-line no-undef
    const page = readFileSync(resolve(process.cwd(), 'src/pages/FinancePage.jsx'), 'utf8')
    expect(page).toMatch(/useInsights\(\s*schoolId,\s*selectedPeriodId,\s*data\?\.freshness\?\.dataAsOf \?\? null,?\s*\)/)
  })
})

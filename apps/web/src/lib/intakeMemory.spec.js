// #32 / #41 — the school's intake memory is OPTIONAL: any failure is `null`,
// which is exactly today's parse. An upload never waits on it or fails for it.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn()
vi.mock('./api.js', () => ({ importsApi: { intakeMemory: (...a) => get(...a) } }))

const { getIntakeMemory, invalidateIntakeMemory, normalizeIntakeMemory } = await import('./intakeMemory.js')

beforeEach(() => {
  get.mockReset()
  invalidateIntakeMemory()
})

describe('getIntakeMemory', () => {
  it('returns the well-formed memory and caches one promise per school', async () => {
    get.mockResolvedValue({ data: { layouts: [{ signature: 'w=3:acct|desc' }], synthetic: { 'revenue:tuition': { acct: 4100 } } } })
    const a = await getIntakeMemory('s1')
    const b = await getIntakeMemory('s1')
    expect(a.layouts).toHaveLength(1)
    expect(b).toBe(a)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('any error (403, 404, network) resolves to null, and is not cached', async () => {
    get.mockRejectedValueOnce(new Error('403'))
    expect(await getIntakeMemory('s1')).toBeNull()
    get.mockResolvedValueOnce({ data: { layouts: [], synthetic: {} } })
    expect(await getIntakeMemory('s1')).toEqual({ layouts: [], synthetic: {} })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('a slow server times out to null', async () => {
    get.mockImplementation(() => new Promise(() => {}))
    expect(await getIntakeMemory('s1', { timeoutMs: 5 })).toBeNull()
  })

  it('no school → null without a request; a save invalidates', async () => {
    expect(await getIntakeMemory(null)).toBeNull()
    expect(get).not.toHaveBeenCalled()
    get.mockResolvedValue({ data: { layouts: [], synthetic: {} } })
    await getIntakeMemory('s1')
    invalidateIntakeMemory('s1')
    await getIntakeMemory('s1')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('a malformed body is shaped (or refused) before the parser sees it', () => {
    expect(normalizeIntakeMemory(null)).toBeNull()
    expect(normalizeIntakeMemory([])).toBeNull()
    expect(normalizeIntakeMemory({ layouts: 'x', synthetic: [] })).toEqual({ layouts: [], synthetic: {} })
  })
})

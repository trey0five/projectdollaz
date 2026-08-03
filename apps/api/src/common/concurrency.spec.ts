import { describe, expect, it } from 'vitest'
import { mapWithConcurrency, ORG_FANOUT_CONCURRENCY } from './concurrency.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — SPEC API-9. The limiter is the whole point of the phase, so it is
// tested by OBSERVING in-flight workers rather than by trusting the loop shape.
//
// RED PROOF (mandatory, and it was run): replacing the call below with
//   `Promise.allSettled(items.map(worker))`
// makes `maxInFlight` report 40 instead of 4 and the first assertion fails. A
// limiter spec that cannot tell the limiter from `Promise.allSettled` is not a
// spec, and this phase exists because the unlimited version shipped.
// ─────────────────────────────────────────────────────────────────────────────

/** A worker that records concurrency and yields to the microtask queue twice. */
function instrument() {
  let inFlight = 0
  let maxInFlight = 0
  const worker = async (n: number): Promise<number> => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    // Two awaits: one tick is not enough to let other runners start.
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    inFlight -= 1
    return n * 2
  }
  return { worker, max: () => maxInFlight }
}

describe('mapWithConcurrency — the org fan-out bound', () => {
  it('the bound is FOUR and it is an integer', () => {
    expect(ORG_FANOUT_CONCURRENCY).toBe(4)
    expect(Number.isInteger(ORG_FANOUT_CONCURRENCY)).toBe(true)
  })

  it('with 40 items and limit 4, never runs more than 4 workers at once', async () => {
    const items = Array.from({ length: 40 }, (_, i) => i)
    const { worker, max } = instrument()
    await mapWithConcurrency(items, ORG_FANOUT_CONCURRENCY, worker)
    expect(max()).toBeLessThanOrEqual(ORG_FANOUT_CONCURRENCY)
    // And it is not accidentally serial — a limiter that runs one at a time would
    // pass the assertion above while making the endpoint 40x slower.
    expect(max()).toBe(ORG_FANOUT_CONCURRENCY)
  })

  it('returns results in INPUT order, not completion order', async () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7]
    // Deliberately inverted delays: item 0 finishes LAST.
    const res = await mapWithConcurrency(items, 4, async (n) => {
      await new Promise((r) => setTimeout(r, (items.length - n) * 2))
      return n
    })
    expect(res.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual(items)
  })

  it('a rejecting worker yields a rejected slot and never aborts the rest', async () => {
    const items = [0, 1, 2, 3, 4, 5]
    const res = await mapWithConcurrency(items, 4, async (n) => {
      if (n === 2) throw new Error('school 2 exploded')
      return n
    })
    expect(res).toHaveLength(6)
    expect(res[2].status).toBe('rejected')
    expect((res[2] as PromiseRejectedResult).reason).toBeInstanceOf(Error)
    for (const i of [0, 1, 3, 4, 5]) {
      expect(res[i].status).toBe('fulfilled')
      expect((res[i] as PromiseFulfilledResult<number>).value).toBe(i)
    }
  })

  it('the whole call never throws, even when every worker rejects', async () => {
    const res = await mapWithConcurrency([1, 2, 3], 2, async () => {
      throw new Error('all down')
    })
    expect(res.every((r) => r.status === 'rejected')).toBe(true)
  })

  it('an empty input returns [] and starts no runner', async () => {
    let calls = 0
    const res = await mapWithConcurrency([], 4, async () => {
      calls += 1
      return 1
    })
    expect(res).toEqual([])
    expect(calls).toBe(0)
  })

  it('clamps a nonsense limit to at least 1 rather than hanging', async () => {
    for (const limit of [0, -3, Number.NaN]) {
      const res = await mapWithConcurrency([1, 2, 3], limit, async (n) => n)
      expect(res.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([1, 2, 3])
    }
  })

  it('passes the index to the worker', async () => {
    const seen: number[] = []
    await mapWithConcurrency(['a', 'b', 'c'], 2, async (_item, i) => {
      seen.push(i)
      return i
    })
    expect([...seen].sort()).toEqual([0, 1, 2])
  })
})

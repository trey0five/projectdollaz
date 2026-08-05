// ─────────────────────────────────────────────────────────────────────────────
// THE NIGHTLY RECORDER EXISTS NOW. Hand-off: "task_rollup has no writer."
//
// The starved reader is the diocesan portfolio's velocity: it differences
// progress events filtered on `event.source === initiative.progressSource`, and
// nothing ever wrote a `task_rollup` event — so a school whose improvement work
// is all task-rollup reported `basis:'insufficient'` forever while the SAME
// initiatives counted toward the rollup score. These drive the sweep directly
// with a mocked Prisma and assert both what it writes and what it refuses to.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TaskRollupRecorderService } from './task-rollup-recorder.service.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))

interface Fx {
  initiatives?: { id: string; schoolId: string }[]
  tasks?: { sourceRef: string; status: string; n: number }[]
  upsertThrows?: boolean
}

function harness(fx: Fx = {}) {
  const upserts: Record<string, unknown>[] = []
  const findMany = vi.fn(async (args: { where: { status: { notIn: string[] } } }) => {
    // The mock enforces what the query CLAIMS: only open task-rollup work.
    expect(args.where.status.notIn).toEqual(['done', 'cancelled'])
    return fx.initiatives ?? []
  })
  const groupBy = vi.fn(async () =>
    (fx.tasks ?? []).map((t) => ({
      sourceRef: t.sourceRef,
      status: t.status,
      _count: { _all: t.n },
    })),
  )
  const upsert = vi.fn(async (args: Record<string, unknown>) => {
    if (fx.upsertThrows) throw new Error('boom')
    upserts.push(args)
    return {}
  })
  const prisma = {
    improvementInitiative: { findMany },
    task: { groupBy },
    improvementProgressEvent: { upsert },
  }
  return { svc: new TaskRollupRecorderService(prisma as never), upserts, findMany, groupBy }
}

const NOW = new Date('2026-08-05T14:30:00.000Z')

describe('what the sweep writes', () => {
  it('one event per open task-rollup initiative, pct = done/total, day-keyed', async () => {
    const h = harness({
      initiatives: [{ id: 'i1', schoolId: 's1' }],
      tasks: [
        { sourceRef: 'i1', status: 'done', n: 3 },
        { sourceRef: 'i1', status: 'open', n: 1 },
      ],
    })
    expect(await h.svc.sweep(NOW)).toBe(1)
    const u = h.upserts[0] as {
      where: { initiativeId_observedOn_source: { initiativeId: string; observedOn: Date; source: string } }
      create: { pct: { toString(): string }; value: { toString(): string }; createdByUserId: null }
    }
    // Idempotent BY THE TABLE'S OWN KEY — the unique index the schema designed
    // for exactly this job. A same-day re-run updates in place.
    expect(u.where.initiativeId_observedOn_source).toMatchObject({
      initiativeId: 'i1',
      source: 'task_rollup',
    })
    expect(u.where.initiativeId_observedOn_source.observedOn.toISOString()).toBe(
      '2026-08-05T00:00:00.000Z',
    )
    expect(u.create.pct.toString()).toBe('0.75')
    expect(u.create.value.toString()).toBe('3')
    // A machine observation, owned by nobody.
    expect(u.create.createdByUserId).toBeNull()
  })

  it('a re-run the same day is an update, not a duplicate (upsert both branches set pct)', async () => {
    const h = harness({
      initiatives: [{ id: 'i1', schoolId: 's1' }],
      tasks: [{ sourceRef: 'i1', status: 'done', n: 2 }],
    })
    await h.svc.sweep(NOW)
    const u = h.upserts[0] as { update: { pct: unknown; value: unknown } }
    expect(u.update.pct).toBeDefined()
    expect(u.update.value).toBeDefined()
  })
})

describe('what the sweep refuses to write', () => {
  it('an initiative with NO linked tasks gets NO event — 0/0 is not "0% done"', async () => {
    // Recording 0/0 would draw a flat line under an initiative the school simply
    // has not wired up yet, and velocity would then measure that nothing.
    const h = harness({ initiatives: [{ id: 'i1', schoolId: 's1' }], tasks: [] })
    expect(await h.svc.sweep(NOW)).toBe(0)
    expect(h.upserts).toHaveLength(0)
  })

  it('no open initiatives → no task query at all', async () => {
    const h = harness({ initiatives: [] })
    expect(await h.svc.sweep(NOW)).toBe(0)
    expect(h.groupBy).not.toHaveBeenCalled()
  })

  it('a failure never throws to the interval loop', async () => {
    const h = harness({
      initiatives: [{ id: 'i1', schoolId: 's1' }],
      tasks: [{ sourceRef: 'i1', status: 'done', n: 1 }],
      upsertThrows: true,
    })
    await expect(h.svc.sweep(NOW)).resolves.toBe(0)
  })
})

describe('the event feeds the reader that was starving', () => {
  it('writes the exact source string the portfolio velocity filter matches', () => {
    // portfolio.service.ts keeps `if (e.source !== initiative.progressSource)
    // continue` — the guard against differencing incomparable series. The
    // recorder's whole purpose is to satisfy it, so the literal is pinned in
    // BOTH files: a rename on either side re-starves the velocity silently.
    const recorder = readFileSync(HERE + 'task-rollup-recorder.service.ts', 'utf8')
    const portfolio = readFileSync(HERE + '../portfolio/portfolio.service.ts', 'utf8')
    expect(recorder).toContain("source: 'task_rollup'")
    expect(portfolio).toContain('e.source !== initiative.progressSource')
    expect(recorder).toMatch(/progressSource: 'task_rollup'/)
  })

  it('does NOT touch lastProgressAt and does NOT audit — machine rows are not user acts', () => {
    const recorder = readFileSync(HERE + 'task-rollup-recorder.service.ts', 'utf8')
    expect(recorder).not.toMatch(/lastProgressAt\s*:/)
    expect(recorder).not.toMatch(/audit\.write/)
  })
})

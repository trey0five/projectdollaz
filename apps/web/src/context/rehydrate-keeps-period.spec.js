/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE BUG: removing ONE of three uploaded trial balances made all three vanish.
//
// The server was right the whole time — DELETE /imports/:id removes exactly one
// role slot for one period. What went wrong was the CLIENT re-hydrate that runs
// afterwards. `refresh()` called loadForSchool(), which re-seeds AppProvider from
// `list[0]` — the NEWEST period by period-end date. A school carrying an empty
// FUTURE period (an FY 2027 row created ahead of time — Sample High School has
// exactly this) has that empty period at list[0], so the re-seed handed
// AppProvider zero files and the whole intake emptied itself.
//
// Reproduced live before the fix: three files in, one DELETE request out, all
// three cards gone, while Postgres still held the two survivors.
//
// This spec reads the source rather than booting the provider: PersistenceContext
// needs a School provider, a Billing provider and axios, and a render test that
// heavy tends to get skipped rather than kept honest. Both links are pinned —
// the parameter existing is worthless if refresh() doesn't pass it.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
  resolve(process.cwd(), 'src/context/PersistenceContext.jsx'),
  'utf8',
)

describe('a mid-session re-hydrate stays on the period the user is working in', () => {
  it('loadForSchool accepts a preferred period', () => {
    expect(src).toMatch(/async \(sid, preferPeriodId = null\)/)
  })

  it('honours it, and falls back when that period is gone', () => {
    // The || chain is the half that keeps a deleted period from blanking the
    // page entirely (the fallbacks themselves are pinned further down).
    expect(src).toMatch(
      /\(preferPeriodId && list\.find\(\(p\) => p\.id === preferPeriodId\)\) \|\|/,
    )
  })

  it('refresh() actually PASSES the active period — the link that carries the fix', () => {
    expect(src).toMatch(/loadForSchool\(schoolId, activePeriod\?\.id \?\? null\)/)
  })

  it('the MOUNT path passes no preference', () => {
    // First load must not inherit a stale preference — it has none to inherit,
    // and pinning this stops a future "just always prefer" edit from freezing
    // the app on whatever period it saw first.
    expect(src).toMatch(/loadForSchool\(schoolId\)\s*$/m)
  })
})

// Same list[0] assumption, worse symptom: on a COLD load, a school carrying an
// empty FUTURE period (an FY 2027 row created ahead of FY 2026's books — Sample
// High School has exactly this) hydrated the intake from that empty period, so
// three saved trial balances opened Finance to an empty uploader.
describe('a cold load lands on a period that actually holds something', () => {
  it('prefers a period with a snapshot or any uploaded role', () => {
    expect(src).toMatch(
      /p\.hasSnapshot \|\| !!\(p\.roles && \(p\.roles\.cy \|\| p\.roles\.py \|\| p\.roles\.audit\)\)/,
    )
    expect(src).toMatch(/list\.find\(hasContent\)/)
  })

  it('still falls back to list[0] so a brand-new school is unchanged', () => {
    expect(src).toMatch(/list\.find\(hasContent\) \|\|\s*\n?\s*list\[0\]/)
  })

  it('the explicit preference still wins over both', () => {
    const order = src.indexOf('preferPeriodId && list.find')
    const content = src.indexOf('list.find(hasContent)')
    expect(order).toBeGreaterThan(-1)
    expect(content).toBeGreaterThan(order)
  })
})

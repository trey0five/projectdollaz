/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE RAIL CANNOT HIDE A CRITICAL. Hand-off item recorded since Phase E:
// "rail truncation can hide a critical finding."
//
// The defect these pin: AccreditationPage reserved four of six slots for engine
// findings and concatenated readiness prompts after them, comparing nothing
// across the seam — so a school with five open CRITICALS had its fifth evicted
// by a watch-level "«code» is unscored" prompt. BEHAVIOURAL tests, because the
// comparator is now a pure export; a regex over the page could not prove an
// eviction.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mergeAttentionRail } from './attentionRail.js'

const ew = (id, severity, extra = {}) => ({ id: `ew-${id}`, severity, ...extra })
const prompt = (id, severity, sortKey) => ({ id: `p-${id}`, severity, sortKey })

describe('a critical is never displaced by a lower band', () => {
  it('five criticals + two watch prompts → all five criticals survive', () => {
    // The exact reported scenario. Under the old four-slot reservation the
    // fifth critical was dropped while both watch prompts rendered.
    const { list, more } = mergeAttentionRail(
      [1, 2, 3, 4, 5].map((n) => ew(n, 'critical')),
      [prompt('a', 'watch', 2), prompt('b', 'watch', 2)],
    )
    const ids = list.map((x) => x.id)
    for (const n of [1, 2, 3, 4, 5]) expect(ids).toContain(`ew-${n}`)
    expect(more).toBe(1)
  })

  it('seven criticals → six criticals and an honest "…and 1 more", never a prompt', () => {
    const { list, more } = mergeAttentionRail(
      [1, 2, 3, 4, 5, 6, 7].map((n) => ew(n, 'critical')),
      [prompt('a', 'watch', 0)],
    )
    expect(list.every((x) => x.severity === 'critical')).toBe(true)
    expect(more).toBe(2)
  })

  it('a watch prompt never sorts above ANY warn or critical finding', () => {
    const { list } = mergeAttentionRail(
      [ew(1, 'warn'), ew(2, 'critical')],
      [prompt('a', 'watch', -1)], // even the sharpest category rank
    )
    expect(list.map((x) => x.id)).toEqual(['ew-2', 'ew-1', 'p-a'])
  })
})

describe('the invariants the old code got right are kept', () => {
  it('the briefing focus rule leads whatever its severity', () => {
    const { list } = mergeAttentionRail(
      [ew(1, 'critical'), ew(2, 'warn', { focused: true })],
      [],
    )
    expect(list[0].id).toBe('ew-2')
  })

  it('within a band, the finding (alarm) precedes the prompt (reminder)', () => {
    const { list } = mergeAttentionRail([ew(1, 'warn')], [prompt('a', 'warn', -1)])
    expect(list.map((x) => x.id)).toEqual(['ew-1', 'p-a'])
  })

  it('readiness prompts still fill spare slots in their category order', () => {
    const { list, more } = mergeAttentionRail(
      [ew(1, 'critical')],
      [prompt('unscored', 'watch', 2), prompt('gate', 'warn', -1), prompt('review', 'watch', 1)],
    )
    expect(list.map((x) => x.id)).toEqual(['ew-1', 'p-gate', 'p-review', 'p-unscored'])
    expect(more).toBe(0)
  })

  it('an unknown severity sorts LAST, never first', () => {
    // The API-side lexical-sort lesson: a new severity name must degrade to the
    // bottom of the rail, not silently outrank criticals.
    const { list } = mergeAttentionRail([ew(1, 'urgent'), ew(2, 'warn')], [])
    expect(list.map((x) => x.id)).toEqual(['ew-2', 'ew-1'])
  })
})

describe('the page and panel are wired to the merged shape', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/AccreditationPage.jsx'),
    'utf8',
  )
  const panel = readFileSync(
    resolve(process.cwd(), 'src/components/domain/NeedsAttentionPanel.jsx'),
    'utf8',
  )

  it('the page delegates to mergeAttentionRail — no local re-derivation', () => {
    expect(page).toMatch(/return mergeAttentionRail\(earlyWarningItems, items\)/)
    // The four-slot reservation formula must be gone.
    expect(page).not.toMatch(/leadCount/)
  })

  it('the overflow is SAID: moreCount threads through to the panel', () => {
    expect(page).toMatch(/attentionMoreCount=\{attentionItems\.more\}/)
    expect(panel).toMatch(/and \{moreCount\} more/)
  })

  it('viewers get the same {list, more} shape (they saw a better list than editors before)', () => {
    expect(page).toMatch(/list: earlyWarningItems\.slice\(0, 6\)/)
    expect(page).toMatch(/more: Math\.max\(0, earlyWarningItems\.length - 6\)/)
  })

  it('engine findings carry severity + focused OUT of the mapper', () => {
    expect(page).toMatch(/severity: f\.severity,\s*\n\s*focused,/)
  })
})

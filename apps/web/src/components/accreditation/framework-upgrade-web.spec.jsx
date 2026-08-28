/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// WS2 WEB — THE UPGRADE PATH'S CONFIRMATION HAS TO BE TRUE, AND THE ADOPT
// MODAL HAS TO STEER.
//
// Same architecture as framework-removal.spec.jsx, because the risks rhyme:
// the sentences that authorise a register-wide re-point live in a pure module
// (frameworkUpgrade.js) where they can be tested as behaviour, and the modal's
// steering rules (hide superseded cards from non-holders, point 2022-holders at
// Upgrade instead of a dual-adopt trap, no fallback figures ever) are
// source-pinned against AdoptFrameworkModal.jsx.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { upgradeLines, upgradeBlockers } from '../../lib/frameworkUpgrade.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

// The §5.1 preflight shape, in a 2022 school's own numbers.
const impact = (over = {}) => ({
  from: { code: 'cognia_2022', name: 'Cognia Performance Standards (2022)', rubricLabels: ['Insufficient', 'Initiating', 'Improving', 'Impacting'] },
  to: { code: 'cognia_2025', name: 'Cognia Performance Standards (rev. 2025)', rubricLabels: ['Insufficient', 'Developing', 'Engaging', 'Demonstrating'] },
  standardsToMove: 42,
  scoredCarried: 18,
  ratedCarried: 12,
  evidenceCarried: 7,
  newStandards: [],
  editedTitleKept: 0,
  unmappedKept: [],
  seriesNote: 'Your readiness trend continues with an explicit break at the upgrade date.',
  blockers: [],
  ...over,
})

describe('the upgrade confirmation counts what carries over', () => {
  it('names every non-zero carried category in the school’s own numbers', () => {
    const { carried } = upgradeLines(impact())
    const joined = carried.join(' | ')
    expect(joined).toContain('42 standards move to Cognia Performance Standards (rev. 2025)')
    expect(joined).toContain('18 rubric scores carry over exactly as scored')
    expect(joined).toContain('12 ratings carry over exactly as rated')
    expect(joined).toContain('7 evidence links stay attached')
  })

  it('says nothing about a zero category', () => {
    const { carried } = upgradeLines(impact({ scoredCarried: 0, ratedCarried: 0, evidenceCarried: 0 }))
    expect(carried).toHaveLength(1)
  })

  it('new standards are announced UNSCORED, by code', () => {
    const { notes } = upgradeLines(impact({ newStandards: ['COG-31'] }))
    const line = notes.find((n) => n.includes('COG-31'))
    expect(line).toBeTruthy()
    expect(line).toContain('UNSCORED')
    expect(line).toContain('never invent a score')
  })

  it('unmapped codes are reported as STAYING on the old framework, by code', () => {
    const { notes } = upgradeLines(impact({ unmappedKept: ['COG-9'] }))
    const line = notes.find((n) => n.includes('COG-9'))
    expect(line).toBeTruthy()
    expect(line).toContain('Cognia Performance Standards (2022)')
  })

  it('the rubric vocabulary change is spelled out, both editions verbatim', () => {
    const { notes } = upgradeLines(impact())
    const line = notes.find((n) => n.includes('rubric vocabulary'))
    expect(line).toContain('Insufficient → Initiating → Improving → Impacting')
    expect(line).toContain('Insufficient → Developing → Engaging → Demonstrating')
  })

  it('…and is NOT announced when the labels are identical', () => {
    const same = ['A', 'B', 'C', 'D']
    const { notes } = upgradeLines(
      impact({ from: { name: 'x', rubricLabels: same }, to: { name: 'y', rubricLabels: same } }),
    )
    expect(notes.find((n) => n.includes('rubric vocabulary'))).toBeUndefined()
  })

  it('the server’s series note passes through verbatim', () => {
    const { notes } = upgradeLines(impact())
    expect(notes).toContain('Your readiness trend continues with an explicit break at the upgrade date.')
  })

  it('INVENTS NOTHING while the preflight is still loading', () => {
    expect(upgradeLines(null)).toEqual({ carried: [], notes: [] })
    expect(upgradeLines(undefined).carried).toEqual([])
  })

  it('a blocker maps to its recovery sentence; unknown codes still surface', () => {
    expect(upgradeBlockers(impact({ blockers: ['successor_already_adopted'] }))[0]).toContain(
      'removal flow',
    )
    expect(upgradeBlockers(impact({ blockers: ['mystery_code'] }))).toEqual(['mystery_code'])
    expect(upgradeBlockers(null)).toEqual([])
  })
})

describe('the adopt modal steers (source-pinned)', () => {
  const modal = read('components/accreditation/AdoptFrameworkModal.jsx')

  it('alias chips render from fw.aliases — the discovery affordance', () => {
    expect(modal).toContain('data-testid="framework-aliases"')
    expect(modal).toMatch(/Also known as: \{fw\.aliases\.join/)
  })

  it('a superseded framework is HIDDEN from schools that do not hold it', () => {
    expect(modal).toMatch(/!\(fw\.supersededBy && !fw\.adopted\)/)
  })

  it('holders see the superseded badge and the Upgrade CTA', () => {
    expect(modal).toContain('data-testid="superseded-badge"')
    expect(modal).toMatch(/fw\.adopted && fw\.supersededBy && fw\.upgrade\?\.available && onUpgrade/)
  })

  it('the successor card steers a predecessor-holder — no radio, an explanation', () => {
    // Selecting the successor directly would land the school in the dual-adopt
    // state that 409-blocks its own one-click upgrade (arch risk 12.3).
    expect(modal).toMatch(/p\.adopted && p\.supersededBy && p\.supersededBy\.code === fw\.code/)
    expect(modal).toMatch(/const selectable = !steerToUpgrade/)
  })

  it('the upgrade confirm is DISABLED until real figures arrive, and by blockers', () => {
    expect(modal).toMatch(/disabled=\{busy \|\| loading \|\| !!error \|\| blockers\.length > 0\}/)
  })

  it('no fallback figures — a failed preflight is an error, not a zero', () => {
    // Both preflights (removal + upgrade) throw on an empty payload.
    const first = modal.indexOf("if (!res) throw new Error('no impact')")
    const second = modal.indexOf("if (!res) throw new Error('no impact')", first + 1)
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
  })

  it('the optional last-review-date is fail-soft — adoption stands either way', () => {
    expect(modal).toMatch(/lastReviewDate && selectedFw\?\.id && onSaveCycleDate/)
    expect(modal).toContain('journey setup card remains the recovery path')
  })

  it('recognition badges render on the card (and nothing renders when absent)', () => {
    expect(modal).toMatch(/<RecognitionChips recognitions=\{fw\.recognitions\}/)
    const chips = read('components/accreditation/RecognitionChips.jsx')
    expect(chips).toMatch(/if \(!rows\.length\) return null/)
  })
})

describe('the page’s upgrade touchpoints (source-pinned)', () => {
  const page = read('pages/AccreditationPage.jsx')

  it('the upgrade banner is quiet and reads the catalog’s supersession flag', () => {
    expect(page).toContain('data-testid="upgrade-banner"')
    expect(page).toMatch(/activeCatalogFw\?\.adopted && activeCatalogFw\?\.supersededBy/)
  })

  it('after an upgrade the selection is handed back to the server’s dominance rule', () => {
    // The old framework id no longer resolves; pinning it would blank the hero.
    const at = page.indexOf('const onUpgradeFramework')
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, at + 900)).toContain('selectFramework(null)')
  })

  it('the division selector PATCHes the profile and repaints both readers', () => {
    expect(page).toContain('data-testid="division-selector"')
    expect(page).toMatch(/accreditationApi\.setFrameworkProfile\(schoolId, code/)
  })
})

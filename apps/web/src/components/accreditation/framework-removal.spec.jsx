/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE SENTENCE THAT AUTHORISES A DELETE HAS TO BE TRUE.
//
// Removing a framework is always permitted — refusing would strand the school
// that adopted the wrong accreditor and noticed after scoring forty standards,
// which is exactly the mistake a seven-framework catalog invites. So nothing
// stands between a mis-click and a year of lost work except this confirmation.
// That makes the copy load-bearing rather than decorative, and it is why the
// counting lives in a pure module with tests instead of inline in the modal.
//
// Three ways this could lie, each pinned below:
//   • overstating — "42 ratings will be lost" for a framework adopted a minute
//     ago, because every adopted standard starts at the default rating;
//   • understating — omitting a non-zero category, so a school loses evidence
//     links it was never warned about;
//   • misleading — "7 evidence links will be removed" reads as "my audit PDF is
//     being deleted", which is NOT what happens and has to be said.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { removalLines, isCostless } from '../../lib/frameworkRemoval.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

const impact = (over = {}) => ({
  frameworkId: 'fw-1',
  code: 'cognia_2022',
  name: 'Cognia Performance Standards',
  standards: 42,
  rubricScored: 0,
  rated: 0,
  evidenceLinks: 0,
  initiativesOrphaned: 0,
  ...over,
})

describe('the confirmation counts what is really going', () => {
  it('names every non-zero category', () => {
    const { losses } = removalLines(
      impact({ standards: 42, rubricScored: 18, rated: 12, evidenceLinks: 7 }),
    )
    expect(losses.join(' | ')).toContain('42 standards leave your register')
    expect(losses.join(' | ')).toContain('18 rubric scores will be lost')
    expect(losses.join(' | ')).toContain('12 ratings will be lost')
    expect(losses.join(' | ')).toContain('7 evidence links will be removed')
  })

  it('says nothing about a category that is zero', () => {
    // "0 rubric scores will be lost" is noise that makes the real losses harder
    // to see, on the one screen where they need to be unmissable.
    const { losses } = removalLines(impact({ standards: 8 }))
    expect(losses).toHaveLength(1)
    expect(losses[0]).toBe('8 standards leave your register')
  })

  it('gets singulars right — "1 standards" undermines the whole sentence', () => {
    const { losses } = removalLines(
      impact({ standards: 1, rubricScored: 1, rated: 1, evidenceLinks: 1 }),
    )
    expect(losses).toEqual([
      '1 standard leaves your register',
      '1 rubric score will be lost',
      '1 rating will be lost',
      '1 evidence link will be removed',
    ])
  })

  it('INVENTS NOTHING while the count is still loading', () => {
    // A confirmation rendered against guessed figures would authorise a delete
    // the school never actually agreed to.
    expect(removalLines(null)).toEqual({ losses: [], survives: [] })
    expect(removalLines(undefined).losses).toEqual([])
  })
})

describe('what SURVIVES is said, not assumed', () => {
  it('promises the documents stay when evidence links are going', () => {
    // Without this line, "7 evidence links will be removed" reads as "my audit
    // PDF is being deleted". It is not — the document lives in the doc store and
    // may serve other standards.
    const { survives } = removalLines(impact({ evidenceLinks: 7 }))
    expect(survives.join(' ')).toContain('documents stay in Knowledge')
  })

  it('does not raise documents when there were no links to worry about', () => {
    expect(removalLines(impact({ evidenceLinks: 0 })).survives).toEqual([])
  })

  it('names improvement work that will lose its link, rather than hiding it', () => {
    // Initiatives are deliberately NOT deleted — an initiative is the school's
    // own plan of work. But the link back breaks, and an unannounced broken link
    // is how a plan quietly stops making sense six months later.
    const { survives } = removalLines(impact({ initiativesOrphaned: 3 }))
    expect(survives.join(' ')).toContain('3 improvement initiatives')
    expect(survives.join(' ')).toContain('no longer link back')
  })
})

describe('an untouched framework is a tidy-up, not a loss', () => {
  it('is costless when nothing was scored, rated, evidenced or planned', () => {
    expect(isCostless(impact({ standards: 42 }))).toBe(true)
  })

  it('is NOT costless if any one of the four is non-zero', () => {
    expect(isCostless(impact({ rubricScored: 1 }))).toBe(false)
    expect(isCostless(impact({ rated: 1 }))).toBe(false)
    expect(isCostless(impact({ evidenceLinks: 1 }))).toBe(false)
    expect(isCostless(impact({ initiativesOrphaned: 1 }))).toBe(false)
  })

  it('is never costless with no data at all — silence is not reassurance', () => {
    expect(isCostless(null)).toBe(false)
  })
})

describe('the control itself', () => {
  const modal = read('components/accreditation/AdoptFrameworkModal.jsx')

  it('Remove is offered only for a framework you actually hold', () => {
    expect(modal).toMatch(/\{fw\.adopted && onRemove \?/)
  })

  it('the confirm button is DISABLED until real figures arrive', () => {
    // The one guarantee that makes "always permitted" safe: you cannot authorise
    // a delete against numbers that failed to load.
    expect(modal).toMatch(/disabled=\{busy \|\| loading \|\| !!error\}/)
  })

  it('no fallback figures — a failed count is an error, not a zero', () => {
    expect(modal).toMatch(/if \(!res\) throw new Error\('no impact'\)/)
  })

  it('the Remove control is a SIBLING of the radio, never nested inside it', () => {
    // A button inside a button is invalid HTML, and here it would put a delete
    // one mis-aimed click from the control that merely selects.
    const cardStart = modal.indexOf('function FrameworkCard')
    const cardEnd = modal.indexOf('function RemovePanel')
    const card = modal.slice(cardStart, cardEnd)
    const radioClose = card.indexOf('</button>')
    const removeBtn = card.indexOf('onClick={() => onRemove(fw)}')
    expect(removeBtn).toBeGreaterThan(radioClose)
  })

  it('the confirmation replaces the card it belongs to', () => {
    // The thing being deleted and the question about deleting it are never two
    // separate places on the screen.
    expect(modal).toMatch(/removing\?\.code === fw\.code \?/)
  })
})

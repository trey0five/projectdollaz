/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// A WARNING THAT NAMES A PROBLEM AND OFFERS NOTHING IS THE WORST SHAPE THERE IS.
//
// The accreditation page told a school a great deal and let it act on almost
// none of it. Ten band cards read "High · 3 critical · 1 warning" — enough to
// worry, not enough to do — and a register row read "Not started · No evidence ·
// Not scored", which states three problems and offers three icon buttons, none
// of which is the answer. Knowing that a rating comes from the rubric, that
// evidence lives in a separate panel, and that neither is improvement work is
// product knowledge a head of school does not have and should not need.
//
// Both surfaces are now openable, and these are the invariants that keep them
// honest rather than merely clickable.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DOMAIN_HUE, domainHue } from './domainMeta.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

describe('domain hues are identity, never status', () => {
  it('gives all ten domains a distinct colour', () => {
    const values = Object.values(DOMAIN_HUE)
    expect(values).toHaveLength(10)
    expect(new Set(values).size, 'two domains share a hue').toBe(10)
  })

  it('falls back rather than crashing on a domain it has not met', () => {
    // The server owns DOMAIN_KEYS; an eleventh domain must render as an ordinary
    // card, not as undefined.
    expect(domainHue('something_new')).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('no domain hue collides with the status vocabulary', () => {
    // A card tinted the same red the risk chip uses would teach a reader that the
    // colour means danger when it only means "Finance". The two languages stay
    // apart — that separation is the whole design.
    const STATUS = ['#EF4444', '#F59E0B', '#10B981']
    for (const [key, hue] of Object.entries(DOMAIN_HUE)) {
      expect(STATUS, `${key} uses a status colour`).not.toContain(hue.toUpperCase())
    }
  })
})

describe('a band card is clickable only when there is something to open', () => {
  const strip = read('components/accreditation/DomainBandStrip.jsx')

  it('needs an open critical or warning — not merely a measured band', () => {
    // A 'Clear' domain has nothing to resolve and an unmeasured one has nothing
    // to show. Making those look interactive teaches the reader that the
    // affordance means nothing.
    expect(strip).toMatch(
      /const openable = !!onOpen && measured && \(band\.facts\?\.critical > 0 \|\| band\.facts\?\.warn > 0\)/,
    )
  })

  it('says what the click will do', () => {
    expect(strip).toContain('What to do')
  })
})

describe('the resolve panel speaks the ENGINE’s words, not its own', () => {
  const panel = read('components/accreditation/DomainResolvePanel.jsx')

  it('renders the server rationale and consequence verbatim', () => {
    // A locally-written explanation could disagree with the finding it explains.
    expect(panel).toMatch(/\{f\.rationale\}/)
    expect(panel).toMatch(/\{f\.consequence\}/)
  })

  it('takes its actions from ruleActions, the one rule→destination map', () => {
    expect(panel).toMatch(/actionsForFinding\(f, api\)/)
  })

  it('uses the engine’s severity order rather than inventing a priority', () => {
    // Ranking findings would be exactly the judgement the twin refuses to make.
    expect(panel).toMatch(/SEVERITY_RANK\[a\.severity\]/)
  })

  it('says so when a finding cleared between render and open', () => {
    expect(panel).toContain('Nothing in this domain is open right now')
  })
})

describe('the standard panel explains the mechanism, not the answer', () => {
  const panel = read('components/accreditation/StandardImprovePanel.jsx')

  it('offers the rubric only to someone who may edit', () => {
    expect(panel).toMatch(/canEdit && onRubric \?/)
  })

  it('does NOT offer a rubric on an assurance gate', () => {
    // An assurance is pass/fail on evidence. A 1–4 picker there is a control that
    // does nothing, on the one standard type where the distinction matters most.
    expect(panel).toMatch(/const isAssurance = standard\.isAssurance === true/)
    const assuranceBranch = panel.slice(panel.indexOf('isAssurance ? ('), panel.indexOf(') : ('))
    expect(assuranceBranch).not.toContain('RubricPicker')
  })

  it('marks steps already done instead of asking for them again', () => {
    expect(panel).toMatch(/const scored = standard\.rubricScore != null/)
    expect(panel).toMatch(/const evidenced = \(standard\.evidenceCount \?\? 0\) > 0/)
  })

  it('never states a score, a lift or a priority', () => {
    // The panel removes confusion about the mechanism. What score a school
    // deserves is its own judgement, and estimating a lift would invent a number
    // the engine deliberately does not produce.
    expect(panel).not.toMatch(/would raise|estimated|points? of lift|we recommend scoring/i)
  })
})

describe('the densest register gets the whole width', () => {
  const page = read('pages/AccreditationPage.jsx')
  const shell = read('components/domain/DomainCommandCenter.jsx')

  it('accreditation opts into the wide register', () => {
    // Seven columns at two-thirds width put rating and actions behind a
    // horizontal scrollbar — a reader had to scroll sideways to find out whether
    // a standard needed a decision.
    expect(page).toMatch(/\n {6}wideRegister\n/)
  })

  it('every other domain keeps the two-column shape', () => {
    expect(shell).toMatch(/wideRegister = false/)
    expect(shell).toMatch(/wideRegister \? 'space-y-6' : 'grid gap-6 lg:grid-cols-3'/)
  })
})

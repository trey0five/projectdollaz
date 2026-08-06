/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// A SCHOOL CAN HOLD MORE THAN ONE ACCREDITATION, AND THE PAGE CAN READ EITHER.
//
// Dual accreditation is ordinary — FCIS beside Cognia in Florida, ACSI beside
// Cognia, the WCEA/WASC joint protocol — and KYRO already let a school adopt
// several: `adoptFramework` is per-framework, `frameworkId` is per standard row,
// and the nightly snapshot has always recorded one independent series per adopted
// framework. What was missing was every live READ. Each one resolved a single
// framework by dominance (whichever had the most linked standards) and said so
// nowhere, which produced two distinct wrongs:
//
//   1. The other accreditation's standards fell silently out of every scored
//      surface — hero, evidence, signals, commendations — with no control to look
//      at them and no sentence admitting they were excluded.
//   2. Those rows rendered their 1–4 rubric with NO LABELS, because the page had
//      exactly one set of labels and they belonged to the other framework. Half a
//      register scored against bare numbered pips.
//
// The rule is now: THE PAGE owns one framework selection and hands it to every
// panel; the server's dominance rule survives only as the no-selection default.
//
// The label logic is pure and tested as behaviour. The wiring — which hook is
// handed the selection — is source-pinned, following this tree's own precedent
// (accreditation-honesty.spec): mounting AccreditationPage needs the school,
// period and entitlement context stack plus a fetch layer, and a spec that
// fragile gets deleted the first time it reddens for an unrelated reason.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  frameworkPillLabel,
  buildRubricLabelsByFrameworkId,
  labelsForStandard,
} from '../lib/frameworkLabels.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

const COGNIA = {
  id: 'fw-cognia',
  code: 'cognia_2022',
  name: 'the Cognia Performance Standards',
  adopted: true,
  rubricLabels: ['Needs Improvement', 'Emerging', 'Impacting', 'Exceeding'],
}
const FCIS = {
  id: 'fw-fcis',
  code: 'fcis_2023',
  name: 'the FCIS Standards',
  adopted: true,
  rubricLabels: ['Not Addressed', 'Developing', 'Meets', 'Exceeds'],
}

describe('every row gets ITS OWN framework’s rubric words', () => {
  const map = buildRubricLabelsByFrameworkId([COGNIA, FCIS], COGNIA)

  it('a row of the READ framework keeps the read framework’s labels', () => {
    expect(labelsForStandard({ frameworkId: 'fw-cognia' }, map, COGNIA.rubricLabels)).toEqual(
      COGNIA.rubricLabels,
    )
  })

  it('THE BUG: a row of the OTHER framework gets its own labels, not null', () => {
    // This is the whole defect. A dually-accredited school's FCIS rows scored
    // against four unlabelled pips because the page held Cognia's labels and
    // handed everything else `null`.
    const labels = labelsForStandard({ frameworkId: 'fw-fcis' }, map, COGNIA.rubricLabels)
    expect(labels).toEqual(FCIS.rubricLabels)
  })

  it('…and NEVER borrows the read framework’s words for another accreditor', () => {
    // The opposite failure, and the worse one: labelling an FCIS row "Impacting"
    // would put Cognia's vocabulary on a standard Cognia does not grade.
    const labels = labelsForStandard({ frameworkId: 'fw-fcis' }, map, COGNIA.rubricLabels)
    expect(labels).not.toEqual(COGNIA.rubricLabels)
  })

  it('a hand-made row with no framework link still falls back to the read framework', () => {
    expect(labelsForStandard({ frameworkId: null }, map, COGNIA.rubricLabels)).toEqual(
      COGNIA.rubricLabels,
    )
  })

  it('an unknown framework gets NO labels rather than somebody else’s', () => {
    expect(labelsForStandard({ frameworkId: 'fw-ghost' }, map, COGNIA.rubricLabels)).toBeNull()
  })

  it('the READ framework wins over a stale catalog copy of itself', () => {
    // The catalog is fetched separately and can lag; readiness.framework is the
    // payload the hero's own number came from and is authoritative.
    const stale = { ...COGNIA, rubricLabels: ['old', 'old', 'old', 'old'] }
    const m = buildRubricLabelsByFrameworkId([stale, FCIS], COGNIA)
    expect(m.get('fw-cognia')).toEqual(COGNIA.rubricLabels)
  })

  it('survives a catalog that has not loaded yet', () => {
    const m = buildRubricLabelsByFrameworkId(null, COGNIA)
    expect(m.get('fw-cognia')).toEqual(COGNIA.rubricLabels)
    expect(labelsForStandard({ frameworkId: 'fw-fcis' }, m, COGNIA.rubricLabels)).toBeNull()
  })
})

describe('the switcher names accreditors, not database rows', () => {
  it('uses the initialism, not the sentence-length catalog name', () => {
    expect(frameworkPillLabel(COGNIA)).toBe('COGNIA')
    expect(frameworkPillLabel(FCIS)).toBe('FCIS')
  })

  it('drops the edition year — the choice is an accreditor, not a revision', () => {
    expect(frameworkPillLabel({ code: 'msa_cess_2022' })).toBe('MSA CESS')
    expect(frameworkPillLabel({ code: 'acs_wasc' })).toBe('ACS WASC')
  })

  it('never renders "undefined" for a framework with no code', () => {
    expect(frameworkPillLabel({ name: 'Something' })).toBe('Something')
    expect(frameworkPillLabel(null)).toBe('Framework')
  })
})

describe('ONE selection, handed to every scored panel', () => {
  const page = read('pages/AccreditationPage.jsx')

  it('readiness, signals, evidence and commendations all receive it', () => {
    // Each of these resolved its own framework independently before. Four panels
    // agreeing by coincidence is not the same as four panels reading one choice.
    for (const hook of [
      'useAccreditationSignals',
      'useEvidenceReadiness',
      'useCommendations',
    ]) {
      const at = page.indexOf(`${hook}(schoolId, {`)
      expect(at, `${hook} is called on the page`).toBeGreaterThan(-1)
      const call = page.slice(at, page.indexOf('})', at))
      expect(call, `${hook} is given the page's framework selection`).toContain('frameworkId,')
    }
  })

  it('the TREND STRIP follows the same selection, across the id↔code seam', () => {
    // HTTP speaks frameworkId (a uuid); recorded history speaks seriesKey (the
    // framework CODE, which outlives any framework row). The two vocabularies are
    // deliberately NOT unified — this is the one place that translates, and
    // without it the hero could describe FCIS while the strip below charted Cognia.
    expect(page).toMatch(/const activeFrameworkCode = readiness\?\.framework\?\.code/)
    expect(page).toMatch(/historySetSeriesKey\(activeFrameworkCode\)/)
  })

  it('…and only for a series that was actually recorded', () => {
    // A framework adopted today has no history. Asking for a series that was never
    // recorded would blank a strip that was correctly showing another one.
    expect(page).toMatch(/if \(!keys\.includes\(activeFrameworkCode\)\) return/)
  })

  it('the panels get the EXPLICIT selection, not the resolved one', () => {
    // Sending the server's own dominance answer back to it changes nothing except
    // to make every panel refetch the moment readiness lands.
    expect(page).toMatch(/frameworkId \?\? readiness\?\.framework\?\.id \?\? null/)
    expect(page).not.toMatch(/frameworkId: activeFrameworkId/)
  })
})

describe('the switcher appears only where it means something', () => {
  const page = read('pages/AccreditationPage.jsx')

  it('a single-accreditation school gains no new control', () => {
    expect(page).toMatch(/const multiFramework = registerFrameworkIds\.length > 1/)
    expect(page).toMatch(/\{multiFramework && adoptedFrameworks\.length > 1 \?/)
  })

  it('is NOT role-gated — looking at a framework changes nothing', () => {
    // `canEdit &&` guards the adopt control beside it, deliberately. Choosing which
    // framework you are READING is not an edit, and a viewer is precisely the
    // person who needs to see both.
    const at = page.indexOf('data-testid="framework-switcher"')
    expect(at).toBeGreaterThan(-1)
    const opener = page.lastIndexOf('adoptedFrameworks.length > 1 ?', at)
    expect(opener).toBeGreaterThan(-1)
    // The whole conditional that renders it, from the line it opens on.
    const condStart = page.lastIndexOf('\n', page.lastIndexOf('{', opener))
    expect(page.slice(condStart, at)).not.toContain('canEdit')
  })

  it('a foreign framework id in the URL is ignored, not sent', () => {
    expect(page).toMatch(/if \(registerFrameworkIds\.includes\(frameworkParam\)\) selectFramework/)
  })
})

describe('the register says whose standard each row is', () => {
  const page = read('pages/AccreditationPage.jsx')

  it('chips only in a mixed register — naming your only framework says nothing', () => {
    expect(page).toMatch(/if \(!multiFramework\) return null/)
  })

  it('the chip is rendered from the row’s own frameworkId', () => {
    expect(page).toMatch(/frameworkChipById && s\.frameworkId && frameworkChipById\[s\.frameworkId\]/)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CoverageCta, { YearsCta, ModulesCta } from './CoverageCta.jsx'
import ImprovementPlaceholder from './ImprovementPlaceholder.jsx'
import { actionsForFinding, DEFAULT_ACTIONS, SEVERITY_RANK } from './ruleActions.js'

// ─────────────────────────────────────────────────────────────────────────────
// THE UI HONESTY INVARIANTS — specs 34–38 from the Phase E review, which shipped
// unwritten because apps/web had no test runner.
//
// Everything the API side guards (no fabricated numeral, no percentage
// likelihood, no control that implies a capability we do not have) can be undone
// in a JSX file, and until now nothing failed when it was. These are the two the
// reviewer named as highest-risk plus the three around them.
//
// Deliberately scoped to components that take plain props. Mounting the whole
// AccreditationPage would need the school/period/entitlement context stack and a
// fetch layer, and a spec that fragile gets deleted the first time it goes red
// for an unrelated reason.
// ─────────────────────────────────────────────────────────────────────────────

// `globals: false` means testing-library's automatic afterEach cleanup is never
// registered, so renders accumulate across tests in one file and a getByRole finds
// the previous test's DOM too. Explicit, and cheap.
afterEach(cleanup)

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('spec 36 — a likelihood is a WORD, never a percentage', () => {
  // The engine emits 'likely' | 'possible' as ordinals precisely because one visit
  // per six years is not calibratable (plan D4/G10). A chip that renders "72%
  // likely" would be a fabricated statistic wearing the engine's authority, and
  // converting an ordinal to a number is a one-line change that reads as an
  // improvement.
  const LIKELIHOODS = ['likely', 'possible']

  it('the vocabulary carries no digit and no percent sign', () => {
    for (const word of LIKELIHOODS) {
      expect(word).not.toMatch(/\d/)
      expect(word).not.toContain('%')
    }
  })

  it('the improvement candidate list renders no % anywhere', () => {
    const findings = [
      {
        findingKey: 'ACC-ASSURANCE-GAP:standard:1',
        ruleId: 'ACC-ASSURANCE-GAP',
        title: 'An assurance gate is unmet',
        rationale: 'COG-A1 is an assurance gate with 0 artifacts attached.',
        severity: 'critical',
        likelihood: 'likely',
        standardTags: ['COG-A1'],
        initiativeId: null,
        findingCleared: false,
      },
    ]
    const { container } = wrap(<ImprovementPlaceholder findings={findings} />)
    expect(container.textContent).not.toContain('%')
  })
})

describe('spec 38 — the Improvement tab ships NO control it cannot honour', () => {
  // AIC PHASE G UPDATE. Through Phase F this block asserted the opposite of two
  // of the cases below: that no create-initiative control was enabled, and that
  // the tab said the manager "is not here yet". Phase G ships the manager, which
  // makes that sentence FALSE — so the assertions defending it die in the same
  // commit as the sentence. A green spec asserting a claim the product has
  // outgrown is the test suite defending a lie.
  //
  // What SURVIVES unchanged is everything that is still true: this rail still
  // shows no progress bar, no owner field, no date input and no percentage. The
  // manager lives at /improvement; half of it duplicated here would be two
  // half-truths instead of one whole one.
  const findings = [
    {
      findingKey: 'ACC-UNSCORED:school',
      ruleId: 'ACC-UNSCORED',
      title: 'Standards carry no rubric score',
      rationale: '42 of 42 standards carry no rubric score at all.',
      severity: 'critical',
      likelihood: 'likely',
      standardTags: ['COG-1'],
      initiativeId: null,
      findingCleared: false,
    },
  ]

  it('renders no progress bar, no owner field and no due-date input', () => {
    const { container } = wrap(<ImprovementPlaceholder findings={findings} />)
    expect(container.querySelector('progress')).toBeNull()
    expect(container.querySelector('input[type="date"]')).toBeNull()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(container.textContent).not.toMatch(/\bOwner\b/)
  })

  it('no longer claims the Continuous Improvement Manager is unbuilt', () => {
    const { container } = wrap(<ImprovementPlaceholder findings={findings} />)
    expect(container.textContent).not.toMatch(/not here yet/i)
    expect(container.textContent).not.toMatch(/Coming in the Continuous Improvement/i)
  })

  it('every candidate offers a REAL, enabled route into the manager, carrying its key AND its title', () => {
    // The action is a link, not a button, and it is never disabled: the page it
    // points at exists now. The finding key rides along so /improvement can open
    // that exact gap's flow — and so does the TITLE, because /improvement's rail
    // is capped at eight and ranked by index lift, and a school-scoped warning
    // (no lift) is the first thing truncated. Without the title the page could
    // only resolve the key against a rail that may not contain it, and the click
    // did nothing at all.
    wrap(<ImprovementPlaceholder findings={findings} />)
    const work = screen.getByRole('link', { name: /work this gap/i })
    const href = work.getAttribute('href')
    const [path, query] = href.split('?')
    expect(path).toBe('/improvement')
    const params = new URLSearchParams(query)
    expect(params.get('rec')).toBe('ACC-UNSCORED:school')
    expect(params.get('recTitle')).toBe(findings[0].title)
    expect(work.hasAttribute('disabled')).toBe(false)
  })

  it('a finding with no key still links somewhere real rather than nowhere', () => {
    const { container } = wrap(
      <ImprovementPlaceholder
        findings={[{ ...findings[0], findingKey: undefined, factKey: undefined }]}
      />,
    )
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toContain('/improvement')
    for (const href of links) expect(href).not.toContain('undefined')
  })
})

describe('spec 37 — CoverageCta asks for exactly what the server named', () => {
  it('prints EVERY fiscal-year label verbatim, never just the first', () => {
    // Naming one year while needing two is how the ask stops being true: the school
    // uploads the named year, the series is still a reading short, and nothing
    // unlocks. This defect shipped in Phase E and was caught in review.
    const { container } = wrap(
      <YearsCta
        unlockableByYears={{
          signalKey: 'fin.operating_margin',
          ruleIds: ['FIN-BUDGET-DETERIORATING'],
          yearsNeeded: 2,
          fyLabels: ['FY2023–24', 'FY2022–23'],
        }}
      />,
    )
    expect(container.textContent).toContain('FY2023–24')
    expect(container.textContent).toContain('FY2022–23')
  })

  it('links to the v2 add-data route that actually opens the bulk uploader', () => {
    // `/data` is a static redirect to `/finance?tab=add` for every user without an
    // explicit ?ui=v1 opt-out, AND the redirect drops the query string — so the
    // original link landed on a generic screen with no uploader open.
    wrap(
      <YearsCta
        unlockableByYears={{ ruleIds: ['FIN-BUDGET-DETERIORATING'], yearsNeeded: 1, fyLabels: ['FY2023–24'] }}
      />,
    )
    const link = screen.getByRole('link', { name: /add years/i })
    expect(link.getAttribute('href')).toBe('/finance?tab=add&add=tb&intake=bulk')
    expect(link.getAttribute('href')).not.toContain('/data')
  })

  it('renders nothing at all when there is nothing to unlock', () => {
    const { container } = wrap(<YearsCta unlockableByYears={{ ruleIds: [] }} />)
    expect(container.textContent).toBe('')
    const empty = wrap(<ModulesCta blockedByModule={{}} />)
    expect(empty.container.textContent).toBe('')
  })

  it('a null coverage payload renders nothing rather than an invented ask', () => {
    const { container } = wrap(<CoverageCta coverage={null} />)
    expect(container.textContent).toBe('')
  })
})

describe('spec 35 — every finding gets at least one action', () => {
  it('an unknown ruleId falls back to DEFAULT_ACTIONS rather than an empty rail', () => {
    const api = { goTab: vi.fn() }
    const actions = actionsForFinding({ ruleId: 'RULE-THAT-DOES-NOT-EXIST' }, api)
    expect(actions.length).toBeGreaterThan(0)
    // Compare by LABEL: each action carries an onClick closure, and two closures
    // built from the same source are never deeply equal.
    expect(actions.map((a) => a.label)).toEqual(
      DEFAULT_ACTIONS({ ruleId: 'RULE-THAT-DOES-NOT-EXIST' }, api).map((a) => a.label),
    )
    actions[0].onClick()
    expect(api.goTab).toHaveBeenCalledWith('signals')
  })

  it('a rule whose builder returns an empty array still yields an action', () => {
    const api = { goTab: vi.fn() }
    // actionsForFinding must not hand the rail a finding with nothing to do.
    expect(actionsForFinding({ ruleId: undefined }, api).length).toBeGreaterThan(0)
    expect(actionsForFinding(null, api).length).toBeGreaterThan(0)
  })

  it('severity ranks critical above warn above info', () => {
    expect(SEVERITY_RANK.critical).toBeLessThan(SEVERITY_RANK.warn)
    expect(SEVERITY_RANK.warn).toBeLessThan(SEVERITY_RANK.info)
  })
})

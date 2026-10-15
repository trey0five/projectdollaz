/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// F1 THE JOURNEY — the six-year cycle surface renders EXACTLY what the payload
// says, and nothing when it says nothing.
//
// Behaviour tests render JourneyTab / MilestoneCard / ReadinessHero against a
// fixture shaped like the frozen cycle contract (arch-2 §3.5): configured with
// an overdue milestone and a not-measurable one, and unconfigured with a
// suggestion. The invariants:
//   · unconfigured → the SETUP CARD, no road, no invented dates;
//   · every milestone's measure sentence and not-measurable reason verbatim;
//   · states carried by icon+word, never color alone (the word is in the DOM);
//   · the hero countdown strip exists ONLY when a cycle is configured;
//   · the next-band sentence and unbacked-points chip render only from server
//     figures, and are absent when the payload omits them.
// Wiring rules that need the page's context stack are source-pinned, the
// tree's own precedent (multi-framework.spec).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JourneyTab from './JourneyTab.jsx'
import MilestoneCard from './MilestoneCard.jsx'
import ReadinessHero from './ReadinessHero.jsx'

afterEach(cleanup)

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

// ── The frozen-contract fixture (arch-2 §3.5 as amended by decision 8) ───────
const CONFIGURED = {
  configured: true,
  framework: { id: 'fw-1', code: 'cognia_2022', name: 'Cognia Performance Standards (2022)' },
  anchor: {
    lastReviewDate: '2022-04-12',
    nextReviewDate: '2028-04-12',
    termYears: 6,
    source: 'manual',
  },
  suggestion: null,
  today: '2026-08-25',
  phase: {
    key: 'self_assessment',
    yearOfCycle: 5,
    label: 'Self-Assessment run-up',
    narrative:
      'You are in year 5 of your six-year Cognia cycle. The Self-Assessment window is open.',
  },
  countdown: {
    milestoneKey: 'evidence_freeze',
    label: 'Evidence uploaded to accreditor portal',
    dueDate: '2028-03-15',
    daysRemaining: 568,
  },
  milestones: [
    {
      key: 'findings_shared',
      label: 'Findings shared with stakeholders',
      dueDate: null,
      window: null,
      state: 'not_measurable',
      measure: null,
      reason: 'No prior-visit findings are on file, so we cannot say whether they were shared.',
      link: '/accreditation?center=evidence',
    },
    {
      key: 'progress_report',
      label: 'Accreditation Progress Report',
      dueDate: '2026-04-12',
      window: null,
      state: 'overdue',
      measure: {
        kind: 'prior_findings_closed',
        num: 3,
        den: 7,
        text: '3 of 7 prior-visit findings answered',
      },
      link: '/accreditation?center=evidence',
    },
    {
      key: 'self_assessment',
      label: 'Self-Assessment',
      window: { start: '2027-04-12', end: '2028-04-12' },
      state: 'on_track',
      measure: { kind: 'scored', num: 0, den: 31, text: '0 of 31 standards self-rated' },
      link: '/accreditation?center=standards',
    },
  ],
  targetIndex: 280,
}

const UNCONFIGURED = {
  configured: false,
  suggestion: { lastReviewDate: '2022-04-12', basis: 'prior_visit' },
  frameworks: [{ id: 'fw-1', code: 'cognia_2022', name: 'Cognia Performance Standards (2022)' }],
}

describe('JourneyTab — unconfigured', () => {
  it('shows the setup card and nothing of the road', () => {
    render(
      <JourneyTab cycle={UNCONFIGURED} canEdit onSave={async () => {}} reduce />,
    )
    expect(screen.getByTestId('journey-setup-card')).toBeTruthy()
    expect(screen.queryByTestId('cycle-rail')).toBeNull()
    expect(screen.queryByTestId('journey-next-up')).toBeNull()
  })

  it('offers the server’s prior-visit suggestion as a chip — never silently adopted', () => {
    render(<JourneyTab cycle={UNCONFIGURED} canEdit onSave={async () => {}} reduce />)
    const chip = screen.getByTestId('cycle-suggestion-chip')
    expect(chip.textContent).toContain('Apr 12, 2022')
    expect(chip.textContent).toContain('prior-visit ledger')
  })

  it('a viewer gets the ask-an-owner line, no form', () => {
    render(<JourneyTab cycle={UNCONFIGURED} canEdit={false} onSave={async () => {}} reduce />)
    expect(screen.getByText(/Ask an owner/)).toBeTruthy()
    expect(screen.queryByText('Map my journey')).toBeNull()
  })
})

describe('JourneyTab — configured', () => {
  it('renders the road, the countdown and the phase narrative verbatim', () => {
    render(<JourneyTab cycle={CONFIGURED} canEdit onSave={async () => {}} reduce />)
    expect(screen.getByTestId('cycle-rail')).toBeTruthy()
    expect(screen.getByTestId('journey-next-up').textContent).toContain(
      'Evidence uploaded to accreditor portal',
    )
    expect(
      screen.getByText(
        'You are in year 5 of your six-year Cognia cycle. The Self-Assessment window is open.',
      ),
    ).toBeTruthy()
    expect(screen.queryByTestId('journey-setup-card')).toBeNull()
  })

  it('an overdue milestone carries the WORD, the payload’s due date, and its measure verbatim', () => {
    render(<JourneyTab cycle={CONFIGURED} canEdit onSave={async () => {}} reduce />)
    const card = screen.getByTestId('milestone-progress_report')
    expect(card.textContent).toContain('Overdue')
    expect(card.textContent).toContain('was due Apr 12, 2026')
    expect(card.textContent).toContain('3 of 7 prior-visit findings answered')
  })

  it('a not-measurable milestone shows the server’s reason verbatim and NO invented figure', () => {
    render(<JourneyTab cycle={CONFIGURED} canEdit onSave={async () => {}} reduce />)
    const card = screen.getByTestId('milestone-findings_shared')
    expect(card.textContent).toContain('Not measurable')
    expect(card.textContent).toContain(
      'No prior-visit findings are on file, so we cannot say whether they were shared.',
    )
    expect(card.textContent).not.toMatch(/\d+ of \d+/)
  })

  it('a windowed milestone prints its window, not a fake single due date', () => {
    render(<JourneyTab cycle={CONFIGURED} canEdit onSave={async () => {}} reduce />)
    expect(screen.getByTestId('milestone-self_assessment').textContent).toContain(
      'window Apr 12, 2027 – Apr 12, 2028',
    )
  })

  it('headline is the CYCLE ("Your 6-year accreditation cycle"), the accreditor a chip — never "Cognia" in the eyebrow', () => {
    render(
      <JourneyTab
        cycle={{
          ...CONFIGURED,
          framework: { ...CONFIGURED.framework, accreditor: 'Cognia', version: '2022' },
        }}
        canEdit
        onSave={async () => {}}
        reduce
      />,
    )
    const title = screen.getByTestId('journey-title')
    expect(title.textContent.replace(/\s+/g, ' ').trim()).toBe('Your 6-year accreditation cycle')
    expect(title.textContent).not.toMatch(/Cognia/i)
    expect(screen.getByTestId('journey-framework-chip').textContent).toBe('Cognia · 2022')
  })

  it('the term is the school’s own — a 7-year FCC anchor reads "Your 7-year accreditation cycle"', () => {
    render(
      <JourneyTab
        cycle={{
          ...CONFIGURED,
          framework: {
            id: 'fw-2',
            code: 'fccap',
            name: 'Florida Catholic Conference Accreditation Program (NSBECS rubrics)',
            accreditor: 'Florida Catholic Conference',
            version: '7-year cycle',
          },
          anchor: { ...CONFIGURED.anchor, termYears: 7 },
        }}
        canEdit
        onSave={async () => {}}
        reduce
      />,
    )
    expect(screen.getByTestId('journey-title').textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Your 7-year accreditation cycle',
    )
    expect(screen.getByTestId('journey-framework-chip').textContent).toBe(
      'Florida Catholic Conference · 7-year cycle',
    )
  })

  it('a payload without accreditor/version (older API) falls back to the framework name in the chip', () => {
    render(<JourneyTab cycle={CONFIGURED} canEdit onSave={async () => {}} reduce />)
    expect(screen.getByTestId('journey-framework-chip').textContent).toBe(
      'Cognia Performance Standards (2022)',
    )
  })

  it('the setup card’s term defaults to the framework’s PUBLISHED cycle — 7 for FCC, never a hard-coded 6', () => {
    render(
      <JourneyTab
        cycle={{
          ...UNCONFIGURED,
          framework: {
            id: 'fw-2',
            code: 'fccap',
            name: 'Florida Catholic Conference Accreditation Program (NSBECS rubrics)',
            accreditor: 'Florida Catholic Conference',
            version: '7-year cycle',
            defaultTermYears: 7,
          },
        }}
        canEdit
        onSave={async () => {}}
        reduce
      />,
    )
    expect(screen.getByLabelText('Term (years)').value).toBe('7')
  })

  it('…and 6 for a Cognia framework, or when an older payload carries no default', () => {
    const { unmount } = render(
      <JourneyTab
        cycle={{ ...UNCONFIGURED, framework: { id: 'fw-1', code: 'cognia_2022', name: 'Cognia', defaultTermYears: 6 } }}
        canEdit
        onSave={async () => {}}
        reduce
      />,
    )
    expect(screen.getByLabelText('Term (years)').value).toBe('6')
    unmount()
    render(<JourneyTab cycle={UNCONFIGURED} canEdit onSave={async () => {}} reduce />)
    expect(screen.getByLabelText('Term (years)').value).toBe('6')
  })

  it('an existing anchor wins over the framework default (editing keeps the school’s own term)', () => {
    render(
      <JourneyTab
        cycle={{
          ...CONFIGURED,
          framework: { ...CONFIGURED.framework, defaultTermYears: 7 },
          anchor: { ...CONFIGURED.anchor, termYears: 5 },
        }}
        canEdit
        onSave={async () => {}}
        reduce
      />,
    )
    fireEvent.click(screen.getByTestId('journey-edit-dates'))
    expect(screen.getByLabelText('Term (years)').value).toBe('5')
  })

  it('the setup card asks about the last accreditation VISIT, with Engagement Review as the Cognia hint', () => {
    render(<JourneyTab cycle={UNCONFIGURED} canEdit onSave={async () => {}} reduce />)
    expect(screen.getByText('When was your last accreditation visit?')).toBeTruthy()
    expect(screen.getByLabelText('Last accreditation visit date')).toBeTruthy()
    expect(screen.getByText(/Engagement Review/).textContent).toMatch(/For Cognia schools/)
  })

  it('Edit dates flips back to the setup card, prefilled — no second form', () => {
    render(<JourneyTab cycle={CONFIGURED} canEdit onSave={async () => {}} reduce />)
    fireEvent.click(screen.getByTestId('journey-edit-dates'))
    expect(screen.getByTestId('journey-setup-card')).toBeTruthy()
  })
})

// ── The road tiles line up: one skeleton, equal rows, no cut labels ─────────
describe('JourneyTab — the measure tiles share one skeleton', () => {
  const journeySrc = read('components/accreditation/JourneyTab.jsx')
  const tileSrc = read('components/analytics/v2/V2StatTile.jsx')

  it('both tile kinds carry h-full and a 2-line clamped label box, never truncate', () => {
    // The misalignment: a fraction tile (32px value) was taller than a
    // sentence tile, `truncate` cut "Implement & gather evidence of i…", and the
    // stretched Next-up tile left dead space under its date. Pin the fix at
    // the source: both tiles fill their grid cell and clamp to two lines.
    const measureTile = journeySrc.slice(
      journeySrc.indexOf('function MeasureTextTile'),
      journeySrc.indexOf('function Shell'),
    )
    expect(measureTile).toMatch(/flex h-full min-w-0 flex-col/)
    expect(measureTile).toMatch(/line-clamp-2 min-h-\[2\.6em\]/)
    expect(measureTile).not.toMatch(/\btruncate\b/)
    expect(tileSrc).toMatch(/flex h-full min-w-0 flex-col/)
    expect(tileSrc).toMatch(/line-clamp-2 min-h-\[2\.6em\]/)
    // V2StatTile's LABEL is never truncated (the sub line, one context string, may be).
    const labelLine = tileSrc.split('\n').find((l) => l.includes('{label}') || l.includes('line-clamp-2'))
    expect(labelLine).not.toMatch(/truncate/)
  })

  it('the inner grid uses equal fractional rows; the Next-up tile fills its stretched cell', () => {
    render(<JourneyTab cycle={CONFIGURED} canEdit onSave={async () => {}} reduce />)
    const grid = screen.getByTestId('journey-measure-grid')
    expect(grid.className).toMatch(/auto-rows-fr/)
    expect(grid.className).toMatch(/items-stretch/)
    const nextUp = screen.getByTestId('journey-next-up')
    expect(nextUp.className).toMatch(/flex h-full flex-col/)
    // Every tile in the grid is an h-full flex column — same skeleton.
    for (const tile of grid.children) {
      expect(tile.className, tile.textContent).toMatch(/\bh-full\b/)
    }
  })

  it('a long milestone label is rendered in full (clamped by CSS, never cut in the DOM)', () => {
    const long = 'Implement & gather evidence of impact across every standard'
    render(
      <JourneyTab
        cycle={{
          ...CONFIGURED,
          milestones: [
            {
              key: 'implement',
              label: long,
              window: { start: '2023-04-12', end: '2025-04-12' },
              state: 'done',
              measure: { kind: 'evidence_currency', num: 0, den: 100, text: '0% of rated evidence is current' },
              link: '/accreditation?center=evidence',
            },
          ],
        }}
        canEdit
        onSave={async () => {}}
        reduce
      />,
    )
    const tile = screen.getByTestId('journey-measure-text-tile')
    expect(tile.textContent).toContain(long)
    expect(tile.textContent).not.toContain('…')
  })
})

describe('MilestoneCard state vocabulary', () => {
  it('every server state renders icon + WORD (never color alone)', () => {
    for (const [state, word] of [
      ['done', 'Done'],
      ['on_track', 'On track'],
      ['at_risk', 'At risk'],
      ['overdue', 'Overdue'],
      ['upcoming', 'Upcoming'],
      ['not_measurable', 'Not measurable'],
    ]) {
      const { unmount, container } = render(
        <ul>
          <MilestoneCard milestone={{ key: 'k', label: 'L', state, measure: null, reason: null }} />
        </ul>,
      )
      expect(container.textContent).toContain(word)
      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
  })
})

// ── The hero's cycle strip + F4 additions ────────────────────────────────────
const READINESS = {
  framework: {
    id: 'fw-1',
    code: 'cognia_2022',
    name: 'Cognia Performance Standards (2022)',
    rubricLabels: ['Insufficient', 'Initiating', 'Improving', 'Impacting'],
    statusBands: [
      { label: 'Accredited', min: 280 },
      { label: 'Accredited with Merit', min: 320 },
    ],
    indexMin: 100,
    indexMax: 400,
    defaultTarget: 280,
  },
  projectedIndex: 290,
  band: 'Accredited',
  selfScoredPct: 40,
  verifiedPct: 20,
  leafCount: 31,
  scoredCount: 12,
  coveredCount: 6,
  gaps: [],
  assurances: [],
  target: { index: 320, bandLabel: 'Accredited with Merit', pointGap: 30, stepsToTarget: 9 },
}

describe('ReadinessHero — countdown only when configured; F4 only from server figures', () => {
  it('no cycle → no countdown strip', () => {
    render(<ReadinessHero readiness={READINESS} adopted reduce />)
    expect(screen.queryByTestId('cycle-countdown-strip')).toBeNull()
  })

  it('a configured cycle → the one-line strip with the payload’s own figures', () => {
    render(<ReadinessHero readiness={READINESS} adopted reduce cycle={CONFIGURED} />)
    const strip = screen.getByTestId('cycle-countdown-strip')
    expect(strip.textContent).toContain('Year 5 of 6')
    expect(strip.textContent).toContain('Evidence uploaded to accreditor portal')
    expect(strip.textContent).toContain('568 days')
  })

  it('an UNCONFIGURED cycle payload also renders no strip — absent is not zero', () => {
    render(<ReadinessHero readiness={READINESS} adopted reduce cycle={UNCONFIGURED} />)
    expect(screen.queryByTestId('cycle-countdown-strip')).toBeNull()
  })

  it('the band-aware headline is two-sided when the server sends nextBand', () => {
    render(
      <ReadinessHero
        readiness={{ ...READINESS, nextBand: { label: 'Accredited with Merit', min: 320, pointGap: 30 } }}
        adopted
        reduce
      />,
    )
    expect(screen.getByText("You'd land Accredited today")).toBeTruthy()
    expect(screen.getByTestId('next-band-line').textContent).toBe(
      '30 points from Accredited with Merit',
    )
  })

  it('no nextBand from the server → no sub-line invented', () => {
    render(<ReadinessHero readiness={READINESS} adopted reduce />)
    expect(screen.queryByTestId('next-band-line')).toBeNull()
  })

  it('the unbacked-points chip renders only for a positive server figure', () => {
    const { unmount } = render(
      <ReadinessHero readiness={{ ...READINESS, unbackedIndexPoints: 31 }} adopted reduce />,
    )
    expect(screen.getByTestId('unbacked-risk-chip').textContent).toContain(
      '31 of your projected points rest on scores with no evidence',
    )
    unmount()
    render(<ReadinessHero readiness={{ ...READINESS, unbackedIndexPoints: 0 }} adopted reduce />)
    expect(screen.queryByTestId('unbacked-risk-chip')).toBeNull()
  })

  it('the seal line renders verbatim when the server composed one — else nothing', () => {
    const division = {
      code: 'nca_casi',
      name: 'NCA CASI',
      sealLine: 'Accredited by NCA CASI, an accreditation division of Cognia',
    }
    const { unmount } = render(
      <ReadinessHero
        readiness={{ ...READINESS, framework: { ...READINESS.framework, division } }}
        adopted
        reduce
      />,
    )
    expect(screen.getByTestId('seal-line').textContent).toBe(
      'Accredited by NCA CASI, an accreditation division of Cognia',
    )
    unmount()
    render(<ReadinessHero readiness={READINESS} adopted reduce />)
    expect(screen.queryByTestId('seal-line')).toBeNull()
  })

  it('the index-reference tick is display-only and labelled from the payload', () => {
    render(
      <ReadinessHero
        readiness={{
          ...READINESS,
          framework: {
            ...READINESS.framework,
            indexReference: { value: 296, label: 'Cognia network average IEQ (2024–25)' },
          },
        }}
        adopted
        reduce
      />,
    )
    const tick = screen.getByTestId('index-reference-tick')
    expect(tick.textContent).toContain('296')
    expect(tick.querySelector('title').textContent).toBe('Cognia network average IEQ (2024–25)')
  })
})

describe('the page wiring (source-pinned)', () => {
  const page = read('pages/AccreditationPage.jsx')

  it('journey is the FIRST center tab of six', () => {
    const at = page.indexOf('const CENTER_TABS = [')
    const block = page.slice(at, page.indexOf(']', at))
    expect(block.indexOf("key: 'journey'")).toBeGreaterThan(-1)
    expect(block.indexOf("key: 'journey'")).toBeLessThan(block.indexOf("key: 'domains'"))
  })

  it('nothing auto-opens: Records is six tiles until the reader picks one; ?center= still opens its tab', () => {
    // AURORA: the cycle has its own section (CycleStepper) above Records, so
    // auto-opening Journey drew it twice. The initial tab is the `?center=`
    // deep link when there is one, else none — and no effect flips it later.
    expect(page).toMatch(/return CENTER_TABS\.some\(\(x\) => x\.key === t\) \? t : null/)
    expect(page).not.toMatch(/setTab\('journey'\)/)
    expect(page).toContain('data-testid="records-tiles"')
    expect(page).toMatch(/onClick=\{\(\) => openRecord\(t\.key\)\}/)
  })

  it('deep links speak ?center=, never ?tab=', () => {
    expect(page).toContain("searchParams.get('center')")
    expect(page).not.toMatch(/center=journey[^'"]*\?tab=/)
  })

  it('the cycle hook is keyed off the page’s ONE framework selection', () => {
    const at = page.indexOf('useAccreditationCycle(schoolId, {')
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, page.indexOf('})', at))).toContain('frameworkId,')
  })

  it('the Owner column and the Mine pill exist, and Mine filters by validated id', () => {
    expect(page).toContain('<Th>Owner</Th>')
    expect(page).toContain('data-testid="mine-filter-pill"')
    expect(page).toMatch(/s\.ownerUserId && s\.ownerUserId === currentUserId/)
  })

  it('the tasks hand-off uses the GovernancePage location.state pattern', () => {
    expect(page).toMatch(/sourceType: 'accreditation'/)
    expect(page).toMatch(/sourceRef: s\.id/)
  })

  it('the explainer flip exists and only for catalog-linked rows', () => {
    expect(page).toContain('data-testid={`expanded-flip-${key}`}')
    expect(page).toMatch(/expandedView === 'explain' && expandedStandard\.catalogStandardId/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Review fixes B1/B3 — the two fixture gaps that let real-payload shapes
// through: the below-floor readiness (band = the SENTINEL STRING, never null)
// and the percentage-kind cycle measures (num 0..100 / den 100).
// ─────────────────────────────────────────────────────────────────────────────
describe('B1 — the hero below the accreditation floor', () => {
  const BELOW_FLOOR = {
    ...READINESS,
    projectedIndex: 119,
    // The real payload's floor value: the engine's sentinel STRING, not null.
    band: 'Below accreditation threshold',
    belowThreshold: true,
    nextBand: { label: 'Accredited', min: 280, pointGap: 161 },
    target: { index: 280, bandLabel: 'Accredited', pointGap: 161, stepsToTarget: 50 },
  }

  it('never phrases the sentinel as a landing — the target phrasing stands instead', () => {
    render(<ReadinessHero readiness={BELOW_FLOOR} adopted reduce />)
    expect(screen.queryByText(/You'd land/)).toBeNull()
    expect(screen.getByText('161 points from Accredited')).toBeTruthy()
    // The two-sided sub-line belongs to the landing phrasing and goes with it.
    expect(screen.queryByTestId('next-band-line')).toBeNull()
  })

  it('a real landing still gets the two-sided headline (the gate narrows, never widens)', () => {
    render(
      <ReadinessHero
        readiness={{
          ...READINESS,
          belowThreshold: false,
          nextBand: { label: 'Accredited with Merit', min: 320, pointGap: 30 },
        }}
        adopted
        reduce
      />,
    )
    expect(screen.getByText("You'd land Accredited today")).toBeTruthy()
    expect(screen.getByTestId('next-band-line')).toBeTruthy()
  })
})

describe('B3 — journey tiles for percentage-kind measures', () => {
  const WITH_PERCENTAGE = {
    ...CONFIGURED,
    milestones: [
      ...CONFIGURED.milestones,
      {
        key: 'evidence_freeze',
        label: 'Evidence uploaded to accreditor portal',
        dueDate: '2028-03-15',
        window: null,
        state: 'at_risk',
        // The real engine's percentage shape: num is a percent, den is 100.
        measure: {
          kind: 'defensible',
          num: 22,
          den: 100,
          text: 'Defensible readiness is 22% — under half, with the upload due within 180 days',
        },
        link: '/accreditation?center=evidence',
      },
    ],
  }

  it('renders the server’s sentence for a percentage kind — never a "22/100" fraction', () => {
    render(<JourneyTab cycle={WITH_PERCENTAGE} canEdit onSave={async () => {}} reduce />)
    const tile = screen.getByTestId('journey-measure-text-tile')
    expect(tile.textContent).toContain(
      'Defensible readiness is 22% — under half, with the upload due within 180 days',
    )
    expect(tile.textContent).not.toContain('22/100')
    expect(tile.textContent).not.toContain('0/100')
  })

  it('count kinds keep their N-of-M fraction tiles', () => {
    render(<JourneyTab cycle={WITH_PERCENTAGE} canEdit onSave={async () => {}} reduce />)
    // prior_findings_closed 3/7 and scored 0/31 are true counts.
    const grid = screen.getByTestId('journey-next-up').parentElement
    expect(grid.textContent).toContain('3/7')
    expect(grid.textContent).toContain('0/31')
  })
})

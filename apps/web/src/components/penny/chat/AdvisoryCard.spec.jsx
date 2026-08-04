import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdvisoryCard, {
  NO_MODEL_PROVENANCE_LINE,
  PROVENANCE_LINE,
  SEGMENT_BODY_CLASS,
  SOURCE_META,
} from './AdvisoryCard.jsx'
import DraftImprovementPlanCard, {
  MODE_A_PROVENANCE,
  NO_STEPS_LINE,
} from './DraftImprovementPlanCard.jsx'
import ProposalCard, { ATTACH_EVIDENCE_PROVENANCE } from './ProposalCard.jsx'
import PennyMessage from './PennyMessage.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE J — THE ADVISORY SURFACE HONESTY INVARIANTS (frozen contract §8).
//
// FILENAME NOTE (deviation, reported to the orchestrator). The contract's
// ownership map names this file `AdvisoryCard.test.jsx`. `apps/web/vitest.config.js`
// includes `src/**/*.spec.{js,jsx}` ONLY, so a file called `.test.jsx` would never
// be collected — it would be a guard that cannot fail, which is the exact class of
// defect §10 exists to prevent (this program has already shipped three of them).
// The file is therefore `.spec.jsx`, matching every other spec in apps/web.
//
// WHAT THIS FILE DEFENDS. Phase J puts a language model in front of nine phases of
// computed work, and the API guards what the model may SAY. None of that survives
// contact with a careless JSX file: one `renderMarkdown(seg.text)` transforms text
// the server guarded byte-for-byte, one `.sort()` re-orders an argument, one
// `opacity-60` on the template branch teaches readers to distrust the sentences
// they can trust MOST, and one `return null` on the empty branch turns a refusal
// into a blank rectangle that reads as a bug rather than as an answer.
//
// EVERY ASSERTION BELOW WAS SEEN RED. Each block names the one-line mutation that
// reddens it; a guard nobody has watched fail is a guard nobody should trust.
// ─────────────────────────────────────────────────────────────────────────────

// `globals: false` means testing-library registers no automatic cleanup.
afterEach(cleanup)

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

/**
 * TEXT WITH ITS ELEMENT BOUNDARIES PRESERVED. `container.textContent` concatenates
 * adjacent elements with no separator, so a chip beside a sentence becomes one
 * token and a `\b`-anchored regex cannot see either. Borrowed verbatim from
 * portfolio-honesty.spec.jsx, where its absence made a red proof pass green.
 */
function spacedText(el) {
  const parts = []
  const walk = (node) => {
    if (node.nodeType === 3) parts.push(node.textContent)
    else node.childNodes.forEach(walk)
  }
  walk(el)
  return parts.join(' ')
}

/** Every digit-run in a string, e.g. '12 of 29 (41.5%)' → ['12','29','41.5']. */
const numbersIn = (s) => String(s ?? '').match(/\d+(?:[.,]\d+)*/g) || []

// ── A Mode-C card whose figures are all server-composed ──────────────────────
const MODE_C_CARD = {
  tool: 'generate_readiness_narrative',
  mode: 'C',
  title: 'Where readiness stands',
  segments: [
    {
      id: 'stands',
      // Deliberately carries markdown syntax: the server guarded THIS string, and
      // a markdown pass would silently rewrite it.
      text: '**Documented** readiness is 41% and defensible readiness is 29%.',
      source: 'llm',
    },
    {
      id: 'moved',
      text: 'Since the March board meeting the index moved by 7 points.',
      source: 'template',
    },
    { id: 'not-evaluated', text: '3 standards could not be evaluated at all.', source: 'template' },
  ],
  templateFallbackCount: 2,
  // THE SERVER SENDS BOTH OF THESE. `checkedSegmentCount` is the number of segments
  // actually submitted to the composer — the tally's denominator — and `modelCalled`
  // says whether a language model was asked AT ALL. Deriving either on the client is
  // the defect WEB-J12 pins.
  checkedSegmentCount: 3,
  modelCalled: true,
  // A STAND-IN, deliberately not the real READINESS_DISCLAIMER: visit-print.spec.jsx
  // forbids that sentence's fragments anywhere under apps/web/src (it lives on the
  // server and is rendered from the payload). What this card must do is render
  // whatever string arrived, verbatim — which this fixture tests just as well.
  disclaimer: '<<the server-owned readiness disclaimer, rendered verbatim>>',
  demoData: false,
}

// ── A Mode-A improvement plan: every string is a recommender field ───────────
const MODE_A_PLAN = {
  title: 'Improvement plan — 3 steps',
  basis: { accreditationLicensed: true, frameworkAdopted: true },
  steps: [
    {
      label: 'Move COG-1.1 up one rubric level',
      findingKey: null,
      originType: 'gap',
      originRef: 'std-1',
      rationale: 'COG-1.1 is rated Emerging today.',
      targetRubricScore: 3,
    },
    {
      label: 'Attach evidence to COG-2.3',
      findingKey: 'ACC-EVIDENCE-GAP:standard:std-2',
      originType: 'finding',
      originRef: 'ACC-EVIDENCE-GAP:standard:std-2',
      rationale: 'COG-2.3 carries no artifacts.',
      targetRubricScore: null,
    },
  ],
  counts: { steps: 2 },
  alreadyDraftedInitiativeId: null,
  demoData: false,
}

describe('WEB-J1 — a phrased answer and a computed plan SAY WHICH THEY ARE', () => {
  // The engineer brief in one sentence: a reader has to be able to tell a
  // deterministic plan from phrased prose. The two provenance strips are the tell,
  // and they must make OPPOSITE claims — two cards that both say "computed by
  // KYRO" would be technically true of the figures and useless about the prose.
  it('the Mode-C card declares that a language model rephrased these sentences', () => {
    // RED PROOF: delete the `advisory-provenance` <p> — every assertion reddens.
    const { container } = wrap(<AdvisoryCard card={MODE_C_CARD} />)
    const prov = screen.getByTestId('advisory-provenance').textContent
    expect(prov).toMatch(/language model/i)
    expect(prov).toMatch(/rephrase/i)
    expect(container.querySelector('[data-mode="C"]')).toBeTruthy()
  })

  it('the Mode-A plan card declares that NO language model was involved', () => {
    // RED PROOF: reuse PROVENANCE_LINE on the draft card — the negation reddens.
    wrap(<DraftImprovementPlanCard payload={MODE_A_PLAN} />)
    const prov = screen.getByTestId('draft-provenance').textContent
    expect(prov).toMatch(/no language model/i)
    expect(screen.getByTestId('draft-improvement-plan').dataset.mode).toBe('A')
  })

  it('the two declarations are different strings making opposite claims', () => {
    expect(MODE_A_PROVENANCE).not.toBe(PROVENANCE_LINE)
    expect(MODE_A_PROVENANCE).toMatch(/no language model/i)
    expect(PROVENANCE_LINE).not.toMatch(/no language model/i)
    expect(PROVENANCE_LINE).toMatch(/language model/i)
  })

  it('a Mode-B card is marked B, not silently rendered as C', () => {
    const { container } = wrap(
      <AdvisoryCard card={{ ...MODE_C_CARD, mode: 'B', tool: 'explain_readiness_change' }} />,
    )
    expect(container.querySelector('[data-mode="B"]')).toBeTruthy()
    expect(container.querySelector('[data-mode="C"]')).toBeNull()
  })
})

describe('WEB-J2 — segments render VERBATIM, in the SERVER’S order', () => {
  it('renders the exact guarded string, markdown syntax and all', () => {
    // RED PROOF: render the body through `renderMarkdown(seg.text)` — the
    // asterisks become a <strong> and the equality reddens. The server's guard
    // approved these bytes; a transformation of them is not what it approved.
    wrap(<AdvisoryCard card={MODE_C_CARD} />)
    const bodies = screen.getAllByTestId('advisory-segment-body')
    expect(bodies[0].textContent).toBe(MODE_C_CARD.segments[0].text)
    expect(bodies[0].textContent).toContain('**Documented**')
    expect(bodies).toHaveLength(3)
  })

  it('keeps the server’s order even when the ids sort the other way', () => {
    // RED PROOF: `segments.slice().sort((a, b) => (a.id < b.id ? -1 : 1))` —
    // 'aaa' would lead and both assertions redden. Segment order is a composition
    // decision the server made (§5.3 freezes it); re-sorting is an edit.
    const reversed = {
      ...MODE_C_CARD,
      segments: [
        { id: 'zzz', text: 'First sentence.', source: 'template' },
        { id: 'aaa', text: 'Second sentence.', source: 'template' },
      ],
    }
    wrap(<AdvisoryCard card={reversed} />)
    const bodies = screen.getAllByTestId('advisory-segment-body')
    expect(bodies[0].textContent).toBe('First sentence.')
    expect(bodies[1].textContent).toBe('Second sentence.')
  })

  it('drops a blank segment rather than rendering an empty row', () => {
    wrap(
      <AdvisoryCard
        card={{ ...MODE_C_CARD, segments: [...MODE_C_CARD.segments, { id: 'x', text: '   ' }] }}
      />,
    )
    expect(screen.getAllByTestId('advisory-segment')).toHaveLength(3)
  })
})

describe('WEB-J3 — a TEMPLATE segment is not flagged as inferior', () => {
  // It is the MORE trustworthy of the two: KYRO wrote it and no model touched it.
  // Styling it as a degraded fallback would invert the trust the whole phase is
  // built to earn.
  it('both sources render through the identical body class', () => {
    // RED PROOF: append ' opacity-60 italic' to the template branch's class — the
    // two classNames stop matching and this reddens.
    wrap(<AdvisoryCard card={MODE_C_CARD} />)
    const bodies = screen.getAllByTestId('advisory-segment-body')
    const classes = new Set(bodies.map((b) => b.className))
    expect(classes.size).toBe(1)
    expect([...classes][0]).toBe(SEGMENT_BODY_CLASS)
  })

  it('the template chip carries no word of apology or degradation', () => {
    const { container } = wrap(<AdvisoryCard card={MODE_C_CARD} />)
    const chip = screen.getAllByTestId('segment-source-template')[0]
    expect(chip.textContent).toBe(SOURCE_META.template.label)
    expect(spacedText(container)).not.toMatch(
      /\bfallback\b|\bunavailable\b|\bunverified\b|\bcould not be phrased\b|\bdegraded\b/i,
    )
  })

  it('both sources are labelled, so a reader can tell which is which', () => {
    wrap(<AdvisoryCard card={MODE_C_CARD} />)
    expect(screen.getAllByTestId('segment-source-template')).toHaveLength(2)
    expect(screen.getAllByTestId('segment-source-llm')).toHaveLength(1)
  })

  it('states how many sentences the model was ignored on, rather than hiding it', () => {
    // RED PROOF: drop the `advisory-fallbacks` line — "the model was ignored twice"
    // becomes invisible, which is precisely what §2.3 put the count on the payload
    // to prevent.
    wrap(<AdvisoryCard card={MODE_C_CARD} />)
    const line = screen.getByTestId('advisory-fallbacks').textContent
    expect(line).toContain('2')
    expect(line).toContain('3')
  })
})

describe('WEB-J4 — the card ORIGINATES no figure', () => {
  it('every number on screen came from the payload', () => {
    // RED PROOF: render a rate — e.g. `{Math.round((fallbackCount / segments.length)
    // * 100)}% of sentences were KYRO's` — 67 is in no server string and this
    // reddens naming it. A percentage the server never computed is exactly the
    // number THE ONE RULE forbids, and it is a one-line "improvement".
    const { container } = wrap(<AdvisoryCard card={MODE_C_CARD} />)
    const allowed = new Set([
      ...numbersIn(MODE_C_CARD.title),
      ...MODE_C_CARD.segments.flatMap((s) => numbersIn(s.text)),
      ...numbersIn(MODE_C_CARD.disclaimer),
      String(MODE_C_CARD.templateFallbackCount),
      String(MODE_C_CARD.segments.length),
    ])
    const onScreen = numbersIn(spacedText(container))
    expect(onScreen.length).toBeGreaterThan(0) // the audit is not vacuous
    for (const n of onScreen) {
      expect(allowed.has(n), `the card rendered "${n}", which no server string contains`).toBe(true)
    }
  })

  it('renders no percentage sign the server did not send', () => {
    const bare = { ...MODE_C_CARD, segments: [{ id: 'a', text: 'Nine standards are unscored.', source: 'template' }], disclaimer: null }
    const { container } = wrap(<AdvisoryCard card={bare} />)
    expect(container.textContent).not.toContain('%')
  })
})

describe('WEB-J5 — the disclaimer is ALWAYS rendered and never collapsible', () => {
  it('is on screen, in the open, with no disclosure control', () => {
    // RED PROOF: wrap it in `<details><summary>Disclaimer</summary>…</details>` —
    // the <details> assertion reddens. A disclaimer a reader has to open is a
    // disclaimer most readers never see.
    const { container } = wrap(<AdvisoryCard card={MODE_C_CARD} />)
    expect(screen.getByTestId('advisory-disclaimer').textContent).toBe(MODE_C_CARD.disclaimer)
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelector('summary')).toBeNull()
  })

  it('survives the cannot-attribute and the empty branches', () => {
    wrap(<AdvisoryCard card={{ ...MODE_C_CARD, mode: 'B', cannotAttribute: true }} />)
    expect(screen.getByTestId('advisory-disclaimer')).toBeTruthy()
    cleanup()
    wrap(<AdvisoryCard card={{ ...MODE_C_CARD, segments: [] }} />)
    expect(screen.getByTestId('advisory-disclaimer')).toBeTruthy()
  })
})

describe('WEB-J6 — "cannot attribute" reads as a refusal, with nothing to speculate from', () => {
  const CANNOT = {
    tool: 'explain_readiness_change',
    mode: 'B',
    title: 'What moved, and why',
    cannotAttribute: true,
    segments: [
      {
        id: 'cannot-attribute',
        text: 'Readiness moved, but I can’t attribute the change to anything in the register: no standard changed score, gained or lost evidence, or entered or left scope between those two dates.',
        source: 'template',
      },
    ],
    templateFallbackCount: 1,
    disclaimer: MODE_C_CARD.disclaimer,
    demoData: false,
  }

  it('prints the server’s frozen sentence and says nothing was guessed', () => {
    // RED PROOF: drop the `advisory-cannot-attribute` block — the second assertion
    // reddens and the card reads as a normal answer that happens to be short.
    const { container } = wrap(<AdvisoryCard card={CANNOT} />)
    expect(container.textContent).toContain('can’t attribute the change')
    expect(screen.getByTestId('advisory-cannot-attribute').textContent).toMatch(
      /nothing has been guessed/i,
    )
  })

  it('offers NO control that would invite a guess, and draws no chart', () => {
    // RED PROOF: add a `<button>Ask Penny for a likely cause</button>` — both
    // assertions redden. A plausible cause is what a language model is best at
    // inventing and what nothing in this program can check.
    const { container } = wrap(<AdvisoryCard card={CANNOT} />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelector('svg.recharts-surface')).toBeNull()
  })

  it('uses no speculative vocabulary of its own', () => {
    const { container } = wrap(<AdvisoryCard card={CANNOT} />)
    // The server's own sentence is exempt — this checks the CHROME this file adds.
    const chrome = spacedText(container).replace(CANNOT.segments[0].text, '')
    expect(chrome.length).toBeGreaterThan(0) // the exemption did not eat the card
    expect(chrome).not.toMatch(
      /\bprobably\b|\blikely\b|\bpresumably\b|\bmy guess\b|\bbest guess\b|\bspeculat/i,
    )
  })
})

describe('WEB-J7 — an empty card is a REFUSAL WITH A NEXT STEP, never a blank panel', () => {
  it('names the reason and offers somewhere to go', () => {
    // RED PROOF: `if (segments.length === 0) return null` — the card vanishes and
    // every assertion reddens. An empty rectangle reads as a broken screen, and a
    // reader concludes Penny had an answer that the UI ate.
    const { container } = wrap(<AdvisoryCard card={{ ...MODE_C_CARD, segments: [] }} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/nothing here to show/i)
    expect(alert.textContent).toMatch(/nothing has been written to fill the gap/i)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/accreditation')
  })

  it('says the same for a malformed or missing payload rather than crashing', () => {
    for (const bad of [undefined, null, {}, { segments: 'nonsense' }, { segments: [{}] }]) {
      cleanup()
      const { container } = wrap(<AdvisoryCard card={bad} />)
      expect(container.textContent.trim().length).toBeGreaterThan(0)
      expect(screen.getByRole('alert').textContent).toMatch(/nothing here to show/i)
    }
  })

  it('does not print a fallback tally over zero segments', () => {
    // "3 of 0 sentences" is a sentence about nothing. RED PROOF: drop the
    // `segments.length > 0` condition on the tally.
    wrap(<AdvisoryCard card={{ ...MODE_C_CARD, segments: [] }} />)
    expect(screen.queryByTestId('advisory-fallbacks')).toBeNull()
  })
})

describe('WEB-J8 — the Mode-A draft card states only what the recommender said', () => {
  it('renders each step’s label and rationale verbatim', () => {
    const { container } = wrap(<DraftImprovementPlanCard payload={MODE_A_PLAN} />)
    expect(screen.getAllByTestId('draft-step')).toHaveLength(2)
    expect(container.textContent).toContain('Move COG-1.1 up one rubric level')
    expect(container.textContent).toContain('COG-1.1 is rated Emerging today.')
    expect(container.textContent).toContain('COG-2.3 carries no artifacts.')
  })

  it('a null targetRubricScore renders NOTHING — never a zero', () => {
    // RED PROOF: `targetRubricScore ?? 0` — a "Target rubric level 0" chip appears
    // on the evidence step and both assertions redden. Level 0 is a rubric claim
    // about a standard that nobody made.
    const { container } = wrap(<DraftImprovementPlanCard payload={MODE_A_PLAN} />)
    expect(screen.getAllByTestId('draft-step-target')).toHaveLength(1)
    expect(container.textContent).not.toMatch(/rubric level 0/i)
  })

  it('an existing draft is reported as THAT draft, not as a new one', () => {
    // RED PROOF: drop the `draft-already` banner — the user confirms believing they
    // are creating a plan when the tool is handing back the one they already have.
    wrap(
      <DraftImprovementPlanCard
        payload={{ ...MODE_A_PLAN, alreadyDraftedInitiativeId: 'init-1' }}
      />,
    )
    expect(screen.getByTestId('draft-already').textContent).toMatch(
      /will not create a second one/i,
    )
  })

  it('a stepless payload states that fact and CLAIMS NOTHING about the school', () => {
    // THE FOUR-WAY "which empty is it" BRANCH IS GONE, deliberately.
    // buildDraftImprovementPlanProposal THROWS on a zero-step plan, so a zero-step
    // proposal never becomes a ProposedAction and never reaches ProposalCard — the
    // only thing that renders this card. The differentiated reasons were a guard
    // that could not fail, and the test that covered them passed by constructing a
    // payload the server cannot emit. They now live on the server as the refusal
    // message (emptyDraftReason) and improvement-plan-drafter.spec.ts (MA-3.5)
    // asserts they stay distinct.
    wrap(
      <DraftImprovementPlanCard
        payload={{
          ...MODE_A_PLAN,
          steps: [],
          counts: { steps: 0 },
          basis: { accreditationLicensed: false, frameworkAdopted: false },
        }}
      />,
    )
    const empty = screen.getByTestId('draft-empty').textContent
    expect(empty).toBe(NO_STEPS_LINE)
    expect(empty).toMatch(/nothing is being claimed about your school/i)
    // No finding, in either direction, about a register this card did not read.
    expect(empty).not.toMatch(/already being worked|nothing is waiting|already has an initiative/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WEB-J12 — THE CARD DOES NOT DESCRIBE A MODEL INTERACTION THAT DID NOT HAPPEN.
//
// THREE DEFECTS, ONE SURFACE. On the surface whose stated job is letting a reader
// tell computed fact from phrasing:
//
//   1. The tally divided `templateFallbackCount` by `segments.length`. The server
//      appended a disclaimer segment AFTER the composer, so a 5-spec Mode-C answer
//      with no LLM configured rendered "5 of these 6 sentences were not accepted
//      from the model" — a reader concludes ONE sentence was accepted when zero were
//      and no model was ever called.
//   2. The Mode-B cannot-attribute branch never calls an LLM AT ALL, and left
//      `templateFallbackCount` at 0 — so the card printed "Every one of these 2
//      sentences passed KYRO's figure check" beside two "KYRO's words" chips.
//   3. PROVENANCE_LINE ("A language model was allowed to rephrase these sentences")
//      rendered on both of those branches.
//
// SEEN RED: revert `checkedCount` to `segments.length` → WEB-J12.1 reads
// "expected '2 of these 6 sentences…' to contain '5 sentences'". Revert the
// `modelCalled` branch → WEB-J12.2 and .3 redden on the provenance text.
// ─────────────────────────────────────────────────────────────────────────────
describe('WEB-J12 — the provenance strip and the tally tell the truth', () => {
  it('WEB-J12.1 the tally counts the segments the composer actually SAW', () => {
    // A payload whose rendered segment count differs from the checked count: the
    // client must use the server's number, never `segments.length`.
    wrap(
      <AdvisoryCard
        card={{
          ...MODE_C_CARD,
          segments: [
            ...MODE_C_CARD.segments,
            { id: 'extra', text: 'A segment appended after the composer ran.', source: 'template' },
          ],
          templateFallbackCount: 2,
          checkedSegmentCount: 3,
        }}
      />,
    )
    const line = screen.getByTestId('advisory-fallbacks').textContent
    expect(line).toContain('2 of these 3 sentences')
    expect(line).not.toContain('of these 4')
  })

  it('WEB-J12.2 a turn on which NO model was called says so, and claims no rejections', () => {
    wrap(
      <AdvisoryCard
        card={{
          ...MODE_C_CARD,
          segments: MODE_C_CARD.segments.map((sg) => ({ ...sg, source: 'template' })),
          templateFallbackCount: 3,
          checkedSegmentCount: 3,
          modelCalled: false,
        }}
      />,
    )
    const prov = screen.getByTestId('advisory-provenance').textContent
    expect(prov).toBe(NO_MODEL_PROVENANCE_LINE)
    expect(prov).toMatch(/no language model was called/i)
    const line = screen.getByTestId('advisory-fallbacks').textContent
    expect(line).toMatch(/no language model was asked/i)
    expect(line).not.toMatch(/not accepted from the model/i)
    expect(line).not.toMatch(/passed KYRO’s figure check/i)
  })

  it('WEB-J12.3 the Mode-B cannot-attribute card makes no model claim either', () => {
    // The server sets modelCalled:false and templateFallbackCount = segments.length
    // on this branch; the card must not print a pass rate for an unasked model.
    wrap(
      <AdvisoryCard
        card={{
          tool: 'explain_readiness_change',
          mode: 'B',
          title: 'What moved, and why',
          cannotAttribute: true,
          segments: [
            { id: 'cannot-attribute', text: 'Readiness moved, but I can’t attribute it.', source: 'template' },
            { id: 'decomposition', text: 'The index moved by 2 points.', source: 'template' },
          ],
          templateFallbackCount: 2,
          checkedSegmentCount: 2,
          modelCalled: false,
          disclaimer: MODE_C_CARD.disclaimer,
        }}
      />,
    )
    expect(screen.getByTestId('advisory-provenance').textContent).toBe(NO_MODEL_PROVENANCE_LINE)
    expect(screen.getByTestId('advisory-fallbacks').textContent).not.toMatch(/figure check/i)
  })

  it('WEB-J12.4 a card that DID reach a model keeps the original provenance line', () => {
    wrap(<AdvisoryCard card={MODE_C_CARD} />)
    expect(screen.getByTestId('advisory-provenance').textContent).toBe(PROVENANCE_LINE)
  })

  it('WEB-J12.5 the disclaimer appears EXACTLY ONCE, even if it is also a segment', () => {
    // The server used to push READINESS_DISCLAIMER into `segments` AND send it as
    // `disclaimer`, so a head of school read the 40-word legal sentence as list item
    // 6 of 6 — tagged "KYRO’s words" like a finding — and again in the footer.
    const text = MODE_C_CARD.disclaimer
    const { container } = wrap(
      <AdvisoryCard
        card={{
          ...MODE_C_CARD,
          segments: [...MODE_C_CARD.segments, { id: 'disclaimer', text, source: 'template' }],
        }}
      />,
    )
    const occurrences = spacedText(container).split(text).length - 1
    expect(occurrences).toBe(1)
  })

  it('WEB-J12.6 a reachable success card offers somewhere to go', () => {
    // The refusal branch always did; every REACHABLE branch offered nothing, so a
    // head of school read "COG-1.1 fell from 3 to 2" with nothing to click.
    const { container } = wrap(<AdvisoryCard card={MODE_C_CARD} />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/accreditation')
    // …and it is a FIXED route, never a target synthesised from segment text.
    expect(screen.getByTestId('advisory-next-step').getAttribute('href')).toBe('/accreditation')
  })
})

describe('WEB-J9 — ProposalCard wires both new kinds', () => {
  const draftAction = {
    kind: 'draft_improvement_plan',
    summary: 'Draft an improvement plan from your recommendations',
    payload: MODE_A_PLAN,
  }
  const attachAction = {
    kind: 'attach_evidence',
    summary: 'Link the 2026 board minutes to COG-1.1',
    payload: { standardCode: 'COG-1.1', sourceType: 'document', sourceRef: 'doc-9' },
  }

  it('a draft_improvement_plan proposal renders the Mode-A body and its own confirm label', () => {
    // RED PROOF: drop the `isDraftImprovement` branch — the card falls back to the
    // bare summary line, the plan body disappears and all three redden.
    const onConfirm = vi.fn()
    wrap(
      <ProposalCard
        proposal={{ action: draftAction, status: 'pending' }}
        index={0}
        messageIndex={1}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByTestId('draft-improvement-plan')).toBeTruthy()
    expect(screen.getByTestId('draft-provenance').textContent).toMatch(/no language model/i)
    const confirm = screen.getByRole('button', { name: /create this plan/i })
    confirm.click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    // The action goes back UNCHANGED — this card mints no payload field.
    expect(onConfirm.mock.calls[0][2]).toBe(draftAction)
    expect(onConfirm.mock.calls[0][3]).toBeUndefined()
  })

  it('an attach_evidence proposal offers NO field in which to type a reference', () => {
    // §5.5 freezes the arg surface at (standard, sourceType, sourceRef) precisely so
    // no authored string lands in a permanent record. A "title" or "notes" box here
    // would re-open that hole from the client side.
    // RED PROOF: add `<input placeholder="Title" />` to the attach branch — the
    // first assertion reddens.
    const { container } = wrap(
      <ProposalCard
        proposal={{ action: attachAction, status: 'pending' }}
        index={0}
        messageIndex={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('input, textarea, [contenteditable]')).toHaveLength(0)
    expect(container.textContent).toContain('Link this existing evidence?')
    expect(screen.getByTestId('attach-evidence-provenance').textContent).toBe(
      ATTACH_EVIDENCE_PROVENANCE,
    )
    expect(ATTACH_EVIDENCE_PROVENANCE).toMatch(/nothing is uploaded/i)
    expect(screen.getByRole('button', { name: /link this evidence/i })).toBeTruthy()
  })

  it('the applied draft receipt names the step count and offers one Undo', () => {
    // RED PROOF: delete the `isDraftImprovement && status === 'applied'` branch —
    // the receipt degrades to a bare "Applied" line and the deep link + count
    // assertions redden.
    const onUndo = vi.fn()
    const { container } = wrap(
      <ProposalCard
        proposal={{ action: draftAction, status: 'applied', reversible: true, auditId: 'a-1' }}
        index={0}
        messageIndex={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onUndo={onUndo}
      />,
    )
    expect(container.textContent).toMatch(/created your improvement plan/i)
    expect(container.textContent).toContain('Steps')
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toContain(
      '/improvement',
    )
    screen.getByRole('button', { name: /undo/i }).click()
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('an IDEMPOTENT no-op says it opened the existing plan, and offers NO undo', () => {
    // THE DEFECT THIS PINS. applyDraftImprovementPlan's dedupe branch returned the
    // PRE-EXISTING plan's id as `createdId`, so `reversible` came back true and the
    // receipt shipped an Undo — which calls removeInitiative and DELETES a plan the
    // team may have been working for weeks, together with every ticked milestone.
    // The server now returns createdId:null there, so reversible is false.
    // RED PROOF: hard-code header="Created your improvement plan" — the first two
    // assertions redden.
    const onUndo = vi.fn()
    const { container } = wrap(
      <ProposalCard
        proposal={{ action: draftAction, status: 'applied', reversible: false, auditId: 'a-2' }}
        index={0}
        messageIndex={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onUndo={onUndo}
      />,
    )
    expect(container.textContent).toMatch(/opened your existing improvement plan/i)
    expect(container.textContent).not.toMatch(/created your improvement plan/i)
    expect(container.textContent).toMatch(/nothing new was created/i)
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull()
    // The DRAFT's step count is not the open plan's, so it is not reported as one.
    expect(container.textContent).not.toContain('Steps')
  })

  it('leaves every OTHER proposal kind byte-identical', () => {
    const { container } = wrap(
      <ProposalCard
        proposal={{ action: { kind: 'create_task', summary: 'Create a task' }, status: 'pending' }}
        index={0}
        messageIndex={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container.textContent).toContain('Proposed change')
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeTruthy()
    expect(screen.queryByTestId('attach-evidence-provenance')).toBeNull()
  })
})

describe('WEB-J10 — a rehydrated assistant turn mounts its advisory cards', () => {
  it('renders the card from a persisted message with no re-execution', () => {
    // RED PROOF: drop the `advisories.map(...)` block from PennyMessage — a
    // reloaded transcript loses the whole answer while keeping Penny's one-sentence
    // introduction to it, which reads as Penny having said nothing.
    const { container } = wrap(
      <PennyMessage
        message={{ role: 'assistant', content: 'Here is where readiness stands.', advisories: [MODE_C_CARD] }}
        messageIndex={0}
      />,
    )
    expect(screen.getByTestId('advisory-card')).toBeTruthy()
    expect(container.textContent).toContain('Since the March board meeting')
  })

  it('a turn with no advisories renders exactly as before', () => {
    const { container } = wrap(
      <PennyMessage message={{ role: 'assistant', content: 'Plain answer.' }} messageIndex={0} />,
    )
    expect(screen.queryByTestId('advisory-card')).toBeNull()
    expect(container.textContent).toContain('Plain answer.')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WEB-J11 — THE STREAM WIRING ITSELF.
//
// Everything above assumes an `advisories` array reaches the message. This block
// proves the SSE branch that puts it there, by driving the real hook over a real
// (fake-transport) event stream. A source-reading regex would have been cheaper
// and would have passed with the branch deleted and re-added in the wrong scope.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../context/SchoolContext.jsx', () => ({ useSchools: () => ({ activeId: 'sch-1' }) }))
vi.mock('../../../context/PennyContext.jsx', () => ({
  usePenny: () => ({
    agentNavigate: () => {},
    agentRefresh: () => {},
    runAgentGuide: () => {},
    openChat: () => {},
  }),
}))
vi.mock('../../../lib/api.js', () => ({
  tokenStore: { getAccess: () => 't' },
  apiErrorMessage: (_e, fallback) => fallback,
  assistantApi: { chatStreamUrl: () => '/api/assistant/stream', apply: async () => ({ data: {} }), undoActivity: async () => ({}) },
}))
vi.mock('../hooks/useTextToSpeech.js', () => ({
  useTextToSpeech: () => ({ reset: () => {}, feed: () => {}, flush: () => {}, stop: () => {} }),
}))
vi.mock('../hooks/useSmoothStream.js', () => ({
  useSmoothStream: () => ({ displayed: '', setTarget: () => {}, reset: () => {}, flush: () => {} }),
}))
vi.mock('../hooks/useAiChatSessions.js', () => ({
  useAiChatSessions: () => ({
    sessions: [],
    activeSessionId: 's-1',
    loadActive: () => ({ messages: [] }),
    persist: () => {},
    setTitleFromFirstMessage: () => {},
    newChat: () => {},
    switchSession: () => {},
    deleteSession: () => {},
  }),
}))

const { default: usePennyChat } = await import('./usePennyChat.js')

/** A minimal ReadableStream stand-in that yields one SSE frame per event. */
function sseBody(events) {
  const enc = new TextEncoder()
  const frames = events.map((e) => enc.encode(`data: ${JSON.stringify(e)}\n\n`))
  let i = 0
  return {
    getReader: () => ({
      read: async () =>
        i < frames.length ? { value: frames[i++], done: false } : { value: undefined, done: true },
      cancel: async () => {},
    }),
  }
}

describe('WEB-J11 — the `advisory` SSE event lands on the assistant turn', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const drive = async (events) => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, body: sseBody(events) }))
    const { result } = renderHook(() => usePennyChat())
    await act(async () => {
      await result.current.send('what moved?')
    })
    return result
  }

  it('accumulates the card verbatim beside charts', async () => {
    // RED PROOF: delete the `ev.type === 'advisory'` branch from the stream loop —
    // the event falls through unhandled, `advisories` stays empty and this reddens.
    const result = await drive([
      { type: 'delta', text: 'Here is what moved.' },
      { type: 'advisory', card: MODE_C_CARD },
      { type: 'done' },
    ])
    const last = result.current.messages[result.current.messages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.advisories).toEqual([MODE_C_CARD])
    // Stored VERBATIM: not re-keyed, not merged, not re-ordered.
    expect(last.advisories[0].segments).toEqual(MODE_C_CARD.segments)
    expect(last.content).toBe('Here is what moved.')
  })

  it('keeps two advisory cards in arrival order and leaves charts alone', async () => {
    const second = { ...MODE_C_CARD, mode: 'B', title: 'What moved, and why' }
    const result = await drive([
      { type: 'advisory', card: MODE_C_CARD },
      { type: 'chart', spec: { title: 'c', chartType: 'bar', data: [] } },
      { type: 'advisory', card: second },
      { type: 'done' },
    ])
    const last = result.current.messages[result.current.messages.length - 1]
    expect(last.advisories.map((c) => c.mode)).toEqual(['C', 'B'])
    expect(last.charts).toHaveLength(1)
  })

  it('a turn with no advisory event still carries an empty array, never undefined', async () => {
    const result = await drive([{ type: 'delta', text: 'Plain.' }, { type: 'done' }])
    const last = result.current.messages[result.current.messages.length - 1]
    expect(last.advisories).toEqual([])
  })
})

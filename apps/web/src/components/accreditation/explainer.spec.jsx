// ─────────────────────────────────────────────────────────────────────────────
// F3 THE EXPLAINER — suppression honesty applies to PROSE too.
//
// The drawer's plain-language line is AUTHORED, per framework, on the server.
// Where it has not been written (every framework except Cognia at launch —
// MSA-CESS is the live case) `plainLanguage` is null, and the drawer must
// render NOTHING in its place: no lorem, no paraphrase of the statement, no
// "translation coming soon". A committee member reading an invented sentence
// as the accreditor's meaning is exactly the failure this layer exists to fix.
//
// The checklist rows, rubric position and signals are the payload's own; the
// null-tolerance of each block is pinned here with real renders.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import ExplainerDrawer from './ExplainerDrawer.jsx'

afterEach(cleanup)

const COGNIA_PAYLOAD = {
  code: 'COG-7',
  title: 'Leaders foster effective communication…',
  statement: 'Leaders foster effective communication with stakeholders.',
  plainLanguage:
    'In plain terms: can you show that leadership actually talks with families and staff — and listens?',
  keyCharacteristic: { code: 'COG-KC2', label: 'Leadership for Learning' },
  rubric: [
    { score: 1, label: 'Insufficient', current: false },
    { score: 2, label: 'Initiating', current: false },
    { score: 3, label: 'Improving', current: true },
    { score: 4, label: 'Impacting', current: false },
  ],
  evidenceChecklist: [
    {
      tag: 'survey',
      label: 'Stakeholder survey results',
      whereItLives: 'Knowledge documents',
      dataAvailability: 'school_upload',
      window: 'Refresh every 24 months',
      state: 'missing',
      artifactCount: 0,
    },
    {
      tag: 'board_minutes',
      label: 'Approved board minutes',
      whereItLives: 'Governance',
      state: 'attached_current',
      artifactCount: 2,
    },
  ],
  signals: [
    { key: 'hr.student_teacher_ratio', label: 'Student-teacher ratio', availability: 'available' },
  ],
  suggestions: [],
}

// The MSA case: no authored layer yet — plainLanguage null, sparse everything.
const MSA_PAYLOAD = {
  code: 'MSA-3',
  title: 'Student Well-Being',
  statement: 'The school provides for student well-being.',
  plainLanguage: null,
  keyCharacteristic: null,
  rubric: [],
  evidenceChecklist: [],
  signals: [],
  suggestions: [],
}

const drawer = (payload) => (
  <ExplainerDrawer standardId="std-1" fetchExplainer={async () => payload} />
)

describe('the plain-language block', () => {
  it('renders the authored sentence verbatim when the server wrote one', async () => {
    render(drawer(COGNIA_PAYLOAD))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.getByTestId('explainer-plain').textContent).toBe(COGNIA_PAYLOAD.plainLanguage)
  })

  it('null plainLanguage → the block is ABSENT and nothing is invented in its place', async () => {
    const { container } = render(drawer(MSA_PAYLOAD))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.queryByTestId('explainer-plain')).toBeNull()
    // No placeholder prose either — the drawer holds only the statement + code.
    expect(container.textContent).not.toMatch(/in plain terms/i)
    expect(container.textContent).not.toMatch(/coming soon|not yet|placeholder|lorem/i)
  })
})

describe('the rest of the drawer is the payload’s, block by block', () => {
  it('checklist rows carry the server’s whereItLives / window / state words', async () => {
    render(drawer(COGNIA_PAYLOAD))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    const text = screen.getByTestId('explainer-drawer').textContent
    expect(text).toContain('Stakeholder survey results')
    expect(text).toContain('Knowledge documents')
    expect(text).toContain('Refresh every 24 months')
    expect(text).toContain('Missing')
    expect(text).toContain('Attached · current')
    expect(text).toContain('2 attached')
  })

  it('the rubric position marks the CURRENT tier from the payload', async () => {
    render(drawer(COGNIA_PAYLOAD))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    const current = document.querySelector('[aria-current="true"]')
    expect(current.textContent).toContain('Improving')
    expect(screen.getByText(/self-scored/)).toBeTruthy()
  })

  it('empty rubric/checklist/signals → those blocks are simply not there', async () => {
    render(drawer(MSA_PAYLOAD))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    const text = screen.getByTestId('explainer-drawer').textContent
    expect(text).not.toContain('What good evidence looks like')
    expect(text).not.toContain('Your rubric position')
    expect(text).not.toContain('Bound signals')
  })

  it('a fetch failure degrades to a sentence, never a crash or a guess', async () => {
    render(
      <ExplainerDrawer
        standardId="std-1"
        fetchExplainer={async () => {
          throw new Error('nope')
        }}
      />,
    )
    await waitFor(() =>
      expect(screen.getByText(/unavailable right now/)).toBeTruthy(),
    )
    expect(screen.queryByTestId('explainer-drawer')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Review fixes B4/B5/B6 — the drawer stops dropping or mis-stating payload
// facts: the rubric descriptor renders, a null availability is "not checked"
// (unknown ≠ available), and the checklist icon matches the state word.
// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — the rubric descriptor', () => {
  it('renders the CURRENT level’s long-form descriptor verbatim as subtext', async () => {
    const payload = {
      ...COGNIA_PAYLOAD,
      rubric: [
        { score: 1, label: 'Insufficient', current: false, descriptor: 'Reflecting areas with insufficient evidence and/or limited activity leading toward improvement' },
        { score: 2, label: 'Developing', current: false, descriptor: 'Developing or improving practices that provide evidence that effort approaches desired level of effectiveness' },
        { score: 3, label: 'Engaging', current: true, descriptor: 'Engaging in practices that provide evidence of expected effectiveness that is reflected in the standard' },
        { score: 4, label: 'Demonstrating', current: false, descriptor: 'Demonstrating noteworthy practices producing clear results that positively impact learners' },
      ],
    }
    render(drawer(payload))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.getByTestId('rubric-descriptor').textContent).toContain(
      'Engaging in practices that provide evidence of expected effectiveness that is reflected in the standard',
    )
  })

  it('no descriptor from the accreditor → no subtext invented', async () => {
    render(drawer(COGNIA_PAYLOAD)) // 2022-style rubric rows carry no descriptor
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.queryByTestId('rubric-descriptor')).toBeNull()
  })
})

describe('B5 — signal availability: unknown ≠ available', () => {
  it('a null availability renders an explicit "not checked" annotation', async () => {
    const payload = {
      ...COGNIA_PAYLOAD,
      signals: [{ key: 'days_cash_on_hand', label: 'Days cash on hand', availability: null }],
    }
    render(drawer(payload))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.getByTestId('explainer-drawer').textContent).toContain('not checked')
  })

  it('only a verified "available" earns the bare chip', async () => {
    render(drawer(COGNIA_PAYLOAD)) // availability: 'available'
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.getByTestId('explainer-drawer').textContent).not.toContain('not checked')
  })
})

describe('B6 — the checklist icon matches the state word', () => {
  it('a not_tracked row renders NO green check — a neutral dash, and the word leads', async () => {
    const payload = {
      ...COGNIA_PAYLOAD,
      evidenceChecklist: [
        {
          tag: 'facility_inspection',
          label: 'Facility inspection record',
          whereItLives: 'Facilities',
          state: 'not_tracked',
          artifactCount: 0,
        },
      ],
    }
    render(drawer(payload))
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.getByTestId('explainer-drawer').textContent).toContain('Not tracked')
    expect(screen.queryByTestId('check-icon-attached')).toBeNull()
    expect(screen.getByTestId('check-icon-neutral')).toBeTruthy()
  })

  it('attached states keep the check; missing keeps the X', async () => {
    render(drawer(COGNIA_PAYLOAD)) // one missing row + one attached_current row
    await waitFor(() => expect(screen.getByTestId('explainer-drawer')).toBeTruthy())
    expect(screen.getByTestId('check-icon-attached')).toBeTruthy()
    expect(screen.getByTestId('check-icon-missing')).toBeTruthy()
    expect(screen.queryByTestId('check-icon-neutral')).toBeNull()
  })
})

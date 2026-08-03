import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VisitPage from './VisitPage.jsx'
import visitFixture from '../components/accreditation/visit/__fixtures__/visit.example.json'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — SPEC-WEB-9. THE PARTIAL-FAILURE REPORT MUST OUTLIVE THE REFETCH.
//
// Frozen spec §2.4 step 3 is verbatim: "A partial failure is reported per row
// ('3 created, 1 failed — retry')". SPEC-WEB-8 proves PlanConfirmCard renders that
// report — in isolation, with a static `items` prop. On the real page the report
// was destroyed milliseconds after it appeared, and no spec could see it:
//
//   run() → per-row states → tally → onDone() → useVisit.refresh() → a NEW payload
//   object → a new `plan.items` identity → the reset effect fires →
//   setConfirming(false) → PlanConfirmCard UNMOUNTS.
//
// The user was left on Act 6 with the failed item silently back in the draft,
// re-ticked by default, and nothing on screen saying anything had gone wrong. The
// only signal that a row 400'd was gone.
//
// So this spec mounts THE PAGE. It is the only way to exercise the interaction
// between the refetch and the card, which is where the defect lived — and it is
// mounted against mocked module boundaries (api, school context, TTS, motion)
// rather than a context stack, so it does not go red for unrelated reasons.
// ─────────────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getVisit: vi.fn(),
  adopt: vi.fn(),
  members: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
  accreditationApi: { getVisit: (...a) => mocks.getVisit(...a) },
  improvementApi: { adopt: (...a) => mocks.adopt(...a) },
  schoolsApi: { members: (...a) => mocks.members(...a) },
  isModuleNotLicensed: () => false,
  isPaymentRequired: () => false,
}))

vi.mock('../context/SchoolContext.jsx', () => ({
  useSchools: () => ({
    activeSchool: { id: 'school-1', name: 'St. Example Academy', role: 'owner' },
    schools: [],
  }),
}))

// The TTS transport. Phase H's narration is a transport being handed sentences the
// composer already wrote; none of that is under test here.
vi.mock('../components/penny/hooks/useNarrationPlayer.js', () => ({
  useNarrationPlayer: () => ({ supported: false, playing: false, play: () => {}, pause: () => {} }),
}))

// jsdom implements no matchMedia, which framer-motion's useReducedMotion reads.
//
// THE CACHE IS LOAD-BEARING. A proxy that mints a fresh component type per property
// read gives React a new element type on every render, so the whole act subtree
// REMOUNTS each time — which silently resets component state and makes every
// assertion about surviving a re-render meaningless (and makes DOM nodes captured
// before a render stale). One component per tag, created once.
const MOTION_PROPS = [
  'initial',
  'animate',
  'transition',
  'exit',
  'variants',
  'whileHover',
  'whileTap',
  'whileInView',
  'viewport',
  'layout',
]

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const cache = new Map()
  const passthrough = (tag) => {
    if (!cache.has(tag)) {
      const C = React.forwardRef(function Motion(props, ref) {
        // The motion-only props are dropped rather than forwarded: React would
        // warn about unknown DOM attributes for every one of them.
        const { children, ...rest } = props
        for (const k of MOTION_PROPS) delete rest[k]
        return React.createElement(tag, { ...rest, ref }, children)
      })
      C.displayName = `motion.${tag}`
      cache.set(tag, C)
    }
    return cache.get(tag)
  }
  return {
    useReducedMotion: () => true,
    motion: new Proxy({}, { get: (_t, tag) => passthrough(String(tag)) }),
  }
})

vi.mock('../components/BillingBanner.jsx', () => ({ default: () => null }))

afterEach(cleanup)

/**
 * A FRESH OBJECT GRAPH PER CALL, exactly as axios produces. This is the whole
 * mechanism of the bug: identity, not content, is what fires the reset effect.
 */
const freshVisit = () => structuredClone(visitFixture)

const planItems = visitFixture.acts.plan.items

beforeEach(() => {
  mocks.getVisit.mockImplementation(() => Promise.resolve({ data: freshVisit() }))
  mocks.members.mockImplementation(() => Promise.resolve({ data: [] }))
  mocks.adopt.mockReset()
})

const wrap = () =>
  render(
    <MemoryRouter>
      <VisitPage />
    </MemoryRouter>,
  )

/** Open the confirm card. The start control is DISABLED until the draft's default
 *  selection lands (it is set in a microtask-deferred effect), so wait for it. */
async function openConfirm(container) {
  const start = await screen.findByRole('button', { name: /turn this into a plan/i })
  await waitFor(() => expect(start.disabled).toBe(false))
  fireEvent.click(start)
  await waitFor(() =>
    expect(container.querySelector('[data-testid="plan-confirm"]')).not.toBeNull(),
  )
  return start
}

/** Act 6: open the confirm card and run it. */
async function runAdopt() {
  const { container } = wrap()
  await openConfirm(container)
  const create = await screen.findByRole('button', { name: /create these initiatives/i })
  fireEvent.click(create)
  return container
}

describe('SPEC-WEB-9 — the per-row adopt report survives the automatic refetch', () => {
  it('a PARTIAL FAILURE is still on screen after /visit refetches', async () => {
    expect(planItems.length).toBeGreaterThan(1)
    let call = 0
    mocks.adopt.mockImplementation(() => {
      call += 1
      return call === 1 ? Promise.resolve({ status: 201 }) : Promise.reject(new Error('boom'))
    })

    const container = await runAdopt()

    // The tally appears…
    const tally = await screen.findByTestId('run-tally')
    expect(tally.textContent).toContain('1 created')
    expect(tally.textContent).toContain('failed — retry')

    // …and the refetch that `onDone` triggers does not take it away. Waiting on
    // the SECOND getVisit call is waiting on exactly the event that used to
    // unmount the card.
    await waitFor(() => expect(mocks.getVisit.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() =>
      expect(container.querySelector('[data-testid="plan-confirm"]')).not.toBeNull(),
    )
    const after = screen.getByTestId('run-tally')
    expect(after.textContent).toContain('1 created')
    expect(after.textContent).toContain('failed — retry')
    // The per-row outcome chips are still there too — the tally without the rows
    // would say a row failed without saying which.
    expect(container.querySelector('[data-testid="row-failed"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="row-created"]')).not.toBeNull()
  })

  it('the row that succeeded is still counted after the server drops it from the draft', async () => {
    // The refetch removes adopted items from `plan.items`. A tally computed over
    // the CURRENT rows loses "1 created" the moment the server stops offering the
    // row that was created — the report would quietly become "1 failed".
    let call = 0
    mocks.adopt.mockImplementation(() => {
      call += 1
      return call === 1 ? Promise.resolve({ status: 201 }) : Promise.reject(new Error('boom'))
    })
    mocks.getVisit.mockImplementationOnce(() => Promise.resolve({ data: freshVisit() }))
    mocks.getVisit.mockImplementation(() => {
      const v = freshVisit()
      v.acts.plan.items = v.acts.plan.items.slice(1) // the adopted one is gone
      return Promise.resolve({ data: v })
    })

    await runAdopt()
    await screen.findByTestId('run-tally')
    await waitFor(() => expect(mocks.getVisit.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() =>
      expect(screen.getByTestId('run-tally').textContent).toContain('1 created'),
    )
  })

  it('Cancel dismisses the report and re-syncs the draft', async () => {
    mocks.adopt.mockResolvedValue({ status: 201 })
    const container = await runAdopt()
    await screen.findByTestId('run-tally')
    await waitFor(() => expect(mocks.getVisit.mock.calls.length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() =>
      expect(container.querySelector('[data-testid="plan-confirm"]')).toBeNull(),
    )
    // Act 6 itself is still there, ready to start again.
    expect(screen.getByRole('button', { name: /turn this into a plan/i })).toBeTruthy()
  })

  it('a refetch BEFORE any run still resets the card — the gate is on having run', async () => {
    // The reset effect is not disabled; it is skipped only for a card that has
    // already produced a report. An unrun card must still follow the draft.
    mocks.adopt.mockResolvedValue({ status: 201 })
    const container = wrap().container
    await openConfirm(container)
    // A payload change with no run in between closes it, as it always did.
    window.dispatchEvent(
      new CustomEvent('penny:data-changed', { detail: { key: 'accreditation' } }),
    )
    await waitFor(() =>
      expect(container.querySelector('[data-testid="plan-confirm"]')).toBeNull(),
    )
  })
})

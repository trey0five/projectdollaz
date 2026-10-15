// ─────────────────────────────────────────────────────────────────────────────
// A5 — THE REVIEW HAPPENS IN ONE POPUP.
//
// Owner, after seeing the inline list: "maybe to make it more visible and user
// friendly, we should show this review in a popup window that is intuitive and
// easier to understand. then when it is finished it can approve and populate
// properly". The inline list truncated every account to "4(" / "40…", showed a
// bare number and asked for "Use this" on EVERY row. Pinned here: grouping,
// full names, pre-filled suggestions count as answers, approve disabled until
// every row has a category, ONE save on approve, every entry point opens the
// SAME popup, and Esc closes without saving.
// ─────────────────────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_CHART } from '@finrep/engine'
import { ingest } from '@finrep/ingestion'
import ReviewAccountsModal from './ReviewAccountsModal.jsx'
import {
  buildReviewItems,
  groupItems,
  currentPicks,
  approveState,
  entriesFromPicks,
  displayName,
  reviewAmount,
  answeredCount,
} from '../../lib/reviewPopup.js'
import {
  reviewModalState,
  resetReviewModal,
  openReviewModal,
} from '../../lib/reviewModalStore.js'
import { requestOpenReview, clearReviewRequest } from '../../lib/reviewRequest.js'
import { holyFamilyStatements } from '../../lib/__fixtures__/holyFamily.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

// ── A mocked intake for the host + file card ────────────────────────────────
let app = {}
vi.mock('../../context/AppContext.jsx', () => ({ useApp: () => app }))

// A plain trial balance (no section facts) with one account KYRO can name,
// one it can't, plus a QuickBooks statement export with one known-class row.
const tbFile = {
  id: 'f-tb',
  fileName: 'TB.xlsx',
  status: 'ready',
  role: 'cy',
  rows: [
    { acct: 1010, desc: 'Cash - Operating Checking', total: 508_400 },
    { acct: 4823, desc: 'Miscellaneous', total: -100 },
    { acct: 5010, desc: 'Salaries - Instructional', total: 2_010_000 },
  ],
  metadata: {},
}
const stmtFile = {
  id: 'f-st',
  fileName: 'Profit and Loss.xlsx',
  status: 'ready',
  role: 'py',
  rows: [
    { acct: 41000, desc: '41000 Contributions without Donor Restrictions with a very long name that must wrap', total: -245_000 },
    // Same account in two files → listed once.
    { acct: 1010, desc: 'Cash - Operating Checking', total: 1 },
  ],
  metadata: {
    statement: {
      type: 'pl',
      partial: 'pl',
      sections: {
        41000: { statement: 'pl', section: 'income', basis: 'section' },
        1010: { statement: 'pl', section: 'income', basis: 'section' },
      },
    },
  },
}

beforeEach(() => {
  resetReviewModal()
  clearReviewRequest()
})
afterEach(() => cleanup())

describe('the popup’s rows (pure)', () => {
  const items = buildReviewItems([tbFile, stmtFile], DEFAULT_CHART)

  it('lists every waiting account once, across files', () => {
    expect(items.map((i) => i.acct).sort((a, b) => a - b)).toEqual([1010, 4823, 5010, 41000])
  })

  it('groups by where each account belongs — section first, then the suggestion, else "Not sure yet"', () => {
    const g = Object.fromEntries(items.map((i) => [i.acct, i.group]))
    expect(g[41000]).toBe('in') // printed under Income
    expect(g[1010]).toBe('own') // name guess: cash
    expect(g[5010]).toBe('out') // name guess: salaries
    expect(g[4823]).toBe('unsure') // nobody could name it
    // "Not sure yet" FIRST: the only rows that need a decision don't sit
    // below every pre-filled one.
    expect(groupItems(items).map((x) => x.key)).toEqual(['unsure', 'in', 'out', 'own'])
  })

  it('a plain TB’s 41000 "Contributions without Donor Restrictions" is never net assets — it is suggested as Contributions & support', () => {
    // No section fact on a trial balance, and the name rules alone would say
    // naWithoutDonor (balance-sheet net assets). The number says 4 = revenue:
    // the name was right about WHAT it is (a gift), the number about where it
    // goes — so the suggestion is the revenue category, and the jargon hint
    // ("Its name sounds like…") is gone.
    const tb = {
      id: 'tb41',
      status: 'ready',
      role: 'cy',
      metadata: {},
      rows: [{ acct: 41000, desc: 'Contributions without Donor Restrictions', total: -245_000 }],
    }
    const [row] = buildReviewItems([tb], DEFAULT_CHART)
    expect(row.suggestion?.category).toBe('support')
    expect(row.group).toBe('in')
    expect(currentPicks([row], {})['41000']).toBe('support')
    expect(entriesFromPicks([row], currentPicks([row], {}))).toEqual({ 41000: 'support' })
    // A contradiction with no clean sibling still needs a person's pick.
    const odd = { ...tb, rows: [{ acct: 15500, desc: 'Net Assets without Donor Restrictions', total: 9 }] }
    const [r2] = buildReviewItems([odd], DEFAULT_CHART)
    expect(r2.suggestion).toBeNull()
    expect(approveState([r2], currentPicks([r2], {})).canApprove).toBe(false)
  })

  it('the popup no longer prints the "Its name sounds like…" hint', () => {
    expect(read('components/intake/ReviewAccountsModal.jsx')).not.toMatch(/sounds like/)
  })

  it('a name guess that AGREES with the number still pre-fills (1 own, 4 in, 5–9 out)', () => {
    const tb = {
      id: 'tbok',
      status: 'ready',
      role: 'cy',
      metadata: {},
      rows: [
        { acct: 31000, desc: 'Net Assets without Donor Restrictions', total: -900_000 },
        { acct: 1010, desc: 'Cash - Operating Checking', total: 5 },
      ],
    }
    const items = buildReviewItems([tb], DEFAULT_CHART)
    const by = Object.fromEntries(items.map((i) => [i.acct, i]))
    expect(by[31000].suggestion?.category).toBe('naWithoutDonor')
    expect(by[1010].suggestion?.category).toBe('cash')
  })

  it('a statement row’s group comes from its QuickBooks section, and its dropdown is fixed to it', () => {
    const row = items.find((i) => i.acct === 41000)
    expect(row.fixed).toBe(true)
    expect(row.section).toBe('revenue')
  })

  it('shows the FULL name, without repeating the number QuickBooks printed in front', () => {
    expect(displayName(41000, '41000 Contributions without Donor Restrictions')).toBe(
      'Contributions without Donor Restrictions',
    )
    expect(displayName(4010, 'Tuition 4010')).toBe('Tuition 4010')
    expect(displayName(5, '')).toBe('Account 5')
  })

  it('formats amounts as money, with a minus only when it runs against its group', () => {
    // Money in / out rows (suggested ones too) say which way the money went.
    expect(reviewAmount(-245_000, 'in')).toBe('$245,000 in')
    expect(reviewAmount(310_000, 'in')).toBe('$310,000 out')
    expect(reviewAmount(1234.5, 'out')).toBe('$1,234.50 out')
    // Balance-sheet groups keep the minus-when-contrary form.
    expect(reviewAmount(-5, 'own')).toBe('−$5')
    expect(reviewAmount(5, 'own')).toBe('$5')
    // "Not sure yet" has no normal side, so it says which way the money went.
    expect(reviewAmount(-12_000, 'unsure')).toBe('$12,000 in')
    expect(reviewAmount(2_179_700, 'unsure')).toBe('$2,179,700 out')
  })

  it('a pre-filled suggestion counts as the answer; approve waits for every row', () => {
    const picks = currentPicks(items, {})
    expect(picks['1010']).toBe('cash')
    expect(picks['4823']).toBe('')
    expect(answeredCount(items, picks)).toBe(3)
    expect(approveState(items, picks)).toMatchObject({ canApprove: false, missing: 1 })
    const done = currentPicks(items, { 4823: 'other' })
    expect(approveState(items, done)).toEqual({ canApprove: true, missing: 0, reason: null })
    // A person's change overrides the suggestion.
    expect(currentPicks(items, { 1010: 'restrictedCash' })['1010']).toBe('restrictedCash')
  })

  it('one map for the one save — only real categories', () => {
    const e = entriesFromPicks(items, currentPicks(items, { 4823: 'other', 5010: 'notACategory' }))
    expect(e['1010']).toBe('cash')
    expect(e['4823']).toBe('other')
    expect(e['5010']).toBeUndefined()
    expect(Object.keys(e).sort()).toEqual(['1010', '41000', '4823'])
  })

  it('the Holy Family workbook needs no popup at all once A1 has sorted it', async () => {
    const { suggestStatementCategories } = await import('@finrep/engine')
    const r = ingest('Holy Family Academy Financial Statements 6-30-26.xlsx', holyFamilyStatements())
    const hf = { id: 'hf', status: 'ready', role: 'cy', rows: r.rows, metadata: r.metadata }
    const all = buildReviewItems([hf], DEFAULT_CHART)
    expect(all).toHaveLength(34)
    // Every row already sits in a group (no "Not sure yet") and has an answer.
    expect(all.filter((i) => i.group === 'unsure')).toHaveLength(0)
    expect(approveState(all, currentPicks(all, {})).canApprove).toBe(true)
    expect(suggestStatementCategories).toBeTypeOf('function')
  })
})

function renderModal(props = {}) {
  const items = props.items ?? buildReviewItems([tbFile, stmtFile], DEFAULT_CHART)
  const handlers = {
    onPick: vi.fn(),
    onApprove: vi.fn(),
    onSaveLater: vi.fn(),
    onClose: vi.fn(),
  }
  const utils = render(
    <ReviewAccountsModal open items={items} picks={props.picks ?? currentPicks(items, {})} {...handlers} {...props} />,
  )
  return { ...utils, items, ...handlers }
}

describe('the popup (render)', () => {
  it('says what it is, why, and how far along', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Review 4 accounts' })).toBeTruthy()
    expect(screen.getByText('Tell us what each account is once. Every future upload remembers.')).toBeTruthy()
    // What is TRUE, and what each row asks for: one needs a pick, three
    // pre-filled suggestions only need a look.
    expect(screen.getByTestId('review-progress').textContent).toBe('1 to pick · 3 to confirm')
  })

  it('groups the rows under plain headings, in order', () => {
    renderModal()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings[0]).toMatch(/^Not sure yet/)
    expect(headings[1]).toMatch(/^Money in/)
    expect(headings[2]).toMatch(/^Money out/)
    expect(headings[3]).toMatch(/^What we own/)
    // …and the unsure row's amount says in or out.
    expect(screen.getByTestId('review-row-4823').textContent).toContain('$100 in')
  })

  it('shows the full number and name — nothing truncated', () => {
    renderModal()
    const row = screen.getByTestId('review-row-41000')
    expect(row.textContent).toContain('41000')
    expect(row.textContent).toContain('Contributions without Donor Restrictions with a very long name that must wrap')
    expect(row.querySelector('.truncate')).toBeNull()
    expect(row.textContent).toContain('$245,000')
  })

  it('pre-fills suggestions and tags them; an unnamed row is flagged "Needs your pick"', () => {
    renderModal()
    expect(screen.getByTestId('review-select-1010').value).toBe('cash')
    expect(screen.getByTestId('review-row-1010').textContent).toContain('Suggested')
    expect(screen.getByTestId('review-select-4823').value).toBe('')
    expect(screen.getByTestId('review-row-4823').textContent).toContain('Needs your pick')
    // No per-row "Use this" button any more.
    expect(screen.queryByText('Use this')).toBeNull()
  })

  it('a section-fixed row only offers categories from its section', () => {
    renderModal()
    const opts = [...screen.getByTestId('review-select-41000').querySelectorAll('option')].map((o) => o.value)
    expect(opts).toContain('development')
    expect(opts).not.toContain('naWithoutDonor')
    expect(opts).not.toContain('cash')
  })

  it('approve is disabled, with the reason, while a row has no category', () => {
    const { onApprove } = renderModal()
    const btn = screen.getByTestId('review-approve')
    expect(btn.disabled).toBe(true)
    expect(screen.getByTestId('approve-reason').textContent).toBe('Pick a category for 1 more account first.')
    fireEvent.click(btn)
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('approve is enabled once every row has a category, and calls onApprove once', () => {
    const items = buildReviewItems([tbFile, stmtFile], DEFAULT_CHART)
    const { onApprove } = renderModal({ items, picks: currentPicks(items, { 4823: 'other' }) })
    const btn = screen.getByTestId('review-approve')
    expect(btn.disabled).toBe(false)
    expect(btn.textContent).toBe('Approve and build statements')
    fireEvent.click(btn)
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('changing a dropdown reports the pick (and saves nothing)', () => {
    const { onPick, onApprove, onSaveLater } = renderModal()
    fireEvent.change(screen.getByTestId('review-select-4823'), { target: { value: 'other' } })
    expect(onPick).toHaveBeenCalledWith(4823, 'other')
    expect(onApprove).not.toHaveBeenCalled()
    expect(onSaveLater).not.toHaveBeenCalled()
  })

  it('"N still need your pick" jumps to the first row without a category', () => {
    renderModal()
    const jump = screen.getByTestId('jump-to-missing')
    expect(jump.textContent).toBe('1 still needs your pick')
    fireEvent.click(jump)
    expect(document.activeElement).toBe(screen.getByTestId('review-select-4823'))
  })

  it('Esc closes without saving', () => {
    const { onClose, onApprove, onSaveLater } = renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApprove).not.toHaveBeenCalled()
    expect(onSaveLater).not.toHaveBeenCalled()
  })

  it('"Save and finish later" is its own press', () => {
    const { onSaveLater } = renderModal()
    fireEvent.click(screen.getByTestId('review-save-later'))
    expect(onSaveLater).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside the dialog', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    const close = screen.getByRole('button', { name: 'Close without saving' })
    const save = screen.getByTestId('review-save-later')
    // From the last enabled control, Tab wraps to the first.
    save.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(close)
    // Shift+Tab from the first wraps to the last.
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save)
  })

  it('is a full-screen sheet on a phone and a centred dialog from sm up', () => {
    renderModal()
    const cls = screen.getByRole('dialog').className
    expect(cls).toMatch(/h-\[100dvh\]/)
    expect(cls).toMatch(/!rounded-none/)
    expect(cls).toMatch(/sm:max-w-3xl/)
  })
})

// ── The host: every way in opens the SAME popup; approve is ONE save ────────
describe('the host (wired to the intake)', () => {
  let ReviewAccountsHost
  beforeEach(async () => {
    ReviewAccountsHost = (await import('./ReviewAccountsHost.jsx')).default
    app = {
      files: [tbFile, stmtFile],
      activeChart: DEFAULT_CHART,
      serverMappedAccts: new Set(),
      mapAccounts: vi.fn(async () => true),
      canEdit: true,
      schoolId: 's1',
    }
  })

  it('opens from the store, and approve sends ONE save with every answer', async () => {
    render(<ReviewAccountsHost />)
    expect(screen.queryByTestId('review-modal')).toBeNull()
    act(() => openReviewModal('s1'))
    expect(await screen.findByTestId('review-modal')).toBeTruthy()
    fireEvent.change(screen.getByTestId('review-select-4823'), { target: { value: 'other' } })
    fireEvent.click(screen.getByTestId('review-approve'))
    await waitFor(() => expect(app.mapAccounts).toHaveBeenCalledTimes(1))
    const [entries, opts] = app.mapAccounts.mock.calls[0]
    expect(entries).toMatchObject({ 1010: 'cash', 4823: 'other', 5010: 'instrSal' })
    // Untouched suggestions are FILL-ONLY; the person's own pick (4823) is
    // "chosen" — a normal merge, never silently dropped (N2).
    expect(opts.onlyNew).toBe(true)
    expect([...opts.chosen]).toEqual(['4823'])
    expect(Object.keys(entries)).toHaveLength(4)
    await waitFor(() => expect(reviewModalState().open).toBe(false))
    expect(reviewModalState().sortedSchoolId).toBe('s1')
  })

  it('Esc closes without saving and drops the unsaved picks', async () => {
    render(<ReviewAccountsHost />)
    act(() => openReviewModal('s1'))
    await screen.findByTestId('review-modal')
    fireEvent.change(screen.getByTestId('review-select-4823'), { target: { value: 'other' } })
    expect(reviewModalState().draft).toEqual({ 4823: 'other' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(reviewModalState().open).toBe(false)
    expect(reviewModalState().draft).toEqual({})
    expect(app.mapAccounts).not.toHaveBeenCalled()
  })

  it('"Save and finish later" saves what has an answer and closes', async () => {
    render(<ReviewAccountsHost />)
    act(() => openReviewModal('s1'))
    await screen.findByTestId('review-modal')
    fireEvent.click(screen.getByTestId('review-save-later'))
    await waitFor(() => expect(app.mapAccounts).toHaveBeenCalledTimes(1))
    expect(app.mapAccounts.mock.calls[0][0]).not.toHaveProperty('4823')
    await waitFor(() => expect(reviewModalState().open).toBe(false))
  })

  it('a failed save keeps the popup open with the picks and says so', async () => {
    app.mapAccounts = vi.fn(async () => false)
    render(<ReviewAccountsHost />)
    act(() => openReviewModal('s1'))
    await screen.findByTestId('review-modal')
    fireEvent.change(screen.getByTestId('review-select-4823'), { target: { value: 'other' } })
    fireEvent.click(screen.getByTestId('review-approve'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(reviewModalState().open).toBe(true)
    expect(reviewModalState().draft).toEqual({ 4823: 'other' })
  })

  it('opens on the finrep:open-review event (the confirm band outside the intake)', async () => {
    render(<ReviewAccountsHost />)
    act(() => {
      window.dispatchEvent(new CustomEvent('finrep:open-review'))
    })
    expect(await screen.findByTestId('review-modal')).toBeTruthy()
  })

  it('takes the Finance band’s STICKY ask once the files have mounted', async () => {
    requestOpenReview()
    render(<ReviewAccountsHost />)
    expect(await screen.findByTestId('review-modal')).toBeTruthy()
  })

  it('never opens over another school, or with nothing to sort, or for a viewer', async () => {
    act(() => openReviewModal('other-school'))
    const { unmount } = render(<ReviewAccountsHost />)
    expect(screen.queryByTestId('review-modal')).toBeNull()
    unmount()
    app = { ...app, files: [] }
    act(() => openReviewModal('s1'))
    const r2 = render(<ReviewAccountsHost />)
    expect(screen.queryByTestId('review-modal')).toBeNull()
    r2.unmount()
    app = { ...app, files: [tbFile], canEdit: false }
    render(<ReviewAccountsHost />)
    expect(screen.queryByTestId('review-modal')).toBeNull()
  })
})

describe('every entry point opens the same popup', () => {
  it('the file card’s amber "Review N accounts →" button', async () => {
    const FileStatusCard = (await import('../FileStatusCard.jsx')).default
    app = {
      files: [tbFile],
      activeChart: DEFAULT_CHART,
      serverMappedAccts: new Set(),
      canEdit: true,
      schoolId: 's1',
      setFileRole: vi.fn(),
      removeFile: vi.fn(),
    }
    render(
      <MemoryRouter>
        <FileStatusCard file={{ ...tbFile, balance: { balanced: true } }} needsReview={false} />
      </MemoryRouter>,
    )
    const btn = screen.getByTestId('review-accounts-button')
    expect(btn.textContent).toBe('Review 3 accounts')
    fireEvent.click(btn)
    expect(reviewModalState()).toMatchObject({ open: true, schoolId: 's1' })
    // The inline list is gone from the card.
    expect(screen.queryByText(/We don.t know what these accounts are yet/)).toBeNull()
  })

  it('the Add-data callout’s "Review N accounts", the band and the event all reach the one host', () => {
    const bar = read('components/IntakeBar.jsx')
    expect(bar).toMatch(/onReview=\{\(\) => openReviewModal\(schoolId\)\}/)
    expect(bar).toMatch(/\{canEdit && <ReviewAccountsHost \/>\}/)
    const card = read('components/FileStatusCard.jsx')
    expect(card).toMatch(/const openReview = \(\) => openReviewModal\(schoolId\)/)
    expect(card).not.toMatch(/MappingCategorySelect/)
    // The Finance band deep-links to the trial-balance step with a sticky ask…
    const page = read('pages/FinancePage.jsx')
    expect(page).toMatch(/to=\{uiV2 \? REVIEW_HREF : addDataHref\(uiV2, \{ add: 'tb' \}\)\}\s*\n\s*onClick=\{\(\) => requestOpenReview\(\)\}/)
    expect(read('lib/reviewQueue.js')).toMatch(/REVIEW_HREF = '\/finance\?tab=add&add=tb&review=1'/)
    // …which the Add-data tab also raises from ?review=1, and the host takes.
    expect(read('components/wizard/AddDataTab.jsx')).toMatch(/if \(deepLink\.review\) requestOpenReview\(\)/)
    expect(read('components/intake/ReviewAccountsHost.jsx')).toMatch(/takeReviewRequest\(\)/)
  })
})

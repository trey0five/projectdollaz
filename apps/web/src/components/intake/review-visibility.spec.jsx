// ─────────────────────────────────────────────────────────────────────────────
// A2 / A3 / A4 — what the owner saw live on 2026-10-15, pinned.
//
//   A4  "make it easier to tell that there are items to review": the Finance
//       band says it in words and its WHITE button goes straight to the review;
//       the Add-data step shows an amber callout above "Your files" that turns
//       green when everything is sorted; the file card's chip is a button.
//   A2  a chatty AI reply ("I'm ready to help…", "I'll need information such
//       as:") was cut into five green Warnings tiles. Only tagged findings are
//       tiles; zero findings is the designed empty state.
//   A3  the upload copy says QuickBooks reports work too.
// ─────────────────────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  needsCheckPhrase,
  reviewVerdict,
  reviewButtonLabel,
  reviewProgress,
  reviewSummary,
  serverMappedAccts,
  reviewSplit,
  snapshotReviewCount,
  REVIEW_HREF,
} from '../../lib/reviewQueue.js'
import {
  requestOpenReview,
  hasReviewRequest,
  takeReviewRequest,
  urlAsksForReview,
  REVIEW_REQUEST_TTL_MS,
} from '../../lib/reviewRequest.js'
import { realSignals, warningTiles } from '../finance/financeAurora.js'
import { toSignals } from '../home/HomeHero.jsx'
import { DEFAULT_CHART } from '@finrep/engine'

vi.mock('../../context/AppContext.jsx', () => ({ useApp: () => ({}) }))

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
afterEach(() => cleanup())

describe('A4 — the words', () => {
  it('says how many, plainly', () => {
    expect(needsCheckPhrase(12)).toBe('12 accounts need a quick check')
    expect(needsCheckPhrase(1)).toBe('1 account needs a quick check')
    expect(reviewVerdict(12, false)).toBe('12 accounts need a quick check before your numbers show.')
    expect(reviewVerdict(0, false)).toBeNull()
    expect(reviewButtonLabel(12)).toBe('Review 12 accounts')
    expect(reviewButtonLabel(1)).toBe('Review 1 account')
    // Says what is TRUE: a pre-filled suggestion is a category, not a check.
    expect(reviewProgress(3, 12)).toBe('3 of 12 have a category')
    expect(reviewProgress(15, 12)).toBe('12 of 12 have a category')
    expect(reviewProgress(1, 1)).toBe('1 of 1 has a category')
    // The popup's own line: what the N accounts actually ask for.
    expect(reviewSplit(5, 18)).toBe('5 to pick · 13 to confirm')
    expect(reviewSplit(0, 18)).toBe('All 18 have a category')
    expect(reviewSplit(2, 2)).toBe('2 to pick')
  })

  it('counts UNIQUE accounts across the intake, and the snapshot’s own list', () => {
    const rows = [
      { acct: 90001, desc: 'Mystery', total: 5 },
      { acct: 90002, desc: 'Other', total: -5 },
    ]
    const files = [
      { id: 'cy', status: 'ready', role: 'cy', rows },
      { id: 'py', status: 'ready', role: 'py', rows },
    ]
    const s = reviewSummary(files, DEFAULT_CHART)
    expect(s.total).toBe(2)
    expect(s.byId).toEqual({ cy: 2, py: 2 })
    expect(s.firstId).toBe('cy')
    expect(snapshotReviewCount({ payload: { unmapped: [{ acct: 1 }] } })).toBe(1)
    expect(snapshotReviewCount(null)).toBeNull()
  })

  it('never re-asks about accounts the saved snapshot shows the server already places', () => {
    const files = [
      {
        id: 'cy',
        status: 'ready',
        role: 'cy',
        persisted: true,
        rows: [
          { acct: 90001, desc: 'Sorted on the server', total: 5 },
          { acct: 90002, desc: 'Still unknown', total: -5 },
        ],
      },
    ]
    const known = serverMappedAccts({ payload: { unmapped: [{ acct: 90002 }] } }, files)
    expect([...known]).toEqual(['90001'])
    expect(reviewSummary(files, DEFAULT_CHART, known).total).toBe(1)
  })

  it('only THIS year’s saved file is vouched for — a saved last-year-only account is still asked about (S2)', () => {
    // The snapshot's `unmapped` is computed over this year's trial balance
    // only. A PY-only account it never looked at must not read "sorted".
    const files = [
      { id: 'cy', status: 'ready', role: 'cy', persisted: true, rows: [{ acct: 90001, desc: 'Shared', total: 5 }] },
      {
        id: 'py',
        status: 'ready',
        role: 'py',
        persisted: true,
        rows: [
          { acct: 90001, desc: 'Shared', total: 4 },
          { acct: 90003, desc: 'Last-year only', total: 7 },
        ],
      },
      { id: 'au', status: 'ready', role: 'audit', persisted: true, rows: [{ acct: 90004, desc: 'Audit only', total: 2 }] },
    ]
    const known = serverMappedAccts({ payload: { unmapped: [] } }, files)
    expect([...known]).toEqual(['90001'])
    const s = reviewSummary(files, DEFAULT_CHART, known)
    expect(s.total).toBe(2)
    expect(s.byId).toEqual({ py: 1, au: 1 })
  })
})

describe('A4a — the Finance band', () => {
  const page = read('pages/FinancePage.jsx')

  it('its verdict says how many accounts need a check, before anything else', () => {
    expect(page).toMatch(/const verdict = reviewCount > 0 \? \(\s*<>\{reviewVerdict\(reviewCount, statementsHaveNumbers\)\}<\/>/)
  })

  it('its PRIMARY white button is "Review N accounts" and lands on the open review', () => {
    expect(page).toMatch(/reviewCount > 0 \? \(\s*<>[\s\S]{0,400}<AuroraButton\s+variant="primary"/)
    expect(page).toMatch(/\{reviewButtonLabel\(reviewCount\)\}/)
    expect(page).toMatch(/onClick=\{\(\) => requestOpenReview\(\)\}/)
    expect(REVIEW_HREF).toBe('/finance?tab=add&add=tb&review=1')
    expect(urlAsksForReview('?tab=add&add=tb&review=1')).toBe(true)
    expect(urlAsksForReview('?tab=add')).toBe(false)
    // Only editors are sent to sort accounts.
    expect(page).toMatch(/reviewCount=\{canEdit \? reviewCount : 0\}/)
  })

  it('the ask survives the hop to Add data, is taken once, and expires', () => {
    requestOpenReview(1_000)
    expect(hasReviewRequest(1_000 + REVIEW_REQUEST_TTL_MS)).toBe(true)
    expect(takeReviewRequest(1_001)).toBe(true)
    expect(takeReviewRequest(1_002)).toBe(false)
    requestOpenReview(1_000)
    expect(takeReviewRequest(1_000 + REVIEW_REQUEST_TTL_MS + 1)).toBe(false)
  })

  it('the school home, the org home and the sidebar are untouched', () => {
    for (const rel of ['pages/HomePage.jsx', 'components/home/OrgHome.jsx', 'components/home/HomeHero.jsx', 'components/nav/sidebarNav.js']) {
      expect(read(rel), rel).not.toMatch(/reviewQueue|reviewModalStore|ReviewAccounts|requestOpenReview/)
    }
  })
})

describe('A4b — the Add-data callout', () => {
  it('amber with the count, one line why and a big "Review 12 accounts" (one action, one name)', async () => {
    const { ReviewCallout } = await import('../IntakeBar.jsx')
    const onReview = vi.fn()
    render(
      <MemoryRouter>
        <ReviewCallout total={12} done={false} onReview={onReview} />
      </MemoryRouter>,
    )
    const box = screen.getByTestId('review-callout')
    expect(box.textContent).toContain('12 accounts need a quick check')
    expect(box.textContent).toMatch(/left out of your statements until you confirm/)
    expect(screen.getByTestId('review-now').textContent.trim()).toBe('Review 12 accounts')
    fireEvent.click(screen.getByTestId('review-now'))
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  it('turns green with a way back to Finance once everything is sorted', async () => {
    const { ReviewCallout } = await import('../IntakeBar.jsx')
    render(
      <MemoryRouter>
        <ReviewCallout total={0} done onReview={() => {}} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('review-done').textContent).toContain('All accounts sorted — your statements are ready')
    expect(screen.getByTestId('see-finance').getAttribute('href')).toBe('/finance')
  })

  it('renders nothing when there was nothing to sort', async () => {
    const { ReviewCallout } = await import('../IntakeBar.jsx')
    const { container } = render(<ReviewCallout total={0} done={false} onReview={() => {}} />)
    expect(container.textContent).toBe('')
  })

  it('sits ABOVE "Your files"', () => {
    const bar = read('components/IntakeBar.jsx')
    expect(bar.indexOf('<ReviewCallout')).toBeGreaterThan(-1)
    expect(bar.indexOf('<ReviewCallout')).toBeLessThan(bar.indexOf('Your files'))
  })
})

describe('A4c — the file card', () => {
  it('the small "N to review" chip is now an amber button', () => {
    const card = read('components/FileStatusCard.jsx')
    expect(card).not.toMatch(/to review<\/span>/)
    expect(card).toMatch(/data-testid="review-accounts-button"/)
    expect(card).toMatch(/hue=\{WATCH_HUE\}/)
    expect(card).toMatch(/\{reviewButtonLabel\(reviewCount\)\}/)
    expect(card).toMatch(/<ArrowRight size=\{14\}/)
  })
})

describe('A2 — warnings are real warnings', () => {
  const chatty = [
    "I'm ready to help summarize your school's finances.",
    "I'll need information such as:",
    'Revenue breakdown (tuition %, other sources)',
    'Could you share your enrollment numbers?',
    'Expense categories',
  ].join('\n')

  it('a conversational reply makes ZERO tiles (the designed empty state)', () => {
    expect(warningTiles(toSignals(chatty))).toEqual([])
  })

  it('only RISK / WATCH / STRENGTH lines become tiles, worst first', () => {
    const text = [
      'STRENGTH: Operating surplus of 1.5% keeps reserves growing.',
      'Some untagged remark about the year.',
      'RISK: Tuition dependency at 92% leaves little cushion.',
      'WATCH: Could you confirm the enrollment figure?',
    ].join('\n')
    const tiles = warningTiles(toSignals(text))
    expect(tiles.map((t) => t.verdict)).toEqual(['risk', 'good'])
    expect(realSignals(toSignals(text))).toHaveLength(2)
  })

  it('Home’s toSignals is unchanged (it still returns neutral lines for Home to show)', () => {
    expect(toSignals('Plain line.')).toEqual([{ category: 'neutral', text: 'Plain line.' }])
  })
})

describe('A3 — QuickBooks reports work too', () => {
  it('the upload box and the Trial balance card say so', () => {
    expect(read('components/HeroDropzone.jsx')).toMatch(/Start with this year’s trial balance or QuickBooks reports/)
    expect(read('components/wizard/wizardConfigs.jsx')).toMatch(
      /Your trial balance, or the Profit & Loss and Balance Sheet exported from QuickBooks/,
    )
  })
})

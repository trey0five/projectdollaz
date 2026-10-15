/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// A GUESS IS A PROPOSAL UNTIL SOMEBODY AGREES WITH IT.
//
// Making the engine chart-agnostic left every school one job: saying what each
// of its accounts is. Suggesting that from the account NAME turns thirty-odd
// dropdown decisions into a review — but it also creates the one failure mode
// this whole feature has to be built against: a wrong category does not raise
// an error. It produces a wrong statement that looks exactly like a right one,
// and that statement goes to a board.
//
// So what is pinned here is mostly RESTRAINT. Nothing is written without a
// person pressing something, an unconfirmed guess still counts as unmapped, and
// the account keeps saying it is unreviewed until it genuinely is.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { suggestCategories } from '@finrep/engine'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const picker = read('components/MappingCategorySelect.jsx')
const card = read('components/FileStatusCard.jsx')
// A5: the review is ONE popup — its host does the saving, the pure lib derives
// the rows and their pre-filled suggestions.
const host = read('components/intake/ReviewAccountsHost.jsx')
const popupLib = read('lib/reviewPopup.js')

describe('nothing is applied without a person', () => {
  it('a suggestion only ever PRE-FILLS the select — it never calls onPick', () => {
    // The whole safety property in one line: the suggestion reaches
    // defaultValue and nothing else. If it were ever passed to onPick on
    // render or in an effect, a school's books would be categorised by a
    // regex nobody read.
    expect(picker).toMatch(/defaultValue: suggested \?\? ''/)
    expect(picker).not.toMatch(/useEffect[\s\S]{0,200}onPick/)
  })

  it('applying a suggestion takes a deliberate press', () => {
    expect(picker).toMatch(/onClick=\{\(\) => onPick\(row\.acct, suggested\)\}/)
    expect(picker).toContain('Use this')
  })

  it('the bulk action is also a press, not an upload side-effect', () => {
    // The popup pre-fills every suggestion so thirty dropdowns become one
    // review — but nothing is written until "Approve and build statements" (or
    // "Save and finish later") is pressed: one explicit agreement, not silence.
    expect(host).toMatch(/const onApprove = async \(\) =>/)
    // FILL-ONLY: approving suggestions never re-points an account the
    // school's mapping already places.
    // (The person's own picks are "chosen" — a normal merge, never dropped.)
    expect(host).toMatch(/const ok = await mapAccounts\(entries, \{ onlyNew: true, chosen \}\)/)
    // The save is only ever reached from the two button handlers.
    expect(host).not.toMatch(/useEffect\([\s\S]{0,400}(mapAccounts|save)\(/)
    // Picks made in the popup are a DRAFT (reviewModalStore) until then.
    expect(host).toMatch(/onPick=\{\(acct, category\) => setReviewPick\(acct, category\)\}/)
  })

  it('a REAL trial balance is never categorised on upload — only a statement export with section facts is', () => {
    // A1 is the one, deliberate exception: a QuickBooks statement export SAYS
    // which section each account is printed under (as reliable as the live
    // sync's AccountType), so its clear accounts sort themselves. The gate is
    // the section facts: a trial balance has none, and autoMapEntries returns
    // nothing for it.
    const ctx = read('context/AppContext.jsx')
    expect(ctx).toMatch(/sections = statementSections\(metadata\)/)
    expect(ctx).toMatch(/if \(Object\.keys\(sections\)\.length === 0\) return/)
    // Only accounts the chart (and the server's snapshot) can't place yet.
    expect(ctx).toMatch(/findUnmapped\(rows \|\| \[\], activeChart\)\.filter\(/)
  })

  it('the bulk action sends ONE request, not one per account', () => {
    // Live-caught: firing mapAccount per account sent 33 concurrent PATCHes
    // that read-modify-wrote the same row. Eleven picks survived. The school
    // was left with numbers that were WRONG, which is worse than absent.
    expect(host).not.toMatch(/mapAccount\(/)
    expect(host).toMatch(/save\(entriesFromPicks\(items, picks\)\)/)
    const ctx = read('context/AppContext.jsx')
    expect(ctx).toMatch(/const mapAccounts = useCallback/)
    // At most two requests (suggestions fill-only, then the person's picks),
    // one after the other — see context/mapping-writes.spec.jsx.
    expect(ctx).toMatch(/await mappingApi\.mergeEntries\(school\.id, rest, \{ onlyNew \}\)/)
    expect(ctx).toMatch(/await mappingApi\.mergeEntries\(school\.id, picked\)/)
  })

  it('an account the school already sorted keeps its category after an auto-sort (#1)', () => {
    // Repro from review: FY26's 67000 re-picked to adminCost; next year's
    // export auto-sorted it back to fixedOther via a browser PATCH that
    // overwrote the stored pick and rebuilt every period. Now: the browser's
    // auto-sort only fills THIS tab's preview overlay (gaps only) and never
    // writes the mapping; the save sorts server-side, fill-only.
    const ctx = read('context/AppContext.jsx')
    const start = ctx.indexOf('const autoSortAccounts = useCallback(')
    expect(start).toBeGreaterThan(-1)
    const body = ctx.slice(start, ctx.indexOf('\n  )\n', start))
    expect(body).not.toMatch(/mergeEntries|mapAccounts\(|mapAccount\(/)
    // Locally a pick already in the overlay wins (fill-only).
    expect(body).toMatch(/if \(next\[k\] == null\) next\[k\] = v/)
    // The multi-year uploader no longer PATCHes before its save.
    expect(read('components/BulkYearsUploader.jsx')).not.toMatch(/mergeEntries|mappingApi/)
    // The one browser path that does write suggestions sends fill-only.
    const api = read('lib/api.js')
    expect(api).toMatch(/mergeEntries: \(schoolId, entries, \{ onlyNew = false \} = \{\}\) =>/)
    expect(api).toMatch(/onlyNew \? \{ entries, onlyNew: true \} : \{ entries \}/)
  })

  it('fill-only reaches the wire: { entries, onlyNew: true }', async () => {
    const { api, mappingApi } = await import('../lib/api.js')
    const calls = []
    const orig = api.patch
    api.patch = async (url, body) => {
      calls.push({ url, body })
      return { data: {} }
    }
    try {
      await mappingApi.mergeEntries('s1', { 67000: 'fixedOther' }, { onlyNew: true })
      await mappingApi.mergeEntries('s1', { 4823: 'other' })
    } finally {
      api.patch = orig
    }
    expect(calls[0]).toEqual({ url: '/schools/s1/mapping', body: { entries: { 67000: 'fixedOther' }, onlyNew: true } })
    // A person's own single pick stays a plain merge (their choice wins).
    expect(calls[1].body).toEqual({ entries: { 4823: 'other' } })
  })

  it('the guess is labelled as a guess, in words', () => {
    expect(picker).toMatch(/looks like \{suggestion\.reason\}/)
  })
})

describe('an unconfirmed guess is still unmapped', () => {
  it('the review list comes from findUnmapped, never from the suggestions', () => {
    // If the list were derived from "accounts without a suggestion", a guessed
    // account would disappear from review while contributing nothing to any
    // statement — the exact silent hole this feature is meant to close.
    expect(card).toMatch(/findUnmapped\(file\.rows \|\| \[\], activeChart\)/)
    expect(read('lib/reviewQueue.js')).toMatch(/const rows = findUnmapped\(file\.rows \|\| \[\], chart\)/)
    // Suggestions are DERIVED from the unmapped rows (section-backed for a
    // statement export, name-based for a trial balance) — never the reverse.
    expect(popupLib).toMatch(/const rows = reviewRowsOf\(f, chart, serverMapped\)/)
    expect(popupLib).toMatch(/reviewSuggestions\(rows, sections, suggestCategories\(rows\)\)/)
  })

  it('the review COUNT counts unmapped accounts, not unsuggested ones', () => {
    expect(card).toMatch(/const reviewCount = unmapped\.length/)
  })
})

describe('the picker can name every kind of account', () => {
  it('offers assets, liabilities and net assets — not just revenue and expense', () => {
    // These carry includedInTotals:false, so the picker's PICKABLE filter had
    // excluded every one. Before the balance sheet became mapping-driven that
    // was harmless; after it, a school reviewing its cash account had no
    // correct answer available in the dropdown.
    for (const group of ['Assets', 'Liabilities', 'Net assets']) {
      expect(picker, `no ${group} optgroup`).toContain(`label="${group}"`)
    }
    expect(picker).toMatch(/const ASSET_OPTS = bsGroup\('asset'\)/)
  })

  it('every offered category has a human label, not a camelCase key', () => {
    for (const key of ['cash', 'tuitionRec', 'apAccrued', 'naWithDonor', 'deprExpense']) {
      expect(picker, `no label for ${key}`).toMatch(new RegExp(`\\b${key}: '`))
    }
  })
})

describe('the suggestions actually cover a real trial balance', () => {
  it('the four-digit file that reproduced the bug is fully suggested', () => {
    // A behavioural check on top of the source pins: the engine's rules and
    // this UI have to agree that there is something to offer.
    const rows = [
      { acct: 1010, desc: 'Cash - Operating Checking', total: 508_400 },
      { acct: 2010, desc: 'Accounts Payable', total: -104_100 },
      { acct: 4010, desc: 'Tuition & Fees Income', total: -4_562_000 },
      { acct: 5010, desc: 'Salaries - Instructional', total: 2_010_000 },
      { acct: 6600, desc: 'Depreciation Expense', total: 240_000 },
    ]
    const s = suggestCategories(rows)
    expect(Object.keys(s)).toHaveLength(rows.length)
    expect(s[1010].category).toBe('cash')
    expect(s[2010].category).toBe('apAccrued')
  })

  it('an account nobody could name gets no suggestion, and no pressure', () => {
    expect(suggestCategories([{ acct: 4823, desc: 'Miscellaneous', total: 100 }])).toEqual({})
  })
})

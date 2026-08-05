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
    // "Use all N" exists because thirty dropdowns is why people abandon this
    // screen — but it is still one explicit agreement, not silence.
    expect(card).toMatch(/Use all \{suggestedCount\} suggestions/)
    expect(card).toMatch(/mapAccounts\(entries\)/)
  })

  it('the bulk action sends ONE request, not one per account', () => {
    // Live-caught: firing mapAccount per account sent 33 concurrent PATCHes
    // that read-modify-wrote the same row. Eleven picks survived. The school
    // was left with numbers that were WRONG, which is worse than absent.
    expect(card).not.toMatch(/for \(const r of unmapped\)[\s\S]{0,200}mapAccount\(r\.acct/)
    const ctx = read('context/AppContext.jsx')
    expect(ctx).toMatch(/const mapAccounts = useCallback/)
    expect(ctx).toMatch(/await mappingApi\.mergeEntries\(school\.id, entries\)/)
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
    expect(card).toMatch(/const suggestions = useMemo\(\(\) => suggestCategories\(unmapped\)/)
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

// ─────────────────────────────────────────────────────────────────────────────
// A1 — a QuickBooks statement export's accounts sort themselves.
//
// The owner's live repro (2026-10-15): Holy Family Academy's two-sheet
// "Financial Statements" workbook imported 34 accounts, and the Finance page
// said "We can't read these accounts yet": the default chart only knows
// 3-digit accounts, and the name-only guesses needed a person for every row —
// and filed the Income-section "Contributions without/with Donor Restrictions"
// as balance-sheet net assets. The section QuickBooks printed each account
// under fixes its class; the name only refines inside it.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { ingest } from '@finrep/ingestion'
import { DEFAULT_CHART, SCOA_CATEGORIES, findUnmapped, calcSOA, calcSFP } from '@finrep/engine'
import {
  autoMapEntries,
  autoMapForFiles,
  reviewSuggestions,
  sectionsOfMetadata,
  sectionSuggestions,
  suggestInSection,
} from './sectionSuggest.js'
import { holyFamilyStatements, holyFamilyPL } from './__fixtures__/holyFamily.js'

const hf = () => ingest('Holy Family Academy Financial Statements 6-30-26.xlsx', holyFamilyStatements())

const chartWith = (entries) => ({
  ...DEFAULT_CHART,
  mapping: { ...DEFAULT_CHART.mapping, entries: { ...DEFAULT_CHART.mapping.entries, ...entries } },
})

describe('A1 — the Holy Family workbook sorts itself by section', () => {
  const { rows, metadata } = hf()
  const sections = sectionsOfMetadata(metadata)
  const unmapped = findUnmapped(rows, DEFAULT_CHART)
  const { entries, review } = autoMapEntries(unmapped, sections)

  it('reads as the full statement pair, with a section for every account', () => {
    expect(metadata.statement.partial).toBe('full')
    expect(rows).toHaveLength(34)
    expect(Object.keys(sections)).toHaveLength(34)
    // The fresh school's default chart places none of the 5-digit accounts.
    expect(unmapped).toHaveLength(34)
  })

  it('maps the Income-section contributions to REVENUE, never to balance-sheet net assets', () => {
    for (const acct of ['41000', '41100']) {
      expect(SCOA_CATEGORIES[entries[acct]].section).toBe('revenue')
      expect(entries[acct]).not.toMatch(/^na/)
    }
  })

  it('maps 44000 Investment Income to an investment/other revenue category', () => {
    expect(['investments', 'interest', 'other']).toContain(entries['44000'])
    expect(SCOA_CATEGORIES[entries['44000']].section).toBe('revenue')
  })

  it('maps 67000 Diocesan Assessment to an expense and 10300 Payroll Account to cash', () => {
    expect(SCOA_CATEGORIES[entries['67000']].section).toBe('expense')
    expect(entries['10300']).toBe('cash')
  })

  it('every category written is a real SCoA category of the account’s own section', () => {
    const want = { pl: ['revenue', 'expense'], bs: ['asset', 'liability', 'netAssets'] }
    for (const [acct, cat] of Object.entries(entries)) {
      expect(SCOA_CATEGORIES[cat], `${acct} → ${cat}`).toBeTruthy()
      expect(want[sections[acct].statement]).toContain(SCOA_CATEGORIES[cat].section)
    }
  })

  it('leaves nothing to review for this clean export', () => {
    expect(review).toBe(0)
    expect(Object.keys(entries)).toHaveLength(34)
  })

  it('with that mapping the statements show the report’s own totals', () => {
    const chart = chartWith(entries)
    expect(findUnmapped(rows, chart)).toHaveLength(0)
    const soa = calcSOA(rows, chart)
    expect(soa.totalRev).toBeCloseTo(4_172_000, 2)
    expect(soa.totalExp).toBeCloseTo(4_109_300, 2)
    expect(soa.netChange).toBeCloseTo(62_700, 2)
    const sfp = calcSFP(rows, 3_483_000 + 380_000 + 62_700, chart)
    expect(sfp.totalAssets).toBeCloseTo(5_193_000, 2)
  })
})

describe('A1 — a real trial balance keeps confirm-first review', () => {
  const tb = [
    { acct: 4010, desc: 'Contributions without Donor Restrictions', total: -245_000 },
    { acct: 1010, desc: 'Operating Checking', total: 612_400 },
  ]

  it('writes nothing on upload when the file has no section facts', () => {
    expect(autoMapEntries(tb, {})).toEqual({ entries: {}, review: 2 })
    expect(autoMapForFiles([{ rows: tb, metadata: { sheet: 'TB' } }])).toEqual({})
  })

  it('still offers the name-based guess in review (pre-fill only)', () => {
    const named = { 1010: { category: 'cash', confidence: 'high', reason: 'cash' } }
    expect(reviewSuggestions(tb, {}, named)[1010].category).toBe('cash')
  })
})

describe('A1 — a suggestion never contradicts its section', () => {
  it('an Income-section row never gets a balance-sheet name guess', () => {
    const rows = [{ acct: 41000, desc: 'Contributions without Donor Restrictions', total: -245_000 }]
    const sections = { 41000: { statement: 'pl', section: 'income', basis: 'section' } }
    // The name-only guess says net assets; the section says income — section wins.
    const nameGuess = { 41000: { category: 'naWithoutDonor', confidence: 'high', reason: 'net assets' } }
    const s = reviewSuggestions(rows, sections, nameGuess)[41000]
    expect(SCOA_CATEGORIES[s.category].section).toBe('revenue')
  })

  it('a known class with an unclear name is pre-filled but NOT applied', () => {
    const rows = [{ acct: 69900, desc: 'Miscellaneous', total: 1_200 }]
    const sections = { 69900: { statement: 'pl', section: 'expenses', basis: 'section' } }
    const s = sectionSuggestions(rows, sections)[69900]
    expect(SCOA_CATEGORIES[s.category].section).toBe('expense')
    expect(s.sure).toBe(false)
    expect(autoMapEntries(rows, sections)).toEqual({ entries: {}, review: 1 })
  })

  it('no fact → no section suggestion', () => {
    expect(suggestInSection({ acct: 1, desc: 'x', total: 1, fact: null })).toBeNull()
  })
})

describe('A1 — the bulk uploader merges every statement file into ONE mapping', () => {
  it('collects the sure entries across files (and skips trial balances)', () => {
    const pl = ingest('Holy Family Academy Profit and Loss 6-30-26.xlsx', holyFamilyPL())
    const entries = autoMapForFiles([pl, { rows: [{ acct: 4010, desc: 'Tuition', total: -5 }], metadata: {} }])
    expect(entries['40100']).toBe('tuition')
    expect(entries['4010']).toBeUndefined()
  })
})

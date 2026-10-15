// ─────────────────────────────────────────────────────────────────────────────
// sectionSuggest — sort a QuickBooks STATEMENT export's accounts by the section
// QuickBooks printed them under (A1). The web's glue over the ENGINE's one
// section-aware suggester (@finrep/engine suggestCategoryInSection) — the
// policy itself lives there, once, and is covered by the engine's tests.
//
// A Profit and Loss / Balance Sheet export knows where every account belongs:
// "Income", "Expenses", "Bank Accounts", "Fixed Assets", "Other Current
// Liabilities", "Equity" … — the same AccountType the live QuickBooks sync
// files by. The ingestion package records it per account
// (metadata.statement.sections, read through statementSections).
//
// THE SECTION FIXES THE CLASS; THE NAME ONLY REFINES INSIDE IT. "41000
// Contributions without Donor Restrictions" printed under Income is revenue —
// never the balance-sheet net assets a name-only guess would file it as.
//
//   sure  → applied automatically on upload, like the live sync does;
//   !sure → the class is known but the exact category is not: left "to
//           review", pre-filled with this suggestion.
//
// A real trial balance has no section facts at all and keeps today's
// confirm-first review. PURE: no I/O, no React.
// ─────────────────────────────────────────────────────────────────────────────
import {
  SCOA_CATEGORIES,
  findUnmapped,
  DEFAULT_CHART,
  suggestCategoryInSection,
  classOfSection,
} from '@finrep/engine'
import { statementSections } from '@finrep/ingestion'

const SECTION_LABELS = {
  income: 'Income',
  otherIncome: 'Other Income',
  expenses: 'Expenses',
  otherExpense: 'Other Expense',
  costOfGoodsSold: 'Cost of Goods Sold',
  bank: 'Bank Accounts',
  accountsReceivable: 'Accounts Receivable',
  otherCurrentAssets: 'Other Current Assets',
  currentAssets: 'Current Assets',
  fixedAssets: 'Fixed Assets',
  otherAssets: 'Other Assets',
  assets: 'Assets',
  accountsPayable: 'Accounts Payable',
  creditCards: 'Credit Cards',
  otherCurrentLiabilities: 'Other Current Liabilities',
  currentLiabilities: 'Current Liabilities',
  longTermLiabilities: 'Long Term Liabilities',
  liabilities: 'Liabilities',
  equity: 'Equity',
}

/** "Bank Accounts" — the QuickBooks heading, in words. */
export function sectionLabel(key) {
  return SECTION_LABELS[key] ?? 'its section'
}

// The SCoA statement section each engine account class belongs to.
const CLASS_STATEMENT_SECTION = {
  revenue: 'revenue',
  expense: 'expense',
  cash: 'asset',
  receivable: 'asset',
  otherCurrentAsset: 'asset',
  currentAsset: 'asset',
  fixedAsset: 'asset',
  otherAsset: 'asset',
  asset: 'asset',
  payable: 'liability',
  otherCurrentLiability: 'liability',
  currentLiability: 'liability',
  longTermDebt: 'liability',
  liability: 'liability',
  netAssets: 'netAssets',
}

/** The SCoA statement section ('revenue'|'expense'|'asset'|'liability'|'netAssets') a fact fixes, or null. */
export function statementSectionOfFact(fact) {
  const cls = classOfFact(fact)
  return cls ? CLASS_STATEMENT_SECTION[cls] ?? null : null
}

/** Is `category` a real SCoA category of the class's statement section? */
export function categoryFitsClass(category, cls) {
  const def = SCOA_CATEGORIES[category]
  return !!def && def.section === CLASS_STATEMENT_SECTION[cls]
}

/**
 * The SCoA statement section an account NUMBER implies (the US chart-of-
 * accounts convention the engine's default chart and the statement adapter's
 * sectionFromAcct both follow): leading 1 asset, 2 liability, 3 net assets,
 * 4 revenue, 5–9 expense. Null for numbers under 3 digits (too short to say).
 */
export function acctImpliedSection(acct) {
  const n = Number(acct)
  if (!Number.isFinite(n) || n <= 0) return null
  const digits = String(Math.trunc(n))
  if (digits.length < 3) return null
  switch (digits[0]) {
    case '1':
      return 'asset'
    case '2':
      return 'liability'
    case '3':
      return 'netAssets'
    case '4':
      return 'revenue'
    default:
      return 'expense'
  }
}

/** The class a section fact fixes, or null (unknown key / no fact). */
export function classOfFact(fact) {
  if (!fact || typeof fact !== 'object') return null
  return classOfSection(fact.section) ?? null
}

/**
 * One account's section-backed suggestion, or null when there is no section
 * fact. Never returns a category outside the fact's class (the engine checks).
 * → { category, confidence: 'high'|'medium', sure, reason, cls, sectionBacked }
 */
export function suggestInSection({ acct, desc, total, fact }) {
  if (!classOfFact(fact)) return null
  const s = suggestCategoryInSection({ acct, desc, total, section: fact.section, basis: fact.basis })
  if (!s || !categoryFitsClass(s.category, s.accountClass)) return null
  return {
    category: s.category,
    confidence: s.sure ? 'high' : 'medium',
    sure: !!s.sure,
    reason: `${s.reason} (under ${sectionLabel(fact.section)})`,
    cls: s.accountClass,
    sectionBacked: true,
  }
}

const factOf = (sections, acct) => (sections ? sections[acct] ?? sections[String(acct)] ?? null : null)

/**
 * Suggestions for every row that has a section fact, keyed by account.
 * `sections` = { [acct]: { statement, section, basis } } (statementSections()).
 * Rows with no balance are skipped, as findUnmapped skips them.
 */
export function sectionSuggestions(rows, sections) {
  const out = {}
  if (!sections || typeof sections !== 'object') return out
  for (const r of rows || []) {
    if (!r || out[r.acct] || r.total === 0) continue
    const fact = factOf(sections, r.acct)
    if (!fact) continue
    const s = suggestInSection({ acct: r.acct, desc: r.desc, total: r.total, fact })
    if (s) out[r.acct] = s
  }
  return out
}

/**
 * What to write on upload: { entries: { [String(acct)]: category }, review: n }.
 * Only SURE section-backed suggestions for rows still unmapped (`unmapped` =
 * findUnmapped against the live chart) are applied; the rest stay to review.
 * Nothing at all for a file with no section facts (a real TB).
 */
export function autoMapEntries(unmapped, sections) {
  const suggestions = sectionSuggestions(unmapped, sections)
  const entries = {}
  let review = 0
  for (const r of unmapped || []) {
    const s = suggestions[r.acct]
    if (s?.sure) entries[String(r.acct)] = s.category
    else review += 1
  }
  return { entries, review }
}

/**
 * The suggestions the review pre-fills. An account with a section fact gets
 * ONLY its section-backed suggestion (or none) — a name-only guess that could
 * contradict the section is never offered. An account with no fact (a real
 * trial balance) gets the name-based guess, exactly as before.
 * `nameSuggestions` = suggestCategories(rows) (engine), passed in.
 */
export function reviewSuggestions(rows, sections, nameSuggestions = {}) {
  const fromSection = sectionSuggestions(rows, sections)
  const out = {}
  for (const r of rows || []) {
    if (!r) continue
    const fact = factOf(sections, r.acct)
    if (fact && classOfFact(fact)) {
      if (fromSection[r.acct]) out[r.acct] = fromSection[r.acct]
      continue
    }
    if (nameSuggestions?.[r.acct]) out[r.acct] = nameSuggestions[r.acct]
  }
  return out
}

/** A file's validated section facts ({} for a real trial balance). */
export function sectionsOfMetadata(metadata) {
  try {
    return statementSections(metadata)
  } catch {
    return {}
  }
}

/**
 * The automatic entries for several parsed files at once (the bulk "Add
 * years" save): every statement export's clear, section-backed accounts that
 * the chart can't place yet. One merged map → ONE PATCH /mapping. Files with
 * no section facts contribute nothing.
 */
export function autoMapForFiles(files, chart = DEFAULT_CHART) {
  const entries = {}
  for (const f of files || []) {
    const sections = sectionsOfMetadata(f?.metadata)
    if (Object.keys(sections).length === 0) continue
    const unmapped = findUnmapped(f.rows || [], chart).filter((r) => entries[String(r.acct)] == null)
    Object.assign(entries, autoMapEntries(unmapped, sections).entries)
  }
  return entries
}

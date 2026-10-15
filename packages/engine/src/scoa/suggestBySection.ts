// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS THIS ACCOUNT, GIVEN WHERE THE REPORT PRINTED IT?
//
// suggest.ts guesses from an account's NAME alone, so every guess waits for a
// person to confirm it. A QuickBooks statement export knows more: it prints
// each account under its SECTION — Income, Expenses, Bank Accounts, Fixed
// Assets, Other Current Liabilities, Equity … — which is the same AccountType
// the live QuickBooks sync trusts to map accounts with no one asking.
//
// So here the SECTION FIXES THE CLASS (revenue / expense / cash / receivable /
// other current asset / fixed asset / AP & accrued / deferred revenue /
// long-term debt / net assets …) and the name only REFINES WITHIN that class.
// A suggestion can never contradict its section: "Contributions without Donor
// Restrictions" printed under Income is income — never balance-sheet net
// assets, which is what its name alone would say.
//
// Each suggestion says whether it is `sure`:
//   • sure  — the section fixes the class AND a name rule (or a class with only
//             one possible category, like Bank Accounts → cash) settles the
//             exact category. Safe to apply without asking.
//   • !sure — the class is known but the exact category is not (an expense
//             named "Miscellaneous"): pre-filled as a suggestion, a person
//             confirms it.
//
// PURE, table-driven, no I/O — covered by the engine purity test.
// ─────────────────────────────────────────────────────────────────────────────
import { SCOA_CATEGORIES, type SCoaCategory, type Section } from './categories.js'
import type { CategorySuggestion, SuggestInput } from './suggest.js'

/** The normalised report sections @finrep/ingestion records (metadata.statement.sections). */
export type StatementSectionKey =
  | 'income'
  | 'otherIncome'
  | 'expenses'
  | 'otherExpense'
  | 'costOfGoodsSold'
  | 'bank'
  | 'accountsReceivable'
  | 'otherCurrentAssets'
  | 'currentAssets'
  | 'fixedAssets'
  | 'otherAssets'
  | 'assets'
  | 'accountsPayable'
  | 'creditCards'
  | 'otherCurrentLiabilities'
  | 'currentLiabilities'
  | 'longTermLiabilities'
  | 'liabilities'
  | 'equity'

/** One account's section fact, as recorded at metadata.statement.sections[acct]. */
export interface StatementSectionFact {
  statement: 'pl' | 'bs'
  section: StatementSectionKey | string
  /** 'section' = printed under the heading; 'number' = a flat report, by the number's block; 'position' = placed by its neighbours. */
  basis?: 'section' | 'number' | 'position'
}

/** The class a section fixes. */
export type AccountClass =
  | 'revenue'
  | 'expense'
  | 'cash'
  | 'receivable'
  | 'otherCurrentAsset'
  | 'currentAsset'
  | 'fixedAsset'
  | 'otherAsset'
  | 'asset'
  | 'payable'
  | 'otherCurrentLiability'
  | 'currentLiability'
  | 'longTermDebt'
  | 'liability'
  | 'netAssets'

export interface SectionSuggestion extends CategorySuggestion {
  /** The class the report section fixed. */
  accountClass: AccountClass
  /** true = safe to apply without asking; false = class known, exact category unclear — a person confirms. */
  sure: boolean
}

export interface SectionSuggestInput extends SuggestInput {
  section: StatementSectionKey | string
  basis?: StatementSectionFact['basis']
}

const SECTION_CLASS: Record<StatementSectionKey, AccountClass> = {
  income: 'revenue',
  otherIncome: 'revenue',
  expenses: 'expense',
  otherExpense: 'expense',
  costOfGoodsSold: 'expense',
  bank: 'cash',
  accountsReceivable: 'receivable',
  otherCurrentAssets: 'otherCurrentAsset',
  currentAssets: 'currentAsset',
  fixedAssets: 'fixedAsset',
  otherAssets: 'otherAsset',
  assets: 'asset',
  accountsPayable: 'payable',
  creditCards: 'payable',
  otherCurrentLiabilities: 'otherCurrentLiability',
  currentLiabilities: 'currentLiability',
  longTermLiabilities: 'longTermDebt',
  liabilities: 'liability',
  equity: 'netAssets',
}

/** The SCoA statement section every category of a class must belong to. */
const CLASS_SECTION: Record<AccountClass, Section> = {
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

/** The class a section key fixes, or null for an unknown key. */
export function classOfSection(section: string | null | undefined): AccountClass | null {
  if (!section || !Object.prototype.hasOwnProperty.call(SECTION_CLASS, section)) return null
  return SECTION_CLASS[section as StatementSectionKey]
}

type Side = 'debit' | 'credit'

interface Rule {
  match: RegExp
  category: SCoaCategory
  reason: string
  /** Only on this side of the ledger. */
  side?: Side
  unless?: RegExp
  /** A best pre-fill, never safe to apply unasked (a bare "Salaries"): the person confirms. */
  tentative?: boolean
}

interface ClassRules {
  rules: Rule[]
  /** Used when no rule matches. */
  fallback: { category: SCoaCategory; reason: string } | null
  /** The fallback is the ONLY sensible category (a one-category class) → sure. */
  fallbackSure: boolean
}

// ── Revenue: tuition first (aid / discounts are contra-tuition), then the
//    specific support kinds, then the catch-all "other revenue". ──
const REVENUE: ClassRules = {
  rules: [
    { match: /international|\bintl\b/, category: 'intlRev', reason: 'international program income' },
    { match: /financial\s+aid|scholarship|tuition|remission|discount|student\s+fees?|registration|enrol?lment\s+fee|application\s+fee|re-?enrol?lment|\bfees?\b/, category: 'tuition', reason: 'tuition & fees (net of aid)' },
    { match: /investment|endowment|unrealized|realized|securities|gain\s+on|loss\s+on/, category: 'investments', reason: 'investment income' },
    { match: /interest|dividend/, category: 'interest', reason: 'interest & dividends' },
    { match: /contribut|donat|\bgifts?\b|annual\s+fund|fundrais|development|advancement|campaign|gala|auction|\bevents?\b|appeal|bequest/, category: 'development', reason: 'contributions & fundraising' },
    { match: /grant|subsid|sponsor|parish|diocesan|diocese|support/, category: 'support', reason: 'sponsor support & grants' },
    { match: /\bbooks?\b|textbook|bookstore/, category: 'textbook', reason: 'book income' },
    { match: /athletic|sports?\b|student\s+activit|\bclubs?\b/, category: 'studActRev', reason: 'student activity income' },
    { match: /auxiliary|after[-\s]?care|after[-\s]?school|extended\s+day|before\s+care|summer|camp|lunch|food|cafeteria|uniform|transportation|\bbus\b|rental|\brent\b|misc|other/, category: 'other', reason: 'auxiliary & other income' },
  ],
  fallback: { category: 'other', reason: 'income — exact kind unclear' },
  fallbackSure: false,
}

const SALARY = /salar|wages|payroll(?!\s+tax)|compensation|stipend/
const EXPENSE: ClassRules = {
  rules: [
    { match: /depreciation|amortization/, category: 'deprExpense', reason: 'depreciation' },
    { match: /international|\bintl\b/, category: 'intlExp', reason: 'international program costs' },
    { match: /(faculty|teach|instruct)/, category: 'instrSal', reason: 'teaching salaries', unless: /supplies|material|curricul|development|training|book/ },
    { match: /(facilit|maintenance|custod|janitor|grounds)/, category: 'facilSal', reason: 'facilities salaries' },
    { match: /(admin|office|staff|support)/, category: 'adminSal', reason: 'administrative salaries' },
    { match: /payroll\s+tax|benefit|pension|retirement|\b403|fica|health\s+insurance|workers.?\s*comp|unemployment/, category: 'fixedOther', reason: 'employee benefits & payroll taxes' },
    { match: /interest|insurance|assessment|diocesan|diocese|cathedraticum|\btax(es)?\b|licen[cs]e|\bdebt\b|loan|mortgage/, category: 'fixedOther', reason: 'fixed charges' },
    { match: /instruction|curricul|classroom|teaching|textbook|\bbooks?\b|library|technology|software|computer|professional\s+development|testing|field\s+trip|educational/, category: 'instrSup', reason: 'instructional costs' },
    { match: /facilit|maintenance|repair|janitor|custod|utilit|electric|\bwater\b|\bgas\b|grounds|cleaning|security|\brent\b|occupancy|building/, category: 'facilCost', reason: 'running the buildings' },
    { match: /food|cafeteria|lunch|dining|kitchen/, category: 'food', reason: 'food service' },
    { match: /transport|\bbus(es|ing)?\b|vehicle/, category: 'bus', reason: 'transport' },
    { match: /athletic|sports?\b/, category: 'athletics', reason: 'athletics' },
    { match: /professional|legal|audit|accounting|consult|bank\s+(service\s+)?(fee|charge)|merchant|office|postage|printing|marketing|advertis|admission|recruit|dues|subscription|travel|telephone|phone|internet|admin/, category: 'adminCost', reason: 'administrative & office costs' },

    // Bare names: a better pre-fill than the catch-all, but a person checks them.
    { match: SALARY, category: 'instrSal', reason: 'salaries — teaching is the usual home; check it', tentative: true },
    { match: /suppl|material/, category: 'instrSup', reason: 'supplies — instructional is the usual home; check it', tentative: true },
  ],
  fallback: { category: 'fixedOther', reason: 'expense — exact kind unclear' },
  fallbackSure: false,
}
// The three salary rules above only apply to salary-named rows (see pickRule).
const SALARY_RULES = new Set<SCoaCategory>(['instrSal', 'facilSal', 'adminSal'])

const CURRENT_ASSET_RULES: Rule[] = [
  { match: /restricted|escrow/, category: 'restrictedCash', reason: 'restricted cash', unless: /receivable|pledge|prepaid/ },
  { match: /prepaid|prepayment|deposits?\s+paid|\bdeposits?\b/, category: 'prepaid', reason: 'prepaid expense' },
  { match: /receivable|pledges?|due\s+from|\bar\b|tuition/, category: 'tuitionRec', reason: 'amounts owed to the school' },
  { match: /\bcash\b|checking|savings|money\s*market|petty|undeposited|operating\s+account|payroll\s+account|\bbank\b/, category: 'cash', reason: 'cash' },
]

const CLASS_RULES: Record<AccountClass, ClassRules> = {
  revenue: REVENUE,
  expense: EXPENSE,
  cash: {
    rules: [{ match: /restricted|escrow|endowment/, category: 'restrictedCash', reason: 'restricted cash' }],
    fallback: { category: 'cash', reason: 'a bank account' },
    fallbackSure: true,
  },
  receivable: { rules: [], fallback: { category: 'tuitionRec', reason: 'accounts receivable' }, fallbackSure: true },
  otherCurrentAsset: {
    rules: CURRENT_ASSET_RULES,
    // The live sync's "Other Current Asset" → account 120 → receivables.
    fallback: { category: 'tuitionRec', reason: 'other current asset — exact kind unclear' },
    fallbackSure: false,
  },
  currentAsset: {
    rules: CURRENT_ASSET_RULES,
    fallback: { category: 'tuitionRec', reason: 'current asset — exact kind unclear' },
    fallbackSure: false,
  },
  fixedAsset: {
    rules: [
      { match: /accumulated|depreciation|amortization/, category: 'accumDepr', reason: 'accumulated depreciation' },
      { match: /right[-\s]?of[-\s]?use|\brou\b/, category: 'rouAsset', reason: 'right-of-use asset' },
    ],
    fallback: { category: 'ppGross', reason: 'property & equipment' },
    fallbackSure: true,
  },
  otherAsset: {
    rules: [
      { match: /accumulated|depreciation|amortization/, category: 'accumDepr', reason: 'accumulated depreciation' },
      { match: /right[-\s]?of[-\s]?use|\brou\b/, category: 'rouAsset', reason: 'right-of-use asset' },
      { match: /investment|endowment|securities|restricted|beneficial\s+interest/, category: 'restrictInvst', reason: 'long-term investments' },
      { match: /prepaid|deposit/, category: 'prepaid', reason: 'deposits & prepaid' },
      { match: /land|building|improvement|furniture|equipment|vehicle|leasehold|construction|property/, category: 'ppGross', reason: 'property & equipment' },
    ],
    // The live sync's "Other Asset" → account 140 → property & equipment.
    fallback: { category: 'ppGross', reason: 'other asset — exact kind unclear' },
    fallbackSure: false,
  },
  asset: {
    rules: [
      { match: /accumulated|depreciation|amortization/, category: 'accumDepr', reason: 'accumulated depreciation' },
      ...CURRENT_ASSET_RULES,
      { match: /right[-\s]?of[-\s]?use|\brou\b/, category: 'rouAsset', reason: 'right-of-use asset' },
      { match: /investment|endowment|securities/, category: 'restrictInvst', reason: 'investments' },
      { match: /land|building|improvement|furniture|equipment|vehicle|leasehold|construction|property|fixed\s+asset/, category: 'ppGross', reason: 'property & equipment' },
    ],
    fallback: null,
    fallbackSure: false,
  },
  payable: { rules: [], fallback: { category: 'apAccrued', reason: 'accounts payable' }, fallbackSure: true },
  otherCurrentLiability: {
    rules: [
      { match: /deferred|unearned|prepaid\s+tuition|advance|received\s+in\s+advance|tuition/, category: 'deferredIntl', reason: 'money received before it is earned' },
      { match: /student\s+(club|activit)|\bclubs?\b|agency|custodial\s+funds|held\s+for\s+others/, category: 'studentClubs', reason: 'funds held for students' },
      { match: /lease/, category: 'leaseCurr', reason: 'current lease obligation' },
      { match: /payable|accrued|accrual|payroll|withholding|liabilit|\btax(es)?\b|due\s+to|credit\s+card|wages/, category: 'apAccrued', reason: 'amounts the school owes' },
    ],
    fallback: { category: 'apAccrued', reason: 'current liability — exact kind unclear' },
    fallbackSure: false,
  },
  currentLiability: {
    rules: [
      { match: /deferred|unearned|prepaid\s+tuition|advance|tuition/, category: 'deferredIntl', reason: 'money received before it is earned' },
      { match: /student\s+(club|activit)|\bclubs?\b|agency|custodial\s+funds|held\s+for\s+others/, category: 'studentClubs', reason: 'funds held for students' },
      { match: /lease/, category: 'leaseCurr', reason: 'current lease obligation' },
      { match: /payable|accrued|accrual|payroll|withholding|liabilit|\btax(es)?\b|due\s+to|credit\s+card|wages/, category: 'apAccrued', reason: 'amounts the school owes' },
    ],
    fallback: { category: 'apAccrued', reason: 'current liability — exact kind unclear' },
    fallbackSure: false,
  },
  // The SCoA has one non-current liability line: every long-term liability lands there.
  longTermDebt: { rules: [], fallback: { category: 'leaseNonCurr', reason: 'long-term debt & leases' }, fallbackSure: true },
  liability: {
    rules: [
      { match: /deferred|unearned|prepaid\s+tuition/, category: 'deferredIntl', reason: 'money received before it is earned' },
      { match: /student\s+(club|activit)/, category: 'studentClubs', reason: 'funds held for students' },
      { match: /mortgage|note\s+payable|notes?\b|loan|bond|long[-\s]term|line\s+of\s+credit/, category: 'leaseNonCurr', reason: 'long-term debt' },
      { match: /lease/, category: 'leaseCurr', reason: 'lease obligation' },
      { match: /payable|accrued|accrual|payroll|withholding|due\s+to|credit\s+card/, category: 'apAccrued', reason: 'amounts the school owes' },
    ],
    fallback: null,
    fallbackSure: false,
  },
  netAssets: {
    rules: [
      { match: /without\s+donor|unrestricted|undesignated|board[-\s]designated/, category: 'naWithoutDonor', reason: 'net assets without donor restrictions' },
      { match: /with\s+donor|donor[-\s]restricted|temporarily|permanently|restricted/, category: 'naWithDonor', reason: 'net assets with donor restrictions' },
    ],
    fallback: { category: 'equityOpening', reason: 'opening equity' },
    fallbackSure: true,
  },
}

function normalise(desc: string | null | undefined): string {
  return String(desc ?? '')
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickRule(cls: AccountClass, desc: string, side: Side | null): Rule | null {
  for (const rule of CLASS_RULES[cls].rules) {
    if (rule.side && side && rule.side !== side) continue
    if (cls === 'expense' && SALARY_RULES.has(rule.category) && !SALARY.test(desc)) continue
    if (rule.unless && rule.unless.test(desc)) continue
    if (rule.match.test(desc)) return rule
  }
  return null
}

/** Never offer a category outside the class's statement section (or one that does not exist). */
function fits(cls: AccountClass, category: SCoaCategory): boolean {
  const def = SCOA_CATEGORIES[category]
  return !!def && def.section === CLASS_SECTION[cls]
}

/**
 * The category for one account whose report section is known. null for an
 * unknown section (the caller falls back to the name-only, confirm-first
 * suggestCategory) or for a coarse class whose name says nothing.
 */
export function suggestCategoryInSection(input: SectionSuggestInput): SectionSuggestion | null {
  const cls = classOfSection(input.section)
  if (!cls) return null
  const desc = normalise(input.desc)
  const total = input.total
  const side: Side | null = total == null || total === 0 ? null : total > 0 ? 'debit' : 'credit'
  // A position-only class (a balance-sheet-numbered row inside a flat P&L) is
  // never sure — the person checks it.
  const trusted = input.basis !== 'position'

  const rule = desc ? pickRule(cls, desc, side) : null
  if (rule && fits(cls, rule.category)) {
    if (rule.tentative) return { category: rule.category, confidence: 'medium', reason: rule.reason, accountClass: cls, sure: false }
    return { category: rule.category, confidence: 'high', reason: rule.reason, accountClass: cls, sure: trusted }
  }
  // A fixed asset carrying a CREDIT balance with no telling name is most likely
  // accumulated depreciation — offered, but a person confirms it.
  if (cls === 'fixedAsset' && side === 'credit') {
    return { category: 'accumDepr', confidence: 'medium', reason: 'a credit balance among fixed assets', accountClass: cls, sure: false }
  }
  const rules = CLASS_RULES[cls]
  if (!rules.fallback || !fits(cls, rules.fallback.category)) return null
  return {
    category: rules.fallback.category,
    confidence: rules.fallbackSure ? 'high' : 'medium',
    reason: rules.fallback.reason,
    accountClass: cls,
    sure: rules.fallbackSure && trusted && input.basis !== 'number',
  }
}

/**
 * Section-backed suggestions for a whole file, keyed by account. Only accounts
 * with a section fact appear (a plain trial balance has none, so it keeps the
 * confirm-first, name-only path). Zero-balance rows are included: the class
 * is known whatever the balance, and mapping them now spares next year's file.
 */
export function suggestStatementCategories(
  rows: readonly SuggestInput[],
  sections: Readonly<Record<string | number, StatementSectionFact | null | undefined>> | null | undefined,
): Record<number, SectionSuggestion> {
  const out: Record<number, SectionSuggestion> = {}
  if (!sections) return out
  for (const row of rows) {
    if (out[row.acct]) continue
    const fact = sections[row.acct] ?? sections[String(row.acct)]
    if (!fact || typeof fact !== 'object') continue
    const s = suggestCategoryInSection({ ...row, section: fact.section, basis: fact.basis })
    if (s) out[row.acct] = s
  }
  return out
}

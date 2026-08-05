// ─────────────────────────────────────────────────────────────────────────────
// WHAT DOES THIS ACCOUNT LOOK LIKE IT MEANS?
//
// The engine can now read any chart of accounts — but only once someone tells it
// what each account IS. For a school arriving with its own numbering that is
// thirty-odd decisions before a single statement appears, and every one of them
// is a decision the account's own NAME already answers. "Cash - Operating
// Checking" is cash. Nobody should have to say so from a dropdown.
//
// THESE ARE SUGGESTIONS AND ONLY SUGGESTIONS. Nothing here is written anywhere.
// A suggestion is shown pre-filled, plainly labelled as a guess, and does not
// count as mapped until a person confirms it — because a wrongly categorised
// account does not produce an error, it produces a WRONG STATEMENT that looks
// exactly like a right one. Silence is recoverable; a confident wrong number
// given to a board is not.
//
// PURE, and table-driven so the rules can be read and argued with. No I/O, no
// clock, no randomness — packages/engine's purity test covers this file.
//
// DISAMBIGUATION USES THE BALANCE'S SIGN, NOT THE ACCOUNT NUMBER. "Advancement"
// is fundraising REVENUE on a credit balance and the advancement OFFICE's costs
// on a debit one; number ranges would answer that only for charts numbered like
// the one we are trying to stop assuming. Sign is a fact about the row.
// ─────────────────────────────────────────────────────────────────────────────
import type { SCoaCategory } from './categories.js'

export type SuggestionConfidence = 'high' | 'medium'

export interface CategorySuggestion {
  category: SCoaCategory
  confidence: SuggestionConfidence
  /** The rule that fired, so a reviewer can see WHY this was proposed. */
  reason: string
}

export interface SuggestInput {
  acct: number
  desc?: string | null
  /** The row's balance. Debit positive, credit negative — the sign disambiguates. */
  total?: number
}

/** Which side of the ledger a rule applies to, when that distinguishes it. */
type Side = 'debit' | 'credit'

interface Rule {
  match: RegExp
  category: SCoaCategory
  confidence: SuggestionConfidence
  reason: string
  side?: Side
  /** Skip when any of these also match — for names that contain a stronger word. */
  unless?: RegExp
}

// ORDER MATTERS: the first match wins, so the most specific phrasings come
// first. "Accumulated depreciation" must beat both "depreciation" and
// "equipment"; "restricted cash" must beat "cash".
const RULES: Rule[] = [
  // ── Balance sheet: assets ──
  { match: /accumulated\s+depreciation|less.*depreciation/, category: 'accumDepr', confidence: 'high', reason: 'accumulated depreciation' },
  { match: /restricted.*cash|cash.*restricted|escrow/, category: 'restrictedCash', confidence: 'high', reason: 'restricted cash' },
  { match: /\b(cash|checking|savings|money\s*market|petty\s*cash|undeposited|operating\s+account)\b/, category: 'cash', confidence: 'high', reason: 'a cash account', unless: /restricted|escrow|flow/ },
  { match: /receivable|\bar\b|pledges?\b/, category: 'tuitionRec', confidence: 'high', reason: 'amounts owed to the school' },
  { match: /prepaid|prepayment|deposits?\s+paid/, category: 'prepaid', confidence: 'high', reason: 'prepaid expense' },
  { match: /right[-\s]?of[-\s]?use|\brou\b/, category: 'rouAsset', confidence: 'high', reason: 'right-of-use asset' },
  { match: /\b(land|building|improvements?|furniture|equipment|vehicles?|leasehold|construction\s+in\s+progress|fixed\s+assets?|property)\b/, category: 'ppGross', confidence: 'high', reason: 'property & equipment', side: 'debit' },
  { match: /investment|endowment|securities/, category: 'restrictInvst', confidence: 'medium', reason: 'investments', side: 'debit' },

  // ── Balance sheet: liabilities & net assets (credit balances) ──
  { match: /net\s+assets.*(with\s+donor|donor[-\s]restricted|temporarily|permanently)|with\s+donor\s+restrictions/, category: 'naWithDonor', confidence: 'high', reason: 'donor-restricted net assets' },
  { match: /net\s+assets.*(without\s+donor|unrestricted)|without\s+donor\s+restrictions/, category: 'naWithoutDonor', confidence: 'high', reason: 'unrestricted net assets' },
  { match: /student\s+(club|activit)/, category: 'studentClubs', confidence: 'high', reason: 'student club funds held' },
  { match: /deferred|unearned|prepaid\s+tuition/, category: 'deferredIntl', confidence: 'high', reason: 'money received before it is earned', side: 'credit' },
  { match: /mortgage|note\s+payable|loan|bond|long[-\s]term\s+debt|line\s+of\s+credit/, category: 'leaseNonCurr', confidence: 'medium', reason: 'long-term debt', side: 'credit' },
  { match: /lease/, category: 'leaseCurr', confidence: 'medium', reason: 'lease obligation', side: 'credit' },
  { match: /payable|accrued|accounts\s+payable/, category: 'apAccrued', confidence: 'high', reason: 'amounts the school owes', side: 'credit' },
  { match: /net\s+assets|fund\s+balance|retained\s+earnings|\bequity\b/, category: 'equityOpening', confidence: 'medium', reason: 'opening equity' },

  // ── Revenue (credit balances), plus the one contra that is a debit ──
  { match: /financial\s+aid|scholarship|tuition\s+(discount|remission|assistance)|discount/, category: 'tuition', confidence: 'high', reason: 'aid netted against tuition' },
  { match: /tuition|student\s+fees|registration\s+fee|enrollment\s+fee/, category: 'tuition', confidence: 'high', reason: 'tuition & fees' },
  { match: /annual\s+fund|contribution|donation|\bgifts?\b|fundrais|development|advancement|campaign|grant/, category: 'development', confidence: 'high', reason: 'fundraising income', side: 'credit' },
  { match: /interest|dividend/, category: 'interest', confidence: 'high', reason: 'interest & dividends', side: 'credit' },
  { match: /(book|textbook)/, category: 'textbook', confidence: 'medium', reason: 'book income', side: 'credit' },
  { match: /athletic|sports/, category: 'studActRev', confidence: 'medium', reason: 'student activity income', side: 'credit' },
  { match: /auxiliary|summer\s+program|after[-\s]?school|aftercare|extended\s+day|before\s+care|camp/, category: 'other', confidence: 'medium', reason: 'auxiliary programs', side: 'credit' },

  // ── Expenses (debit balances) ──
  { match: /depreciation|amortization/, category: 'deprExpense', confidence: 'high', reason: 'depreciation', side: 'debit' },
  { match: /salar.*(instruct|teach|faculty)|(instruct|teach|faculty).*salar|teacher\s+(pay|wages)/, category: 'instrSal', confidence: 'high', reason: 'teaching salaries' },
  { match: /salar.*(admin|office|support\s+staff)|(admin|office).*salar/, category: 'adminSal', confidence: 'high', reason: 'administrative salaries' },
  { match: /(benefits?|payroll\s+tax|pension|retirement|fica|health\s+insurance|workers.?\s*comp)/, category: 'adminCost', confidence: 'medium', reason: 'employment costs' },
  { match: /instructional|curriculum|classroom|teaching\s+material|library|technology|software|computer/, category: 'instrSup', confidence: 'high', reason: 'instructional costs', side: 'debit' },
  { match: /(plant|maintenance|janitor|custodial|utilit|electric|\bwater\b|\bgas\b|repairs?|grounds|cleaning|security)/, category: 'facilCost', confidence: 'high', reason: 'running the buildings', side: 'debit' },
  { match: /interest\s+expense/, category: 'fixedOther', confidence: 'high', reason: 'interest expense' },
  { match: /insurance/, category: 'fixedOther', confidence: 'medium', reason: 'insurance', side: 'debit' },
  { match: /(professional\s+fees|legal|audit|accounting|consult|bank\s+(fee|charge))/, category: 'adminCost', confidence: 'high', reason: 'professional & office costs', side: 'debit' },
  { match: /(marketing|advertis|admission|enrollment\s+management|advancement|development)/, category: 'adminCost', confidence: 'medium', reason: 'advancement & marketing costs', side: 'debit' },
  { match: /(food|cafeteria|lunch|dining|kitchen)/, category: 'food', confidence: 'high', reason: 'food service', side: 'debit' },
  { match: /(transport|\bbus\b|vehicle\s+(fuel|operat))/, category: 'bus', confidence: 'high', reason: 'transport', side: 'debit' },
  { match: /athletic|sports/, category: 'athletics', confidence: 'medium', reason: 'athletics', side: 'debit' },
]

function normalise(desc: string | null | undefined): string {
  return String(desc ?? '')
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A best guess at what one account is, from its name. `null` when nothing
 * matches, which is the honest answer far more often than a stretch would be.
 */
export function suggestCategory(input: SuggestInput): CategorySuggestion | null {
  const desc = normalise(input.desc)
  if (!desc) return null
  const total = input.total
  // Unknown sign matches either side rather than none — a rule that needs the
  // sign simply cannot help here, but the sign-free rules still can.
  const side: Side | null = total == null || total === 0 ? null : total > 0 ? 'debit' : 'credit'

  for (const rule of RULES) {
    if (rule.side && side && rule.side !== side) continue
    if (rule.unless && rule.unless.test(desc)) continue
    if (!rule.match.test(desc)) continue
    return { category: rule.category, confidence: rule.confidence, reason: rule.reason }
  }
  return null
}

/**
 * Suggestions for a whole trial balance, keyed by account. Unmatched accounts
 * are absent.
 *
 * Rows with NO BALANCE are skipped, matching what `findUnmapped` flags: a
 * dormant account cannot move a number, so asking someone to classify it is
 * review work that buys nothing.
 */
export function suggestCategories(
  rows: readonly SuggestInput[]
): Record<number, CategorySuggestion> {
  const out: Record<number, CategorySuggestion> = {}
  for (const row of rows) {
    if (out[row.acct]) continue
    if (row.total === 0) continue
    const s = suggestCategory(row)
    if (s) out[row.acct] = s
  }
  return out
}

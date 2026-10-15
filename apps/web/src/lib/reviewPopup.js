// ─────────────────────────────────────────────────────────────────────────────
// reviewPopup — what the "Review N accounts" popup shows and saves (A5). PURE.
//
// The popup is the ONE place a person sorts the accounts KYRO couldn't place.
// It lists every account still waiting (unique across the intake's files),
// GROUPED by where it belongs — Money in / Money out / What we own / What we
// owe / Net assets — from the QuickBooks section when the file printed one,
// else from the suggestion's statement section, else "Not sure yet".
//
// A pre-filled suggestion IS the answer unless the person changes it, so the
// only thing that blocks "Approve and build statements" is a row with no
// category at all. Approve writes every answer in ONE save.
// ─────────────────────────────────────────────────────────────────────────────
import { SCOA_CATEGORIES, suggestCategories } from '@finrep/engine'
import { reviewRowsOf } from './reviewQueue.js'
import {
  reviewSuggestions,
  sectionsOfMetadata,
  statementSectionOfFact,
  acctImpliedSection,
} from './sectionSuggest.js'
import { numberedAcctSet } from './statementNotes.js'

/** The groups, in the order the popup shows them. `side` = the account's normal balance. */
// "Not sure yet" comes FIRST: those are the only rows that need a decision,
// so they must not sit below every pre-filled one.
export const REVIEW_GROUPS = Object.freeze([
  { key: 'unsure', title: 'Not sure yet', hint: 'Pick where each one belongs', section: null, side: null },
  { key: 'in', title: 'Money in', hint: 'Income — tuition, gifts, fees', section: 'revenue', side: 'credit' },
  { key: 'out', title: 'Money out', hint: 'Expenses — salaries, supplies, bills', section: 'expense', side: 'debit' },
  { key: 'own', title: 'What we own', hint: 'Cash, money owed to you, buildings', section: 'asset', side: 'debit' },
  { key: 'owe', title: 'What we owe', hint: 'Bills, payroll owed, loans', section: 'liability', side: 'credit' },
  { key: 'net', title: 'Net assets', hint: 'What the school is worth', section: 'netAssets', side: 'credit' },
])

const GROUP_BY_SECTION = Object.freeze(
  Object.fromEntries(REVIEW_GROUPS.filter((g) => g.section).map((g) => [g.section, g.key])),
)

/** SCoA statement section → group key ('unsure' for anything else). */
export function groupOfSection(section) {
  return GROUP_BY_SECTION[section] ?? 'unsure'
}

/** The SCoA statement section of a category key, or null. */
export function sectionOfCategory(category) {
  return (category && SCOA_CATEGORIES[category]?.section) || null
}

/**
 * The account's name without the number QuickBooks prints in front of it
 * ("40100 Tuition" → "Tuition"), so the popup shows the number once.
 */
export function displayName(acct, desc) {
  const d = String(desc ?? '').trim()
  const a = String(acct ?? '')
  if (a && d.startsWith(a)) {
    const rest = d.slice(a.length).replace(/^[\s.:·–—-]+/, '').trim()
    if (rest) return rest
  }
  return d || `Account ${a}`
}

/**
 * "$3,850,000" / "$1,234.56"; a minus sign when it runs against its group's
 * normal side. A "Not sure yet" row has no normal side, so it says which way
 * the money went instead — "$12,000 in" (a credit) / "$2,179,700 out" (a
 * debit): the one clue a person needs to pick a category.
 */
export function reviewAmount(total, groupKey) {
  const n = Number(total) || 0
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  // Money in / Money out / Not sure yet: say which way the money went — for a
  // suggested row too, so the amount reads the same everywhere in the popup.
  if (groupKey === 'unsure' || groupKey === 'in' || groupKey === 'out') {
    return n < 0 ? `$${s} in` : n > 0 ? `$${s} out` : `$${s}`
  }
  const side = REVIEW_GROUPS.find((g) => g.key === groupKey)?.side ?? null
  const contrary = (side === 'credit' && n > 0) || (side === 'debit' && n < 0)
  return `${contrary ? '−' : ''}$${s}`
}

/**
 * May a NAME-ONLY guess pre-fill this row? Only when it lands in the class the
 * account NUMBER implies (1 own, 2 owe, 3 net assets, 4 in, 5–9 out). "41000
 * Contributions without Donor Restrictions" on a plain trial balance is a
 * credit in the 4s — revenue — and the name rules would file it as balance-
 * sheet net assets; one click on Approve would then move a school's gifts off
 * its income statement. A number too short to imply a class (< 3 digits)
 * leaves the guess as it was.
 */
export function nameGuessFitsNumber(acct, category) {
  const implied = acctImpliedSection(acct)
  if (!implied) return true
  return sectionOfCategory(category) === implied
}

/**
 * A name guess the account NUMBER contradicts, re-filed in the class the
 * number implies when the meaning carries over cleanly → a suggestion, or null.
 * Donor-restriction NET ASSETS by name in the 4s (revenue) are contributions.
 */
const SIBLING = Object.freeze({
  naWithoutDonor: { revenue: 'support' },
  naWithDonor: { revenue: 'support' },
})
export function numberedSibling(acct, category) {
  const implied = acctImpliedSection(acct)
  const to = implied ? SIBLING[category]?.[implied] : null
  if (!to || !SCOA_CATEGORIES[to]) return null
  return { category: to, reason: 'a contribution — the account number files it as income' }
}

/**
 * Every account still waiting for a person, unique across the intake's files
 * (the first file that lists an account wins — this year's before last year's
 * in the intake's order). → [{ acct, desc, name, total, fileId, group,
 * section, fixed, suggestion, hint, numbered }]
 *   section    = the SCoA statement section the QuickBooks heading fixes (or null)
 *   fixed      = true when that heading fixed it (the dropdown offers that section only)
 *   suggestion = pre-filled — it counts as the answer
 *   hint       = a name-only guess that CONTRADICTS the account number: shown
 *                as a hint, never pre-filled (the row needs a person's pick)
 */
export function buildReviewItems(files, chart, serverMapped = null) {
  const seen = new Set()
  const items = []
  for (const f of files || []) {
    const rows = reviewRowsOf(f, chart, serverMapped)
    if (rows.length === 0) continue
    const sections = sectionsOfMetadata(f.metadata)
    const suggestions = reviewSuggestions(rows, sections, suggestCategories(rows))
    const numbered = numberedAcctSet(f)
    for (const r of rows) {
      const k = String(r.acct)
      if (seen.has(k)) continue
      seen.add(k)
      const fact = sections[r.acct] ?? null
      const fixedSection = statementSectionOfFact(fact)
      let suggestion = suggestions[r.acct] ?? null
      let hint = null
      if (!fixedSection && suggestion && !nameGuessFitsNumber(r.acct, suggestion.category)) {
        hint = suggestion
        // The name was right about WHAT it is, the number about WHERE it goes:
        // "41000 Contributions without Donor Restrictions" is a gift, filed as
        // income. Offer the category that keeps both true; else ask.
        suggestion = numberedSibling(r.acct, hint.category)
      }
      const section = fixedSection ?? sectionOfCategory(suggestion?.category)
      items.push({
        acct: r.acct,
        desc: r.desc,
        name: displayName(r.acct, r.desc),
        total: r.total,
        fileId: f.id,
        group: groupOfSection(section),
        section: section ?? null,
        fixed: !!fixedSection,
        suggestion,
        hint,
        numbered: numbered.has(Number(r.acct)),
      })
    }
  }
  return items
}

/** Items bucketed in REVIEW_GROUPS order; empty groups left out. */
export function groupItems(items) {
  return REVIEW_GROUPS.map((g) => ({ ...g, items: (items || []).filter((it) => it.group === g.key) })).filter(
    (g) => g.items.length > 0,
  )
}

/** The answers the popup opens with: every suggestion pre-filled ('' = needs a pick). */
export function initialPicks(items) {
  const out = {}
  for (const it of items || []) out[String(it.acct)] = it.suggestion?.category ?? ''
  return out
}

/** The answers on screen: the pre-filled suggestions, overlaid by what the person chose. */
export function currentPicks(items, draft = {}) {
  const base = initialPicks(items)
  for (const [k, v] of Object.entries(draft || {})) {
    if (Object.prototype.hasOwnProperty.call(base, k)) base[k] = v ?? ''
  }
  return base
}

/** How many rows have an answer (a pre-filled suggestion counts). */
export function answeredCount(items, picks) {
  return (items || []).filter((it) => !!picks?.[String(it.acct)]).length
}

/**
 * Can the person approve? Every row needs a category.
 * → { canApprove, missing, reason }
 */
export function approveState(items, picks) {
  const total = (items || []).length
  const missing = total - answeredCount(items, picks)
  if (total === 0) return { canApprove: false, missing: 0, reason: 'Nothing to sort.' }
  if (missing > 0) {
    return {
      canApprove: false,
      missing,
      reason: `Pick a category for ${missing} more account${missing === 1 ? '' : 's'} first.`,
    }
  }
  return { canApprove: true, missing: 0, reason: null }
}

/** { [String(acct)]: category } for every answered row — the ONE save. */
export function entriesFromPicks(items, picks) {
  const out = {}
  for (const it of items || []) {
    const v = picks?.[String(it.acct)]
    if (v && SCOA_CATEGORIES[v]) out[String(it.acct)] = v
  }
  return out
}

/**
 * "Review 12 accounts" / "Review 1 account" — the popup's title is the SAME
 * words as every button that opens it (one action, one name).
 */
export function reviewTitle(n) {
  return `Review ${n} account${n === 1 ? '' : 's'}`
}

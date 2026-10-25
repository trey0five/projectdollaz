// ─────────────────────────────────────────────────────────────────────────────
// financeInventory — what the school ALREADY has on file, and what a newly
// dropped file would do to it (Finance → Add data, "Already on file").
//
// Owner, 2026-10-25: "I can't see the data that was already added. What happens
// when the user wants to delete data and add new data?" The upload sorter now
// shows every saved year above the drop zone, and each dropped file says, BEFORE
// anything is saved, whether it replaces something ("Replaces your FY25 trial
// balance (uploaded Oct 3)").
//
// PURE: no React, no network. The inventory itself is GET /finance/on-file
// (OnFileResponse); `routeVerdict` reads it next to a financeSort verdict.
// ─────────────────────────────────────────────────────────────────────────────
import { partitionCandidates } from './trendIntake.js'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const HALF_LABEL = { pl: 'Profit and Loss', bs: 'Balance Sheet' }

const ymd = (s) => (s ? String(s).slice(0, 10) : '')

/** "FY25" for a June 30 year end; otherwise the stored label (server rule). */
export function shortLabelFor({ label, periodEndDate } = {}) {
  const end = ymd(periodEndDate)
  if (end.endsWith('-06-30')) return `FY${end.slice(2, 4)}`
  return label || end
}

/** "June 30, 2025" from 'YYYY-MM-DD' — by string parts (no timezone drift). */
export function longDate(periodEndDate) {
  const end = ymd(periodEndDate)
  const [y, m, d] = end.split('-').map(Number)
  if (!y || !m || !d) return end
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** "FY25 · year ending June 30, 2025", or "<label> · through March 31, 2026". */
export function yearHeading({ label, periodEndDate } = {}) {
  const end = ymd(periodEndDate)
  if (end.endsWith('-06-30')) return `${shortLabelFor({ label, periodEndDate })} · year ending ${longDate(end)}`
  return `${label || shortLabelFor({ label, periodEndDate })} · through ${longDate(end)}`
}

/** '2026-03' → "March 2026". */
export function monthLong(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number)
  if (!y || !m) return String(monthKey || '')
  return `${MONTHS[m - 1]} ${y}`
}

/** '2026-03' → "Mar 2026". */
export function monthShort(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number)
  if (!y || !m) return String(monthKey || '')
  return `${MONTHS[m - 1].slice(0, 3)} ${y}`
}

/** The June 30 that ends the fiscal year (Jul–Jun) a month belongs to. */
export function fyEndOfMonth(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number)
  if (!y || !m) return null
  return `${m >= 7 ? y + 1 : y}-06-30`
}

/** "Oct 3" for a timestamp this year, "Oct 3, 2024" otherwise. */
export function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(
    'en-US',
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
  )
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items) {
  const list = (items || []).filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/**
 * "January, February and March 2026" — the year once when every month shares
 * it, otherwise each month carries its own ("December 2025 and January 2026").
 */
export function monthList(keys) {
  const sorted = Array.from(new Set(keys || [])).sort()
  const years = new Set(sorted.map((k) => k.slice(0, 4)))
  if (years.size === 1 && sorted.length > 1) {
    const names = sorted.map((k) => MONTHS[Number(k.slice(5, 7)) - 1])
    return `${joinAnd(names)} ${sorted[0].slice(0, 4)}`
  }
  return joinAnd(sorted.map(monthLong))
}

export const halfLabel = (half) => HALF_LABEL[half] || null

// ── What a dropped file covers ───────────────────────────────────────────────

const FAMILY = {
  annual: 'trial_balance',
  'multi-year': 'trial_balance',
  half: 'trial_balance',
  monthly: 'monthly',
  budget: 'budget',
}

/**
 * The years / months a financeSort verdict covers, read from the candidates the
 * sorter already parsed (financeSort itself is not changed).
 */
export function verdictCoverage(verdict) {
  const family = FAMILY[verdict?.kind] ?? null
  const out = { family, trialBalances: [], undated: false, months: [], budgetMonthKeys: [] }
  if (!verdict || !family) return out
  const parts = partitionCandidates(Array.isArray(verdict.candidates) ? verdict.candidates : [])
  if (verdict.kind === 'annual' || verdict.kind === 'multi-year') {
    out.trialBalances = parts.annual
      .filter((c) => c.periodEndDate)
      .map((c) => ({ periodEndDate: ymd(c.periodEndDate), half: null }))
    out.undated = out.trialBalances.length === 0 && parts.undated.length > 0
  } else if (verdict.kind === 'half') {
    out.trialBalances = parts.partial
      .filter((c) => c.periodEndDate)
      .map((c) => ({ periodEndDate: ymd(c.periodEndDate), half: c.partial || null }))
    out.undated = out.trialBalances.length === 0
  } else if (verdict.kind === 'monthly') {
    out.months = Array.from(
      new Set(parts.monthly.map((c) => c.metadata?.monthKey || c.periodEndDate?.slice(0, 7)).filter(Boolean)),
    ).sort()
  } else if (verdict.kind === 'budget') {
    out.budgetMonthKeys = Array.isArray(verdict.monthKeys) ? verdict.monthKeys : []
  }
  return out
}

// ── Where a dropped file goes, and what it will replace ─────────────────────

const FAMILY_NOUN = { trial_balance: 'trial balance', monthly: 'monthly numbers', budget: 'budget' }
const FAMILY_ARTICLE = { trial_balance: 'a trial balance', monthly: 'monthly numbers', budget: 'a budget' }

const cyOf = (year) => (year?.trialBalances || []).find((t) => t.role === 'cy') || null

/**
 * Route one sorted file against what is already on file.
 *   → { destination, periodId, focus, notes: [{tone:'watch'|'info', text}] }
 * `target` = the Replace the person clicked ({kind, periodId, shortLabel}) or null.
 * `activePeriodId` = the year the Budget / Monthly tiles open on when nothing
 * else names one (the page's year), so a budget warning names the year it saves to.
 */
export function routeVerdict(
  verdict,
  { onFile = null, periods = [], activePeriodId = null, target = null, onFileUnavailable = false } = {},
) {
  const out = { destination: verdict?.destination ?? null, periodId: null, focus: false, notes: [] }
  if (!verdict) return out
  const cov = verdictCoverage(verdict)
  const periodList = Array.isArray(periods) ? periods : []
  const periodForEnd = (end) => periodList.find((p) => ymd(p.periodEndDate) === end) || null

  // Monthly numbers go to the year the first month belongs to — with or without
  // the inventory (the periods list alone answers it).
  if (cov.family === 'monthly' && cov.months.length) {
    out.periodId = periodForEnd(fyEndOfMonth(cov.months[0]))?.id ?? null
  }
  if (!onFile) {
    // The list of what's on file failed to load, so we can't tell whether this
    // year already has a trial balance. Add years saves it as that year's newest
    // version either way, while the single intake can't replace a saved year.
    if (onFileUnavailable && verdict.kind === 'annual') {
      const dated = Array.from(new Set(cov.trialBalances.map((t) => t.periodEndDate)))
      if (dated.length === 1) {
        const p = periodForEnd(dated[0])
        const label = p ? shortLabelFor(p) : dated[0].endsWith('-06-30') ? shortLabelFor({ periodEndDate: dated[0] }) : null
        out.destination = 'tb-bulk'
        out.periodId = p?.id ?? null
        out.notes.push({
          tone: 'info',
          text: `We couldn't check what's already on file${label ? ` for ${label}` : ''}, so this goes to Add years, which saves it as ${label ? `your ${label}` : 'that year’s'} trial balance either way.`,
        })
      }
    }
    return out
  }

  const years = Array.isArray(onFile.years) ? onFile.years : []
  const yearForEnd = (end) => years.find((y) => y.periodEndDate === end) || null
  const yearForId = (id) => years.find((y) => y.periodId === id) || null
  const labelForEnd = (end) => {
    const y = yearForEnd(end)
    if (y) return y.shortLabel
    const p = periodForEnd(end)
    if (p) return shortLabelFor(p)
    return end.endsWith('-06-30') ? shortLabelFor({ periodEndDate: end }) : `the period ending ${longDate(end)}`
  }
  const watch = (text) => out.notes.push({ tone: 'watch', text })
  const info = (text) => out.notes.push({ tone: 'info', text })
  const replacesTb = (y, tb) =>
    tb.half === 'pl' || tb.half === 'bs'
      ? `Replaces your saved ${y.shortLabel} ${HALF_LABEL[tb.half]} (uploaded ${shortDate(tb.uploadedAt)})`
      : `Replaces your ${y.shortLabel} trial balance (uploaded ${shortDate(tb.uploadedAt)})`

  const ends = Array.from(new Set(cov.trialBalances.map((t) => t.periodEndDate))).sort()

  if (verdict.kind === 'annual') {
    if (ends.length === 1) {
      const y = yearForEnd(ends[0])
      const tb = cyOf(y)
      out.periodId = y?.periodId ?? periodForEnd(ends[0])?.id ?? null
      if (tb) {
        // The single intake can never put a new file in a saved year's slot
        // (saved files hydrate role-confirmed), so a replacement goes through
        // Add years, which saves it as that year's newest version.
        out.destination = 'tb-bulk'
        watch(replacesTb(y, tb))
      }
    } else if (cov.undated && target?.kind === 'trial_balance') {
      out.destination = 'tb-bulk'
      out.periodId = target.periodId ?? null
      info(`This file doesn't say which year it's for. You'll pick ${target.shortLabel} on the next screen.`)
    }
  } else if (verdict.kind === 'multi-year') {
    const filled = ends.map((e) => ({ y: yearForEnd(e), e })).filter(({ y }) => cyOf(y))
    if (filled.length === 1) watch(replacesTb(filled[0].y, cyOf(filled[0].y)))
    else if (filled.length > 1) watch(`Replaces your ${joinAnd(filled.map(({ y }) => y.shortLabel))} trial balances`)
  } else if (verdict.kind === 'half') {
    const halves = new Set(cov.trialBalances.map((t) => t.half).filter(Boolean))
    if (ends.length === 1) {
      const y = yearForEnd(ends[0])
      const tb = cyOf(y)
      if (tb) {
        const mine = halves.size === 1 ? [...halves][0] : null
        const other = mine === 'pl' ? 'bs' : mine === 'bs' ? 'pl' : null
        if (other && tb.half === other) {
          out.destination = 'tb-single'
          out.periodId = y.periodId
          out.focus = true
          out.yearLabel = y.shortLabel
          info(
            `Goes with your saved ${y.shortLabel} ${HALF_LABEL[other]} (uploaded ${shortDate(tb.uploadedAt)}). You can combine them on the next screen.`,
          )
        } else {
          watch(
            `You already have an ${y.shortLabel} trial balance (uploaded ${shortDate(tb.uploadedAt)}). To use this file instead, remove that one above first.`,
          )
        }
      }
    }
  } else if (cov.family === 'monthly') {
    const saved = new Map()
    for (const y of years) for (const m of y.monthly?.months || []) saved.set(m.monthKey, m)
    const hits = cov.months.filter((k) => saved.has(k))
    if (hits.length === 1) {
      watch(`Replaces your ${monthLong(hits[0])} numbers (uploaded ${shortDate(saved.get(hits[0]).uploadedAt)})`)
    } else if (hits.length > 1) {
      watch(`Replaces ${hits.length} months you already added: ${monthList(hits)}`)
    }
  } else if (cov.family === 'budget') {
    // The Replace target's year, else the year the Budget tile opens on.
    out.periodId = target?.periodId ?? activePeriodId ?? null
    const y = yearForId(out.periodId)
    if (y?.budget) watch(`Replaces your ${y.shortLabel} budget (saved ${shortDate(y.budget.updatedAt)})`)
  }

  // The Replace the person clicked, when this file is not what they pointed at.
  if (target && cov.family) {
    const targetNoun = `the ${target.shortLabel} ${FAMILY_NOUN[target.kind] || 'data'}`
    if (target.kind !== cov.family) {
      watch(
        `You chose to replace ${targetNoun}, but this file looks like ${FAMILY_ARTICLE[cov.family]}. It will go where it belongs.`,
      )
    } else if (cov.family === 'trial_balance' && ends.length) {
      const targetEnd = ymd(yearForId(target.periodId)?.periodEndDate || periodList.find((p) => p.id === target.periodId)?.periodEndDate)
      if (targetEnd && !ends.includes(targetEnd)) {
        const fileYears = joinAnd(ends.map(labelForEnd))
        watch(`You chose to replace ${target.shortLabel}, but this file is for ${fileYears}. It will go to ${fileYears}.`)
      }
    }
  }
  return out
}

// ── Continue buttons: a saved year's other half gets its own ────────────────

/** 'tb-single@p25' → 'tb-single' (the DESTINATION key a split group belongs to). */
export const destinationKeyOf = (key) => String(key).split('@')[0]

/**
 * The single trial-balance step opens on ONE year. A half that pairs with a
 * saved year's other half must open on that year, so when it shares the
 * 'tb-single' group with files for other years (or halves for another saved
 * year), each such half moves to its own group 'tb-single@<periodId>' — its own
 * Continue button — instead of one file's year deciding for all of them.
 * Order of the Map is kept; the split groups take the original group's place.
 */
export function splitFocusGroups(groups) {
  const tb = groups.get('tb-single')
  if (!tb) return groups
  const focused = new Map()
  const rest = []
  for (const s of tb) {
    const pid = s.route?.focus ? s.route.periodId : null
    if (pid) focused.set(pid, [...(focused.get(pid) || []), s])
    else rest.push(s)
  }
  if (focused.size === 0 || (focused.size === 1 && rest.length === 0)) return groups
  const out = new Map()
  for (const [k, v] of groups) {
    if (k !== 'tb-single') {
      out.set(k, v)
      continue
    }
    if (rest.length) out.set('tb-single', rest)
    for (const [pid, items] of focused) out.set(`tb-single@${pid}`, items)
  }
  return out
}

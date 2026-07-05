import { Loader2 } from 'lucide-react'
import { SCOA_CATEGORIES } from '@finrep/engine'
import { fmt } from '../lib/format.js'

// ─────────────────────────────────────────────────────────────
// Per-account category picker row for the trial-balance "to review"
// panel. Presentational + top-level only — all chart/overlay state lives
// in AppContext (the FROZEN mapAccount / mappingAccts / activeChart API).
// Picking a category calls onPick(acct, categoryKey); the row then exits
// the parent's AnimatePresence list because findUnmapped(activeChart) no
// longer flags it.
// ─────────────────────────────────────────────────────────────

// Friendly labels for the SCoA category keys. Anything not listed falls
// back to a humanized camelCase split.
const LABELS = {
  tuition: 'Tuition & fees',
  intlRev: 'International revenue',
  textbook: 'Textbooks',
  other: 'Other revenue',
  studActRev: 'Student activities (revenue)',
  investments: 'Investment income',
  support: 'Contributions & support',
  interest: 'Interest income',
  development: 'Development / fundraising',
  instrSal: 'Instructional salaries',
  instrSup: 'Instructional supplies',
  adminSal: 'Administrative salaries',
  adminCost: 'Administrative costs',
  facilSal: 'Facilities salaries',
  facilCost: 'Facilities costs',
  fixedOther: 'Other fixed costs',
  bus: 'Transportation',
  food: 'Food service',
  athletics: 'Athletics',
  ancillary: 'Ancillary',
  restricted: 'Restricted',
  intlExp: 'International expense',
  studActExp: 'Student activities (expense)',
}

const humanize = (k) =>
  k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

const labelFor = (k) => LABELS[k] || humanize(k)

// Named export so other surfaces (e.g. the QuickBooks category review card)
// render category/suggestion labels from this ONE source.
export { labelFor }

// Build the grouped option lists ONCE at module scope (not per render). Exclude
// categories that don't roll into the statement totals (ancillary) or have no
// real accounts (studActExp) — mapping a flagged income account to those would
// silently drop it from the statements, defeating the point.
const PICKABLE = (c) => c.includedInTotals !== false && c.category !== 'studActExp'

const REVENUE_OPTS = Object.values(SCOA_CATEGORIES)
  .filter((c) => c.section === 'revenue' && PICKABLE(c))
  .map((c) => ({ value: c.category, label: labelFor(c.category) }))
  .sort((a, b) => a.label.localeCompare(b.label))

const EXPENSE_OPTS = Object.values(SCOA_CATEGORIES)
  .filter((c) => c.section === 'expense' && PICKABLE(c))
  .map((c) => ({ value: c.category, label: labelFor(c.category) }))
  .sort((a, b) => a.label.localeCompare(b.label))

/**
 * One account row: identity + dollars + a gold category select.
 *
 * Two modes:
 * - Uncontrolled (intake "to review" panel — no `value` prop): defaultValue=""
 *   with an "Assign category…" placeholder; the row exits once picked.
 * - Controlled (`value` provided, e.g. the QuickBooks review card): the select
 *   reflects `value`, no placeholder (every account already has a category).
 * Optional `section` ('revenue'|'expense') narrows the options to that group.
 */
export default function MappingCategorySelect({ row, busy, disabled, onPick, value, section }) {
  const controlled = value !== undefined
  // Controlled safety: if the current value isn't among the rendered options
  // (a wrong-section or non-pickable category set via another mapping surface),
  // render it as an explicit extra option — otherwise the browser silently
  // displays the FIRST option while the account's real category differs.
  const renderedOpts = [
    ...(section !== 'expense' ? REVENUE_OPTS : []),
    ...(section !== 'revenue' ? EXPENSE_OPTS : []),
  ]
  const valueMissing = controlled && !!value && !renderedOpts.some((o) => o.value === value)
  const handleChange = (e) => {
    const picked = e.target.value
    if (!picked) return
    onPick(row.acct, picked)
    // Intentionally do NOT clear the select — the row exits on the next
    // render once findUnmapped(activeChart) stops flagging this account.
  }

  return (
    <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-[13px] text-[#5a4400]">
        <span className="min-w-0 truncate">
          <span className="font-semibold">{row.acct}</span> — {row.desc}
        </span>
        <span className="shrink-0 font-mono">{fmt(Math.abs(row.total))}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <select
          aria-label={`Category for account ${row.acct} ${row.desc}`}
          disabled={busy || disabled}
          {...(controlled ? { value } : { defaultValue: '' })}
          onChange={handleChange}
          className="w-full rounded-lg border-2 border-gold/40 bg-white px-2.5 py-1.5 text-[13px] text-navy transition-colors focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:cursor-not-allowed disabled:opacity-60 sm:w-56"
        >
          {!controlled && (
            <option value="" disabled>
              Assign category…
            </option>
          )}
          {section !== 'expense' && (
            <optgroup label="Revenue">
              {REVENUE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {section !== 'revenue' && (
            <optgroup label="Expense">
              {EXPENSE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {valueMissing && (
            <option value={value}>{labelFor(value)} (current)</option>
          )}
        </select>
        {busy && (
          <Loader2 size={15} className="shrink-0 animate-spin text-gold" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

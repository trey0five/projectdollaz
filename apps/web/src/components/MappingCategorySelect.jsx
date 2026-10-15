import { Loader2 } from 'lucide-react'
import { SCOA_CATEGORIES } from '@finrep/engine'
import { fmt } from '../lib/format.js'

// ─────────────────────────────────────────────────────────────
// Per-account category picker row (the QuickBooks category review uses it;
// the intake review popup reuses its CATEGORY_OPTIONS / labelFor). Purely
// presentational: picking a category calls onPick(acct, categoryKey) and the
// host decides what to save.
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
  // Balance sheet — plain-language, because the person reviewing a trial
  // balance is often not the person who chose the account names.
  cash: 'Cash & equivalents',
  restrictedCash: 'Restricted cash',
  tuitionRec: 'Receivables',
  prepaid: 'Prepaid expenses',
  ppGross: 'Property & equipment',
  accumDepr: 'Accumulated depreciation',
  rouAsset: 'Right-of-use asset',
  restrictInvst: 'Investments',
  apAccrued: 'Payables & accruals',
  leaseCurr: 'Lease — current portion',
  studentClubs: 'Student club funds',
  deferredIntl: 'Deferred revenue',
  leaseNonCurr: 'Long-term debt & leases',
  naWithoutDonor: 'Net assets — unrestricted',
  naWithDonor: 'Net assets — donor restricted',
  equityOpening: 'Opening equity',
  deprExpense: 'Depreciation expense',
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

// BALANCE-SHEET OPTIONS. These carry includedInTotals:false — they contribute
// to no income-statement total — so the PICKABLE filter above would have
// excluded every one of them. That filter exists to stop a REVENUE account
// being parked somewhere it would vanish from the totals; it was never about
// assets. Without these groups a school reviewing an unmapped cash account had
// no honest answer available to it in the dropdown at all.
const bsGroup = (section) =>
  Object.values(SCOA_CATEGORIES)
    .filter((c) => c.section === section)
    .map((c) => ({ value: c.category, label: labelFor(c.category) }))
    .sort((a, b) => a.label.localeCompare(b.label))

const ASSET_OPTS = bsGroup('asset')
const LIABILITY_OPTS = bsGroup('liability')
const NET_ASSET_OPTS = bsGroup('netAssets')

/** Every pickable category, by SCoA statement section (the review popup's dropdowns). */
export const CATEGORY_OPTIONS = Object.freeze({
  revenue: REVENUE_OPTS,
  expense: EXPENSE_OPTS,
  asset: ASSET_OPTS,
  liability: LIABILITY_OPTS,
  netAssets: NET_ASSET_OPTS,
})

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
export default function MappingCategorySelect({
  row,
  busy,
  disabled,
  onPick,
  value,
  section,
  // A NAME-BASED GUESS at what this account is, or null. Pre-fills the select
  // and offers a one-click "Use this" — but is never applied on its own. An
  // account put in the wrong bucket does not raise an error, it produces a
  // wrong statement that looks exactly like a right one, so a person confirms
  // every one of these.
  suggestion = null,
}) {
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
    // A deliberate pick from the dropdown IS the confirmation — it needs no
    // second one. Only the pre-filled guess waits for "Use this".
    onPick(row.acct, picked)
    // Intentionally do NOT clear the select — the row exits on the next
    // render once findUnmapped(activeChart) stops flagging this account.
  }
  const suggested = !controlled && suggestion?.category ? suggestion.category : null

  return (
    <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-[13px] text-ink">
        <span className="min-w-0 truncate">
          <span className="font-semibold">{row.acct}</span> — {row.desc}
          {suggested ? (
            <>
              {/* A4: a pre-filled pick is plainly marked as KYRO's suggestion —
                  it isn't saved until somebody agrees to it. */}
              <span
                className="ml-2 inline-flex items-center rounded-full border border-[rgb(var(--c-watch)/0.35)] bg-[rgb(var(--c-watch)/0.08)] px-1.5 py-px align-middle text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[rgb(var(--c-watch))]"
                data-testid="suggestion-tag"
              >
                Suggestion
              </span>
              <span className="ml-1.5 whitespace-nowrap text-[11.5px] font-semibold text-ink/70">
                looks like {suggestion.reason}
              </span>
            </>
          ) : null}
        </span>
        <span className="num shrink-0">{fmt(Math.abs(row.total))}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <select
          aria-label={`Category for account ${row.acct} ${row.desc}`}
          disabled={busy || disabled}
          {...(controlled ? { value } : { defaultValue: suggested ?? '' })}
          onChange={handleChange}
          className="w-full rounded-lg border border-hair bg-white px-2.5 py-1.5 text-[13px] text-ink transition-colors focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 disabled:cursor-not-allowed disabled:opacity-60 sm:w-56"
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
          {/* Assets and liabilities. Absent until the balance sheet became
              mapping-driven, which left a cash account with nothing correct to
              choose. Hidden when the caller has narrowed to one side. */}
          {!section && (
            <>
              <optgroup label="Assets">
                {ASSET_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Liabilities">
                {LIABILITY_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Net assets">
                {NET_ASSET_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </>
          )}
          {valueMissing && (
            <option value={value}>{labelFor(value)} (current)</option>
          )}
        </select>
        {/* THE CONFIRMATION. A pre-filled guess is a proposal until somebody
            agrees with it: it is not written, and the account stays flagged
            for review until this is pressed (or a different category picked). */}
        {suggested && !busy ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(row.acct, suggested)}
            className="shrink-0 rounded-lg border border-hair bg-ink/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-hair/[0.3] hover:bg-ink/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use this
          </button>
        ) : null}
        {busy && (
          <Loader2 size={15} className="shrink-0 animate-spin text-ink2" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

// QuickBooks category review — the guided step after a QBO import. QuickBooks
// accounts carry no account numbers, so the importer sorts every P&L account
// onto a default bucket ('Other revenue' / 'Fixed & other'). This card lets an
// owner/accountant refine each account's SCoA category and rebuilds the
// statements + monthly snapshots on save. Data fetching is owned by
// IntegrationsSection (the entry pill and this card share ONE `review`).
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { qboApi, apiErrorMessage } from '../../lib/api.js'
import { FormError } from '../auth/fields.jsx'
import MappingCategorySelect, { labelFor } from '../MappingCategorySelect.jsx'
import SettingsCard from './SettingsCard.jsx'

const GROUPS = [
  { section: 'revenue', head: 'Revenue — currently shown as Other revenue' },
  { section: 'expense', head: 'Expenses — currently shown as Fixed & other' },
]

export default function QboCategoryReviewCard({ schoolId, review, canEdit, onSaved }) {
  // Unsaved picks: { [acct]: categoryKey }. `filterChoice` is the user's explicit
  // pill pick; until they choose, the filter derives from the data (defaults to
  // the accounts that still need a look; 'all' once none are left, for re-edits).
  const [drafts, setDrafts] = useState({})
  const [filterChoice, setFilterChoice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  // NOTE: drafts are keyed by engine account numbers, which are meaningless
  // across schools — the parent remounts this card per school (key={schoolId}).

  if (!canEdit || !review || review.summary.total === 0) return null

  const { accounts, summary } = review
  const reviewed = summary.total - summary.needsReview
  const allDone = summary.needsReview === 0
  // With nothing left on the default, 'needs' would render an empty list.
  const activeFilter = filterChoice ?? (allDone ? 'all' : 'needs')
  const draftCount = Object.keys(drafts).length

  const isVisible = (a) =>
    activeFilter === 'all' || a.isDefault || drafts[a.acct] !== undefined

  const acceptSuggestions = (rows) =>
    setDrafts((d) => {
      const next = { ...d }
      for (const a of rows) if (next[a.acct] === undefined) next[a.acct] = a.suggestion
      return next
    })

  const save = async () => {
    setErr('')
    setResult(null)
    setSaving(true)
    try {
      const res = await qboApi.applyReview(schoolId, drafts)
      setResult(res.data)
      setDrafts({})
      onSaved?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not save the categories.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="qb-review">
      <SettingsCard
        title="Review QuickBooks categories"
        description="QuickBooks doesn’t use account numbers, so we sorted your income and expense accounts automatically. Refine them here so your statements tell the right story."
      >
        {/* Progress header */}
        {allDone ? (
          <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-navy">
            <CheckCircle2 size={17} className="shrink-0 text-gold" />
            All {summary.total} QuickBooks accounts categorized
          </p>
        ) : (
          <p className="mb-2 text-[15px] font-semibold text-navy">
            {summary.needsReview} of {summary.total} accounts still on the automatic category
          </p>
        )}
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-navy/[0.08]">
          <div
            className="h-full rounded-full bg-gold transition-all duration-500"
            style={{ width: `${summary.total ? (reviewed / summary.total) * 100 : 0}%` }}
          />
        </div>
        <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          Revenue {summary.revenue} · Expenses {summary.expense}
        </p>

        {/* Filter pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { key: 'needs', label: `Needs review (${summary.needsReview})` },
            { key: 'all', label: `All accounts (${summary.total})` },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => setFilterChoice(p.key)}
              className={`rounded-full border-2 px-4 py-1.5 text-[13.5px] font-semibold transition-colors ${
                activeFilter === p.key
                  ? 'border-gold bg-gold/15 text-navy'
                  : 'border-border bg-white text-muted hover:border-gold/50 hover:text-navy'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Account groups — server pre-sorts; we only filter. */}
        <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
          {GROUPS.map(({ section, head }) => {
            const rows = accounts.filter((a) => a.section === section && isVisible(a))
            if (rows.length === 0) return null
            const suggestible = rows.filter(
              (a) => a.isDefault && a.suggestion && drafts[a.acct] === undefined
            )
            return (
              <div key={section} className="rounded-lg border border-border bg-section/40 px-3.5 py-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {head}
                  </p>
                  {suggestible.length >= 2 && (
                    <button
                      onClick={() => acceptSuggestions(suggestible)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-navy underline-offset-2 hover:text-gold hover:underline disabled:opacity-50"
                    >
                      <Sparkles size={13} className="text-gold" /> Accept all suggestions
                    </button>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {rows.map((a) => {
                    const draft = drafts[a.acct]
                    const untouchedDefault = a.isDefault && draft === undefined
                    return (
                      <motion.div
                        key={a.acct}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className={`overflow-hidden border-l-2 pl-3 ${
                          draft !== undefined ? 'border-gold' : 'border-transparent'
                        }`}
                      >
                        <MappingCategorySelect
                          row={{ acct: a.acct, desc: a.name, total: a.amount }}
                          value={draft ?? a.category}
                          section={a.section}
                          disabled={saving}
                          onPick={(acct, v) => setDrafts((d) => ({ ...d, [acct]: v }))}
                        />
                        {(untouchedDefault || a.periodLabel) && (
                          <div className="flex flex-wrap items-center gap-2 pb-1.5 text-[12px]">
                            {untouchedDefault && (
                              <span
                                title="Default category — assigned automatically from the QuickBooks account type"
                                className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 font-bold uppercase tracking-[0.06em] text-[#5a4400]"
                              >
                                Auto
                              </span>
                            )}
                            {untouchedDefault && a.suggestion && (
                              <button
                                onClick={() =>
                                  setDrafts((d) => ({ ...d, [a.acct]: a.suggestion }))
                                }
                                disabled={saving}
                                className="inline-flex items-center gap-1 rounded-full border border-gold bg-gold/15 px-2 py-0.5 font-semibold text-navy transition-colors hover:bg-gold/30 disabled:opacity-50"
                              >
                                <Sparkles size={11} className="text-gold" />
                                Suggest: {labelFor(a.suggestion)}
                              </button>
                            )}
                            {a.periodLabel && (
                              <span className="text-muted">as of {a.periodLabel}</span>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {err && <div className="mt-3"><FormError>{err}</FormError></div>}

        {/* Save outcome — partial rebuild failures are still a success. */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3"
          >
            <p className="flex items-center gap-2 text-[14.5px] font-semibold text-navy">
              <CheckCircle2 size={15} className="shrink-0 text-gold" />
              Saved {result.merged} categories · statements rebuilt for {result.statements.rebuilt}{' '}
              periods · {result.monthly.rebuilt} monthly snapshots refreshed
            </p>
            {(result.statements.failed.length > 0 || result.monthly.failed.length > 0) && (
              <p className="mt-1 text-[13px] text-muted">
                Some rebuilds didn’t finish and will pick up the new categories on the next sync:
                {result.statements.failed.length > 0 &&
                  ` ${result.statements.failed.length} period${result.statements.failed.length === 1 ? '' : 's'}`}
                {result.statements.failed.length > 0 && result.monthly.failed.length > 0 && ' ·'}
                {result.monthly.failed.length > 0 &&
                  ` ${result.monthly.failed.length} monthly snapshot${result.monthly.failed.length === 1 ? '' : 's'}`}
                .
              </p>
            )}
          </motion.div>
        )}

        {/* Sticky save bar */}
        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-border bg-white pt-3.5">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={save}
            disabled={saving || draftCount === 0}
            className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving
              ? 'Rebuilding statements…'
              : `Save ${draftCount} categor${draftCount === 1 ? 'y' : 'ies'}`}
          </motion.button>
          <p className="text-[13px] text-muted">
            Rebuilds your statements and monthly numbers with the new categories.
          </p>
        </div>
      </SettingsCard>
    </div>
  )
}

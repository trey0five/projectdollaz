// ─────────────────────────────────────────────────────────────────────────────
// ResolveUnmatched — inline editor for budget lines the rollup couldn't match to
// an SCoA category. Lists each unmatched line, lets the user pick a category per
// line, then SAVES the picks into the school's Mapping.entries (so they persist
// for future imports) and asks the parent to RE-RUN the assessment — resolved
// lines then drop off and this panel self-hides.
//
// Props: { schoolId, unmatched, onResolved }
//   unmatched = assessment.unmatched = [{ key, acct, label, annual }]
//   onResolved() — parent bumps the assess key to force a re-assessment.
//
// ADVISORY ONLY — never gates Confirm. A save failure only sets local error.
// Navy/gold, framer-motion entrance, consistent with SufficiencyPanel.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Wand2, Loader2, CheckCircle2 } from 'lucide-react'
import { mappingApi, apiErrorMessage } from '../../lib/api.js'
import { fmtDollar } from '../../lib/format.js'
import { SCOA_REVENUE_OPTIONS, SCOA_EXPENSE_OPTIONS } from '../../lib/scoaCategories.js'

export default function ResolveUnmatched({ schoolId, unmatched, onResolved }) {
  const [choices, setChoices] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const rows = Array.isArray(unmatched) ? unmatched : []
  if (rows.length === 0) return null

  const chosenCount = Object.values(choices).filter(Boolean).length

  const onSave = async () => {
    // Build entries keyed by each row's server-provided `key` (echoed verbatim) →
    // the chosen SCoA category. Only rows with a pick are sent.
    const entries = {}
    for (const r of rows) {
      const cat = choices[r.key]
      if (cat) entries[r.key] = cat
    }
    if (Object.keys(entries).length === 0) return
    setSaving(true)
    setSaveError('')
    try {
      await mappingApi.mergeEntries(schoolId, entries)
      onResolved?.()
    } catch (e) {
      setSaveError(apiErrorMessage(e, 'Could not save these category picks.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-soft space-y-3 border-amber-300/60 p-4"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Wand2 size={15} />
        </span>
        <div>
          <div className="font-serif text-[15px] font-semibold text-navy">Resolve unmatched lines</div>
          <p className="text-[12px] text-muted">
            Pick a category so these lines roll into the totals — your choices are saved for next time.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-white px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-ink">
                {r.label || '(no label)'}
                {r.acct > 0 && (
                  <span className="ml-2 text-[11px] font-normal text-muted">#{r.acct}</span>
                )}
              </div>
              <div className="text-[12px] text-muted">{fmtDollar(r.annual)}</div>
            </div>
            <select
              value={choices[r.key] ?? ''}
              onChange={(e) =>
                setChoices((prev) => ({ ...prev, [r.key]: e.target.value }))
              }
              className="rounded-lg border border-rule bg-cream/40 px-2.5 py-1.5 text-[13px] text-ink focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/40"
            >
              <option value="">Choose a category…</option>
              <optgroup label="Revenue">
                {SCOA_REVENUE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Expense">
                {SCOA_EXPENSE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </li>
        ))}
      </ul>

      {saveError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-700">
          {saveError}
        </div>
      )}

      <div className="flex items-center justify-end">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onSave}
          disabled={saving || chosenCount === 0}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={15} /> Save categories
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  )
}

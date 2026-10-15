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
// A Section on the ground (ruled rows, native selects), consistent with SufficiencyPanel.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Wand2, Loader2, CheckCircle2 } from 'lucide-react'
import { mappingApi, apiErrorMessage } from '../../lib/api.js'
import { fmtDollar } from '../../lib/format.js'
import { SCOA_REVENUE_OPTIONS, SCOA_EXPENSE_OPTIONS } from '../../lib/scoaCategories.js'
import { Section, Pill, Button } from '../ui/surface/index.js'

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
    <Section
      label="Resolve unmatched lines"
      aside={<Pill variant="status" tone="watch">{rows.length} to resolve</Pill>}
     
    >
      <p className="mb-2 flex items-start gap-2 text-small text-ink2">
        <Wand2 size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        Pick a category so these lines roll into the totals — your choices are saved for next time.
      </p>

      <ul>
        {rows.map((r) => (
          <li key={r.key} className="fig flex-wrap !items-center">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-ink">
                {r.label || '(no label)'}
                {r.acct > 0 && <span className="ml-2 text-[11px] font-normal text-ink2">#{r.acct}</span>}
              </div>
              <div className="text-[12px] tabular-nums text-ink2">{fmtDollar(r.annual)}</div>
            </div>
            <select
              value={choices[r.key] ?? ''}
              aria-label={`Category for ${r.label || 'this line'}`}
              onChange={(e) => setChoices((prev) => ({ ...prev, [r.key]: e.target.value }))}
              className="sel max-w-full"
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
        <p className="b2-callout mt-3" data-tone="risk" role="alert">
          {saveError}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end">
        <Button
          variant="primary"
          onClick={onSave}
          disabled={saving || chosenCount === 0}
          icon={saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        >
          {saving ? 'Saving…' : 'Save categories'}
        </Button>
      </div>
    </Section>
  )
}

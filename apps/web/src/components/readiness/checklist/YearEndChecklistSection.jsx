// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — the Year-End Review Checklist section on /readiness, between the
// Compliance Intake and the reconciliation section. Self-fetching (mirrors
// CorrectiveActionPlanSection): owns the checklist GET via useChecklist, holds a
// draft map keyed by itemId synced render-time on a syncKey, and debounced
// autosave (useAutosave) of just the dirty rows. Renders ChecklistProgress at
// top, then one ChecklistGroup per group, then (canEdit only) the autosave
// status bar. owner/accountant edit; viewer read-only. Also surfaces the
// Workpapers Packet export. notEntitled -> null.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ListChecks } from 'lucide-react'
import { useChecklist } from '../../../hooks/useChecklist.js'
import { useAutosave } from '../../../hooks/useAutosave.js'
import { FormError } from '../../auth/fields.jsx'
import { AutosaveBar } from '../../AutosaveIndicator.jsx'
import ChecklistProgress from './ChecklistProgress.jsx'
import ChecklistGroup from './ChecklistGroup.jsx'
import WorkpapersExportButton from '../WorkpapersExportButton.jsx'

function draftFor(item) {
  return { status: item.status ?? 'pending', notes: item.notes ?? '' }
}

// Rows whose draft differs from the persisted server state. Empty notes become
// null (clears the column). Pure — safe to call during render for the dirty count.
function diffChanged(drafts, items) {
  return items
    .map((item) => {
      const d = drafts[item.id] ?? draftFor(item)
      const savedNotes = item.notes ?? ''
      if (d.status === item.status && d.notes === savedNotes) return null
      return {
        itemId: item.id,
        status: d.status,
        notes: d.notes.trim() === '' ? null : d.notes,
      }
    })
    .filter(Boolean)
}

export default function YearEndChecklistSection({ schoolId, periodId, canEdit }) {
  const reduce = useReducedMotion()
  const { data, groups, rollup, loading, error, notEntitled, save } = useChecklist(
    schoolId,
    periodId,
  )

  const [drafts, setDrafts] = useState({})

  const allItems = groups.flatMap((g) => g.items)

  // Sync drafts render-time when the item identity (school/period/data) changes.
  const syncKey = `${schoolId}:${periodId}:${data ? allItems.map((i) => `${i.id}:${i.status}`).join(',') : ''}`
  const [syncedKey, setSyncedKey] = useState(null)
  if (data && syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    const next = {}
    for (const item of allItems) next[item.id] = draftFor(item)
    setDrafts(next)
  }

  const changedNow = canEdit ? diffChanged(drafts, allItems) : []
  const dirtyCount = changedNow.length

  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: canEdit,
    dirty: dirtyCount > 0,
    signal: changedNow,
    save: () => save(diffChanged(drafts, allItems)),
  })

  const onChange = (itemId, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { status: 'pending', notes: '' }), [field]: value },
    }))
  }

  if (notEntitled) return null

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
            <ListChecks size={19} />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold text-navy">Year-End Review Checklist</h2>
            <p className="text-[15px] text-muted">
              {canEdit
                ? 'Walk each AUP procedure + gather the documents the reviewer will request. Changes autosave.'
                : 'Read-only — only an owner or accountant can update the checklist.'}
            </p>
          </div>
        </div>
        <WorkpapersExportButton periodId={periodId} />
      </div>

      {loading && !data ? (
        <div className="card-soft p-8 text-center text-[16px] text-muted">
          Loading the year-end checklist…
        </div>
      ) : error ? (
        <FormError>{error}</FormError>
      ) : (
        <>
          <ChecklistProgress rollup={rollup} />

          <div className="space-y-6">
            {groups.map((group) => (
              <ChecklistGroup
                key={group.section}
                group={group}
                drafts={drafts}
                onChange={onChange}
                canEdit={canEdit}
              />
            ))}
          </div>

          {saveError && <FormError>{saveError}</FormError>}

          {canEdit && (
            <AutosaveBar
              saving={saving}
              dirty={dirtyCount > 0}
              error={!!saveError}
              onSaveNow={saveNow}
              className="border-t border-rule/60 pt-4"
            />
          )}
        </>
      )}
    </motion.div>
  )
}

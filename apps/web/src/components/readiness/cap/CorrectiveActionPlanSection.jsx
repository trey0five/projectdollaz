// ─────────────────────────────────────────────────────────────────────────────
// Phase 2D — the Corrective Action Plan section on /readiness, after the
// reconciliation section. Self-fetching (mirrors ScholarshipReconciliationSection):
// it owns the CAP GET via useCorrectiveActionPlan, holds an editsByRule draft map
// synced render-time on the entries identity, a single Save (PUT) then refresh, an
// auto-fill action (reset all editable fields to the scaffold suggestions),
// per-card reset, and the Print/Export action. Owner/accountant edit; viewer
// read-only. Entitlement 402 -> the parent already shows the paused panel, but this
// section also no-ops gracefully.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ClipboardList, Sparkles, ChevronDown } from 'lucide-react'
import { useCorrectiveActionPlan } from '../../../hooks/useCorrectiveActionPlan.js'
import { useAutosave } from '../../../hooks/useAutosave.js'
import { FormError } from '../../auth/fields.jsx'
import { AutosaveBar } from '../../AutosaveIndicator.jsx'
import CapSummaryStrip from './CapSummaryStrip.jsx'
import CapEntryCard from './CapEntryCard.jsx'
import CapExportButton from './CapExportButton.jsx'

// Build the editable draft for one entry: saved value if present, else suggestion.
function draftFor(entry) {
  return {
    rootCause: entry.rootCause ?? '',
    correctiveAction: entry.correctiveAction ?? '',
    responsibleParty: entry.responsibleParty ?? '',
    targetDate: entry.targetDate ?? '',
    status: entry.status ?? 'open',
  }
}

function suggestionDraft(entry) {
  return {
    rootCause: entry.suggestedRootCause ?? '',
    correctiveAction: entry.suggestedCorrectiveAction ?? '',
    responsibleParty: entry.suggestedResponsibleParty ?? '',
    targetDate: '',
    status: entry.status ?? 'open',
  }
}

export default function CorrectiveActionPlanSection({ schoolId, periodId, canEdit }) {
  const reduce = useReducedMotion()
  const { data, entries, archived, summary, loading, error, notEntitled, reload, save, setArchived } =
    useCorrectiveActionPlan(schoolId, periodId)

  // Penny autonomous-write refresh: a drafted CAP entry broadcasts 'penny:data-changed'
  // with key 'cap' — re-pull the plan so the new draft appears. Pure listener.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'cap') reload()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [reload])

  const [editsByRule, setEditsByRule] = useState({})
  // Resolved + dismissed lists are collapsed by default so they don't stack up.
  const [showResolved, setShowResolved] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  const onArchiveItem = async (ruleId, archive) => {
    try {
      await setArchived(ruleId, archive)
    } catch {
      // Idempotent action — the next load reflects the true state; user can retry.
    }
  }

  // Sync drafts render-time when the entries identity (school/period/data) changes.
  const syncKey = `${schoolId}:${periodId}:${data ? entries.map((e) => e.ruleId).join(',') : ''}`
  const [syncedKey, setSyncedKey] = useState(null)
  if (data && syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    const next = {}
    for (const e of entries) next[e.ruleId] = draftFor(e)
    setEditsByRule(next)
  }

  const onChange = (ruleId, field, value) => {
    setEditsByRule((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], [field]: value },
    }))
  }

  const onReset = (ruleId) => {
    const entry = entries.find((e) => e.ruleId === ruleId)
    if (!entry) return
    setEditsByRule((prev) => ({ ...prev, [ruleId]: suggestionDraft(entry) }))
  }

  const autoFill = () => {
    const next = {}
    for (const e of entries) next[e.ruleId] = e.isResolved ? draftFor(e) : suggestionDraft(e)
    setEditsByRule(next)
  }

  const editable = useMemo(() => entries.filter((e) => !e.isResolved), [entries])
  const resolved = useMemo(() => entries.filter((e) => e.isResolved), [entries])

  const buildPayload = () =>
    entries
      .filter((e) => !e.isResolved)
      .map((e) => {
        const d = editsByRule[e.ruleId] ?? draftFor(e)
        return {
          ruleId: e.ruleId,
          rootCause: d.rootCause.trim() === '' ? null : d.rootCause.trim(),
          correctiveAction: d.correctiveAction.trim() === '' ? null : d.correctiveAction.trim(),
          responsibleParty: d.responsibleParty.trim() === '' ? null : d.responsibleParty.trim(),
          targetDate: d.targetDate === '' ? null : d.targetDate,
          status: d.status,
        }
      })

  // Dirty when any editable entry's draft differs from its saved values (compared
  // in persisted form so a save can't re-trigger itself).
  const norm = (s) => (s == null || String(s).trim() === '' ? null : String(s).trim())
  const dirty =
    canEdit &&
    editable.some((e) => {
      const d = editsByRule[e.ruleId] ?? draftFor(e)
      return (
        norm(d.rootCause) !== norm(e.rootCause) ||
        norm(d.correctiveAction) !== norm(e.correctiveAction) ||
        norm(d.responsibleParty) !== norm(e.responsibleParty) ||
        (d.targetDate || '') !== (e.targetDate || '') ||
        (d.status ?? 'open') !== (e.status ?? 'open')
      )
    })

  const { saving, error: err, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: JSON.stringify(editsByRule),
    save: () => save(buildPayload()),
  })

  if (notEntitled) return null

  // Nothing to remediate -> a quiet positive state (still on-theme). Dismissed
  // rows still count as "something to show" so their disclosure stays reachable.
  const hasAny = entries.length > 0 || archived.length > 0

  return (
    <motion.div
      id="readiness-cap-panel"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ClipboardList size={18} aria-hidden="true" className="mt-1.5 shrink-0 text-ink2" />
          <div>
            <h2 className="font-serif text-title font-medium text-ink">Corrective Action Plan</h2>
            <p className="text-small text-ink2">
              {canEdit
                ? 'Pre-filled remediation for each material / reportable exception. Edit, then save.'
                : 'Read-only — only an owner or accountant can edit the plan.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && hasAny && (
            <button type="button" onClick={autoFill} className="btn btn-secondary">
              <Sparkles size={14} aria-hidden="true" className="text-penny" /> Auto-fill from findings
            </button>
          )}
          <CapExportButton periodId={periodId} />
        </div>
      </div>

      {loading && !data ? (
        <div className="b2-note" aria-busy="true">
          <p>Loading the corrective action plan…</p>
        </div>
      ) : error ? (
        <FormError>{error}</FormError>
      ) : !hasAny ? (
        <div className="b2-note">
          <p className="b2-note-title">
            No material or reportable exceptions — nothing to remediate for this period.
          </p>
          <p>
            If a finding becomes material or reportable, a pre-filled CAP card appears here.
          </p>
        </div>
      ) : (
        <>
          {entries.length > 0 ? (
            <CapSummaryStrip summary={summary} />
          ) : (
            <div className="b2-note">
              <p>No active exceptions — only dismissed items remain for this period.</p>
            </div>
          )}

          <div className="space-y-4">
            {editable.map((entry, i) => (
              <CapEntryCard
                key={entry.ruleId}
                entry={entry}
                draft={editsByRule[entry.ruleId] ?? draftFor(entry)}
                onChange={onChange}
                onReset={onReset}
                canEdit={canEdit}
                index={i}
              />
            ))}
          </div>

          {resolved.length > 0 && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowResolved((s) => !s)}
                className="flex w-full items-center justify-between gap-2 border-b border-hair py-2.5 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB]/50"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
                  Resolved / self-healed ({resolved.length})
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={`text-ink2 transition-transform ${showResolved ? 'rotate-180' : ''}`}
                />
              </button>
              {showResolved &&
                resolved.map((entry, i) => (
                  <CapEntryCard
                    key={entry.ruleId}
                    entry={entry}
                    draft={editsByRule[entry.ruleId] ?? draftFor(entry)}
                    onChange={onChange}
                    onReset={onReset}
                    onArchive={onArchiveItem}
                    canEdit={canEdit}
                    index={i}
                  />
                ))}
            </div>
          )}

          {archived.length > 0 && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowDismissed((s) => !s)}
                className="flex w-full items-center justify-between gap-2 border-b border-hair py-2.5 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB]/50"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
                  Dismissed ({archived.length})
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={`text-ink2 transition-transform ${showDismissed ? 'rotate-180' : ''}`}
                />
              </button>
              {showDismissed &&
                archived.map((entry, i) => (
                  <CapEntryCard
                    key={entry.ruleId}
                    entry={entry}
                    draft={editsByRule[entry.ruleId] ?? draftFor(entry)}
                    onChange={onChange}
                    onReset={onReset}
                    onArchive={onArchiveItem}
                    canEdit={canEdit}
                    index={i}
                  />
                ))}
            </div>
          )}

          {err && <FormError>{err}</FormError>}

          {canEdit && editable.length > 0 && (
            <AutosaveBar
              saving={saving}
              dirty={dirty}
              error={!!err}
              onSaveNow={saveNow}
              className="border-t border-hair pt-4"
            />
          )}
        </>
      )}
    </motion.div>
  )
}

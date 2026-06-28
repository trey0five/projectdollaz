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
import { useMemo, useState } from 'react'
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
  const { data, entries, archived, summary, loading, error, notEntitled, save, setArchived } =
    useCorrectiveActionPlan(schoolId, periodId)

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
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
            <ClipboardList size={19} />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold text-navy">Corrective Action Plan</h2>
            <p className="text-[15px] text-muted">
              {canEdit
                ? 'Pre-filled remediation for each material / reportable exception. Edit, then save.'
                : 'Read-only — only an owner or accountant can edit the plan.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && hasAny && (
            <button
              type="button"
              onClick={autoFill}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-[15px] font-semibold text-navy transition-all hover:border-gold/50 hover:text-gold"
            >
              <Sparkles size={15} /> Auto-fill from findings
            </button>
          )}
          <CapExportButton periodId={periodId} />
        </div>
      </div>

      {loading && !data ? (
        <div className="card-soft p-8 text-center text-[16px] text-muted">
          Loading the corrective action plan…
        </div>
      ) : error ? (
        <FormError>{error}</FormError>
      ) : !hasAny ? (
        <div className="card-soft border-dashed px-6 py-10 text-center">
          <p className="font-serif text-[16px] italic text-muted">
            No material or reportable exceptions — nothing to remediate for this period.
          </p>
          <p className="mt-1 text-[14px] text-muted">
            If a finding becomes material or reportable, a pre-filled CAP card appears here.
          </p>
        </div>
      ) : (
        <>
          {entries.length > 0 ? (
            <CapSummaryStrip summary={summary} />
          ) : (
            <div className="card-soft border-dashed px-6 py-8 text-center">
              <p className="font-serif text-[16px] italic text-muted">
                No active exceptions — only dismissed items remain for this period.
              </p>
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
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-rule/70 bg-section/50 px-4 py-2.5 text-left transition-colors hover:border-gold/40"
              >
                <span className="text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Resolved / self-healed ({resolved.length})
                </span>
                <ChevronDown
                  size={16}
                  className={`text-muted transition-transform ${showResolved ? 'rotate-180' : ''}`}
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
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-rule/70 bg-section/50 px-4 py-2.5 text-left transition-colors hover:border-gold/40"
              >
                <span className="text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Dismissed ({archived.length})
                </span>
                <ChevronDown
                  size={16}
                  className={`text-muted transition-transform ${showDismissed ? 'rotate-180' : ''}`}
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
              className="border-t border-rule/60 pt-4"
            />
          )}
        </>
      )}
    </motion.div>
  )
}

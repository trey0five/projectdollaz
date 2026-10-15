import { motion, useReducedMotion } from 'framer-motion'
import {
  BookOpen,
  RotateCcw,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { complianceStatusMeta } from '../../../lib/complianceMeta.js'
import { CAP_STATUS_OPTIONS, capStatusMeta } from '../../../lib/capMeta.js'
import { Pill } from '../../ui/surface/index.js'
import DatePicker from '../../ui/DatePicker.jsx'

const labelCls = 'b2-label'
const inputCls = 'b2-input disabled:cursor-not-allowed disabled:bg-ground disabled:text-ink2'

/**
 * One CAP card. Read-only finding context (severity badge, observation, citation)
 * + editable fields (root cause, corrective action, responsible party, target date)
 * and a 3-pill status selector. `draft` holds the live editable values; onChange
 * lifts a field up to the section. Reset restores the scaffold suggestions. When
 * `canEdit` is false every control is disabled. Resolved entries render dimmed.
 */
export default function CapEntryCard({
  entry,
  draft,
  onChange,
  onReset,
  onArchive,
  canEdit,
  index = 0,
}) {
  const reduce = useReducedMotion()
  const sevMeta = complianceStatusMeta(entry.severity)
  const disabled = !canEdit || entry.isResolved

  const set = (field) => (e) => onChange(entry.ruleId, field, e.target.value)
  const SevIcon = entry.severity === 'material' ? ShieldAlert : AlertTriangle

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce ? undefined : { type: 'spring', stiffness: 260, damping: 22, delay: index * 0.04 }
      }
      className={`panel relative overflow-hidden p-5 pl-6 ${entry.isResolved ? 'opacity-70' : ''}`}
    >
      {/* The one actionable entry card: a Panel with a 2px severity mark. */}
      <span className={`tone-${sevMeta.palette} absolute inset-y-0 left-0 w-0.5 bg-current`} aria-hidden />

      {/* Header: severity + title + citation, resolved badge */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill variant="status" tone={sevMeta.palette} className="capitalize">
          <SevIcon size={11} aria-hidden="true" />
          {entry.severity}
        </Pill>
        {entry.isResolved && (
          <Pill variant="status" tone="good">
            <CheckCircle2 size={11} aria-hidden="true" /> Resolved
          </Pill>
        )}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink2">
          <BookOpen size={12} aria-hidden="true" />
          <span className="font-mono">{entry.citation}</span>
        </span>
      </div>

      <h4 className="text-heading font-semibold text-ink">{entry.title}</h4>

      {/* Read-only observation — a quoted block on the ground (ink left rule). */}
      <div className="mt-2 border-l-2 border-hair/[0.3] pl-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">Observation</p>
        <p className="mt-0.5 text-small leading-relaxed text-ink">{entry.observation}</p>
      </div>

      {/* Editable grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Root cause</label>
          <textarea
            className={`${inputCls} !h-auto min-h-[72px] resize-y py-2`}
            value={draft.rootCause}
            disabled={disabled}
            onChange={set('rootCause')}
            placeholder={entry.suggestedRootCause}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Corrective action</label>
          <textarea
            className={`${inputCls} !h-auto min-h-[88px] resize-y py-2`}
            value={draft.correctiveAction}
            disabled={disabled}
            onChange={set('correctiveAction')}
            placeholder={entry.suggestedCorrectiveAction}
          />
        </div>
        <div>
          <label className={labelCls}>Responsible party</label>
          <input
            className={inputCls}
            value={draft.responsibleParty}
            disabled={disabled}
            onChange={set('responsibleParty')}
            placeholder={entry.suggestedResponsibleParty}
          />
        </div>
        <div>
          <label className={labelCls}>Target date</label>
          <DatePicker
            className={inputCls}
            value={draft.targetDate}
            disabled={disabled}
            onChange={(v) => set('targetDate')({ target: { value: v } })}
          />
          {entry.suggestedTimeframe && !draft.targetDate && (
            <p className="mt-1.5 text-[12px] italic text-ink2">
              Suggested: {entry.suggestedTimeframe}
            </p>
          )}
        </div>
      </div>

      {/* Status selector + reset */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className={labelCls}>Status</span>
          <div className="seg" role="group" aria-label="Status">
            {CAP_STATUS_OPTIONS.map((opt) => {
              const active = draft.status === opt.value
              const m = capStatusMeta(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onChange(entry.ruleId, 'status', opt.value)}
                  className="seg-btn disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <i className={`mark tone-${m.palette} ${active ? '!text-white' : ''}`} aria-hidden="true" />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {canEdit && !entry.isResolved && (
          <button
            type="button"
            onClick={() => onReset(entry.ruleId)}
            className="btn btn-quiet btn-sm"
          >
            <RotateCcw size={13} aria-hidden="true" /> Reset to suggestion
          </button>
        )}

        {/* Resolved → dismiss (archive); archived → restore. */}
        {canEdit && entry.isResolved && onArchive && (
          <button
            type="button"
            onClick={() => onArchive(entry.ruleId, !entry.archivedAt)}
            className="btn btn-quiet btn-sm"
          >
            {entry.archivedAt ? (
              <>
                <ArchiveRestore size={13} /> Restore
              </>
            ) : (
              <>
                <Archive size={13} /> Dismiss
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  )
}

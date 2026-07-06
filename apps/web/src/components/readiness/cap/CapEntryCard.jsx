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
import StatusDot from '../../analytics/StatusDot.jsx'
import { complianceStatusMeta } from '../../../lib/complianceMeta.js'
import { CAP_STATUS_OPTIONS, capStatusMeta } from '../../../lib/capMeta.js'
import { activePillCls } from '../../../lib/activePill.js'
import DatePicker from '../../ui/DatePicker.jsx'

const labelCls =
  'mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted'
const inputCls =
  'w-full rounded-lg border border-border bg-white px-4 py-3 text-[16px] text-ink outline-none transition-all focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

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
      className={`card-soft relative overflow-hidden p-5 pl-6 ${
        entry.isResolved ? 'opacity-70' : ''
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${sevMeta.meta.rail}`} aria-hidden />

      {/* Header: severity + title + citation, resolved badge */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${sevMeta.meta.chip}`}
        >
          <SevIcon size={11} />
          {entry.severity}
        </span>
        {entry.isResolved && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
            <CheckCircle2 size={11} /> Resolved
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted/80">
          <BookOpen size={12} className="text-gold" />
          <span className="font-mono">{entry.citation}</span>
        </span>
      </div>

      <h4 className="font-serif text-[16px] font-semibold text-navy">{entry.title}</h4>

      {/* Read-only observation */}
      <div className="mt-2 rounded-lg border border-border bg-section px-4 py-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Observation
        </p>
        <p className="mt-1 text-[15px] leading-relaxed text-ink">{entry.observation}</p>
      </div>

      {/* Editable grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Root cause</label>
          <textarea
            className={`${inputCls} min-h-[72px] resize-y`}
            value={draft.rootCause}
            disabled={disabled}
            onChange={set('rootCause')}
            placeholder={entry.suggestedRootCause}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Corrective action</label>
          <textarea
            className={`${inputCls} min-h-[88px] resize-y`}
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
            <p className="mt-1.5 text-[13px] italic text-muted">
              Suggested: {entry.suggestedTimeframe}
            </p>
          )}
        </div>
      </div>

      {/* Status selector + reset */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className={labelCls}>Status</span>
          <div className="flex gap-2">
            {CAP_STATUS_OPTIONS.map((opt) => {
              const active = draft.status === opt.value
              const m = capStatusMeta(opt.value)
              return (
                <motion.button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  whileTap={reduce || disabled ? undefined : { scale: 0.96 }}
                  disabled={disabled}
                  onClick={() => onChange(entry.ruleId, 'status', opt.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-[14px] font-semibold uppercase tracking-[0.06em] transition-all ${
                    active ? activePillCls(m.palette) : 'border-border bg-section text-muted'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-gold/40'}`}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="inline-block shrink-0 rounded-full bg-white"
                      style={{ width: 7, height: 7 }}
                    />
                  ) : (
                    <StatusDot status={m.palette} size={7} />
                  )}
                  {opt.label}
                </motion.button>
              )
            })}
          </div>
        </div>

        {canEdit && !entry.isResolved && (
          <button
            type="button"
            onClick={() => onReset(entry.ruleId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-section px-3 py-2 text-[14px] font-semibold text-muted transition-colors hover:border-gold/40 hover:text-gold"
          >
            <RotateCcw size={13} /> Reset to suggestion
          </button>
        )}

        {/* Resolved → dismiss (archive); archived → restore. */}
        {canEdit && entry.isResolved && onArchive && (
          <button
            type="button"
            onClick={() => onArchive(entry.ruleId, !entry.archivedAt)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-section px-3 py-2 text-[14px] font-semibold text-muted transition-colors hover:border-gold/40 hover:text-gold"
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

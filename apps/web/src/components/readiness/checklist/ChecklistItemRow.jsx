// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — one checklist item. A status-colored left rail, serif label +
// guidance, a kind chip (procedure/document) + citation when a related rule is
// present, the inline LIVE 2A finding status (CONTEXT only, never the user's
// state), a 3-pill status control (Pending / Done / N/A), and a notes textarea.
// All controls disabled when !canEdit (viewer read-only).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen, Activity } from 'lucide-react'
import StatusDot from '../../analytics/StatusDot.jsx'
import { complianceStatusMeta } from '../../../lib/complianceMeta.js'
import {
  CHECKLIST_STATUS_OPTIONS,
  checklistStatusMeta,
  KIND_LABELS,
} from '../../../lib/ChecklistMeta.js'
import { activePillCls } from '../../../lib/activePill.js'

const inputCls =
  'w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-[13px] text-ink outline-none transition-all focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'


export default function ChecklistItemRow({ item, draft, onChange, canEdit, index = 0 }) {
  const reduce = useReducedMotion()
  const status = draft?.status ?? item.status ?? 'pending'
  const notes = draft?.notes ?? ''
  const statusMetaBundle = checklistStatusMeta(status)
  const disabled = !canEdit

  // Citation lives in the guidance string for procedures; surface the related
  // finding status as read-only context.
  const findingMeta = item.findingStatus ? complianceStatusMeta(item.findingStatus) : null

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce ? undefined : { type: 'spring', stiffness: 260, damping: 22, delay: index * 0.03 }
      }
      className="card-soft relative overflow-hidden p-4 pl-5"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${statusMetaBundle.meta.rail}`} aria-hidden />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                item.kind === 'document'
                  ? 'border-navy/20 bg-navy/[0.04] text-navy'
                  : 'border-gold/30 bg-gold/10 text-gold'
              }`}
            >
              {KIND_LABELS[item.kind] ?? item.kind}
            </span>
            {findingMeta && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${findingMeta.meta.chip}`}
                title="Live compliance status for this rule (context only)"
              >
                <Activity size={10} /> Live: {findingMeta.label}
              </span>
            )}
          </div>
          <h4 className="font-serif text-[15px] font-semibold text-navy">{item.label}</h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{item.guidance}</p>
          {item.relatedRuleId && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted/80">
              <BookOpen size={12} className="text-gold" />
              <span className="font-mono">{item.relatedRuleId}</span>
            </p>
          )}
        </div>
      </div>

      {/* Status control */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {CHECKLIST_STATUS_OPTIONS.map((opt) => {
          const active = status === opt.value
          const m = checklistStatusMeta(opt.value)
          const activeCls = activePillCls(m.palette)
          return (
            <motion.button
              key={opt.value}
              type="button"
              aria-pressed={active}
              whileTap={reduce || disabled ? undefined : { scale: 0.96 }}
              disabled={disabled}
              onClick={() => onChange(item.id, 'status', opt.value)}
              className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] transition-all ${
                active ? activeCls : 'border-border bg-section text-muted'
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

      {/* Notes */}
      <div className="mt-3">
        <textarea
          className={`${inputCls} min-h-[52px] resize-y`}
          value={notes}
          disabled={disabled}
          onChange={(e) => onChange(item.id, 'notes', e.target.value)}
          placeholder={canEdit ? 'Notes (optional) — who, where it lives, follow-up…' : ''}
        />
      </div>
    </motion.div>
  )
}

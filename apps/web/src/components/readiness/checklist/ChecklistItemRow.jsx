// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — one checklist item. A status-colored left rail, serif label +
// guidance, a kind chip (procedure/document) + citation when a related rule is
// present, the inline LIVE 2A finding status (CONTEXT only, never the user's
// state), a 3-pill status control (Pending / Done / N/A), and a notes textarea.
// All controls disabled when !canEdit (viewer read-only).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { complianceStatusMeta } from '../../../lib/complianceMeta.js'
import {
  CHECKLIST_STATUS_OPTIONS,
  checklistStatusMeta,
  KIND_LABELS,
} from '../../../lib/ChecklistMeta.js'
import { Pill } from '../../ui/surface/index.js'

const inputCls = 'b2-input disabled:cursor-not-allowed disabled:bg-ground disabled:text-ink2'


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
      className="relative border-b border-hair py-4 pl-4"
    >
      {/* A ruled row on the ground; the status is the 2px rail on the left. */}
      <span className={`tone-${statusMetaBundle.palette} absolute bottom-4 left-0 top-4 w-0.5 bg-current`} aria-hidden />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
              {KIND_LABELS[item.kind] ?? item.kind}
            </span>
            {findingMeta && (
              <Pill
                variant="status"
                tone={findingMeta.palette}
                title="Live compliance status for this rule (context only)"
              >
                <Activity size={10} aria-hidden="true" /> Live: {findingMeta.label}
              </Pill>
            )}
          </div>
          <h4 className="text-[15px] font-semibold text-ink">{item.label}</h4>
          <p className="mt-0.5 max-w-4xl text-small leading-relaxed text-ink2">{item.guidance}</p>
        </div>
      </div>

      {/* Status control */}
      <div className="seg mt-3" role="group" aria-label={`Status for ${item.label}`}>
        {CHECKLIST_STATUS_OPTIONS.map((opt) => {
          const active = status === opt.value
          const m = checklistStatusMeta(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(item.id, 'status', opt.value)}
              className="seg-btn disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i className={`mark tone-${m.palette} ${active ? '!text-white' : ''}`} aria-hidden="true" />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Notes */}
      <div className="mt-3">
        <textarea
          className={`${inputCls} !h-auto min-h-[52px] resize-y py-2`}
          aria-label={`Notes for ${item.label}`}
          value={notes}
          disabled={disabled}
          onChange={(e) => onChange(item.id, 'notes', e.target.value)}
          placeholder={canEdit ? 'Notes (optional) — who, where it lives, follow-up…' : ''}
        />
      </div>
    </motion.div>
  )
}

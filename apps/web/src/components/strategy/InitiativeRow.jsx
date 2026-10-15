// ─────────────────────────────────────────────────────────────────────────────
// InitiativeRow — one initiative under a goal, in the Initiatives register: a
// RULED ROW on the ground (Premium UI P4). Title + goal context, the owner, a
// status Pill, an optional linked-task rollup rule ({done}/{total}), and a
// watch-marked "stale" Pill when it hasn't moved in >60 days (staleDays supplied
// from the frozen summary). The parent renders these inside a `.b1-list`.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { User, Pencil, Trash2 } from 'lucide-react'
import { Pill } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'

const STATUS_PILL = {
  planned: { label: 'Planned', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'hue' },
  blocked: { label: 'Blocked', tone: 'risk' },
  done: { label: 'Done', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export default function InitiativeRow({ initiative, canEdit, onEdit, onDelete }) {
  const reduce = useReducedMotion()
  const status = STATUS_PILL[initiative.status] ?? STATUS_PILL.planned
  const tc = initiative.linkedTaskCounts
  const hasTasks = tc && typeof tc.total === 'number' && tc.total > 0
  const taskPct = hasTasks ? Math.round((tc.done / tc.total) * 100) : 0
  const stale = typeof initiative.staleDays === 'number' && initiative.staleDays > 60

  return (
    <li className="group b1-row !flex-nowrap py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-semibold text-ink [overflow-wrap:anywhere] ${initiative.status === 'cancelled' ? 'line-through opacity-60' : ''}`}
          >
            {initiative.title}
          </span>
          <Pill variant="status" tone={status.tone}>
            {status.label}
          </Pill>
          {stale ? (
            <Pill variant="status" tone="watch">
              Stale {initiative.staleDays}d
            </Pill>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink2">
          {initiative.goalTitle ? <span className="[overflow-wrap:anywhere]">↳ {initiative.goalTitle}</span> : null}
          <span className="inline-flex items-center gap-1">
            <User size={12} aria-hidden="true" />
            {initiative.ownerName ?? 'Unassigned'}
          </span>
        </div>
      </div>

      {/* linked-task rollup rule */}
      {hasTasks ? (
        <div className="hidden w-32 shrink-0 sm:block">
          <div className="b1-prog">
            <motion.span
              className="b1-prog-fill origin-left"
              style={{ '--pct': taskPct }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <div className="mt-1 text-right text-[11px] font-semibold tabular-nums text-ink2">
            {tc.done}/{tc.total} tasks
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="dt-actions flex shrink-0 items-center gap-1 group-hover:opacity-100 group-focus-within:opacity-100">
          {onEdit ? (
            <button type="button" onClick={() => onEdit(initiative)} aria-label={`Edit ${initiative.title}`} className="b1-icon-act">
              <Pencil size={14} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(initiative)}
              aria-label={`Delete ${initiative.title}`}
              className="b1-icon-act b1-icon-act-danger"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

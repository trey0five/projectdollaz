// ─────────────────────────────────────────────────────────────────────────────
// InitiativeRow — one initiative under a goal, in the Initiatives register. Title
// + goal context, an owner chip, a status pill, an optional linked-task rollup
// mini-bar ({done}/{total}), and an amber "stale" badge when it hasn't moved in
// >60 days (staleDays supplied from the frozen summary). Light command-center
// surface, on-theme. Reduced-motion respected by the parent list stagger.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { User, Clock, Pencil, Trash2 } from 'lucide-react'

const STATUS_PILL = {
  planned: { label: 'Planned', cls: 'border-rule/60 bg-section text-muted' },
  in_progress: { label: 'In progress', cls: 'border-navy-soft/40 bg-navy-soft/10 text-navy-soft' },
  blocked: { label: 'Blocked', cls: 'border-danger/30 bg-danger/10 text-danger' },
  done: { label: 'Done', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled', cls: 'border-rule/60 bg-section text-muted line-through' },
}

export default function InitiativeRow({ initiative, index = 0, canEdit, onEdit, onDelete }) {
  const reduce = useReducedMotion()
  const status = STATUS_PILL[initiative.status] ?? STATUS_PILL.planned
  const tc = initiative.linkedTaskCounts
  const hasTasks = tc && typeof tc.total === 'number' && tc.total > 0
  const taskPct = hasTasks ? Math.round((tc.done / tc.total) * 100) : 0
  const stale = typeof initiative.staleDays === 'number' && initiative.staleDays > 60

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.04 }}
      className="group flex items-center gap-3 border-t border-rule/50 px-1 py-3 first:border-t-0"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-navy">{initiative.title}</span>
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${status.cls}`}>
            {status.label}
          </span>
          {stale ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5e00]">
              <Clock size={11} /> Stale {initiative.staleDays}d
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {initiative.goalTitle ? <span className="truncate">↳ {initiative.goalTitle}</span> : null}
          <span className="inline-flex items-center gap-1">
            <User size={12} />
            {initiative.ownerName ?? 'Unassigned'}
          </span>
        </div>
      </div>

      {/* linked-task rollup mini-bar */}
      {hasTasks ? (
        <div className="hidden w-32 shrink-0 sm:block">
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-rule/50 bg-section">
            <motion.div
              className="h-full bg-gold-gradient"
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${taskPct}%` }}
              transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-1 text-right text-[11px] font-semibold text-muted">
            {tc.done}/{tc.total} tasks
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex shrink-0 items-center gap-1.5 opacity-60 transition group-hover:opacity-100">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(initiative)}
              aria-label={`Edit ${initiative.title}`}
              className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
            >
              <Pencil size={14} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(initiative)}
              aria-label={`Delete ${initiative.title}`}
              className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  )
}

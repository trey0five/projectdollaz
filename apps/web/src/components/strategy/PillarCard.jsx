// ─────────────────────────────────────────────────────────────────────────────
// PillarCard — a strategic pillar's rollup tile. An animated gold-gradient rollup
// bar (motion width 0→progressPct), a big serif progress %, a pace-severity chip,
// and its goal-count breakdown. Hover raise + a diagonal glint sweep (the premium
// card language). Parent staggers the grid on mount. Reduced-motion respected.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Layers, Pencil, Trash2 } from 'lucide-react'
import { CountUp } from '../ui/briefingFx.jsx'
import PaceChip, { paceMeta } from './PaceChip.jsx'

export default function PillarCard({ pillar, index = 0, canEdit, onEdit, onDelete }) {
  const reduce = useReducedMotion()
  const pct = Math.round(Math.min(Math.max(pillar.progressPct ?? 0, 0), 1) * 100)
  const meta = paceMeta(pillar.paceStatus)
  const gc = pillar.goalCounts ?? {}
  const goalTotal = gc.total ?? 0

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.07, type: 'spring', stiffness: 240, damping: 24 }}
      whileHover={reduce ? undefined : { y: -2 }}
      className="card-vital group relative flex flex-col p-4 sm:p-5"
    >
      <div className="relative z-[3] flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: meta.hex }}
            >
              <Layers size={16} />
            </span>
            <h3 className="min-w-0 truncate font-serif text-[17px] font-semibold text-navy">{pillar.name}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PaceChip status={pillar.paceStatus} />
            {canEdit ? (
              <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(pillar)}
                    aria-label={`Edit ${pillar.name}`}
                    className="rounded-lg border border-rule/60 bg-white/70 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
                  >
                    <Pencil size={13} />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(pillar)}
                    aria-label={`Delete ${pillar.name}`}
                    className="rounded-lg border border-rule/60 bg-white/70 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-end gap-1">
          <span className="font-serif text-[30px] font-semibold leading-none text-navy">
            <CountUp value={pct} duration={900} />
          </span>
          <span className="pb-1 text-[15px] font-semibold text-muted">%</span>
        </div>

        {/* rollup bar */}
        <div className="h-2.5 w-full overflow-hidden rounded-full border border-rule/50 bg-section">
          <motion.div
            className="h-full bg-gold-gradient"
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: reduce ? 0 : 0.9, ease: 'easeOut' }}
          />
        </div>

        {/* goal-count breakdown */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-muted">
          <span>
            {goalTotal} goal{goalTotal === 1 ? '' : 's'}
          </span>
          {gc.onTrack ? <span className="text-emerald-600">{gc.onTrack} on track</span> : null}
          {gc.atRisk ? <span className="text-[#7a5e00]">{gc.atRisk} at risk</span> : null}
          {gc.behind ? <span className="text-danger">{gc.behind} behind</span> : null}
          {gc.achieved ? <span className="text-emerald-600">{gc.achieved} achieved</span> : null}
        </div>
      </div>
    </motion.div>
  )
}

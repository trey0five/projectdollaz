// ─────────────────────────────────────────────────────────────────────────────
// PillarCard — a strategic pillar's rollup, rendered as a SECTION on the ground
// (Premium UI P4: pillars are sections, not tiles). The label rule names the
// pillar; the aside carries its pace Pill and the edit actions; beneath sit a
// Garamond count-up of its progress, a thin progress rule in the module hue and
// the goal-count breakdown with 2px status marks. Reduced-motion respected.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { CountUp } from '../ui/briefingFx.jsx'
import { Section } from '../ui/surface/index.js'
import PaceChip from './PaceChip.jsx'
import '../../styles/pending/b1-domain.css'

function Count({ n, tone, label }) {
  if (!n) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`mark tone-${tone}`} aria-hidden="true" />
      {n} {label}
    </span>
  )
}

export default function PillarCard({ pillar, canEdit, onEdit, onDelete }) {
  const reduce = useReducedMotion()
  const pct = Math.round(Math.min(Math.max(pillar.progressPct ?? 0, 0), 1) * 100)
  const gc = pillar.goalCounts ?? {}
  const goalTotal = gc.total ?? 0

  return (
    <Section
      className="!mt-0"
      label={pillar.name}
      aside={
        canEdit ? (
          <>
            {canEdit && onEdit ? (
              <button type="button" onClick={() => onEdit(pillar)} aria-label={`Edit ${pillar.name}`} className="b1-icon-act">
                <Pencil size={13} />
              </button>
            ) : null}
            {canEdit && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(pillar)}
                aria-label={`Delete ${pillar.name}`}
                className="b1-icon-act b1-icon-act-danger"
              >
                <Trash2 size={13} />
              </button>
            ) : null}
          </>
        ) : null
      }
    >
      {/* The pace verdict on its own line, so sibling pillars' figures align. */}
      <div className="mb-2.5">
        <PaceChip status={pillar.paceStatus} />
      </div>
      <div className="flex items-baseline">
        <span className="font-serif text-[30px] font-medium leading-none tabular-nums text-ink">
          <CountUp value={pct} duration={900} />
        </span>
        <span className="text-[15px] font-semibold text-ink2">%</span>
      </div>

      <div className="b1-prog mt-3">
        <motion.span
          className="b1-prog-fill origin-left"
          style={{ '--pct': pct }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-ink2">
        <span className="tabular-nums">
          {goalTotal} goal{goalTotal === 1 ? '' : 's'}
        </span>
        <Count n={gc.onTrack} tone="good" label="on track" />
        <Count n={gc.atRisk} tone="watch" label="at risk" />
        <Count n={gc.behind} tone="risk" label="behind" />
        <Count n={gc.achieved} tone="good" label="achieved" />
      </div>
    </Section>
  )
}

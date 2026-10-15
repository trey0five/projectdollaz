// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — the readiness progress rollup. A 2px progress rule whose
// width tracks pctComplete (done + na resolved) and whose DONE segment is shown
// distinctly so marking everything "n/a" cannot masquerade as fully prepared.
// done/na/pending counts are Stats with health-palette marks; the headline reports
// "X resolved / Y" with the done count called out. Animates the bar width
// (reduce -> instant).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { StatStrip, Stat } from '../../ui/surface/index.js'

// Premium UI P4: the progress is a StatStrip (resolved / done / N/A / pending,
// count-ups, 2px marks) over a 2px stacked progress rule — primary blue for
// done, ink for N/A. No flashy card, no gold.
export default function ChecklistProgress({ rollup }) {
  const reduce = useReducedMotion()
  if (!rollup) return null
  const { total, done, na, pending, pctComplete } = rollup
  const donePct = total > 0 ? (done / total) * 100 : 0
  const naPct = total > 0 ? (na / total) * 100 : 0

  return (
    <div>
      <StatStrip cols={4} className="stats-compact">
        <Stat label="Resolved" value={`${pctComplete}%`} note={`${done + na} of ${total}`} status={pctComplete === 100 ? 'good' : undefined} />
        <Stat label="Done" value={done} status={done > 0 ? 'good' : undefined} />
        <Stat label="Not applicable" value={na} />
        <Stat label="Pending" value={pending} status={pending > 0 ? 'neutral' : undefined} />
      </StatStrip>

      {/* Stacked 2px rule: blue = done, ink = n/a. Together they fill pctComplete. */}
      <div
        className="mt-3 flex h-0.5 w-full bg-ink/[0.08]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctComplete}
        aria-label="Checklist resolved"
      >
        <motion.div
          className="h-full bg-[#2563EB]"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${donePct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.div
          className="h-full bg-ink/40"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${naPct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

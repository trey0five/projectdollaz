import { AlertTriangle } from 'lucide-react'
import { complianceStatusMeta } from '../../lib/complianceMeta.js'
import { Section, StatStrip, Stat } from '../ui/surface/index.js'

const COUNT_ORDER = [
  { key: 'pass', status: 'pass' },
  { key: 'reportable', status: 'reportable' },
  { key: 'material', status: 'material' },
  { key: 'watch', status: 'watch' },
  { key: 'needs_data', status: 'needs_data' },
  { key: 'manual', status: 'manual' },
  { key: 'not_applicable', status: 'not_applicable' },
]

/**
 * Overall readiness rollup: the per-status counts as a StatStrip (count-ups,
 * vertical rules, a 2px status mark per state from the health palette), plus a
 * Material -> Corrective Action Plan callout (a NOTE only — 2D owns the actual
 * CAP document). Premium UI P4: no flashy card, no tinted chips.
 */
export default function ReadinessSummary({ summary }) {
  if (!summary) return null
  const counts = summary.counts ?? {}

  return (
    <Section label="Overall readiness" className="!mt-0">
      <StatStrip cols={4} className="stats-wrap stats-compact">
        {COUNT_ORDER.map(({ key, status }) => {
          const n = counts[key] ?? 0
          const { palette, label } = complianceStatusMeta(status)
          return (
            <Stat
              key={key}
              label={label}
              value={n}
              status={n > 0 ? palette : undefined}
              className={n === 0 ? 'opacity-60' : ''}
            />
          )
        })}
      </StatStrip>

      {summary.hasMaterial && (
        <p className="b2-callout b2-risk mt-4">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            <span className="font-semibold">Material exception present.</span> A Corrective Action Plan
            will be required for this engagement. (The CAP document itself is produced separately.)
          </span>
        </p>
      )}
    </Section>
  )
}

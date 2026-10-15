// Compliance status vital for the home command center. Premium UI P4: the same
// `Stat` grammar HeroVitalTile now wears (label caps / Garamond value / a 2px
// status mark / a foot line) — no card shell, no gold medallion, no hover lift —
// driven by the useCompliance summary instead of a metric. Clicking navigates to
// /readiness. Status reuses the shared health palette (MARK: risk/watch/good).
import { useNavigate } from 'react-router-dom'
import CountUp from '../CountUp.jsx'
import { Pill } from '../ui/surface/index.js'

export default function ComplianceVitalTile({ summary, loading }) {
  const navigate = useNavigate()

  const counts = summary?.counts ?? {}
  const material = counts.material ?? 0
  const reportable = counts.reportable ?? 0
  const requiresAup = Boolean(summary?.requiresAup)

  // Map to the shared health palette.
  const status = summary?.hasMaterial ? 'risk' : reportable > 0 ? 'watch' : 'good'
  const statusLabel = status === 'risk' ? 'Action needed' : status === 'watch' ? 'Review items' : 'On track'

  const sub = summary
    ? requiresAup
      ? 'AUP required for this period'
      : material > 0 || reportable > 0
        ? `${material} material · ${reportable} reportable`
        : 'No exceptions found'
    : 'Readiness checks'

  const figure = material > 0 ? material : reportable

  return (
    <button
      type="button"
      onClick={() => navigate('/readiness')}
      className="stat stat-link w-full text-left"
      aria-label="Review readiness details"
    >
      <p className="stat-label">Review readiness</p>
      {loading ? (
        <div className="mt-2 space-y-2">
          <div className="shimmer-bar h-7 w-24 rounded-sm" />
          <div className="shimmer-bar h-3 w-36 rounded-sm" />
        </div>
      ) : (
        <>
          <span className="stat-value num">
            {material > 0 || reportable > 0 ? (
              <>
                <CountUp value={figure} />
                <span className="stat-unit">{material > 0 ? 'material' : 'reportable'}</span>
              </>
            ) : summary ? (
              'All clear'
            ) : (
              '—'
            )}
          </span>
          {summary ? <span className={`stat-mark tone-${status}`} aria-hidden="true" /> : null}
          <div className="stat-foot">
            {summary ? (
              <Pill variant="status" tone={status}>
                {statusLabel}
              </Pill>
            ) : null}
            <span>{sub}</span>
          </div>
        </>
      )}
    </button>
  )
}

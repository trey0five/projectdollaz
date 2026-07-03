// Compliance status vital tile for the home command center. Built on-theme to
// match HeroVitalTile (status-colored rail, soft card, hover lift) but driven by
// the useCompliance summary instead of a metric. Reuses the health palette via
// statusMeta — NO new colors. Clicking navigates to /readiness.
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import StatusDot from '../analytics/StatusDot.jsx'
import { statusMeta } from '../../lib/metricMeta.js'

export default function ComplianceVitalTile({ summary, loading, index = 0 }) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()

  const counts = summary?.counts ?? {}
  const material = counts.material ?? 0
  const reportable = counts.reportable ?? 0
  const requiresAup = Boolean(summary?.requiresAup)

  // Map to the shared health palette.
  const status = summary?.hasMaterial ? 'risk' : reportable > 0 ? 'watch' : 'good'
  const meta = statusMeta(status)
  const Icon = status === 'risk' ? ShieldAlert : status === 'watch' ? ShieldQuestion : ShieldCheck
  const statusLabel = status === 'risk' ? 'Action needed' : status === 'watch' ? 'Review items' : 'On track'

  const sub = summary
    ? requiresAup
      ? 'AUP required for this period'
      : material > 0 || reportable > 0
        ? `${material} material · ${reportable} reportable`
        : 'No exceptions found'
    : 'Readiness checks'

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/readiness')}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 240, damping: 22 }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="card-vital group relative flex w-full flex-col overflow-hidden p-4 text-left sm:p-5"
      aria-label="Review readiness details"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 z-[1] w-1 ${meta.rail}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-[0_3px_10px_-2px_rgba(184,150,80,0.55)] transition-transform duration-300 group-hover:scale-105 sm:h-10 sm:w-10">
          <Icon size={18} />
        </span>
        {summary && (
          <>
            <span
              className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] sm:inline-flex ${meta.chip}`}
            >
              <StatusDot status={status} size={7} />
              {statusLabel}
            </span>
            <span className="shrink-0 sm:hidden">
              <StatusDot status={status} size={11} />
            </span>
          </>
        )}
      </div>
      <h3 className="mt-2.5 line-clamp-2 font-sans text-[13px] font-semibold uppercase leading-snug tracking-[0.1em] text-muted">
        Review Readiness
      </h3>

      {loading ? (
        <div className="mt-5 space-y-3">
          <div className="shimmer-bar h-9 w-28 rounded" />
          <div className="shimmer-bar h-3 w-40 rounded" />
        </div>
      ) : (
        <>
          <div className="mt-3 sm:mt-4">
            {material > 0 || reportable > 0 ? (
              <span className="flex items-baseline gap-1.5">
                <span className="gold-text font-serif text-[30px] font-semibold leading-none sm:text-[40px]">
                  {material > 0 ? material : reportable}
                </span>
                <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted sm:text-[14px]">
                  {material > 0 ? 'material' : 'reportable'}
                </span>
              </span>
            ) : (
              <span className="gold-text font-serif text-[24px] font-semibold leading-none sm:text-[30px]">
                {summary ? 'All clear' : '—'}
              </span>
            )}
          </div>
          <p className={`mt-2.5 text-[14px] leading-snug sm:mt-3 ${requiresAup ? meta.text : 'text-muted'}`}>{sub}</p>
        </>
      )}
    </motion.button>
  )
}

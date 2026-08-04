// ─────────────────────────────────────────────────────────────────────────────
// VsPlanKpi — the headline enrollment-vs-plan card. Reads the /summary response
// ({ latest, vsPlan }) and shows actual headcount, the plan, and the gap with a
// good/watch/risk band matching the enrollment_vs_plan metric (good ≥ -2%, watch
// down to -5%, risk below). Purely presentational (no fetch). Navy/gold theme.
// ─────────────────────────────────────────────────────────────────────────────
import { TrendingUp, TrendingDown, Target } from 'lucide-react'
import { healthStatus, bandsFor } from '@finrep/analytics'
import { formatMetricValue } from '../../lib/metricMeta.js'

// Band comes from the CANONICAL enrollment_vs_plan registry bands (good ≥ -2%, watch
// to -5%, risk below) via healthStatus — never hardcoded here, so this card can never
// disagree with the dashboard/briefing when the band is re-tuned.
// Status is a TINT + RING laid over the shared card, not a card style of its own.
// These three tiles were the last KPI row still wearing the pre-card-soft
// vocabulary (`rounded-2xl border-2 border-rule/50 bg-white shadow-card`), so
// after the depth sweep /enrollment read flat next to every other module's
// cushioned tiles. index.css documents `.card-soft` as the replacement for
// exactly those heavy border-2 boxes; card contract §5 says shared components
// first, never a per-page fork.
const BAND = {
  good: { ring: 'ring-1 ring-inset ring-emerald-300/70 bg-emerald-50/70', text: 'text-emerald-700', label: 'On plan' },
  watch: { ring: 'ring-1 ring-inset ring-gold/40 bg-gold/[0.07]', text: 'text-[#7a5e00]', label: 'Below plan' },
  risk: { ring: 'ring-1 ring-inset ring-danger/30 bg-danger/[0.07]', text: 'text-danger', label: 'Well below plan' },
  neutral: { ring: '', text: 'text-muted', label: 'No plan set' },
}

export default function VsPlanKpi({ summary }) {
  const latest = summary?.latest ?? null
  const vsPlan = summary?.vsPlan ?? null
  const actual = latest?.totalEnrolled ?? null
  const gap = vsPlan?.gap ?? null
  const gapPct = vsPlan?.gapPct ?? null
  const band = BAND[healthStatus(gapPct, bandsFor('enrollment_vs_plan'), gapPct != null)]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="card-soft min-w-0 p-5 sm:p-6">
        <p className="min-w-0 break-words text-[11.5px] font-semibold uppercase leading-snug tracking-[0.12em] text-muted">
          Enrollment now
        </p>
        <p className="mt-1.5 min-w-0 break-words font-serif text-3xl font-bold text-navy">
          {actual !== null ? actual.toLocaleString('en-US') : '—'}
        </p>
        <p className="mt-1 min-w-0 break-words text-[13px] leading-snug text-muted">
          {latest?.observedOn ? `As of ${latest.observedOn}` : 'No roster yet'}
        </p>
      </div>

      <div className="card-soft min-w-0 p-5 sm:p-6">
        <p className="flex min-w-0 items-start gap-1.5 text-[11.5px] font-semibold uppercase leading-snug tracking-[0.12em] text-muted">
          <Target size={13} className="mt-px shrink-0 text-gold" />
          <span className="min-w-0 break-words">Plan</span>
        </p>
        <p className="mt-1.5 min-w-0 break-words font-serif text-3xl font-bold text-navy">
          {vsPlan?.planTotal != null ? vsPlan.planTotal.toLocaleString('en-US') : '—'}
        </p>
        <p className="mt-1 min-w-0 break-words text-[13px] leading-snug text-muted">
          {vsPlan?.planTotal != null
            ? 'From your budget / enrollment plan'
            : 'Set a plan in Budget or Enrollment & aid'}
        </p>
      </div>

      <div className={`card-soft min-w-0 p-5 sm:p-6 ${band.ring}`}>
        <p
          className={`min-w-0 break-words text-[11.5px] font-semibold uppercase leading-snug tracking-[0.12em] ${band.text}`}
        >
          {band.label}
        </p>
        <p
          className={`mt-1.5 flex min-w-0 items-center gap-1.5 break-words font-serif text-3xl font-bold ${band.text}`}
        >
          {gap != null && gap < 0 ? (
            <TrendingDown size={22} className="shrink-0" />
          ) : (
            <TrendingUp size={22} className="shrink-0" />
          )}
          {formatMetricValue(gapPct, 'percent')}
        </p>
        <p className={`mt-1 min-w-0 break-words text-[13px] leading-snug ${band.text}`}>
          {gap != null
            ? `${gap > 0 ? '+' : ''}${gap.toLocaleString('en-US')} vs plan`
            : 'Needs a roster and a plan'}
        </p>
      </div>
    </div>
  )
}

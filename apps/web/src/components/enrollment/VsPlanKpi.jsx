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
const BAND = {
  good: { ring: 'border-emerald-300/70 bg-emerald-50', text: 'text-emerald-700', label: 'On plan' },
  watch: { ring: 'border-gold/40 bg-gold/10', text: 'text-[#7a5e00]', label: 'Below plan' },
  risk: { ring: 'border-danger/30 bg-danger/10', text: 'text-danger', label: 'Well below plan' },
  neutral: { ring: 'border-rule/60 bg-section', text: 'text-muted', label: 'No plan set' },
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
      <div className="rounded-2xl border-2 border-rule/50 bg-white p-5 shadow-card">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          Enrollment now
        </p>
        <p className="mt-1.5 font-serif text-3xl font-bold text-navy">
          {actual !== null ? actual.toLocaleString('en-US') : '—'}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {latest?.observedOn ? `As of ${latest.observedOn}` : 'No roster yet'}
        </p>
      </div>

      <div className="rounded-2xl border-2 border-rule/50 bg-white p-5 shadow-card">
        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          <Target size={13} className="text-gold" /> Plan
        </p>
        <p className="mt-1.5 font-serif text-3xl font-bold text-navy">
          {vsPlan?.planTotal != null ? vsPlan.planTotal.toLocaleString('en-US') : '—'}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {vsPlan?.planTotal != null
            ? 'From your budget / enrollment plan'
            : 'Set a plan in Budget or Enrollment & aid'}
        </p>
      </div>

      <div className={`rounded-2xl border-2 p-5 shadow-card ${band.ring}`}>
        <p className={`text-[11.5px] font-semibold uppercase tracking-[0.12em] ${band.text}`}>
          {band.label}
        </p>
        <p className={`mt-1.5 flex items-center gap-1.5 font-serif text-3xl font-bold ${band.text}`}>
          {gap != null && gap < 0 ? <TrendingDown size={22} /> : <TrendingUp size={22} />}
          {formatMetricValue(gapPct, 'percent')}
        </p>
        <p className={`mt-1 text-[13px] ${band.text}`}>
          {gap != null
            ? `${gap > 0 ? '+' : ''}${gap.toLocaleString('en-US')} vs plan`
            : 'Needs a roster and a plan'}
        </p>
      </div>
    </div>
  )
}

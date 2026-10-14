// ─────────────────────────────────────────────────────────────────────────────
// VsPlanKpi — the headline enrollment-vs-plan detail. Reads the /summary response
// ({ latest, vsPlan }) and shows actual headcount, the plan, and the gap with a
// good/watch/risk band matching the enrollment_vs_plan metric (good ≥ -2%, watch
// down to -5%, risk below). Purely presentational (no fetch).
//
// PREMIUM UI P4: three `Stat`s in a `StatStrip` on the ground — the SHARED
// surface vocabulary, never a per-page card fork (card contract §5). Status is
// the Stat's 2px mark + a status Pill; the text stays ink. Labels wrap, never
// truncate.
// ─────────────────────────────────────────────────────────────────────────────
import { healthStatus, bandsFor } from '@finrep/analytics'
import { formatMetricValue } from '../../lib/metricMeta.js'
import { StatStrip, Stat, Section } from '../ui/surface/index.js'
import { fmtDay } from './EnrollmentHero.jsx'

// Band comes from the CANONICAL enrollment_vs_plan registry bands (good ≥ -2%, watch
// to -5%, risk below) via healthStatus — never hardcoded here, so this strip can
// never disagree with the dashboard/briefing when the band is re-tuned.
const BAND_LABEL = {
  good: 'On plan',
  watch: 'Below plan',
  risk: 'Well below plan',
  neutral: 'No plan set',
}

export default function VsPlanKpi({ summary }) {
  const latest = summary?.latest ?? null
  const vsPlan = summary?.vsPlan ?? null
  const actual = latest?.totalEnrolled ?? null
  const gap = vsPlan?.gap ?? null
  const gapPct = vsPlan?.gapPct ?? null
  const band = healthStatus(gapPct, bandsFor('enrollment_vs_plan'), gapPct != null)
  const tone = band === 'neutral' ? null : band

  return (
    <Section label="Against plan">
      <StatStrip cols={3} className="stats-wrap !grid-cols-1 sm:!grid-cols-3">
        <Stat
          label="Enrollment now"
          value={actual !== null ? actual : '—'}
          note={latest?.observedOn ? `As of ${fmtDay(latest.observedOn) ?? latest.observedOn}` : 'No roster yet'}
        />
        <Stat
          label="Plan"
          value={vsPlan?.planTotal != null ? vsPlan.planTotal : '—'}
          note={vsPlan?.planTotal != null ? 'From your budget / enrollment plan' : 'Set a plan in Budget or Enrollment & aid'}
        />
        <Stat
          label={BAND_LABEL[band] ?? 'vs plan'}
          value={gapPct != null ? formatMetricValue(gapPct, 'percent') : '—'}
          status={tone}
          delta={gap != null ? { text: `${gap > 0 ? '+' : ''}${gap.toLocaleString('en-US')} vs plan`, tone: tone ?? 'neutral' } : null}
          note={gap == null ? 'Needs a roster and a plan' : null}
        />
      </StatStrip>
    </Section>
  )
}

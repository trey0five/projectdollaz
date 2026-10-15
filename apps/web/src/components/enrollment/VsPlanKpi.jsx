// ─────────────────────────────────────────────────────────────────────────────
// VsPlanKpi — the enrollment-vs-plan summary tile. Reads the /summary response
// ({ latest, vsPlan }) and states the gap against the plan with a good/watch/
// risk verdict matching the enrollment_vs_plan metric (good ≥ -2%, watch down
// to -5%, risk below). Purely presentational (no fetch).
//
// AURORA (2026-10-15): one row tile in the "Students by grade" stack — the
// gap as the title, the share and the plan as one short line, the verdict
// pill in the foot. The band above carries the same figures as glass cards;
// this tile is the gap said in words beside the grades that carry it. Status
// is tone + pill (word + icon); the text stays ink. Labels wrap, never truncate.
// ─────────────────────────────────────────────────────────────────────────────
import { Target } from 'lucide-react'
import { healthStatus, bandsFor } from '@finrep/analytics'
import { formatMetricValue } from '../../lib/metricMeta.js'
import { AuroraTile } from '../ui/aurora/index.js'
import { StatStrip, Stat } from '../ui/surface/index.js'

// Band comes from the CANONICAL enrollment_vs_plan registry bands (good ≥ -2%, watch
// to -5%, risk below) via healthStatus — never hardcoded here, so this tile can
// never disagree with the dashboard/briefing when the band is re-tuned. The
// pill speaks the band's own vocabulary (Good / Watch / At risk) — the same
// word the band's "Gap to plan" card prints for the same metric.

export default function VsPlanKpi({ summary }) {
  const vsPlan = summary?.vsPlan ?? null
  const gap = vsPlan?.gap ?? null
  const gapPct = vsPlan?.gapPct ?? null
  const planTotal = vsPlan?.planTotal ?? null
  const band = healthStatus(gapPct, bandsFor('enrollment_vs_plan'), gapPct != null)
  const tone = band === 'neutral' ? null : band

  // No gap to state: the shared Stat's honest em-dash + why, never a zero.
  if (gap == null || planTotal == null) {
    return (
      <StatStrip cols={1} className="stats-wrap !grid-cols-1">
        <Stat label="Against plan" value="—" note="Needs a roster and a plan" />
      </StatStrip>
    )
  }

  const sign = gap > 0 ? '+' : gap < 0 ? '−' : ''
  const share = gapPct != null ? formatMetricValue(Math.abs(gapPct), 'percent') : null
  const where = gap < 0 ? 'below' : gap > 0 ? 'above' : 'on'
  return (
    <AuroraTile
      row
      art={false}
      icon={Target}
      tone={tone}
      title={`${sign}${Math.abs(gap).toLocaleString('en-US')} vs plan`}
      desc={
        gap === 0
          ? `Right on the plan of ${planTotal.toLocaleString('en-US')}`
          : `${share ? `${share} ` : ''}${where} the plan of ${planTotal.toLocaleString('en-US')}`
      }
      verdict={tone}
    />
  )
}

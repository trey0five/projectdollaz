// Organization KPI strip (canonical semantic layer v1) — a MODEST, read-only
// org-scope KPI band shown above the consolidated statements. Reads the
// org-metrics endpoint (one call site in api.js / useOrgMetrics) and renders the
// Tier-1 banded metrics as a STAT STRIP (Premium UI P2 — numbers between
// vertical rules with a 2px status mark and a delta pill; no boxes) with the
// SAME status semantics + value formatting the per-school dashboard uses.
//
// The moat made visible: each org value is the metric's OWN formula run on the
// SUM of every reporting school's extensive components (e.g. org operating margin
// = (Σrev−Σexp)/Σrev), NEVER the average of per-school values. A "based on N of M
// schools reporting" caption + an "enrollment-weighted" note on the weighted
// per-pupil metrics make that explicit.
//
// Pure presentation over the `metrics` prop; everything derived at render (no
// effects, no in-render component definitions — React-Compiler safe). No-print; advisory.
import { Section, StatStrip, Stat } from '../ui/surface/index.js'
import { metricFormat, formatDelta, deltaTone, isBandedStatus } from '../../lib/metricMeta.js'

// The org strip leads with the four Tier-1 banded metrics (status-marked), then a
// few key operational/weighted ratios. We deliberately omit the mix donuts here
// (the consolidated SOA/SFP below already shows the org composition).
const STRIP_KEYS = [
  'operating_margin',
  'days_cash_on_hand',
  'months_operating_reserve',
  'tuition_dependency',
  'cost_per_pupil',
  'tuition_discount_rate',
  'pct_students_on_aid',
  // Enrollment domain — now roll-up-able at org scope (recompute-from-components):
  // system-wide enrollment decline surfaces as a superintendent-level banded signal.
  // Renders '—' (unavailable) when no school has a prior year, via the existing path.
  'enrollment_change_yoy',
]

// Weighted metrics get an honest "enrollment-weighted" hint so users understand
// the org value is recompute-from-sums, not a naive average.
const WEIGHTED = {
  cost_per_pupil: 'enrollment-weighted',
  net_tuition_per_student: 'enrollment-weighted',
  financial_aid_per_student: 'enrollment-weighted',
  aid_per_aided_student: 'aided-count-weighted',
}

const MARK = { good: 'good', watch: 'watch', risk: 'risk' }

export default function OrgKpiStrip({ metrics, loading, error }) {
  if (loading) {
    return (
      <div className="animate-pulse py-8 text-center">
        <p className="font-serif text-small italic text-ink2">Loading organization KPIs…</p>
      </div>
    )
  }
  // Read-only / advisory: a KPI failure must never block the consolidated
  // statements below it, so we render nothing on error rather than an alarm.
  if (error || !metrics) return null

  const byKey = {}
  for (const m of metrics.metrics ?? []) byKey[m.key] = m
  const tiles = STRIP_KEYS.map((k) => byKey[k]).filter(Boolean)
  if (tiles.length === 0) return null

  const reported = metrics.reportedCount ?? 0
  const total = metrics.schoolCount ?? 0

  return (
    <Section
      label="Organization KPIs"
      aria-label="Organization KPIs"
      className="mt-0"
      aside={total > 0 ? <span>Based on {reported} of {total} schools reporting</span> : null}
    >
      {/* Four to a row: eight metrics read as two ruled rows, not one squeeze. */}
      <StatStrip cols={Math.min(4, tiles.length)} className="org-kpi-strip">
        {tiles.map((m) => {
          const unavailable = !m.available
          const fmt = metricFormat(m.key, m.unit)
          const deltaText =
            !unavailable && m.periodOverPeriodDelta != null ? formatDelta(m.periodOverPeriodDelta, fmt) : null
          return (
            <Stat
              key={m.key}
              label={m.label}
              value={unavailable ? null : m.value}
              format={unavailable ? undefined : fmt}
              status={!unavailable && isBandedStatus(m.status) ? MARK[m.status] : undefined}
              delta={deltaText ? { text: deltaText, tone: deltaTone(m.periodOverPeriodDelta, m.goodDirection) } : null}
              note={!unavailable ? WEIGHTED[m.key] : undefined}
            />
          )
        })}
      </StatStrip>
    </Section>
  )
}

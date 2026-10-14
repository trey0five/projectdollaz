// ─────────────────────────────────────────────────────────────────────────────
// PeersView — the peers scope (auto-benchmark ONE school against its comparable
// peers). Rendered for all three sub-views (Overview · Charts · Scorecard),
// switched on `view`. Premium UI P3: no navy band — the group description + the
// headline standing (insights[0]) open the panel as a `Section` on the ground,
// with a status Pill when the group was BROADENED (relaxed) or fell back to all
// schools; the headline figures are a `StatStrip`; the rails and demographics
// are chart Sections; the scorecard is a `DataTable` with the peer median as its
// footer line. Every number is a @finrep/analytics-formatted string (value
// parity).
//
// Degrades gracefully off group.sample / matchTier:
//   • emptyState (matchTier 'none') → "No comparable peers yet" + a Settings CTA
//     when the profile is incomplete.
//   • headtohead / small → the percentile is withheld, Stats carry a
//     "small sample (n=X)" note.
//   • rich → rank + median + percentile.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Users, Sparkles, Settings2 } from 'lucide-react'
import { metricLabel } from '../../../lib/metricMeta.js'
import { healthStatus } from '@finrep/analytics'
import { schoolColor } from './chartPalette.js'
import { lightStatus, MARK } from './statusStyle.js'
import { formatMetric } from './helpers.js'
import ColumnChart from '../charts/ColumnChart.jsx'
import HealthRail from '../charts/HealthRail.jsx'
import { peerCaption } from './peerCaption.js'
import { TargetBandBar } from '../MetricDrawer.jsx'
import { Section, StatStrip, Stat, DataTable, Pill, Panel, Button } from '../../ui/surface/index.js'

// The headline metrics of the peer scorecard (contract-frozen order).
const HEADLINE_KEYS = [
  'days_cash_on_hand',
  'operating_margin',
  'months_operating_reserve',
  'tuition_dependency',
  'cost_per_pupil',
]

const intFmt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—')

// Percentile → a status token for the standing pill (direction already baked into
// the server's percentile). Top quartile = on track, bottom quartile = at risk.
// These null-guards were already here and, until now, UNREACHABLE: the server
// always sent a number, even for a group of two where it could only be 1 or 0.
// packages/analytics withholds it below MIN_PEERS_FOR_PERCENTILE now, so the
// defensive branch the UI was written with finally does its job.
function pctStatus(percentile) {
  if (percentile == null) return 'neutral'
  if (percentile >= 0.75) return 'good'
  if (percentile <= 0.25) return 'risk'
  return 'neutral'
}
function pctLabel(percentile) {
  if (percentile == null) return null
  const p = Math.round(percentile * 100)
  const suffix = p % 100 >= 11 && p % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][p % 10 > 3 ? 0 : p % 10]
  return `${p}${suffix} pctile`
}

/**
 * Focus + every peer as points for one metric key (focus flagged).
 *
 * `available` IS RESPECTED. A metric the school cannot compute — cost per pupil
 * with no enrolment on file — arrives with available:false and a value of 0, and
 * plotting that put a school on the rail at $0 as though it educated children
 * for nothing. A missing value is not a zero; it becomes null and the caption
 * says the school has not reported.
 */
function pointValue(m) {
  return m && m.available !== false && m.value != null && Number.isFinite(m.value)
    ? m.value
    : null
}

function metricPoints(data, key) {
  const pts = []
  const fm = data.focus.metrics?.[key]
  const fv = pointValue(fm)
  pts.push({
    id: data.focus.schoolId,
    name: data.focus.schoolName,
    value: fv,
    formatted: fv != null ? fm?.formatted ?? null : null,
    isFocus: true,
  })
  for (const p of data.peers) {
    const m = p.metrics?.[key]
    const v = pointValue(m)
    pts.push({
      id: p.schoolId,
      name: p.schoolName,
      value: v,
      formatted: v != null ? m?.formatted ?? null : null,
      isFocus: false,
    })
  }
  return pts
}

/** Enrollment points (synthetic metric) from each school's profile. */
function enrollmentPoints(data) {
  const pts = []
  pts.push({
    id: data.focus.schoolId,
    name: data.focus.schoolName,
    value: data.focus.profile?.enrollment ?? null,
    formatted: intFmt(data.focus.profile?.enrollment),
    isFocus: true,
  })
  for (const p of data.peers) {
    pts.push({
      id: p.schoolId,
      name: p.schoolName,
      value: p.profile?.enrollment ?? null,
      formatted: intFmt(p.profile?.enrollment),
      isFocus: false,
    })
  }
  return pts
}

// ── The opening: who is being benchmarked against whom, and the one sentence ─
function PeerHead({ data }) {
  const { focus, group, insights } = data
  const tier =
    group.matchTier === 'relaxed'
      ? { text: `Broadened — comparing against ${group.groupDescription}`, tone: 'watch' }
      : group.matchTier === 'all-schools'
        ? { text: 'Comparing against all your schools — add county or type to narrow', tone: 'neutral' }
        : null
  return (
    <Section
      label={
        <span className="inline-flex items-center gap-1.5">
          <Users size={13} aria-hidden="true" /> Peer benchmark
        </span>
      }
      aside={`${group.peerCount} ${group.peerCount === 1 ? 'peer' : 'peers'}`}
      className="!mt-0"
    >
      <h3 className="sec-title !mb-1">{focus.schoolName}</h3>
      <p className="text-small text-ink2">vs. {group.groupDescription}</p>
      {insights?.[0] && (
        <p className="mt-3 flex items-start gap-2 text-body font-semibold text-ink">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-ink2" aria-hidden="true" />
          {insights[0]}
        </p>
      )}
      {tier && (
        <p className="mt-3">
          <Pill variant="status" tone={tier.tone}>
            {tier.text}
          </Pill>
        </p>
      )}
    </Section>
  )
}

// ── Overview: headline Stats (focus value · peer median · rank · percentile) ──
function PeerOverview({ data }) {
  const keys = HEADLINE_KEYS.filter((k) => data.focus.metrics?.[k] || data.stats?.[k])
  const small = data.group.sample === 'small' || data.group.sample === 'headtohead'
  return (
    <div>
      <PeerHead data={data} />
      <Section label="Where you stand" aside={small ? `small sample (n=${data.group.peerCount + 1})` : null}>
        <StatStrip cols={Math.min(keys.length, 5) || 1} className="stats-compact">
          {keys.map((k) => {
            const fm = data.focus.metrics?.[k]
            const stat = data.stats?.[k]
            const status = pctStatus(stat?.percentile)
            const note = [
              `Peer median ${stat?.medianFormatted ?? '—'}`,
              stat && stat.rank != null ? `rank ${stat.rank}/${stat.count}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
            const pct = stat?.percentile != null && !small ? pctLabel(stat.percentile) : null
            return (
              <Stat
                key={k}
                label={metricLabel(k)}
                value={fm?.formatted ?? formatMetric({ key: k, value: fm?.value ?? null, unit: fm?.unit })}
                status={MARK[status]}
                delta={pct ? { text: pct, tone: lightStatus(status).tone } : null}
                note={note}
              />
            )
          })}
        </StatStrip>
      </Section>
    </div>
  )
}

// ── Charts: one HEALTH RAIL per metric ───────────────────────────────────────
//
// The card used to be a name, a number, a percentile, and two unlabelled rows
// with a dot on each. It answered "where do I rank?" — badly, because a dot
// with no domain says nothing — and never answered "is this any good?", which
// is the question a head of school is actually asking. The rail answers both:
// health is where the dots stand, comparison is the space between them.
function RailSection({ data, metricKey }) {
  const stat = data.stats?.[metricKey]
  if (!stat) return null
  const fm = data.focus.metrics?.[metricKey]
  const points = metricPoints(data, metricKey)
  // The BANDS come off the focus school's own metric — the same object the
  // metric drawer and the scorecard read, so the healthy range cannot differ
  // between two places in the product. Absent for metrics with no agreed range
  // (cost per pupil), and the rail renders plain rather than inventing one.
  const bands = fm?.bands ?? null
  const caption = peerCaption({
    stat,
    points,
    metricKey,
    unit: fm?.unit,
    bands,
  })
  const status = lightStatus(healthStatus(stat.focusValue ?? null, bands ?? undefined, stat.focusValue != null))

  return (
    <Section
      label={metricLabel(metricKey)}
      className="!mt-0 min-w-0"
      aside={
        <span className="inline-flex items-center gap-2 tabular-nums">
          <b className="text-ink">{stat.focusFormatted ?? '—'}</b>
          {bands && stat.focusValue != null && (
            <Pill variant="status" tone={status.tone}>
              {status.label}
            </Pill>
          )}
        </span>
      }
    >
      <HealthRail
        points={points}
        bands={bands}
        caption={caption}
        ariaLabel={`${metricLabel(metricKey)} — ${caption ?? 'peer comparison'}`}
      />
    </Section>
  )
}

function PeerCharts({ data }) {
  const stripKeys = HEADLINE_KEYS.filter((k) => data.stats?.[k])
  const enrollRows = useMemo(
    () =>
      enrollmentPoints(data)
        .filter((p) => Number.isFinite(p.value))
        .map((p, i) => ({
          id: p.id,
          label: p.name + (p.isFocus ? ' (you)' : ''),
          value: p.value,
          formatted: p.formatted,
          // The focus school is owned by `emphasis` (gradient + glow); giving it a
          // second hue as well painted a two-colour column that read as diverging.
          ...(p.isFocus ? { emphasis: true } : { color: schoolColor(i + 1) }),
        }))
        // Largest first — the rank is the reading; colour stays with the school.
        .sort((a, b) => b.value - a.value),
    [data],
  )
  const prof = data.focus.profile || {}
  const badges = [
    prof.sizeBandLabel && { label: 'Size', value: prof.sizeBandLabel },
    prof.schoolType && { label: 'Type', value: prof.schoolType },
    prof.gradeLow && prof.gradeHigh && { label: 'Grades', value: `${prof.gradeLow}–${prof.gradeHigh}` },
    prof.county && { label: 'County', value: prof.county },
    prof.district && { label: 'District', value: prof.district },
  ].filter(Boolean)
  return (
    <div>
      <PeerHead data={data} />
      <Section label="Where you stand">
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
          {stripKeys.map((k) => (
            <RailSection key={k} data={data} metricKey={k} />
          ))}
        </div>
      </Section>
      <Section label="Demographics">
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
          <Section label="Enrollment across the peer group" className="!mt-0 min-w-0">
            {enrollRows.length ? (
              <ColumnChart rows={enrollRows} formatter={intFmt} ariaLabel="Enrollment across the peer group" />
            ) : (
              <p className="py-8 text-center text-small italic text-ink2">No enrollment reported yet.</p>
            )}
          </Section>
          <Section label="This school's profile" className="!mt-0 min-w-0">
            {badges.length ? (
              <dl className="m-0">
                {badges.map((b) => (
                  <div key={b.label} className="fig">
                    <dt className="fig-label">{b.label}</dt>
                    <dd className="fig-value m-0">{b.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-small italic text-ink2">
                No profile set yet.{' '}
                <Link to="/settings" className="font-semibold text-ink underline">
                  Add it in Settings
                </Link>
                .
              </p>
            )}
          </Section>
        </div>
      </Section>
    </div>
  )
}

// ── Scorecard: focus + peers × metric columns + a peer-median footer line ─────
function PeerScorecard({ data }) {
  const cols = HEADLINE_KEYS.filter((k) => data.focus.metrics?.[k] || data.peers.some((p) => p.metrics?.[k]))
  const columns = [
    { key: 'name', header: 'School', className: 'dt-nowrap', render: (r) => <span className={r.isFocus ? 'font-semibold text-ink' : 'text-ink'}>{r.name}</span> },
    { key: 'size', header: 'Size', render: (r) => r.profile?.sizeBandLabel ?? <span className="text-ink2">—</span> },
    ...cols.map((k) => ({
      key: k,
      header: metricLabel(k),
      num: true,
      render: (r) => r.metrics?.[k]?.formatted ?? <span className="text-ink2">—</span>,
    })),
  ]
  const rows = [
    { id: data.focus.schoolId, name: `${data.focus.schoolName} (you)`, profile: data.focus.profile, metrics: data.focus.metrics, isFocus: true },
    ...data.peers.map((p) => ({ id: p.schoolId, name: p.schoolName, profile: p.profile, metrics: p.metrics })),
  ]
  const medianMetrics = {}
  for (const k of cols) medianMetrics[k] = { formatted: data.stats?.[k]?.medianFormatted ?? '—' }
  const foot = [{ id: '__median', name: 'Peer median', profile: null, metrics: medianMetrics }]
  return (
    <div>
      <PeerHead data={data} />
      <Section label="Peer scorecard">
        <DataTable columns={columns} rows={rows} rowKey="id" footRows={foot} markOf={(r) => (r.isFocus ? 'hue' : null)} caption="Peer scorecard" className="dt-sticky" />
      </Section>
    </div>
  )
}

// ── The sector-band fallback (DECIDED): a single-school head gets a real
// comparison surface — this school's vitals against the sector target bands —
// instead of a dead end. HONEST FRAMING IS THE WHOLE FEATURE: the bands are
// documented sector defaults ("NOT hard truths", health.ts), not a peer group,
// and every sentence here says so. cost_per_pupil ships without a band on
// purpose — spending levels vary by mission, and inventing a target would be a
// judgement the product refuses to fake. ─────────────────────────────────────
function SectorBandStat({ row, metric }) {
  const label = metric?.label ?? metricLabel(row.key)
  const value = metric?.value ?? row.value
  const formatted = metric ? formatMetric(metric) : value != null ? String(value) : '—'
  return (
    <Stat label={label} value={formatted} className="min-w-0">
      {row.bands && value != null ? (
        <TargetBandBar metric={{ key: row.key, unit: metric?.unit, value, bands: row.bands }} />
      ) : (
        <p className="mt-2 text-small italic leading-snug text-ink2">
          {value == null
            ? 'No value for this year yet.'
            : 'No sector band — deliberately: spending levels vary by mission.'}
        </p>
      )}
    </Stat>
  )
}

function SectorBandFallback({ data }) {
  const byKey = data.focus?.metrics ?? {}
  return (
    <Section
      label="Your school vs the sector band"
      aside={
        <Pill variant="status" tone="neutral">
          Sector default — not a peer group
        </Pill>
      }
    >
      <p className="mb-4 max-w-2xl text-small leading-snug text-ink2">
        These are documented private-school sector targets, not your peers&apos; numbers — a
        starting point, not a verdict. Real peer benchmarking unlocks when your organization has
        sibling schools reporting.
      </p>
      <StatStrip cols={Math.min(data.benchmark.length, 3) || 1} className="stats-compact">
        {data.benchmark.map((row) => (
          <SectorBandStat key={row.key} row={row} metric={byKey[row.key]} />
        ))}
      </StatStrip>
    </Section>
  )
}

// ── Degradation: no comparable peers ─────────────────────────────────────────
function PeerEmpty({ data }) {
  const es = data.emptyState || {}
  const single = es.reason === 'single_school'
  const msg =
    es.message ||
    (single
      ? 'One school here — so your context is the sector band, not a peer group.'
      : "Your other schools haven't reported this year yet.")
  const needsProfile = data.focus && data.focus.profileComplete === false
  const bands = single && Array.isArray(data.benchmark) && data.benchmark.length > 0
  return (
    <div>
      <PeerHead data={data} />
      {bands ? (
        // The band comparison IS the surface for a single school — the dead-end
        // card demoted to a footnote beneath it.
        <>
          <SectorBandFallback data={data} />
          <p className="sec-note text-center">{msg}</p>
        </>
      ) : (
        <Section label="No comparable peers yet">
          <p className="max-w-md text-body text-ink2">{msg}</p>
          {needsProfile && (
            <Panel className="mt-4 inline-block">
              <Button variant="primary" to="/settings" icon={<Settings2 size={15} />}>
                Complete your school profile
              </Button>
            </Panel>
          )}
        </Section>
      )}
    </div>
  )
}

export default function PeersView({ peers, view }) {
  const data = peers?.data
  if (peers?.loading && !data) {
    return <p className="sec-note animate-pulse py-12 text-center">Finding your peer group…</p>
  }
  if (!data) {
    return <p className="sec-note py-12 text-center italic">Peer comparison unavailable right now.</p>
  }
  if (data.emptyState || data.group?.matchTier === 'none') return <PeerEmpty data={data} />
  if (view === 'charts') return <PeerCharts data={data} />
  if (view === 'scorecard') return <PeerScorecard data={data} />
  return <PeerOverview data={data} />
}

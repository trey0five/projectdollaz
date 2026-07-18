// ─────────────────────────────────────────────────────────────────────────────
// PeersView — the peers scope (auto-benchmark ONE school against its comparable
// peers). Rendered for all three sub-views (Overview · Charts · Scorecard),
// switched on `view`. Speaks the same visual language as the other scopes: a navy
// HERO BAND carries the group description + the headline standing (insights[0]),
// with a subtle chip when the group was BROADENED (relaxed) or fell back to all
// schools. Every number is a @finrep/analytics-formatted string (value parity).
//
// Degrades gracefully off group.sample / matchTier:
//   • emptyState (matchTier 'none') → "No comparable peers yet" + a Settings CTA
//     when the profile is incomplete.
//   • headtohead / small → PercentileStrip collapses to a ranked-dot list, tiles
//     carry a "small sample (n=X)" tag.
//   • rich → full p25/median/p75 strip.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Users, Sparkles, Info, Settings2 } from 'lucide-react'
import { metricLabel, formatMetricValue } from '../../../lib/metricMeta.js'
import { schoolColor } from './chartPalette.js'
import { lightStatus } from './statusStyle.js'
import { formatMetric } from './helpers.js'
import BarList from '../charts/BarList.jsx'
import PercentileStrip from '../charts/PercentileStrip.jsx'

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

/** Focus + every peer as points for one metric key (focus flagged). */
function metricPoints(data, key) {
  const pts = []
  const fm = data.focus.metrics?.[key]
  pts.push({
    id: data.focus.schoolId,
    name: data.focus.schoolName,
    value: fm?.value ?? null,
    formatted: fm?.formatted ?? null,
    isFocus: true,
  })
  for (const p of data.peers) {
    const m = p.metrics?.[key]
    pts.push({ id: p.schoolId, name: p.schoolName, value: m?.value ?? null, formatted: m?.formatted ?? null, isFocus: false })
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

// ── The navy hero band (OverviewView's HeroBand sibling) ─────────────────────
function PeerHero({ data }) {
  const reduce = useReducedMotion()
  const { focus, group, insights } = data
  const tierChip =
    group.matchTier === 'relaxed'
      ? { text: `Broadened — comparing against ${group.groupDescription}`, tone: 'amber' }
      : group.matchTier === 'all-schools'
        ? { text: 'Comparing against all your schools — add county or type to narrow', tone: 'sky' }
        : null
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-6"
    >
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(214,178,92,0.5), transparent)' }}
      />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-gold/80">
            <Users size={14} /> Peer benchmark
          </span>
          <span className="text-[11.5px] font-medium text-white/50">
            {group.peerCount} {group.peerCount === 1 ? 'peer' : 'peers'}
          </span>
        </div>
        <h3 className="font-serif text-xl font-semibold text-white sm:text-2xl">{focus.schoolName}</h3>
        <p className="mt-0.5 text-[13.5px] text-white/70">vs. {group.groupDescription}</p>
        {insights?.[0] && (
          <p className="mt-3 flex items-start gap-2 text-[15px] font-semibold text-white">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-gold" />
            {insights[0]}
          </p>
        )}
        {tierChip && (
          <p
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
              tierChip.tone === 'amber' ? 'bg-amber-400/15 text-amber-200' : 'bg-sky-400/15 text-sky-200'
            }`}
          >
            <Info size={13} /> {tierChip.text}
          </p>
        )}
      </div>
    </motion.section>
  )
}

// ── Overview: headline KPI tiles (focus value · peer median · percentile pill) ──
function PeerOverview({ data }) {
  const tiles = HEADLINE_KEYS.filter((k) => data.focus.metrics?.[k] || data.stats?.[k])
  const small = data.group.sample === 'small' || data.group.sample === 'headtohead'
  return (
    <div className="space-y-6">
      <PeerHero data={data} />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((k, i) => {
          const fm = data.focus.metrics?.[k]
          const stat = data.stats?.[k]
          const st = lightStatus(pctStatus(stat?.percentile))
          return (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="av2-card p-4"
            >
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{metricLabel(k)}</p>
              <p className="mt-1 text-2xl font-bold text-navy tabular-nums">
                {fm?.formatted ?? formatMetric({ key: k, value: fm?.value ?? null, unit: fm?.unit })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                <span>
                  Peer median <b className="text-navy tabular-nums">{stat?.medianFormatted ?? '—'}</b>
                </span>
                {stat && stat.rank != null && (
                  <span className="text-slate-400">· rank {stat.rank}/{stat.count}</span>
                )}
              </div>
              {stat?.percentile != null && !small && (
                <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${st.pill}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
                  {pctLabel(stat.percentile)}
                </span>
              )}
              {small && (
                <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  small sample (n={stat?.count ?? data.group.peerCount + 1})
                </span>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Charts: per-metric percentile strips + demographics ──────────────────────
function StripCard({ data, metricKey }) {
  const stat = data.stats?.[metricKey]
  if (!stat) return null
  const points = metricPoints(data, metricKey)
  const fmtRaw = (v) => {
    const fm = data.focus.metrics?.[metricKey]
    return formatMetricValue(v, fm?.unit ?? 'number')
  }
  return (
    <div className="av2-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-navy">{metricLabel(metricKey)}</p>
        <p className="text-[12px] text-muted">
          you <b className="text-navy tabular-nums">{stat.focusFormatted ?? '—'}</b>
          {stat.percentile != null && <span className="ml-1.5 text-slate-400">· {pctLabel(stat.percentile)}</span>}
        </p>
      </div>
      <PercentileStrip stat={stat} points={points} format={fmtRaw} />
    </div>
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
          color: p.isFocus ? 'rgb(var(--c-coral))' : schoolColor(i + 1),
        })),
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
    <div className="space-y-6">
      <PeerHero data={data} />
      <div>
        <h4 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Where you stand</h4>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {stripKeys.map((k) => (
            <StripCard key={k} data={data} metricKey={k} />
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Demographics</h4>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="av2-card p-4">
            <p className="mb-2 text-[13px] font-semibold text-navy">Enrollment across the peer group</p>
            {enrollRows.length ? (
              <BarList rows={enrollRows} formatter={intFmt} />
            ) : (
              <p className="py-8 text-center text-[13px] italic text-muted">No enrollment reported yet.</p>
            )}
          </div>
          <div className="av2-card p-4">
            <p className="mb-3 text-[13px] font-semibold text-navy">This school's profile</p>
            {badges.length ? (
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1.5 rounded-full border border-rule/60 px-3 py-1.5 text-[12.5px] font-semibold text-navy">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{b.label}</span>
                    {b.value}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] italic text-muted">
                No profile set yet.{' '}
                <Link to="/settings" className="font-semibold text-navy underline">
                  Add it in Settings
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Scorecard: focus + peers × metric columns + a peer-median summary row ─────
function PeerScorecard({ data }) {
  const cols = HEADLINE_KEYS.filter((k) => data.focus.metrics?.[k] || data.peers.some((p) => p.metrics?.[k]))
  const rowFor = (school) => (
    <>
      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold text-navy">{school.name}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-muted">{school.profile?.sizeBandLabel ?? '—'}</td>
      {cols.map((k) => (
        <td key={k} className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] tabular-nums text-navy">
          {school.metrics?.[k]?.formatted ?? '—'}
        </td>
      ))}
    </>
  )
  return (
    <div className="space-y-5">
      <PeerHero data={data} />
      <div className="av2-card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-rule/60 bg-cream/40">
              <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">School</th>
              <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Size</th>
              {cols.map((k) => (
                <th key={k} className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  {metricLabel(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-rule/40 bg-coral/5">
              {rowFor({ name: `${data.focus.schoolName} (you)`, profile: data.focus.profile, metrics: data.focus.metrics })}
            </tr>
            {data.peers.map((p) => (
              <tr key={p.schoolId} className="border-b border-rule/30">
                {rowFor({ name: p.schoolName, profile: p.profile, metrics: p.metrics })}
              </tr>
            ))}
            <tr className="bg-cream/50">
              <td className="px-3 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted" colSpan={2}>
                Peer median
              </td>
              {cols.map((k) => (
                <td key={k} className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-navy">
                  {data.stats?.[k]?.medianFormatted ?? '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Degradation: no comparable peers ─────────────────────────────────────────
function PeerEmpty({ data }) {
  const es = data.emptyState || {}
  const msg =
    es.message ||
    (es.reason === 'single_school'
      ? 'Add another school to unlock peer benchmarking.'
      : "Your other schools haven't reported this year yet.")
  const needsProfile = data.focus && data.focus.profileComplete === false
  return (
    <div className="space-y-6">
      <PeerHero data={data} />
      <div className="av2-card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cream text-navy">
          <Users size={26} />
        </span>
        <h3 className="font-serif text-lg font-semibold text-navy">No comparable peers yet</h3>
        <p className="max-w-md text-[14px] text-muted">{msg}</p>
        {needsProfile && (
          <Link
            to="/settings"
            className="mt-1 inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            <Settings2 size={15} /> Complete your school profile
          </Link>
        )}
      </div>
    </div>
  )
}

export default function PeersView({ peers, view }) {
  const data = peers?.data
  if (peers?.loading && !data) {
    return <div className="av2-card animate-pulse px-6 py-16 text-center text-[14px] text-muted">Finding your peer group…</div>
  }
  if (!data) {
    return <div className="av2-card px-6 py-16 text-center text-[14px] italic text-muted">Peer comparison unavailable right now.</div>
  }
  if (data.emptyState || data.group?.matchTier === 'none') return <PeerEmpty data={data} />
  if (view === 'charts') return <PeerCharts data={data} />
  if (view === 'scorecard') return <PeerScorecard data={data} />
  return <PeerOverview data={data} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard — the Compare and Diocese scorecards: schools × metrics tables whose
// COLUMNS are the user's visible-metric set (the same set that drives the School
// scorecard, so the three surfaces agree). Click a column to sort (component-local;
// a re-sort never recolours a school — the colour dot follows roster/seriesIndex).
// Every cell prints the SERVER-STAMPED `formatted` string from the compare endpoint
// (value parity with the single-school dashboard). The Diocese variant appends the
// org roll-up row from useOrgMetrics (formatted via the canonical formatter).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { seriesColor } from '../charts/palette.js'
import { statusMeta } from '../../../lib/metricMeta.js'
import { formatMetric } from './helpers.js'

function StatusDotCell({ cell }) {
  if (!cell || cell.status === 'neutral' || !cell.status) return <span>{cell?.formatted ?? '—'}</span>
  const sm = statusMeta(cell.status)
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${sm.dot}`} />
      {cell.formatted ?? '—'}
    </span>
  )
}

function useSort(defaultKey) {
  const [sort, setSort] = useState({ key: defaultKey, dir: 'desc' })
  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  return [sort, toggle]
}

function SortHead({ label, active, dir, onClick, className = '' }) {
  return (
    <th onClick={onClick} className={`text-muted ${className}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </span>
    </th>
  )
}

/** Compare scope: the selected schools ranked over the visible columns. */
export function CompareLeaderboard({ schools, columns }) {
  const [sort, toggle] = useSort(columns[0]?.key ?? '__name')
  const sorted = [...schools].sort((a, b) => {
    if (sort.key === '__name') {
      const cmp = a.schoolName.localeCompare(b.schoolName)
      return sort.dir === 'desc' ? -cmp : cmp
    }
    const av = a.metrics?.[sort.key]?.value ?? -Infinity
    const bv = b.metrics?.[sort.key]?.value ?? -Infinity
    return sort.dir === 'desc' ? bv - av : av - bv
  })
  return (
    <div className="card-soft overflow-x-auto p-4 sm:p-5">
      <h3 className="mb-1 font-serif text-base font-semibold text-navy">The metrics board</h3>
      <p className="mb-3 text-[13px] text-muted">Sortable — click a column to rank. Colour follows each school, not its rank.</p>
      <table className="av2-lb">
        <thead>
          <tr>
            <SortHead label="School" active={sort.key === '__name'} dir={sort.dir} onClick={() => toggle('__name')} className="bg-white" />
            {columns.map((c) => (
              <SortHead key={c.key} label={c.label} active={sort.key === c.key} dir={sort.dir} onClick={() => toggle(c.key)} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.schoolId} className="border-t border-rule/50 text-navy">
              <td className="bg-white">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesColor(s.seriesIndex ?? 0) }} />
                  {s.schoolName}
                </span>
              </td>
              {columns.map((c) => (
                <td key={c.key} className="tabular-nums">
                  <StatusDotCell cell={s.metrics?.[c.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Diocese scope: all reporting schools + a diocese roll-up row from org metrics. */
export function DioceseScorecard({ schools, columns, orgMetrics }) {
  const [sort, toggle] = useSort(columns[0]?.key ?? '__name')
  const orgByKey = {}
  for (const m of orgMetrics?.metrics ?? []) orgByKey[m.key] = m
  const sorted = [...schools].sort((a, b) => {
    if (sort.key === '__name') {
      const cmp = a.schoolName.localeCompare(b.schoolName)
      return sort.dir === 'desc' ? -cmp : cmp
    }
    const av = a.metrics?.[sort.key]?.value ?? -Infinity
    const bv = b.metrics?.[sort.key]?.value ?? -Infinity
    return sort.dir === 'desc' ? bv - av : av - bv
  })
  return (
    <div className="card-soft overflow-x-auto p-4 sm:p-5">
      <h3 className="mb-1 font-serif text-base font-semibold text-navy">Diocese scorecard</h3>
      <p className="mb-3 text-[13px] text-muted">Every reporting school, plus the consolidated diocese roll-up row.</p>
      <table className="av2-lb">
        <thead>
          <tr>
            <SortHead label="School" active={sort.key === '__name'} dir={sort.dir} onClick={() => toggle('__name')} className="bg-white" />
            {columns.map((c) => (
              <SortHead key={c.key} label={c.label} active={sort.key === c.key} dir={sort.dir} onClick={() => toggle(c.key)} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr key={s.schoolId} className="border-t border-rule/50 text-navy">
              <td className="bg-white">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesColor(s.seriesIndex ?? i) }} />
                  {s.schoolName}
                </span>
              </td>
              {columns.map((c) => (
                <td key={c.key} className="tabular-nums">
                  <StatusDotCell cell={s.metrics?.[c.key]} />
                </td>
              ))}
            </tr>
          ))}
          {orgMetrics && (
            <tr className="border-t-2 border-gold/40 bg-gold/5 font-semibold text-navy">
              <td className="bg-gold/5">⛪ Diocese (consolidated)</td>
              {columns.map((c) => (
                <td key={c.key} className="tabular-nums">
                  {orgByKey[c.key] ? formatMetric(orgByKey[c.key]) : '—'}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

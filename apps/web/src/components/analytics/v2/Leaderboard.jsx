// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard — the Compare and Diocese scorecards: schools × metrics tables whose
// COLUMNS are the user's visible-metric set (the same set that drives the School
// scorecard, so the three surfaces agree). Click a column to sort (component-local;
// a re-sort never recolours a school — the colour dot follows roster/seriesIndex).
// Every cell prints the SERVER-STAMPED `formatted` string from the compare endpoint
// (value parity with the single-school dashboard). The Diocese variant appends the
// org roll-up row from useOrgMetrics (formatted via the canonical formatter).
//
// Visual language: the structure stays a sortable table, restyled — av2-card
// chrome, 11px uppercase tracked slate-400 header, right-aligned tabular-nums
// value cells, banded cells wear a tinted STATUS PILL (soft matching glow) around
// the value, school hue dots unchanged (identity!), row hover tint (css).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { seriesColor } from '../charts/palette.js'
import { lightStatus } from './statusStyle.js'
import { formatMetric } from './helpers.js'

// Banded cell → the value INSIDE a status pill; contextual cell → plain value.
function StatusCell({ cell }) {
  if (!cell) return <span className="text-slate-300">—</span>
  if (!cell.status || cell.status === 'neutral') return <span>{cell.formatted ?? '—'}</span>
  const ls = lightStatus(cell.status)
  return (
    <span className={ls.pill}>
      <i aria-hidden="true" />
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
    <th onClick={onClick} className={className}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </span>
    </th>
  )
}

function SchoolNameCell({ name, colorIndex }) {
  return (
    <span className="inline-flex items-center gap-2 text-navy">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: seriesColor(colorIndex) }} />
      {name}
    </span>
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
    <div className="av2-card overflow-x-auto p-4 sm:p-5">
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
            <tr key={s.schoolId} className="border-t border-slate-200/60 text-navy">
              <td className="bg-white">
                <SchoolNameCell name={s.schoolName} colorIndex={s.seriesIndex ?? 0} />
              </td>
              {columns.map((c) => (
                <td key={c.key} className="tabular-nums">
                  <StatusCell cell={s.metrics?.[c.key]} />
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
    <div className="av2-card overflow-x-auto p-4 sm:p-5">
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
            <tr key={s.schoolId} className="border-t border-slate-200/60 text-navy">
              <td className="bg-white">
                <SchoolNameCell name={s.schoolName} colorIndex={s.seriesIndex ?? i} />
              </td>
              {columns.map((c) => (
                <td key={c.key} className="tabular-nums">
                  <StatusCell cell={s.metrics?.[c.key]} />
                </td>
              ))}
            </tr>
          ))}
          {orgMetrics && (
            <tr className="av2-total border-t-2 border-gold/40 bg-gold/5 font-semibold text-navy">
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

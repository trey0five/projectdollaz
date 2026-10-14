// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard — the Compare and All-schools scorecards: schools × metrics tables
// whose COLUMNS are the user's visible-metric set (the same set that drives the
// School scorecard, so the three surfaces agree). Click a column to sort
// (component-local; a re-sort never recolours a school — the colour swatch
// follows roster/seriesIndex). Every cell prints the SERVER-STAMPED `formatted`
// string from the compare endpoint (value parity with the single-school
// dashboard). The Org variant appends the roll-up row from useOrgMetrics
// (canonical formatter) as the table's footer line.
//
// Premium UI P3: a `DataTable` on the ground under a Section rule — sticky
// 11px-caps head, 36px hairline rows, right-aligned tabular numerics; a banded
// cell wears a status Pill (2px mark + ink value), a contextual cell plain ink.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { schoolColor } from './chartPalette.js'
import { lightStatus } from './statusStyle.js'
import { formatMetric } from './helpers.js'
import { Section, DataTable, Pill } from '../../ui/surface/index.js'

// Banded cell → the value beside a 2px status mark; contextual cell → plain value.
function StatusCell({ cell }) {
  if (!cell) return <span className="text-ink2">—</span>
  if (!cell.status || cell.status === 'neutral') return <span>{cell.formatted ?? '—'}</span>
  return (
    <Pill variant="status" tone={lightStatus(cell.status).tone}>
      {cell.formatted ?? '—'}
    </Pill>
  )
}

function SchoolNameCell({ name, colorIndex }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-ink">
      <span className="swatch" style={{ background: schoolColor(colorIndex) }} aria-hidden="true" />
      {name}
    </span>
  )
}

function useColumns(columns) {
  return useMemo(
    () => [
      {
        key: '__name',
        header: 'School',
        sortable: true,
        className: 'dt-nowrap',
        sortValue: (s) => s.schoolName,
        render: (s) => (s.isTotal ? <span className="font-semibold text-ink">{s.schoolName}</span> : <SchoolNameCell name={s.schoolName} colorIndex={s.seriesIndex ?? 0} />),
      },
      ...columns.map((c) => ({
        key: c.key,
        header: c.label,
        num: true,
        sortable: true,
        sortValue: (s) => s.metrics?.[c.key]?.value ?? null,
        render: (s) => <StatusCell cell={s.metrics?.[c.key]} />,
      })),
    ],
    [columns],
  )
}

/** Compare scope: the selected schools ranked over the visible columns. */
export function CompareLeaderboard({ schools, columns }) {
  const cols = useColumns(columns)
  const first = columns[0]?.key ?? '__name'
  return (
    <Section label="The metrics board" aside="click a column to rank · colour follows the school, not its rank" className="!mt-0">
      <DataTable
        columns={cols}
        rows={schools}
        rowKey="schoolId"
        defaultSort={{ key: first, dir: first === '__name' ? 'asc' : 'desc' }}
        caption="Compare leaderboard"
        empty="No schools selected."
        className="dt-sticky"
      />
    </Section>
  )
}

/** Org scope: every reporting school + the consolidated roll-up row from org metrics. */
export function OrgScorecard({ schools, columns, orgMetrics }) {
  const cols = useColumns(columns)
  const first = columns[0]?.key ?? '__name'
  const rows = useMemo(() => schools.map((s, i) => ({ ...s, seriesIndex: s.seriesIndex ?? i })), [schools])
  const foot = useMemo(() => {
    if (!orgMetrics) return []
    const orgByKey = {}
    for (const m of orgMetrics?.metrics ?? []) orgByKey[m.key] = m
    const metrics = {}
    for (const c of columns) {
      metrics[c.key] = orgByKey[c.key] ? { formatted: formatMetric(orgByKey[c.key]), status: 'neutral' } : null
    }
    return [{ schoolId: '__org', schoolName: 'All schools (consolidated)', isTotal: true, metrics }]
  }, [orgMetrics, columns])
  return (
    <Section label="System scorecard" aside="every reporting school, plus the consolidated roll-up" className="!mt-0">
      <DataTable
        columns={cols}
        rows={rows}
        rowKey="schoolId"
        defaultSort={{ key: first, dir: first === '__name' ? 'asc' : 'desc' }}
        footRows={foot}
        caption="System scorecard"
        empty="No schools reporting yet."
        className="dt-sticky"
      />
    </Section>
  )
}

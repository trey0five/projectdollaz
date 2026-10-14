// Per-school summary table for the ORGANIZATION view — the "Schools in your
// organization" roll-up (critical/warn/review counts + reporting status per school).
// Extracted from OrgBriefing so OrgHome can place it ABOVE the triage board (with
// the org KPI strip), while the briefing headline stays attached to the triage.
// Pure presentation over `schools` (server-provided); never re-sorts or recounts
// on its own — the DataTable's column sort is the reader's, the data is the server's.
// Premium UI P3: a `DataTable` under a Section rule (sticky head, `.dt-num`
// right-aligned counts, a 2px row mark for the worst severity, status as mark +
// word — no tinted count pills, no card, no icon tile).
import { useMemo } from 'react'
import { Section, DataTable, Pill } from '../ui/surface/index.js'

const markOf = (s) => {
  if (s.failed || !s.reported || !s.summary) return null
  if ((s.summary.critical ?? 0) > 0) return 'risk'
  if ((s.summary.warn ?? 0) > 0) return 'watch'
  if ((s.summary.info ?? 0) > 0) return 'neutral'
  return 'good'
}
const count = (v) => (v ? v : <span className="text-ink2">—</span>)

export default function OrgSchoolsTable({ schools = [] }) {
  const columns = useMemo(
    () => [
      { key: 'name', header: 'School', sortable: true, render: (s) => <span className="font-semibold text-ink">{s.name}</span> },
      { key: 'periodLabel', header: 'Period', sortable: true, render: (s) => s.periodLabel || <span className="text-ink2">—</span> },
      { key: 'critical', header: 'Critical', num: true, sortable: true, sortValue: (s) => s.summary?.critical ?? null, render: (s) => (s.summary ? count(s.summary.critical) : count(null)) },
      { key: 'warn', header: 'Warn', num: true, sortable: true, sortValue: (s) => s.summary?.warn ?? null, render: (s) => (s.summary ? count(s.summary.warn) : count(null)) },
      { key: 'info', header: 'Review', num: true, sortable: true, sortValue: (s) => s.summary?.info ?? null, render: (s) => (s.summary ? count(s.summary.info) : count(null)) },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        sortValue: (s) => (s.failed ? 2 : s.reported ? 0 : 1),
        render: (s) =>
          s.failed ? (
            <Pill variant="status" tone="neutral">Couldn&rsquo;t load</Pill>
          ) : s.reported ? (
            <Pill variant="status" tone="good">Reported</Pill>
          ) : (
            <Pill variant="status" tone="neutral">Not yet reported</Pill>
          ),
      },
    ],
    [],
  )
  return (
    <Section label="Schools in your organization" className="!mt-0">
      <DataTable columns={columns} rows={schools} rowKey="schoolId" markOf={markOf} caption="Schools in your organization" empty="No schools found for your organization." />
    </Section>
  )
}

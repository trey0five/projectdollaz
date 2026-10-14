// Phase 3 — period-over-period comparison. The metrics endpoint already carries
// `periodOverPeriodDelta` (current − prior, in the metric's own units), so the
// prior value is exact: prior = value − delta. No new backend. Direction-goodness
// varies by metric, so the change is shown neutrally (arrow + ink), not red/green.
// Premium UI P3: a `DataTable` under a Section rule (Metric · Prior · Current ·
// Change, numerics right-aligned tabular).
import { useMemo } from 'react'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { metricFormat, formatMetricValue, formatDelta } from '../../lib/metricMeta.js'
import { Section, DataTable } from '../ui/surface/index.js'

export default function PeriodComparison({ metrics }) {
  const rows = useMemo(
    () => (metrics ?? []).filter((m) => m.available && m.value != null && m.periodOverPeriodDelta != null),
    [metrics],
  )
  const columns = useMemo(
    () => [
      { key: 'label', header: 'Metric', sortable: true, render: (m) => <span className="text-ink">{m.label}</span> },
      {
        key: 'prior',
        header: 'Prior',
        num: true,
        sortValue: (m) => m.value - m.periodOverPeriodDelta,
        render: (m) => <span className="text-ink2">{formatMetricValue(m.value - m.periodOverPeriodDelta, metricFormat(m.key, m.unit))}</span>,
      },
      {
        key: 'value',
        header: 'Current',
        num: true,
        sortable: true,
        render: (m) => <span className="font-semibold text-ink">{formatMetricValue(m.value, metricFormat(m.key, m.unit))}</span>,
      },
      {
        key: 'periodOverPeriodDelta',
        header: 'Change',
        num: true,
        sortable: true,
        render: (m) => {
          const delta = m.periodOverPeriodDelta
          const Arrow = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus
          return (
            <span className={`inline-flex items-center justify-end gap-1 tabular-nums ${delta === 0 ? 'text-ink2' : 'text-ink'}`}>
              <Arrow size={12} aria-hidden="true" />
              {formatDelta(delta, metricFormat(m.key, m.unit)) ?? '—'}
            </span>
          )
        },
      },
    ],
    [],
  )
  if (rows.length === 0) return null

  return (
    <Section label="Period-over-period" aside="each metric this period vs. the prior period">
      <DataTable columns={columns} rows={rows} rowKey="key" caption="Period-over-period comparison" />
    </Section>
  )
}

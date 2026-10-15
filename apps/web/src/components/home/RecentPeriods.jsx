// Recent saved-periods quick access for the home command center. Shows the most
// recent saved periods (newest-first); each row deep-links into the Statements &
// Periods page with that period preselected (?period=<id>). Premium UI P4: a
// Section on the ground with a DataTable (period · period end · open), no cards.
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'
import { DataTable, Section } from '../ui/surface/index.js'

export default function RecentPeriods({ periods }) {
  const recent = (periods || []).filter((p) => p.hasSnapshot).slice(0, 5)
  if (recent.length === 0) return null

  const href = (p) => `/statements?period=${encodeURIComponent(p.id)}`
  const columns = [
    {
      key: 'label',
      header: 'Period',
      render: (p) => (
        <Link to={href(p)} className="dt-link font-semibold text-ink">
          {p.label}
        </Link>
      ),
    },
    { key: 'periodEndDate', header: 'Period end', num: true, render: (p) => formatShortDate(p.periodEndDate) },
    {
      key: 'open',
      header: <span className="sr-only">Open</span>,
      num: true,
      render: (p) => (
        <Link to={href(p)} className="sec-more mt-0" aria-label={`Open ${p.label}`}>
          Open <ChevronRight size={13} aria-hidden="true" />
        </Link>
      ),
    },
  ]

  return (
    <Section
      label="Recent periods"
      aside={
        <Link to="/statements" className="sec-more mt-0">
          View all <ChevronRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      <DataTable columns={columns} rows={recent} rowKey="id" caption="Recent saved periods" />
    </Section>
  )
}

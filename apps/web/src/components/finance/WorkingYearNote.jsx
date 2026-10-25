// WorkingYearNote — "Working on FY24 · year ending June 30, 2024", shown above
// the Monthly numbers / Budget step when the person opened it for a year other
// than the one the page is on (a Replace or "Manage months" in Already on file).
import { yearHeading } from '../../lib/financeInventory.js'

export default function WorkingYearNote({ period }) {
  if (!period) return null
  return (
    <p className="mb-3 text-[13px] text-ink2" data-testid="working-year">
      Working on {yearHeading(period)}
    </p>
  )
}

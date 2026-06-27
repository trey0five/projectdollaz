// ─────────────────────────────────────────────────────────────────────────────
// Monthly Actuals — Reports-hub section wrapper. The hub isn't pinned to a single
// period, so this thin wrapper supplies a period <select> (defaulting to the live
// snapshot period) and derives canEdit from the active school's role, then mounts
// the self-contained MonthlyActualsPanel. Additive surface only — it does NOT
// touch the annual intake, the board report, or the granularity selector.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { formatShortDate, PERIOD_LABELS } from '../../lib/format.js'
import MonthlyActualsPanel from './MonthlyActualsPanel.jsx'

export default function MonthlyActualsSection({ periods = [], initialPeriodId = null }) {
  const { activeSchool } = useSchools()
  const canEdit =
    activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const periodOptions = useMemo(() => periods || [], [periods])
  const [periodId, setPeriodId] = useState(
    initialPeriodId || periodOptions[0]?.id || '',
  )

  const periodLabel = (p) => {
    const kind = PERIOD_LABELS[p.periodType] || ''
    const date = formatShortDate(p.periodEndDate)
    return [p.label, kind, date].filter(Boolean).join(' · ')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="monthly-period"
          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
        >
          Fiscal period
        </label>
        {periodOptions.length === 0 ? (
          <span className="text-[13px] italic text-muted">No saved periods yet.</span>
        ) : (
          <select
            id="monthly-period"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="rounded-xl border border-rule bg-white px-3.5 py-2 text-[14px] text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
          >
            {periodOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        )}
      </div>

      <MonthlyActualsPanel
        schoolId={activeSchool?.id ?? null}
        periodId={periodId || null}
        canEdit={canEdit}
      />
    </div>
  )
}

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
import MonthlyActualsPanel, { MONTHLY_BLURB } from './MonthlyActualsPanel.jsx'
import { PageHeader } from '../ui/surface/index.js'

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
      <PageHeader
        eyebrow="Reports · Monthly actuals"
        title="Monthly actuals"
        meta={MONTHLY_BLURB}
        hue="37 99 235"
        actions={
          periodOptions.length === 0 ? (
            <span className="text-small italic text-ink2">No saved periods yet.</span>
          ) : (
            <label className="flex items-center gap-2">
              <span className="toolbar-label">Fiscal period</span>
              <select
                id="monthly-period"
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="sel h-9 w-auto"
                // .sel caps at 16rem, which clipped "… · Jun 30, 2026" mid-date.
                style={{ maxWidth: 'min(24rem, 100%)' }}
              >
                {periodOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {periodLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />

      <MonthlyActualsPanel
        schoolId={activeSchool?.id ?? null}
        periodId={periodId || null}
        canEdit={canEdit}
        hosted
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Actuals — Reports-hub section wrapper. The hub isn't pinned to a single
// period, so this thin wrapper supplies the band's year switch (defaulting to the
// live snapshot period) and derives canEdit from the active school's role, then
// mounts the self-contained MonthlyActualsPanel. Additive surface only — it does
// NOT touch the annual intake, the board report, or the granularity selector.
//
// Aurora: "Upload a month" is the band's ONE primary button — the panel's upload
// state is lifted here (controlled `upload` / `onUploadChange`) so the panel
// drops its own two copies of that button.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useBilling } from '../../context/BillingContext.jsx'
import MonthlyActualsPanel from './MonthlyActualsPanel.jsx'
import { AuroraButton, AuroraSection, HowThisWorks } from '../ui/aurora/index.js'
import { FinanceSubBand, FinancePeriodSwitch } from '../statements/financeSub.jsx'

export default function MonthlyActualsSection({ periods = [], initialPeriodId = null }) {
  const { activeSchool } = useSchools()
  const { entitled } = useBilling()
  const canEdit =
    activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const periodOptions = useMemo(() => periods || [], [periods])
  const [periodId, setPeriodId] = useState(
    initialPeriodId || periodOptions[0]?.id || '',
  )
  // null = idle; { month } = the upload card is open ('' = pick a month).
  const [upload, setUpload] = useState(null)
  const pickPeriod = (id) => {
    setUpload(null)
    setPeriodId(id)
  }

  return (
    <div className="space-y-5">
      <FinanceSubBand
        eyebrow="Month by month"
        title="Monthly Actuals"
        verdict={<>Add each month&rsquo;s numbers to see where the year stands as it goes.</>}
        actions={
          canEdit && periodId && entitled !== false && !upload ? (
            <AuroraButton variant="primary" onClick={() => setUpload({ month: '' })} icon={<Plus size={19} aria-hidden="true" />}>
              Upload a month
            </AuroraButton>
          ) : null
        }
        tools={periodOptions.length === 0 ? <span className="pill">No saved years yet</span> : null}
        aside={<FinancePeriodSwitch periods={periodOptions} activeId={periodId} onSelect={pickPeriod} label="Fiscal period" />}
      />

      <AuroraSection first icon={CalendarClock} title="Your months" subtitle="One year-to-date trial balance per month-end">
        <MonthlyActualsPanel
          schoolId={activeSchool?.id ?? null}
          periodId={periodId || null}
          canEdit={canEdit}
          hosted
          upload={upload}
          onUploadChange={setUpload}
        />
      </AuroraSection>

      <HowThisWorks>
        <p>
          Add each month-end trial balance (year-to-date figures) as the year goes on, so you can see where the year
          stands month by month — not just at year-end.
        </p>
      </HowThisWorks>
    </div>
  )
}

import { useApp } from '../context/AppContext.jsx'
import { inferPeriod } from '@finrep/ingestion'

/** Reactive period-end date + period-type, pre-filled from the CY file. */
export default function PeriodControls() {
  const {
    periodType,
    setPeriodType,
    periodDate,
    setPeriodDate,
    periodTouched,
    byRole,
  } = useApp()

  // `periodDate` from context is the EFFECTIVE date (detected-until-touched).
  const cyMeta = byRole.cy?.metadata
  const detected = cyMeta ? inferPeriod(cyMeta) : null
  const detectedDate = detected?.periodEndDate

  // The date is auto-filled from the CY-slot file ONLY when the user hasn't
  // touched it AND that file actually supplied a detected date (which the
  // effective value is now showing). Truthful — never claims an auto-fill when
  // the field is empty.
  const autoFilled = !periodTouched && !!detectedDate && periodDate === detectedDate
  const showReset = periodTouched && detectedDate && detectedDate !== periodDate

  return (
    <div className="flex flex-wrap items-end gap-5 rounded-2xl border-2 border-border bg-white p-4 shadow-card">
      <div className="flex flex-col">
        <span className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          Period End Date
        </span>
        <input
          type="date"
          value={periodDate}
          onChange={(e) => setPeriodDate(e.target.value)}
          className={`cursor-pointer rounded-xl border-2 bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold ${
            periodDate ? 'border-border' : 'border-gold shadow-glow'
          }`}
        />
      </div>

      <div className="flex flex-col">
        <span className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          Reporting Period
        </span>
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value)}
          className="cursor-pointer appearance-none rounded-xl border-2 border-border bg-white px-4 py-3.5 text-sm text-ink outline-none transition-colors focus:border-gold"
        >
          <option value="ytd">Year-to-Date (YTD)</option>
          <option value="mtd">Month-to-Date (MTD)</option>
          <option value="fy">Full Fiscal Year</option>
        </select>
      </div>

      <div className="flex flex-col pb-1 text-[12px] text-muted">
        {autoFilled && (
          <span className="italic">
            Auto-filled from {byRole.cy?.fileName}
          </span>
        )}
        {!periodDate && (
          <span className="italic text-[#7a5e00]">
            Set a period-end date to preview statements.
          </span>
        )}
        {showReset && (
          <button
            type="button"
            onClick={() => setPeriodDate(detectedDate)}
            className="self-start text-left font-semibold text-gold underline-offset-2 hover:underline"
          >
            Use detected date
          </button>
        )}
      </div>
    </div>
  )
}

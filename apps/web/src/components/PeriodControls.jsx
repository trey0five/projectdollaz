import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { inferPeriod } from '@finrep/ingestion'
import { formatShortDate } from '../lib/format.js'
import DatePicker from './ui/DatePicker.jsx'

const TYPE_LABEL = {
  ytd: 'Year-to-Date',
  mtd: 'Month-to-Date',
  fy: 'Full Fiscal Year',
}

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

  // When the period was confidently auto-filled, default to a compact CONFIRMATION
  // row (it reads as "we set this for you — change if needed") instead of two big
  // inputs. The user can expand to edit. Any non-auto-filled / empty / touched
  // state shows the full controls.
  const [editing, setEditing] = useState(false)
  const collapsed = autoFilled && !editing

  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-border bg-white px-4 py-3.5 shadow-card">
        <p className="text-[14px] text-navy">
          <span className="font-semibold uppercase tracking-[0.1em] text-muted">Period:</span>{' '}
          <span className="font-semibold">{TYPE_LABEL[periodType] || 'Full Fiscal Year'}</span>{' '}
          ending <span className="font-semibold">{formatShortDate(periodDate)}</span>
          <span className="ml-2 text-muted">· auto-detected from {byRole.cy?.fileName}</span>
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gold/40 px-3 py-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-gold transition-colors hover:bg-gold/5"
        >
          <Pencil size={13} /> Change
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-5 rounded-2xl border-2 border-border bg-white p-4 shadow-card">
      <div className="flex flex-col">
        <span className="mb-2 text-[14px] font-semibold uppercase tracking-[0.12em] text-muted">
          Period End Date
        </span>
        <DatePicker
          value={periodDate}
          onChange={(v) => setPeriodDate(v)}
          className={`cursor-pointer rounded-xl border-2 bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-gold ${
            periodDate ? 'border-border' : 'border-gold shadow-glow'
          }`}
        />
      </div>

      <div className="flex flex-col">
        <span className="mb-2 text-[14px] font-semibold uppercase tracking-[0.12em] text-muted">
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

      <div className="flex flex-col pb-1 text-[14px] text-muted">
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

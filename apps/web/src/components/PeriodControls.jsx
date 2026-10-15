import { useState } from 'react'
import '../styles/pending/b2-finance.css'
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-hair py-3">
        <p className="text-small text-ink">
          <span className="font-semibold uppercase tracking-[0.1em] text-ink2">Period:</span>{' '}
          <span className="font-semibold">{TYPE_LABEL[periodType] || 'Full Fiscal Year'}</span>{' '}
          ending <span className="font-semibold">{formatShortDate(periodDate)}</span>
          <span className="ml-2 text-ink2">· auto-detected from {byRole.cy?.fileName}</span>
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-quiet btn-sm"
        >
          <Pencil size={13} /> Change
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-5 border-y border-hair py-4">
      <div className="flex flex-col">
        <span className="b2-label">
          Period End Date
        </span>
        <DatePicker
          value={periodDate}
          onChange={(v) => setPeriodDate(v)}
          className={`b2-input w-auto cursor-pointer ${
            periodDate ? 'border-hair/[0.18]' : 'border-watch/70 '
          }`}
        />
      </div>

      <div className="flex flex-col">
        <span className="b2-label">
          Reporting Period
        </span>
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value)}
          className="sel h-9"
        >
          <option value="ytd">Year-to-Date (YTD)</option>
          <option value="mtd">Month-to-Date (MTD)</option>
          <option value="fy">Full Fiscal Year</option>
        </select>
      </div>

      <div className="flex flex-col pb-1 text-small text-ink2">
        {autoFilled && (
          <span className="italic">
            Auto-filled from {byRole.cy?.fileName}
          </span>
        )}
        {!periodDate && (
          <span className="italic text-ink">
            Set a period-end date to preview statements.
          </span>
        )}
        {showReset && (
          <button
            type="button"
            onClick={() => setPeriodDate(detectedDate)}
            className="self-start text-left font-semibold text-ink2 underline-offset-2 hover:underline"
          >
            Use detected date
          </button>
        )}
      </div>
    </div>
  )
}

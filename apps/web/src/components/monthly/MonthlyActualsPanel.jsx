// ─────────────────────────────────────────────────────────────────────────────
// Monthly Actuals — self-contained panel (foundation slice). Manages a period's
// monthly trial-balance snapshots: shows which fiscal-year months are loaded,
// and (for owners/accountants) uploads a new month / replaces / deletes one.
//
// This is INGESTION + AVAILABILITY only. The consuming MTD/YTD board view is
// deferred — this slice does NOT touch the annual intake, the board report, or
// the granularity selector. monthlyApi.actuals is wired in lib/api.js for the
// follow-up; this panel intentionally does not render it yet.
//
// State machine (no in-render component defs):
//   • idle  → the loaded-months strip + an "Upload a month" CTA
//   • upload→ the MonthlyUploadCard (optionally pre-set to a month for Replace)
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Plus, Loader2, Info } from 'lucide-react'
import { Section, Pill, Button } from '../ui/surface/index.js'
import '../../styles/pending/b2-finance.css'
import { monthlyApi, apiErrorMessage } from '../../lib/api.js'
import { useMonthlySnapshots } from '../../hooks/useMonthlySnapshots.js'
import { monthKeyLabel } from '../../lib/monthlyShapes.js'
import MonthlyUploadCard from './MonthlyUploadCard.jsx'
import LoadedMonthsList from './LoadedMonthsList.jsx'

// What monthly actuals are, in the user's terms (shared with the hub header).
export const MONTHLY_BLURB =
  'Add each month-end trial balance (year-to-date figures) as the year goes on, so you can see where the year stands month by month — not just at year-end.'

// `hosted` — the caller (the Reports hub's MonthlyActualsSection) already shows
// a PageHeader titled "Monthly actuals", so the panel drops its own heading and
// keeps only the upload action.
export default function MonthlyActualsPanel({ schoolId, periodId, canEdit = false, hosted = false }) {
  const { fiscalYearStart, months, loading, error, notEntitled, reload } = useMonthlySnapshots(
    schoolId,
    periodId,
  )

  // 'idle' | 'upload'. When opening upload via a cell's Replace/Add, pre-set the
  // month so the picker lands on it.
  const [mode, setMode] = useState('idle')
  const [presetMonth, setPresetMonth] = useState('')
  const [toast, setToast] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const loadedMonthKeys = months.map((m) => m.monthKey)

  const openUpload = (monthKey = '') => {
    setPresetMonth(monthKey)
    setMode('upload')
    setDeleteError('')
  }

  const closeUpload = () => {
    setMode('idle')
    setPresetMonth('')
  }

  const onSaved = async (res) => {
    setToast(`${res?.replaced ? 'Replaced' : 'Saved'} ${monthKeyLabel(res?.monthKey)}.`)
    closeUpload()
    await reload()
    if (typeof window !== 'undefined') window.setTimeout(() => setToast(''), 3500)
  }

  const onDelete = async (monthKey) => {
    setDeleteError('')
    try {
      await monthlyApi.remove(schoolId, periodId, monthKey)
      setToast(`Removed ${monthKeyLabel(monthKey)}.`)
      await reload()
      if (typeof window !== 'undefined') window.setTimeout(() => setToast(''), 3500)
    } catch (e) {
      setDeleteError(apiErrorMessage(e, 'Could not delete that month.'))
    }
  }

  if (!periodId) {
    return (
      <div className="b2-note">
        <p>Select a period to manage its monthly actuals.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[180px] items-center justify-center">
        <Loader2 size={24} aria-label="Loading" className="animate-spin text-ink2" />
      </div>
    )
  }

  if (notEntitled) {
    return (
      <div className="b2-note">
        <p>Monthly actuals are part of your subscription — reactivate to upload monthly trial balances.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className={`flex flex-wrap items-start gap-3 ${hosted ? 'justify-end' : 'justify-between'}`}>
        {!hosted && (
          <div className="flex items-start gap-2.5">
            <CalendarClock size={18} aria-hidden="true" className="mt-1.5 shrink-0 text-ink2" />
            <div>
              <h2 className="font-serif text-title font-medium text-ink">Monthly actuals</h2>
              <p className="mt-0.5 max-w-xl text-small text-ink2">{MONTHLY_BLURB}</p>
            </div>
          </div>
        )}
        {canEdit && mode === 'idle' && (
          <Button variant="primary" onClick={() => openUpload('')} icon={<Plus size={14} />}>
            Upload a month
          </Button>
        )}
      </div>

      {error && (
        <p className="b2-callout b2-risk" role="alert">
          {error}
        </p>
      )}
      {deleteError && (
        <p className="b2-callout b2-risk" role="alert">
          {deleteError}
        </p>
      )}
      {toast && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="b2-callout b2-good font-medium"
          role="status"
        >
          {toast}
        </motion.p>
      )}

      {mode === 'upload' && canEdit && (
        <MonthlyUploadCard
          schoolId={schoolId}
          periodId={periodId}
          fiscalYearStart={fiscalYearStart}
          loadedMonthKeys={loadedMonthKeys}
          initialMonthKey={presetMonth}
          onSaved={onSaved}
          onCancel={closeUpload}
        />
      )}

      {months.length === 0 && mode === 'idle' ? (
        <div className="b2-note">
          <p className="b2-note-title">No monthly trial balances loaded yet.</p>
          <p className="mx-auto flex max-w-md items-center justify-center gap-1.5">
            <Info size={13} aria-hidden="true" className="shrink-0" />
            Each month should be a cumulative year-to-date trial balance as of that month-end.
          </p>
          {canEdit && (
            <div className="pt-2">
              <Button variant="secondary" onClick={() => openUpload('')} icon={<Plus size={14} />}>
                Upload your first month
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Section
          label={`Fiscal year ${fiscalYearStart ? `(${fiscalYearStart.slice(0, 4)}–${Number(fiscalYearStart.slice(0, 4)) + 1})` : ''}`}
          aside={<Pill variant="count">{months.length} of 12 months loaded</Pill>}
          className="!mt-2"
        >
          <LoadedMonthsList
            fiscalYearStart={fiscalYearStart}
            months={months}
            canEdit={canEdit}
            onReplace={openUpload}
            onDelete={onDelete}
          />
        </Section>
      )}
    </div>
  )
}

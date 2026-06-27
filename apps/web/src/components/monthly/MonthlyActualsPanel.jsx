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
import { monthlyApi, apiErrorMessage } from '../../lib/api.js'
import { useMonthlySnapshots } from '../../hooks/useMonthlySnapshots.js'
import { monthKeyLabel } from '../../lib/monthlyShapes.js'
import MonthlyUploadCard from './MonthlyUploadCard.jsx'
import LoadedMonthsList from './LoadedMonthsList.jsx'

export default function MonthlyActualsPanel({ schoolId, periodId, canEdit = false }) {
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
      <div className="rounded-2xl border-2 border-dashed border-rule bg-section/50 px-6 py-12 text-center">
        <p className="font-serif text-lg italic text-muted">
          Select a period to manage its monthly actuals.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[180px] items-center justify-center">
        <Loader2 size={26} className="animate-spin text-gold" />
      </div>
    )
  }

  if (notEntitled) {
    return (
      <div className="rounded-2xl border border-rule bg-white px-6 py-12 text-center shadow-card">
        <p className="font-serif text-lg italic text-muted">
          Monthly actuals are part of your subscription — reactivate to upload monthly trial balances.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
            <CalendarClock size={22} />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold text-navy">Monthly actuals</h2>
            <p className="mt-0.5 max-w-xl text-[13px] text-muted">
              Upload a month-end (cumulative-YTD) trial balance for each month of the fiscal year.
              These feed year-to-date and month-to-date actuals for an upcoming board-report view.
            </p>
          </div>
        </div>
        {canEdit && mode === 'idle' && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => openUpload('')}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={15} /> Upload a month
          </motion.button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          {error}
        </div>
      )}
      {deleteError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          {deleteError}
        </div>
      )}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-[13px] font-medium text-emerald-800"
        >
          {toast}
        </motion.div>
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
        <div className="rounded-2xl border-2 border-dashed border-rule bg-section/40 px-6 py-12 text-center">
          <p className="font-serif text-lg italic text-muted">No monthly trial balances loaded yet.</p>
          <p className="mx-auto mt-1.5 flex max-w-md items-center justify-center gap-1.5 text-[12px] text-muted">
            <Info size={13} className="shrink-0 text-gold" />
            Each month should be a cumulative year-to-date trial balance as of that month-end.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => openUpload('')}
              className="btn-ghost mt-4 inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Upload your first month
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Fiscal year {fiscalYearStart ? `(${fiscalYearStart.slice(0, 4)}–${Number(fiscalYearStart.slice(0, 4)) + 1})` : ''}
            </h3>
            <span className="text-[12px] text-muted">
              {months.length} of 12 months loaded
            </span>
          </div>
          <LoadedMonthsList
            fiscalYearStart={fiscalYearStart}
            months={months}
            canEdit={canEdit}
            onReplace={openUpload}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  )
}

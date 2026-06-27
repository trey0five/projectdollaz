// ─────────────────────────────────────────────────────────────────────────────
// Monthly Actuals — loaded-months strip. A 12-cell fiscal-year grid Jul→Jun.
// Each cell is either LOADED (sourceName · rowCount · updatedAt, with Replace +
// Delete) or EMPTY (muted, "Add" when editable). Availability only — NO MTD/YTD
// rendering this slice (deferred to the board-report view).
//
// Pure presentation over props; the Delete confirm is a tiny inline two-step on
// local state (no in-render component defs). Animated fill on load. Navy/gold.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Plus, RotateCcw, Trash2, Loader2, FileSpreadsheet } from 'lucide-react'
import { fyMonthKeys } from '../../lib/monthlyShapes.js'
import { formatRelative } from '../../lib/format.js'

export default function LoadedMonthsList({
  fiscalYearStart,
  months = [],
  canEdit = false,
  onReplace,
  onDelete,
}) {
  // local: which monthKey is pending a delete confirm / in-flight.
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const cells = useMemo(() => fyMonthKeys(fiscalYearStart), [fiscalYearStart])
  const byKey = useMemo(() => {
    const map = new Map()
    for (const m of months) map.set(m.monthKey, m)
    return map
  }, [months])

  const handleDelete = async (monthKey) => {
    setDeleting(monthKey)
    try {
      await onDelete?.(monthKey)
    } finally {
      setDeleting(null)
      setConfirming(null)
    }
  }

  if (!cells.length) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cells.map((cell, i) => {
        const loaded = byKey.get(cell.monthKey)
        const isConfirming = confirming === cell.monthKey
        const isDeleting = deleting === cell.monthKey
        return (
          <motion.div
            key={cell.monthKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 * i }}
            className={`flex min-h-[118px] flex-col rounded-xl border p-3.5 transition-colors ${
              loaded
                ? 'border-gold/40 bg-white shadow-card'
                : 'border-dashed border-rule/70 bg-section/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-[12px] font-bold uppercase tracking-[0.08em] ${
                  loaded ? 'text-navy' : 'text-muted'
                }`}
              >
                {cell.label}
              </span>
              {loaded && <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />}
            </div>

            {loaded ? (
              <>
                <div className="mt-2 flex min-w-0 items-center gap-1.5">
                  <FileSpreadsheet size={13} className="shrink-0 text-gold" />
                  <span className="truncate text-[12px] font-medium text-ink" title={loaded.sourceName}>
                    {loaded.sourceName}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {loaded.rowCount} rows
                  {loaded.updatedAt ? ` · ${formatRelative(loaded.updatedAt)}` : ''}
                </p>

                {canEdit && (
                  <div className="mt-auto pt-2.5">
                    {isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDelete(cell.monthKey)}
                          disabled={isDeleting}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 px-2 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
                        >
                          {isDeleting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          disabled={isDeleting}
                          className="rounded-lg border border-rule px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-navy"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onReplace?.(cell.monthKey)}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rule px-2 py-1.5 text-[11px] font-semibold text-navy transition-colors hover:border-gold/60 hover:text-gold"
                        >
                          <RotateCcw size={12} /> Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(cell.monthKey)}
                          aria-label={`Delete ${cell.label}`}
                          className="rounded-lg border border-rule p-1.5 text-muted transition-colors hover:border-rose-300 hover:text-rose-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-auto pt-2.5">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onReplace?.(cell.monthKey)}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-rule px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:border-gold/60 hover:text-gold"
                  >
                    <Plus size={12} /> Add
                  </button>
                ) : (
                  <span className="text-[11px] italic text-muted/70">Not loaded</span>
                )}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

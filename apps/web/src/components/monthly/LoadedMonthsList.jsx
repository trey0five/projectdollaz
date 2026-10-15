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
import { Plus, RotateCcw, Trash2, Loader2, FileSpreadsheet } from 'lucide-react'
import { fyMonthKeys } from '../../lib/monthlyShapes.js'
import { formatRelative } from '../../lib/format.js'
import { DataTable, Button } from '../ui/surface/index.js'

// Premium UI P4: the twelve fiscal months as ONE DataTable (Month · Source ·
// Rows · Updated · actions) with a 2px status mark per row (loaded = good),
// not a wall of month cards. Row actions fade in on hover (always on under
// touch / focus); the delete keeps its inline two-step confirm.
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

  const rows = cells.map((cell) => ({ ...cell, loaded: byKey.get(cell.monthKey) ?? null }))

  const renderActions = (r) => {
    if (!canEdit) return r.loaded ? null : <span className="text-[12px] italic text-ink2">Not loaded</span>
    if (!r.loaded) {
      return (
        <span className="dt-actions inline-flex">
          <Button variant="quiet" size="sm" onClick={() => onReplace?.(r.monthKey)} icon={<Plus size={12} />}>
            Add
          </Button>
        </span>
      )
    }
    const isConfirming = confirming === r.monthKey
    const isDeleting = deleting === r.monthKey
    if (isConfirming) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-ink">Delete {r.label}?</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleDelete(r.monthKey)}
            disabled={isDeleting}
            icon={isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          >
            Confirm
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setConfirming(null)} disabled={isDeleting}>
            Cancel
          </Button>
        </span>
      )
    }
    return (
      <span className="dt-actions inline-flex items-center gap-1">
        <Button variant="quiet" size="sm" onClick={() => onReplace?.(r.monthKey)} icon={<RotateCcw size={12} />}>
          Replace
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={() => setConfirming(r.monthKey)}
          aria-label={`Delete ${r.label}`}
          icon={<Trash2 size={12} />}
        />
      </span>
    )
  }

  const columns = [
    { key: 'label', header: 'Month', render: (r) => <span className={r.loaded ? 'font-semibold text-ink' : 'text-ink2'}>{r.label}</span> },
    {
      key: 'source',
      header: 'Trial balance',
      render: (r) =>
        r.loaded ? (
          <span className="inline-flex max-w-[260px] items-center gap-1.5" title={r.loaded.sourceName}>
            <FileSpreadsheet size={13} aria-hidden="true" className="shrink-0 text-ink2" />
            <span className="truncate">{r.loaded.sourceName}</span>
          </span>
        ) : (
          <span className="text-ink2">—</span>
        ),
    },
    { key: 'rows', header: 'Rows', num: true, render: (r) => (r.loaded ? r.loaded.rowCount : '—') },
    {
      key: 'updated',
      header: 'Updated',
      className: 'whitespace-nowrap text-ink2',
      render: (r) => (r.loaded?.updatedAt ? formatRelative(r.loaded.updatedAt) : '—'),
    },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right whitespace-nowrap', render: renderActions },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey="monthKey"
      markOf={(r) => (r.loaded ? 'good' : null)}
      caption="Monthly trial balances for the fiscal year"
    />
  )
}

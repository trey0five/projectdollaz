import { Reorder } from 'framer-motion'
import CustomizeMetricRow from './CustomizeMetricRow.jsx'

/**
 * The customize-mode editor: a draggable, reorderable list of metric rows. The
 * working `draft` lives in the parent (AnalyticsDashboard) so Save/Cancel can
 * persist/revert. Reorder.Group drives drag reordering; each row also offers
 * up/down arrows + a visibility toggle + a chart-variant control.
 *
 * Items are keyed by metricKey (stable) and the Reorder value IS the item object,
 * so onReorder hands back the new ordered array directly.
 */
export default function CustomizePanel({ draft, onChange }) {
  const visibleCount = draft.filter((i) => i.visible).length

  const setItem = (metricKey, patch) =>
    onChange(draft.map((i) => (i.metricKey === metricKey ? { ...i, ...patch } : i)))

  const move = (metricKey, dir) => {
    const idx = draft.findIndex((i) => i.metricKey === metricKey)
    const next = idx + dir
    if (idx < 0 || next < 0 || next >= draft.length) return
    const copy = draft.slice()
    const [it] = copy.splice(idx, 1)
    copy.splice(next, 0, it)
    onChange(copy)
  }

  return (
    <div className="rounded-2xl border border-gold/30 bg-section p-4 shadow-card ring-1 ring-gold/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Drag the handle or use the arrows to reorder · eye to show/hide · chart &amp; wide per metric
        </p>
        <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-navy">
          {visibleCount} shown
        </span>
      </div>
      <Reorder.Group
        axis="y"
        values={draft}
        onReorder={onChange}
        className="flex flex-col gap-2"
      >
        {draft.map((item, idx) => (
          <CustomizeMetricRow
            key={item.metricKey}
            item={item}
            isFirst={idx === 0}
            isLast={idx === draft.length - 1}
            canHide={visibleCount > 1}
            onToggleVisible={() => setItem(item.metricKey, { visible: !item.visible })}
            onChart={(chart) => setItem(item.metricKey, { chart })}
            onSpan={(span) => setItem(item.metricKey, { span })}
            onMoveUp={() => move(item.metricKey, -1)}
            onMoveDown={() => move(item.metricKey, +1)}
          />
        ))}
      </Reorder.Group>
    </div>
  )
}

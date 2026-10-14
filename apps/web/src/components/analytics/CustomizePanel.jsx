import { Reorder } from 'framer-motion'
import CustomizeMetricRow from './CustomizeMetricRow.jsx'
import { Panel, Pill } from '../ui/surface/index.js'

/**
 * The customize-mode editor: a draggable, reorderable list of metric rows. The
 * working `draft` lives in the parent (AnalyticsDashboard / Scorecard) so
 * Save/Cancel can persist/revert. Reorder.Group drives drag reordering; each row
 * also offers up/down arrows + a visibility toggle + a chart-variant control.
 *
 * Items are keyed by metricKey (stable) and the Reorder value IS the item object,
 * so onReorder hands back the new ordered array directly. Premium UI P3: a
 * `Panel` (it is a form), a count `Pill`, no gold ring.
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
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-micro font-semibold uppercase text-ink2">
          Drag the handle or use the arrows to reorder · eye to show/hide · chart &amp; wide per metric
        </p>
        <Pill variant="count">{visibleCount} shown</Pill>
      </div>
      <Reorder.Group axis="y" values={draft} onReorder={onChange} className="flex flex-col gap-2">
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
    </Panel>
  )
}

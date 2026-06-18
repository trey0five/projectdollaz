import { Reorder, useDragControls, useReducedMotion } from 'framer-motion'
import {
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  PieChart,
  RectangleHorizontal,
} from 'lucide-react'
import MetricIcon from './MetricIcon.jsx'
import { metricLabel, isMixMetric } from '../../lib/metricMeta.js'

const CHART_OPTS = [
  { key: 'auto', label: 'Auto' },
  { key: 'value', label: 'Value' },
  { key: 'trend', label: 'Trend' },
]

/**
 * One editable metric row in customize mode. A framer-motion Reorder.Item with:
 *  - a GripVertical DRAG HANDLE (drag scoped to the handle so toggles/clicks
 *    never trigger an accidental drag),
 *  - Up/Down arrows as the accessible/keyboard reorder path (disabled at ends),
 *  - an Eye/EyeOff visibility toggle (cannot hide the last visible metric),
 *  - a chart-variant segmented control for scalar metrics; mix metrics show a
 *    locked "Donut" pill (server always renders them as donuts),
 *  - a "Wide" span toggle for scalar metrics (span 1<->2).
 * useReducedMotion-gated: when reduced, drag is disabled and arrows are the path.
 */
export default function CustomizeMetricRow({
  item,
  isFirst,
  isLast,
  canHide,
  onToggleVisible,
  onChart,
  onSpan,
  onMoveUp,
  onMoveDown,
}) {
  const reduce = useReducedMotion()
  const dragControls = useDragControls()
  const mix = isMixMetric(item.metricKey)
  const hidden = !item.visible

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      layout={reduce ? false : 'position'}
      initial={false}
      whileDrag={reduce ? undefined : { scale: 1.02, boxShadow: '0 12px 30px rgba(184,150,80,0.25)' }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22 }}
      className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 ${
        hidden ? 'border-dashed border-border opacity-60' : 'border-border'
      }`}
    >
      {/* Drag handle — drag is scoped here only */}
      <button
        type="button"
        aria-label={`Drag to reorder ${metricLabel(item.metricKey)}`}
        onPointerDown={(e) => {
          if (!reduce) dragControls.start(e)
        }}
        className={`shrink-0 rounded-md p-1 text-muted transition-colors hover:text-gold ${
          reduce ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <GripVertical size={16} />
      </button>

      {/* Up/Down — accessible reorder fallback */}
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          aria-label={`Move ${metricLabel(item.metricKey)} up`}
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded-md p-0.5 text-muted transition-colors hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          aria-label={`Move ${metricLabel(item.metricKey)} down`}
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded-md p-0.5 text-muted transition-colors hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {/* Icon + label */}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          hidden ? 'bg-section text-muted' : 'bg-gold/15 text-gold'
        }`}
      >
        <MetricIcon metricKey={item.metricKey} size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-semibold text-navy">
        {metricLabel(item.metricKey)}
      </span>

      {/* Chart variant (scalar) or locked Donut pill (mix) */}
      {mix ? (
        <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-section px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted sm:inline-flex">
          <PieChart size={11} /> Donut
        </span>
      ) : (
        <div className="hidden shrink-0 overflow-hidden rounded-lg border border-border sm:flex">
          {CHART_OPTS.map((opt) => {
            const active = (item.chart ?? 'auto') === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChart(opt.key)}
                disabled={hidden}
                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? 'bg-gold/15 text-navy' : 'text-muted hover:text-navy'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Wide (span:2) toggle — scalar only */}
      {!mix && (
        <button
          type="button"
          aria-label={`Make ${metricLabel(item.metricKey)} ${item.span === 2 ? 'standard' : 'wide'}`}
          aria-pressed={item.span === 2}
          onClick={() => onSpan(item.span === 2 ? 1 : 2)}
          disabled={hidden}
          title={item.span === 2 ? 'Wide card (spans two columns)' : 'Standard card width'}
          className={`hidden shrink-0 rounded-lg border p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex ${
            item.span === 2
              ? 'border-gold bg-gold/10 text-gold'
              : 'border-border text-muted hover:border-gold/60 hover:text-gold'
          }`}
        >
          <RectangleHorizontal size={15} />
        </button>
      )}

      {/* Visibility toggle */}
      <button
        type="button"
        aria-label={hidden ? `Show ${metricLabel(item.metricKey)}` : `Hide ${metricLabel(item.metricKey)}`}
        aria-pressed={item.visible}
        onClick={onToggleVisible}
        disabled={!hidden && !canHide}
        title={!hidden && !canHide ? 'At least one metric must stay visible' : undefined}
        className={`shrink-0 rounded-lg border p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          hidden
            ? 'border-border text-muted hover:border-gold/60 hover:text-gold'
            : 'border-gold bg-gold/10 text-gold'
        }`}
      >
        {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </Reorder.Item>
  )
}

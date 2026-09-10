import { CHROME } from './palette.js'
import { ABSENT_STYLE, SUPPRESSED_STYLE } from './heatScales.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// HeatCell — ONE cell primitive for every heat map, plus the scale legend that
// states its thresholds.
//
// The three grids used to each hand-roll a tinted <motion.div>: an inset ring
// around every mark (a border doing the job the surface gap should do), a
// hover scale that overlapped its neighbours, a native `title` nobody on a
// keyboard could reach, and "<5" painted the same grey as "never filed". This
// primitive fixes all four in one place:
//
//   • 2px SURFACE GAP between cells (the table's border-spacing), 4px corners,
//     NO ring — the white between cells is the separator.
//   • no hover transform; hover/focus raise the shared `useTooltip` singleton
//     (the same tooltip every chart in the library uses).
//   • `tabIndex=0 role="img" aria-label` on every cell, a visible focus ring in
//     the module's hue, and the tooltip opens on focus too.
//   • three STATES, three SURFACES: a value wears its step's fill and the ink
//     that clears AA on that fill; `suppressed` wears the amber hatch;
//     `absent` is barely there. The token printed in the cell says which.
//
// props: state='value'|'suppressed'|'absent', step={fill,ink} (value only),
//        label (aria), tip ({title,rows} | string), height=44, focusColor,
//        children (the printed token), className/style (extra)
// ─────────────────────────────────────────────────────────────────────────────
export default function HeatCell({
  state = 'value',
  step = null,
  label,
  tip,
  height = 44,
  focusColor = '#2563EB',
  className = '',
  style,
  children,
}) {
  const tooltip = useTooltip()
  const surface =
    state === 'suppressed'
      ? SUPPRESSED_STYLE
      : state === 'absent' || !step
        ? ABSENT_STYLE
        : { background: step.fill, color: step.ink }
  const show = (x, y) => tip && tooltip.show(tip, x, y)
  return (
    <div
      tabIndex={0}
      role="img"
      aria-label={label}
      data-heat-state={state}
      className={`grid place-items-center rounded-[4px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-offset-1 ${className}`}
      style={{ height, '--tw-ring-color': focusColor, ...surface, ...style }}
      onMouseMove={(ev) => show(ev.clientX, ev.clientY)}
      onMouseLeave={() => tooltip.hide()}
      onFocus={(ev) => {
        const r = ev.currentTarget.getBoundingClientRect()
        show(r.left + r.width / 2, r.bottom)
      }}
      onBlur={() => tooltip.hide()}
    >
      {children}
    </div>
  )
}

/**
 * The scale, stated with its real thresholds — a swatch per step and a tick at
 * every boundary, so "how dark is dark" is answered on the card, not guessed.
 *
 * props: steps=[{fill}] (pole → pole or light → dark), ticks=[string] with
 *        length steps+1 (boundary labels; '' skips one), title?, extras (nodes
 *        for the suppressed / absent keys), caption?
 */
export function HeatScaleLegend({ steps = [], ticks = [], title, extras = null, caption = null, swatchWidth = 30 }) {
  const n = steps.length
  if (n === 0) return null
  const width = n * swatchWidth
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div className="min-w-0">
          {title ? (
            <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: CHROME.axis }}>
              {title}
            </span>
          ) : null}
          <div style={{ width, maxWidth: '100%' }}>
            <div
              aria-hidden="true"
              className="grid h-2.5 overflow-hidden rounded-[3px]"
              style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 1 }}
            >
              {steps.map((s, i) => (
                <span key={i} style={{ background: s.fill }} />
              ))}
            </div>
            <div className="relative h-3.5" aria-hidden="true">
              {ticks.map((t, i) =>
                t === '' || t === null || t === undefined ? null : (
                  <span
                    key={i}
                    className="absolute top-0 whitespace-nowrap font-mono text-[9px] font-bold tabular-nums"
                    style={{
                      left: `${(100 * i) / n}%`,
                      transform: i === 0 ? 'none' : i === n ? 'translateX(-100%)' : 'translateX(-50%)',
                      color: CHROME.axis,
                    }}
                  >
                    {t}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
        {extras}
      </div>
      {caption ? <p className="text-[11px] leading-snug text-muted">{caption}</p> : null}
    </div>
  )
}

/** The two non-value keys, shared verbatim by every grid's legend. */
export function HeatStateKeys({ suppressedLabel = 'hidden, not zero', absentLabel = 'not on file', absentToken = '—' }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5 pb-3.5">
        <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px]" style={SUPPRESSED_STYLE} />
        <span className="text-[11px] text-muted">
          <span className="font-mono font-bold text-amber-700">&lt;5</span> — {suppressedLabel}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 pb-3.5">
        <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px]" style={ABSENT_STYLE} />
        <span className="text-[11px] text-muted">
          <span className="font-mono font-bold text-slate-400">{absentToken}</span> — {absentLabel}
        </span>
      </span>
    </>
  )
}

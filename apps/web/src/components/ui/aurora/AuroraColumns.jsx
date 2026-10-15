// ─────────────────────────────────────────────────────────────────────────────
// AuroraColumns — a small VERTICAL column chart (owner rule: bars are columns)
// for the 2–5 headline figures a section compares: money in / money out / left
// over, planned vs actual. One axis, recessive grid, a value label on every
// column (there are only a few), category labels under the baseline, a hover/
// focus tooltip per column, and 4px rounded data-ends anchored to the baseline.
// Negative values hang below a zero line.
//
//   bars   [{ key, label, value (number|null), display (formatted string),
//             color (css colour; default the module hue), dashed (planned) }]
//   tick   (n) => string for the y-axis ticks (default compact $)
//   ariaLabel  what the chart shows, for screen readers
// A null value draws no column and labels it "—" (never a zero).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'

const H = 230
const PAD_L = 48
const PAD_R = 8
const PAD_T = 26
const PAD_B = 30

function niceStep(span) {
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * mag
}

export function compactDollar(n) {
  const a = Math.abs(n)
  const s = n < 0 ? '−' : ''
  if (a >= 1e9) return `${s}$${+(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${s}$${+(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${s}$${+(a / 1e3).toFixed(0)}K`
  return `${s}$${Math.round(a)}`
}

// A column path with only the data-end corners rounded (top for positive,
// bottom for negative) — the baseline end stays square.
function colPath(x, y0, y1, w, r) {
  const up = y1 < y0
  const top = Math.min(y0, y1)
  const h = Math.abs(y1 - y0)
  const rr = Math.min(r, h / 2, w / 2)
  if (h < 0.5) return `M${x},${y0}h${w}`
  if (up) {
    return `M${x},${y0}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${y0}Z`
  }
  const bot = top + h
  return `M${x},${y0}V${bot - rr}Q${x},${bot} ${x + rr},${bot}H${x + w - rr}Q${x + w},${bot} ${x + w},${bot - rr}V${y0}Z`
}

export default function AuroraColumns({ bars = [], tick = compactDollar, ariaLabel = 'Column chart', className = '' }) {
  const [hover, setHover] = useState(null)
  // The chart is drawn at its REAL width (not a scaled viewBox) so the labels
  // stay legible on a phone instead of shrinking with the drawing.
  const ref = useRef(null)
  const [W, setW] = useState(520)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect?.width ?? 0)
      if (width > 0) setW(Math.max(240, width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const vals = bars.map((b) => (Number.isFinite(b.value) ? b.value : 0))
  const hi = Math.max(0, ...vals)
  const lo = Math.min(0, ...vals)
  const step = niceStep(hi - lo || 1)
  const top = Math.ceil(hi / step) * step || step
  const bottom = Math.floor(lo / step) * step
  const ticks = []
  for (let t = bottom; t <= top + step / 2; t += step) ticks.push(t)
  const plotH = H - PAD_T - PAD_B
  const y = (v) => PAD_T + ((top - v) / (top - bottom || 1)) * plotH
  const plotW = W - PAD_L - PAD_R
  const slot = plotW / Math.max(1, bars.length)
  const bw = Math.min(70, slot * 0.56)

  return (
    <div ref={ref} className={`au-chart${className ? ` ${className}` : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'au-chart-base' : 'au-chart-grid'} x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} />
            <text className="au-chart-tick" x={PAD_L - 8} y={y(t) + 4} textAnchor="end">
              {tick(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const has = Number.isFinite(b.value)
          const x = PAD_L + slot * i + (slot - bw) / 2
          const y0 = y(0)
          const y1 = has ? y(b.value) : y0
          const neg = has && b.value < 0
          const color = b.color ?? 'var(--au-h, #2563eb)'
          const shown = has ? (b.display ?? tick(b.value)) : '—'
          return (
            <g
              key={b.key ?? b.label}
              className="au-chart-col"
              tabIndex={0}
              role="img"
              aria-label={`${b.label}: ${shown}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              {/* generous invisible hit target */}
              <rect x={PAD_L + slot * i} y={PAD_T - 20} width={slot} height={plotH + 20} fill="transparent" />
              {has ? (
                <path
                  className="au-chart-bar"
                  d={colPath(x, y0, y1, bw, 4)}
                  fill={b.dashed ? 'rgba(148,163,184,.12)' : color}
                  stroke={b.dashed ? '#64748b' : 'none'}
                  strokeWidth={b.dashed ? 1.5 : 0}
                  strokeDasharray={b.dashed ? '6 5' : undefined}
                />
              ) : null}
              <text
                className="au-chart-val"
                x={x + bw / 2}
                y={neg ? y1 + 16 : y1 - 8}
                textAnchor="middle"
              >
                {shown}
              </text>
              <text className="au-chart-lab" x={x + bw / 2} y={H - 8} textAnchor="middle">
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>
      {hover != null && bars[hover] ? (
        <span
          className="au-chart-tip"
          role="presentation"
          style={{
            left: `${((PAD_L + slot * hover + slot / 2) / W) * 100}%`,
            top: `${((Number.isFinite(bars[hover].value) ? Math.min(y(bars[hover].value), y(0)) : y(0)) / H) * 100}%`,
          }}
        >
          {bars[hover].label}: {Number.isFinite(bars[hover].value) ? (bars[hover].full ?? bars[hover].display ?? tick(bars[hover].value)) : '—'}
        </span>
      ) : null}
    </div>
  )
}

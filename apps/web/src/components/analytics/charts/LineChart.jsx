import { useEffect, useId, useRef, useState } from 'react'
import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useMeasuredWidth } from './useMeasuredWidth.js'
import { useTooltip } from './Tooltip.jsx'
import { niceTicks } from './ColumnChart.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// LineChart — ports the mockup's lineChart(). SINGLE Y axis (never dual). Ported
// motion: staggered stroke-dasharray draw-in (one-shot), optional gradient area
// wash (.28→0), end-label collision avoidance with leader lines, and a
// crosshair + shared tooltip. `deemphId` greys every non-match series (mockup
// "context" mode); `spotlightId` dims non-matched groups to .16 (Legend hover).
// Colors come IN via series[].color.
//
// Y AXIS: clean 1/2/2.5/5 ticks (the ColumnChart ladder) over the data's own
// range, zero kept in view. Tick VALUES are never rounded to integers — a ratio
// metric (operating margin 0.164) used to print "0.0% 0.0% 0.0%" because every
// tick was Math.round()ed to 0 before the percent formatter saw it. Ticks run
// through `tickFormatter` (default: `formatter`), so a caller passes the
// metric's own unit formatter and the axis speaks the same unit as the values.
//
// HOVER LAYER (dataviz: crosshair + one tooltip listing every series):
//   pointer — the crosshair snaps to the nearest X; every series gets a ringed
//             dot at that X; the tooltip lists each series' value there.
//   keyboard — the chart is ONE tab stop; focus lands on the latest point,
//             ←/→ (and Home/End) step through the X positions, Esc hides.
//             Same details on focus as on hover.
//   touch   — pointer events, so a tap/drag shows the same readout.
//
// props: series=[{id,label,color,vals:number[]}], labels:string[], formatter?,
//        tickFormatter?, area?, deemphId?, spotlightId?, height?, ariaLabel?
//        (`pulseId` is accepted for compatibility and ignored — the infinite
//        end pulse was retired: motion is one-shot.)
// ─────────────────────────────────────────────────────────────────────────────
export default function LineChart({
  series = [],
  labels = [],
  formatter = (v) => v,
  tickFormatter,
  area = false,
  deemphId = null,
  spotlightId = null,
  height = 190,
  ariaLabel,
}) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  const [containerRef, W] = useMeasuredWidth(520)
  const svgRef = useRef(null)
  const pathRefs = useRef([])
  const [hoverI, setHoverI] = useState(null)
  const [focused, setFocused] = useState(false)
  const tip = useTooltip()
  const fmtTick = tickFormatter ?? formatter

  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const h = height
  const maxLab = Math.max(0, ...series.map((s) => (s.label || '').length))

  // Nice-number axis — ignore non-finite points so an empty/all-null series can
  // never poison the domain into -Infinity/NaN. Zero stays in view.
  const all = series.flatMap((s) => s.vals).filter((v) => Number.isFinite(v))
  const dataMax = all.length ? Math.max(...all) : 1
  const dataMin = all.length ? Math.min(...all) : 0
  let lo0 = Math.min(0, dataMin)
  let hi0 = Math.max(0, dataMax)
  // Degenerate (flat / all-zero) series: a DATA-RELATIVE span, never a fixed 1
  // (which turned an all-zero ratio into a meaningless 0%–100% axis).
  if (hi0 - lo0 < 1e-12) hi0 = lo0 + (Math.abs(lo0) * 0.1 || 0.05)
  let ticks0 = niceTicks(lo0, hi0, 4)
  // Extend to the nearest tick ABOVE/BELOW so the line never touches the frame.
  let step = ticks0.length > 1 ? ticks0[1] - ticks0[0] : hi0 - lo0
  // niceTicks rounds to 6 decimals, so a microscopic span collapses to all-zero
  // ticks (step 0 → NaN geometry). Fall back to a plain quartering of the span.
  if (!(step > 0)) {
    step = (hi0 - lo0) / 4 || 1
    ticks0 = [0, 1, 2, 3, 4].map((k) => lo0 + k * step)
  }
  const snap = (v) => Number((Math.round(v / step) * step).toPrecision(12))
  const min = ticks0.length ? Math.min(ticks0[0], snap(Math.floor(lo0 / step) * step)) : lo0
  const max = ticks0.length ? Math.max(ticks0[ticks0.length - 1], snap(Math.ceil(hi0 / step) * step)) : hi0
  const ticks = []
  for (let v = min; v <= max + step / 2; v += step) ticks.push(snap(v))

  const tickW = Math.max(28, ...ticks.map((t) => String(fmtTick(t)).length * 6.4 + 12))
  const P = { l: Math.round(tickW), r: Math.max(maxLab ? 56 : 18, maxLab * 7.5 + 22), t: 10, b: 24 }
  const iw = Math.max(10, W - P.l - P.r)
  const ih = h - P.t - P.b

  const X = (i) => P.l + iw * (labels.length < 2 ? 0.5 : i / (labels.length - 1))
  const Y = (v) => P.t + ih * (1 - (finite(v) - min) / (max - min || 1))

  // end-label collision avoidance (ported)
  const last = series[0] ? series[0].vals.length - 1 : 0
  const slots = series.map((s, si) => ({ si, y: Y(s.vals[last]) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < slots.length; i++) {
    if (slots[i].y - slots[i - 1].y < 13) slots[i].y = slots[i - 1].y + 13
  }
  const labelY = {}
  slots.forEach((s) => {
    labelY[s.si] = s.y
  })

  // staggered draw-in — runs on data/width change, NOT on spotlight (paths persist)
  const geomKey = W + '|' + series.map((s) => s.id + ':' + s.vals.join(',')).join('|')
  useEffect(() => {
    if (reduce) return
    pathRefs.current.forEach((p, i) => {
      if (!p) return
      try {
        const L = p.getTotalLength()
        p.style.strokeDasharray = `${L} ${L}`
        p.style.strokeDashoffset = String(L)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            p.style.transition = `stroke-dashoffset .9s cubic-bezier(.22,1,.36,1) ${i * 0.12}s`
            p.style.strokeDashoffset = '0'
          }),
        )
      } catch {
        /* getTotalLength can throw pre-layout */
      }
    })
  }, [reduce, geomKey])

  const n = labels.length
  // The tooltip is position:fixed — any page scroll strands it, so a scroll
  // clears the readout (re-shown by the next pointer move / arrow key).
  useEffect(() => {
    if (hoverI == null) return undefined
    const clear = () => {
      setHoverI(null)
      tip.hide()
    }
    window.addEventListener('scroll', clear, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', clear, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverI == null])
  const tipFor = (i) => ({
    title: labels[i],
    rows: series.map((s) => ({ color: s.color, label: s.name ?? s.label ?? '', value: formatter(s.vals[i]) })),
  })
  // Screen position of point i (for the keyboard tooltip, which has no pointer).
  const pointToClient = (i) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    const sx = r.width / W
    const top = Math.min(...series.map((s) => Y(s.vals[i])))
    return { x: r.left + X(i) * sx, y: r.top + (Number.isFinite(top) ? top : P.t) * sx }
  }
  const showAt = (i, cx, cy) => {
    setHoverI(i)
    tip.show(tipFor(i), cx, cy)
  }
  const indexAt = (clientX) => {
    const svg = svgRef.current
    if (!svg || n < 1) return null
    const r = svg.getBoundingClientRect()
    const mx = (clientX - r.left) * (W / r.width)
    if (n < 2) return 0
    const i = Math.round((mx - P.l) / (iw / (n - 1)))
    return Math.max(0, Math.min(n - 1, i))
  }

  function onPointerMove(ev) {
    const i = indexAt(ev.clientX)
    if (i == null) return
    showAt(i, ev.clientX, ev.clientY)
  }
  function onPointerLeave() {
    if (focused) return
    setHoverI(null)
    tip.hide()
  }
  // Pin the readout ONLY for keyboard focus: a mouse click also focuses the tab
  // stop, and pinning then left the fixed tooltip stranded after the pointer
  // left (and after the page scrolled) until blur.
  function onFocus(e) {
    if (n < 1) return
    try {
      if (!e.currentTarget.matches(':focus-visible')) return
    } catch {
      /* :focus-visible unsupported — treat as keyboard */
    }
    setFocused(true)
    const i = hoverI ?? n - 1
    const p = pointToClient(i)
    showAt(i, p.x, p.y)
  }
  function onBlur() {
    setFocused(false)
    setHoverI(null)
    tip.hide()
  }
  function onKeyDown(e) {
    if (n < 1) return
    let i = hoverI ?? n - 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = Math.min(n - 1, i + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = Math.max(0, i - 1)
    else if (e.key === 'Home') i = 0
    else if (e.key === 'End') i = n - 1
    else if (e.key === 'Escape') {
      setHoverI(null)
      tip.hide()
      return
    } else return
    e.preventDefault()
    const p = pointToClient(i)
    showAt(i, p.x, p.y)
  }

  const named = series.map((s) => s.label).filter(Boolean)
  const summary =
    ariaLabel ??
    `Line chart${named.length ? ` of ${named.join(', ')}` : ''}, ${labels[0] ?? ''} to ${labels[n - 1] ?? ''}. Use the arrow keys to read each point.`

  return (
    <div
      ref={containerRef}
      className="fr-line rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50"
      style={{ width: '100%', touchAction: 'pan-y' }}
      tabIndex={n > 0 ? 0 : undefined}
      role="group"
      aria-label={summary}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${h}`}
        width="100%"
        height={h}
        aria-hidden="true"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        <defs>
          {area &&
            series.map((s, si) => {
              const dim = deemphId && s.id !== deemphId
              if (dim) return null
              return (
                <linearGradient key={si} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              )
            })}
        </defs>

        {/* recessive hairline grid + Y ticks — HORIZONTAL only, one per tick */}
        {ticks.map((t) => {
          const y = Y(t)
          return (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke={CHROME.grid} strokeWidth="1" />
              <text
                x={P.l - 8}
                y={y + 4}
                textAnchor="end"
                fill={CHROME.axis}
                fontSize="11"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtTick(t)}
              </text>
            </g>
          )
        })}

        {/* X labels */}
        {labels.map((lb, i) => (
          <text
            key={i}
            x={X(i)}
            y={h - 6}
            textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
            fill={hoverI === i ? CHROME.ink : CHROME.axis}
            fontWeight={hoverI === i ? 700 : 400}
            fontSize="11"
          >
            {lb}
          </text>
        ))}

        {/* crosshair — under the series so the marks stay on top */}
        {hoverI != null && (
          <line x1={X(hoverI)} x2={X(hoverI)} y1={P.t} y2={P.t + ih} stroke={CHROME.crosshair} strokeWidth="1" />
        )}

        {/* series */}
        {series.map((s, si) => {
          const dim = deemphId && s.id !== deemphId
          const spotDim = spotlightId != null && s.id !== spotlightId
          const stroke = dim ? CHROME.dim : s.color
          const line = s.vals.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ')
          const areaD = line + ` L ${X(last)} ${P.t + ih} L ${X(0)} ${P.t + ih} Z`
          const dotY = Y(s.vals[last])
          const ly = (labelY[si] ?? dotY) + 4
          const needsLeader = Math.abs(ly - 4 - dotY) > 6
          return (
            <g key={s.id ?? si} data-sid={s.id ?? si} style={{ opacity: spotDim ? 0.16 : 1, transition: 'opacity .2s' }}>
              {area && !dim && (
                <path
                  d={areaD}
                  fill={`url(#${uid}-g${si})`}
                  stroke="none"
                  className={reduce ? undefined : 'fr-fadein'}
                  style={reduce ? undefined : { animationDelay: '0.45s' }}
                />
              )}
              <path
                ref={(el) => {
                  pathRefs.current[si] = el
                }}
                d={line}
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={X(last)}
                cy={dotY}
                r="4.5"
                fill={stroke}
                stroke={CHROME.ring}
                strokeWidth="2"
                className={reduce ? undefined : 'fr-fadein'}
                style={reduce ? undefined : { animationDelay: `${0.65 + si * 0.1}s` }}
              />
              {hoverI != null && hoverI !== last && Number.isFinite(s.vals[hoverI]) && (
                <circle cx={X(hoverI)} cy={Y(s.vals[hoverI])} r="4" fill={stroke} stroke={CHROME.ring} strokeWidth="2" />
              )}
              {needsLeader && s.label && (
                <line x1={X(last) + 5} y1={dotY} x2={X(last) + 8} y2={ly - 4} stroke={stroke} strokeWidth="1" />
              )}
              {s.label ? (
                <text
                  x={X(last) + 10}
                  y={ly}
                  fill={dim ? CHROME.dimText : CHROME.ink}
                  fontSize="11.5"
                  fontWeight="700"
                  className={reduce ? undefined : 'fr-fadein'}
                  style={reduce ? undefined : { animationDelay: `${0.7 + si * 0.1}s` }}
                >
                  {s.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

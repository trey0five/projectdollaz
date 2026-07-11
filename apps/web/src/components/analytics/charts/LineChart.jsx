import { useEffect, useId, useRef, useState } from 'react'
import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useMeasuredWidth } from './useMeasuredWidth.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// LineChart — ports the mockup's lineChart(). SINGLE Y axis (never dual). Ported
// motion: staggered stroke-dasharray draw-in, optional gradient area wash (.18→0),
// an end pulse dot (pulseId), nice-number axis, end-label collision avoidance with
// leader lines, and a crosshair + shared tooltip. `deemphId` greys every non-match
// series (mockup "context" mode); `spotlightId` dims non-matched groups to .16
// (Legend hover). Colors come IN via series[].color.
//
// props: series=[{id,label,color,vals:number[]}], labels:string[], formatter?,
//        area?, pulseId?, deemphId?, spotlightId?, height?
// ─────────────────────────────────────────────────────────────────────────────
export default function LineChart({
  series = [],
  labels = [],
  formatter = (v) => v,
  area = false,
  pulseId = null,
  deemphId = null,
  spotlightId = null,
  height = 190,
}) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  const [containerRef, W] = useMeasuredWidth(520)
  const svgRef = useRef(null)
  const pathRefs = useRef([])
  const [hover, setHover] = useState(null) // { x, i }
  const tip = useTooltip()

  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const h = height
  const maxLab = Math.max(0, ...series.map((s) => (s.label || '').length))
  const P = { l: 58, r: Math.max(56, maxLab * 7.5 + 22), t: 10, b: 24 }
  const iw = W - P.l - P.r
  const ih = h - P.t - P.b

  // nice-number axis (ported) — ignore non-finite points so an empty/all-null
  // series can never poison the domain into -Infinity/NaN.
  const all = series.flatMap((s) => s.vals).filter((v) => Number.isFinite(v))
  const rawMax = all.length ? Math.max(...all) : 1
  const min = Math.min(0, ...(all.length ? all : [0]))
  const span = Math.max(rawMax - min, 1e-9)
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)))
  const nice = Math.ceil((rawMax * 1.05 - min) / (3 * step)) * (3 * step)
  const max = min + (nice || span)

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

  const gridLines = [0, 1, 2, 3]

  function onMove(ev) {
    if (labels.length < 2) return
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const mx = (ev.clientX - r.left) * (W / r.width)
    let i = Math.round((mx - P.l) / (iw / (labels.length - 1)))
    i = Math.max(0, Math.min(labels.length - 1, i))
    setHover({ x: X(i), i })
    tip.show(
      {
        title: labels[i],
        rows: series.map((s) => ({ color: s.color, label: s.label, value: formatter(s.vals[i]) })),
      },
      ev.clientX,
      ev.clientY,
    )
  }
  function onLeave() {
    setHover(null)
    tip.hide()
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${h}`}
        width="100%"
        height={h}
        role="img"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
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

        {/* hairline grid + Y ticks — dashed slate-200/60, HORIZONTAL only */}
        {gridLines.map((g) => {
          const y = P.t + (ih * g) / 3
          const val = Math.round(min + (max - min) * (1 - g / 3))
          return (
            <g key={g}>
              <line
                x1={P.l}
                x2={W - P.r}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeOpacity="0.6"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={P.l - 8}
                y={y + 4}
                textAnchor="end"
                fill="#94A3B8"
                fontSize="11"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatter(val)}
              </text>
            </g>
          )
        })}

        {/* X labels */}
        {labels.map((lb, i) => (
          <text key={i} x={X(i)} y={h - 6} textAnchor="middle" fill="#94A3B8" fontSize="11">
            {lb}
          </text>
        ))}

        {/* series */}
        {series.map((s, si) => {
          const dim = deemphId && s.id !== deemphId
          const spotDim = spotlightId != null && s.id !== spotlightId
          const stroke = dim ? CHROME.dim : s.color
          const line = s.vals.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ')
          const areaD =
            line + ` L ${X(last)} ${P.t + ih} L ${X(0)} ${P.t + ih} Z`
          const dotY = Y(s.vals[last])
          const ly = (labelY[si] ?? dotY) + 4
          const needsLeader = Math.abs(ly - 4 - dotY) > 6
          return (
            <g
              key={s.id ?? si}
              data-sid={s.id ?? si}
              style={{ opacity: spotDim ? 0.16 : 1, transition: 'opacity .2s' }}
            >
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
                className={dim ? undefined : 'fr-glow'}
              />
              <circle
                cx={X(last)}
                cy={dotY}
                r="4.5"
                fill={stroke}
                stroke="#fff"
                strokeWidth="2"
                className={reduce ? undefined : 'fr-fadein'}
                style={reduce ? undefined : { animationDelay: `${0.65 + si * 0.1}s` }}
              />
              {pulseId && s.id === pulseId && !reduce && (
                <circle cx={X(last)} cy={dotY} r="5" fill="none" stroke={s.color} strokeWidth="2" className="fr-pulse" />
              )}
              {needsLeader && (
                <line x1={X(last) + 5} y1={dotY} x2={X(last) + 8} y2={ly - 4} stroke={stroke} strokeWidth="1" />
              )}
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
            </g>
          )
        })}

        {/* crosshair */}
        <line
          x1={hover ? hover.x : 0}
          x2={hover ? hover.x : 0}
          y1={P.t}
          y2={P.t + ih}
          stroke={CHROME.crosshair}
          strokeWidth="1"
          opacity={hover ? 1 : 0}
        />
      </svg>
    </div>
  )
}

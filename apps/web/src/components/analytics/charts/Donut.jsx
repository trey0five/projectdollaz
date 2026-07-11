import { useEffect, useRef } from 'react'
import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useCountUp } from './useCountUp.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// Donut — ports the mockup's donut(). Ported motion: staggered stroke-dasharray
// sweep-in (each segment grows from 0), a center count-up, 2.5px inter-segment
// gaps, and butt caps. Colors come IN via `colors`. Per-segment shared tooltip.
//
// props: parts:number[], colors:string[], names:string[], center:string,
//        sub:string, formatter?
// ─────────────────────────────────────────────────────────────────────────────
export default function Donut({ parts = [], colors = [], names = [], center = '', sub = '', formatter = (p) => p + '%' }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()
  const circleRefs = useRef([])
  const centerText = useCountUp(center)

  const size = 168
  const r = 60
  const sw = 20
  const C = 2 * Math.PI * r
  const gapPx = 2.5
  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const total = parts.reduce((a, b) => a + finite(b), 0) || 1

  // precompute each segment's dash length + rotation offset (prefix sums, no mutation)
  const fracs = parts.map((p) => finite(p) / total)
  const segs = parts.map((p, pi) => {
    const frac = fracs[pi]
    const before = fracs.slice(0, pi).reduce((a, b) => a + b, 0)
    const seg = Math.max(0, C * frac - gapPx)
    const off = C * 0.25 - before * C
    return { p, pi, seg, off }
  })

  // sweep-in: animate stroke-dasharray from 0.001 → seg (ported)
  const geomKey = parts.join(',')
  useEffect(() => {
    if (reduce) return
    circleRefs.current.forEach((c, pi) => {
      if (!c) return
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          c.style.transition = `stroke-dasharray .9s cubic-bezier(.22,1,.36,1) ${pi * 0.12}s`
          c.setAttribute('stroke-dasharray', `${segs[pi].seg} ${C}`)
        }),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, geomKey])

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block', margin: '0 auto' }} role="img">
      {segs.map(({ pi, seg, off }) => (
        <circle
          key={pi}
          ref={(el) => {
            circleRefs.current[pi] = el
          }}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors[pi]}
          strokeWidth={sw}
          strokeDasharray={`${reduce ? seg : 0.001} ${C}`}
          strokeDashoffset={off}
          strokeLinecap="butt"
          onMouseMove={(ev) =>
            tip.show(
              { rows: [{ color: colors[pi], label: names[pi], value: formatter(parts[pi]) }] },
              ev.clientX,
              ev.clientY,
            )
          }
          onMouseLeave={() => tip.hide()}
        />
      ))}
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={CHROME.ink} fontSize="26" fontWeight="800">
        {centerText}
      </text>
      <text x={size / 2} y={size / 2 + 17} textAnchor="middle" fill={CHROME.axis} fontSize="10.5">
        {sub}
      </text>
    </svg>
  )
}

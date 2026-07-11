import { useEffect, useRef } from 'react'
import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useCountUp } from './useCountUp.js'
import { useTooltip } from './Tooltip.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// Donut — ports the mockup's donut(). Ported motion: staggered stroke-dasharray
// sweep-in (each segment grows from 0) + a center count-up. Visual language:
// a SLIM premium ring (inner radius ≈78% of outer) with ROUNDED segment caps.
// Because round caps bulge half a stroke-width past each dash end, the dash gap
// is capWidth + a 2° pad — so adjacent caps never collide and the rest state
// shows a crisp, even 2° air between segments (each segment is also re-centered
// in its slot by half the gap). Zero-value parts are skipped entirely (a rounded
// cap would otherwise render them as phantom dots). Colors come IN via `colors`.
// Per-segment shared tooltip.
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
  const r = 64
  const sw = 16 // inner/outer = (r - sw/2)/(r + sw/2) ≈ 0.78 — the slim ring
  const C = 2 * Math.PI * r
  const padPx = (2 / 360) * C // 2° visual pad between segments
  const gapPx = sw + padPx // round caps bulge sw/2 per end → gap must absorb sw
  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const total = parts.reduce((a, b) => a + finite(b), 0) || 1

  // precompute each segment's dash length + placement (prefix sums, no mutation).
  // Placement uses a rotate() TRANSFORM, not stroke-dashoffset: an SVG dash
  // pattern does NOT wrap around a circle (its period is seg+C), so a positive
  // dashoffset silently truncates the first segment's wrapped beginning — the
  // long-standing "ragged gap" between 12 and ~3 o'clock. Rotating each circle so
  // its dash starts at path position 0 renders every segment in full. Single-part
  // donuts skip the gap so a lone segment closes the ring.
  const fracs = parts.map((p) => finite(p) / total)
  const drawn = fracs.filter((f) => f > 0).length
  const gap = drawn > 1 ? gapPx : 0
  const segs = parts.map((p, pi) => {
    const frac = fracs[pi]
    const before = fracs.slice(0, pi).reduce((a, b) => a + b, 0)
    const seg = Math.max(0.001, C * frac - gap)
    const rot = -90 + ((before * C + gap / 2) / C) * 360 // 12 o'clock start, gap-centered
    return { p, pi, frac, seg, rot }
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
      {segs.map(({ pi, frac, seg, rot }) => {
        if (frac <= 0) return null
        return (
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
            transform={`rotate(${rot} ${size / 2} ${size / 2})`}
            strokeLinecap="round"
            onMouseMove={(ev) =>
              tip.show(
                { rows: [{ color: colors[pi], label: names[pi], value: formatter(parts[pi]) }] },
                ev.clientX,
                ev.clientY,
              )
            }
            onMouseLeave={() => tip.hide()}
          />
        )
      })}
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={CHROME.ink} fontSize="26" fontWeight="800">
        {centerText}
      </text>
      <text x={size / 2} y={size / 2 + 17} textAnchor="middle" fill={CHROME.axis} fontSize="10.5">
        {sub}
      </text>
    </svg>
  )
}

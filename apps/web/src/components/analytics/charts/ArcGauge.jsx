import { useEffect, useId, useRef } from 'react'
import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useCountUp } from './useCountUp.js'

// ─────────────────────────────────────────────────────────────────────────────
// ArcGauge — ports the mockup's arcGauge(). A SINGLE ~240° arc (not a dial, no
// dual axis) with a blue→cyan gradient fill, a draw-in sweep, a white tip dot +
// infinite pulse, and a center count-up. Renders whatever 0-100 `pct` IA passes
// (capacity is NOT a registry metric — IA substitutes a real 0-100 key).
//
// props: pct:number, label?:string (caption under the number),
//        subRows?: [{ label, value }] rendered as meter rows below the arc
// ─────────────────────────────────────────────────────────────────────────────
export default function ArcGauge({ pct = 0, label, subRows = [] }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, '')
  const fillRef = useRef(null)
  const p = Math.max(0, Math.min(100, Number(pct) || 0))
  const centerText = useCountUp(`${Math.round(p)}%`)

  const W = 230
  const H = 178
  const cx = W / 2
  const cy = 112
  const R = 84
  const a0 = Math.PI * 1.17
  const a1 = -Math.PI * 0.17
  const pt = (a) => [cx + R * Math.cos(a), cy - R * Math.sin(a)]
  const arc = (f0, f1) => {
    const s = pt(a0 + (a1 - a0) * f0)
    const e = pt(a0 + (a1 - a0) * f1)
    return `M ${s[0]} ${s[1]} A ${R} ${R} 0 ${f1 - f0 > 0.5 ? 1 : 0} 1 ${e[0]} ${e[1]}`
  }
  const tipP = pt(a0 + (a1 - a0) * (p / 100))

  // draw-in the fill arc (ported drawPath)
  useEffect(() => {
    if (reduce) return
    const path = fillRef.current
    if (!path) return
    try {
      const L = path.getTotalLength()
      path.style.strokeDasharray = `${L} ${L}`
      path.style.strokeDashoffset = String(L)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          path.style.transition = 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) 0.1s'
          path.style.strokeDashoffset = '0'
        }),
      )
    } catch {
      /* no-op */
    }
  }, [reduce, p])

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 230, display: 'block', margin: '0 auto' }} role="img">
        <defs>
          <linearGradient id={`${uid}-g`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={CHROME.gaugeFrom} />
            <stop offset="100%" stopColor={CHROME.gaugeTo} />
          </linearGradient>
        </defs>
        <path d={arc(0, 1)} fill="none" stroke={CHROME.gaugeTrack} strokeWidth="13" strokeLinecap="round" />
        <path
          ref={fillRef}
          d={arc(0, p / 100)}
          fill="none"
          stroke={`url(#${uid}-g)`}
          strokeWidth="13"
          strokeLinecap="round"
          className="fr-glow"
        />
        <circle
          cx={tipP[0]}
          cy={tipP[1]}
          r="5.5"
          fill="#fff"
          stroke={CHROME.gaugeFrom}
          strokeWidth="3"
          className={reduce ? undefined : 'fr-fadein'}
          style={reduce ? undefined : { animationDelay: '1s' }}
        />
        {!reduce && (
          <circle cx={tipP[0]} cy={tipP[1]} r="5" fill="none" stroke={CHROME.gaugeFrom} strokeWidth="2" className="fr-pulse" />
        )}
        <text x={cx} y={cy - 14} textAnchor="middle" fill={CHROME.ink} fontSize="30" fontWeight="800">
          {centerText}
        </text>
        {label && (
          <text x={cx} y={cy + 4} textAnchor="middle" fill={CHROME.axis} fontSize="11">
            {label}
          </text>
        )}
      </svg>
      {subRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          {subRows.map((row, i) => (
            <div
              key={i}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: CHROME.inkSoft }}
            >
              <span>{row.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

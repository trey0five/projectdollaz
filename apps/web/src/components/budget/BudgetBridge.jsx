// ─────────────────────────────────────────────────────────────────────────────
// BudgetBridge — "From plan to what happened" as a real WATERFALL (vertical
// columns — owner rule). Two solid anchor columns stand on the baseline (the
// planned left-over and the actual left-over); between them the income and
// spending swings FLOAT from where the previous column ended, joined by thin
// dashed connector rules, so the eye walks plan → +income → −spending → actual
// without adding up labels:
//
//   Plan      0 → netBud
//   Income    netBud → netBud + revVar            (green when above budget)
//   Spending  netBud + revVar → netAct            (green when under budget)
//   Actual    0 → netAct
//
// netAct = netBud + revVar − expVar holds by construction (budgetTotals), so the
// last swing always lands exactly on the Actual column's top.
//
// Same chart vocabulary as AuroraColumns (au-chart-* classes: recessive grid,
// compact $ ticks, a value label on every column, category labels under the
// baseline); drawn at its real width so labels stay legible on a phone.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { compactDollar } from '../ui/aurora/index.js'

const H = 240
const PAD_L = 52
const PAD_R = 10
const PAD_T = 28
const PAD_B = 30

const GOOD = '#059669'
const RISK = '#e11d48'
const PLAN = '#64748b'

function niceStep(span) {
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * mag
}

// A column with only the data-end corners rounded (anchored columns) or all
// four corners rounded (floating swings).
function barPath(x, yA, yB, w, r, floating) {
  const top = Math.min(yA, yB)
  const bot = Math.max(yA, yB)
  const h = bot - top
  if (h < 1) return `M${x},${top}h${w}v1h${-w}Z`
  const rr = Math.min(r, h / 2, w / 2)
  if (floating) {
    return `M${x},${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${bot - rr}Q${x + w},${bot} ${x + w - rr},${bot}H${x + rr}Q${x},${bot} ${x},${bot - rr}Z`
  }
  // Anchored: the baseline end is yA (the zero line).
  if (yB < yA) {
    return `M${x},${yA}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${yA}Z`
  }
  return `M${x},${yA}V${bot - rr}Q${x},${bot} ${x + rr},${bot}H${x + w - rr}Q${x + w},${bot} ${x + w},${bot - rr}V${yA}Z`
}

/**
 * @param netBud   planned left over (budgeted income − budgeted spending)
 * @param revVar   actual income − budgeted income
 * @param expVar   actual spending − budgeted spending
 * @param netAct   actual left over
 * @param fmt      (n) => short money string for the value labels
 * @param fullFmt  (n) => full money string for the screen-reader names
 */
export default function BudgetBridge({ netBud, revVar, expVar, netAct, fmt, fullFmt = fmt }) {
  const ref = useRef(null)
  const [W, setW] = useState(560)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect?.width ?? 0)
      if (width > 0) setW(Math.max(260, width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const afterIncome = netBud + revVar
  const signed = (n) => `${n >= 0 ? '+' : ''}${fmt(n)}`
  const steps = [
    { key: 'plan', label: 'Plan', from: 0, to: netBud, color: PLAN, text: fmt(netBud), full: `Planned left over ${fullFmt(netBud)}` },
    {
      key: 'rev',
      label: 'Income',
      from: netBud,
      to: afterIncome,
      floating: true,
      color: revVar >= 0 ? GOOD : RISK,
      text: signed(revVar),
      full: `Income ${revVar >= 0 ? 'above' : 'below'} budget by ${fullFmt(Math.abs(revVar))}`,
    },
    {
      key: 'exp',
      label: 'Spending',
      from: afterIncome,
      to: netAct,
      floating: true,
      color: expVar <= 0 ? GOOD : RISK,
      text: signed(-expVar),
      full: `Spending ${expVar >= 0 ? 'over' : 'under'} budget by ${fullFmt(Math.abs(expVar))}`,
    },
    { key: 'act', label: 'Actual', from: 0, to: netAct, color: 'var(--au-h, #2563eb)', text: fmt(netAct), full: `Actual left over ${fullFmt(netAct)}` },
  ]

  const levels = steps.flatMap((s) => [s.from, s.to])
  const hi = Math.max(0, ...levels)
  const lo = Math.min(0, ...levels)
  const step = niceStep(hi - lo || 1)
  const top = Math.ceil(hi / step) * step || step
  const bottom = Math.floor(lo / step) * step
  const ticks = []
  for (let t = bottom; t <= top + step / 2; t += step) ticks.push(t)
  const plotH = H - PAD_T - PAD_B
  const y = (v) => PAD_T + ((top - v) / (top - bottom || 1)) * plotH
  const plotW = W - PAD_L - PAD_R
  const slot = plotW / steps.length
  const bw = Math.min(76, slot * 0.58)
  const xOf = (i) => PAD_L + slot * i + (slot - bw) / 2

  return (
    <div ref={ref} className="au-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="From the planned left-over, through the income and spending differences, to the actual left-over">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'au-chart-base' : 'au-chart-grid'} x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} />
            <text className="au-chart-tick" x={PAD_L - 8} y={y(t) + 4} textAnchor="end">
              {compactDollar(t)}
            </text>
          </g>
        ))}
        {/* Connector rules: each column's end level carried to the next one. */}
        {steps.slice(0, -1).map((s, i) => (
          <line
            key={`link-${s.key}`}
            className="fsub-bridge-link"
            x1={xOf(i) + bw}
            x2={xOf(i + 1)}
            y1={y(s.to)}
            y2={y(s.to)}
          />
        ))}
        {steps.map((s, i) => {
          const x = xOf(i)
          const yA = y(s.from)
          const yB = y(s.to)
          const labelY = Math.min(yA, yB) - 8
          return (
            <g key={s.key} className="au-chart-col" tabIndex={0} role="img" aria-label={`${s.label}: ${s.full}`}>
              <title>{s.full}</title>
              <path className="au-chart-bar" d={barPath(x, yA, yB, bw, 4, s.floating)} fill={s.color} />
              <text className="au-chart-val" x={x + bw / 2} y={Math.max(12, labelY)} textAnchor="middle">
                {s.text}
              </text>
              <text className="au-chart-lab" x={x + bw / 2} y={H - 8} textAnchor="middle">
                {s.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

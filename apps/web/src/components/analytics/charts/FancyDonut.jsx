// ─────────────────────────────────────────────────────────────────────────────
// FancyDonut — a REAL sliced pie (annular sectors with flat radial edges and
// hairline gaps), not a stroked ring: rounded stroke caps turn a 1% share into a
// floating dot, but a true wedge stays a crisp thin slice at any size.
// Flashy + dynamic:
//   • mount: the pie rotates in while wedges stagger-fade (reduced-motion: static);
//   • hover (wedge OR its key row): the wedge EXPLODES outward along its
//     mid-angle, the others dim, and the CENTER swaps to that category's
//     label · value · share;
//   • a key list beside the pie carries the exact figures (text never sits on
//     slices), cross-highlighting with the ring via shared hover state.
//
// props: parts=[{label,value,color,formatted,share,deemph?}], centerTotal,
//        centerSub, formatter?
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'

const SIZE = 200
const R1 = 92 // outer radius
const R0 = 57 // inner radius (donut hole for the center readout)
const GAP_PX = 2 // hairline gap between wedges, measured at the outer rim
const EXPLODE = 9 // hover offset along the wedge's mid-angle

const P = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

// Split a category label into at most two ~12-char lines (word-wrapped, tail
// ellipsized) so the center readout always fits inside the donut hole.
function wrapLabel(label) {
  const words = String(label).split(' ')
  const lines = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if ((cur + ' ' + w).trim().length <= 12 || cur === '') lines[lines.length - 1] = (cur + ' ' + w).trim()
    else if (lines.length < 2) lines.push(w)
    else {
      lines[1] = lines[1].length > 9 ? lines[1].slice(0, 9) + '…' : lines[1] + '…'
      break
    }
  }
  return lines
}

// Annular sector path between angles a0→a1 (radians, clockwise from 12 o'clock).
function wedgePath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = P(cx, cy, r1, a0)
  const [x1, y1] = P(cx, cy, r1, a1)
  const [x2, y2] = P(cx, cy, r0, a1)
  const [x3, y3] = P(cx, cy, r0, a0)
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`
}

export default function FancyDonut({ parts = [], centerTotal = '', centerSub = '', formatter = (v) => v }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const [hover, setHover] = useState(null)

  const cx = SIZE / 2
  const cy = SIZE / 2
  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const total = parts.reduce((a, p) => a + finite(p.value), 0) || 1

  const segs = useMemo(() => {
    const fullPad = GAP_PX / R1 // angular pad (radians) at the outer rim
    let acc = -Math.PI / 2 // start at 12 o'clock
    const drawn = parts.filter((p) => finite(p.value) > 0).length
    return parts.map((p, i) => {
      const frac = finite(p.value) / total
      const span = frac * Math.PI * 2
      const a0 = acc
      acc += span
      if (frac <= 0) return { ...p, i, frac, skip: true }
      // Pad each side, but never eat more than 30% of a tiny slice — a 1% share
      // must stay a visible sliver, not vanish into its own gaps.
      const pad = drawn > 1 ? Math.min(fullPad, span * 0.15) : 0
      const mid = a0 + span / 2
      return {
        ...p,
        i,
        frac,
        skip: false,
        d: wedgePath(cx, cy, R0, R1, a0 + pad, acc - pad),
        dx: Math.cos(mid) * EXPLODE,
        dy: Math.sin(mid) * EXPLODE,
      }
    })
  }, [parts, total, cx, cy])

  const active = hover != null && !segs[hover]?.skip ? segs[hover] : null

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${centerSub}: ${centerTotal}`}
        onMouseLeave={() => setHover(null)}
        initial={reduce ? false : { rotate: -32, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        style={{ overflow: 'visible' }}
      >
        {segs.map((s) =>
          s.skip ? null : (
            <motion.path
              key={s.i}
              d={s.d}
              fill={s.color}
              style={{ cursor: 'pointer' }}
              initial={reduce ? false : { opacity: 0, scale: 0.82 }}
              animate={{
                opacity: hover == null || hover === s.i ? 1 : 0.32,
                scale: 1,
                x: hover === s.i ? s.dx : 0,
                y: hover === s.i ? s.dy : 0,
              }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      opacity: { duration: 0.25, delay: hover == null ? 0.05 * s.i : 0 },
                      scale: { type: 'spring', stiffness: 300, damping: 24, delay: 0.05 * s.i },
                      x: { type: 'spring', stiffness: 420, damping: 26 },
                      y: { type: 'spring', stiffness: 420, damping: 26 },
                    }
              }
              onMouseEnter={() => setHover(s.i)}
            />
          ),
        )}
        {/* Center readout — swaps to the hovered slice. counter-rotate not needed:
            text renders after the group settles; reduced-motion is static. */}
        {active ? (
          (() => {
            const lines = wrapLabel(active.label)
            const two = lines.length > 1
            const halo = { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' }
            return (
              <>
                <text x="50%" y={two ? '38%' : '42%'} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, fill: '#16243b', textTransform: 'uppercase', letterSpacing: '0.03em', ...halo }}>
                  {lines[0]}
                </text>
                {two && (
                  <text x="50%" y="44.5%" textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, fill: '#16243b', textTransform: 'uppercase', letterSpacing: '0.03em', ...halo }}>
                    {lines[1]}
                  </text>
                )}
                <text x="50%" y="56%" textAnchor="middle" style={{ fontSize: 16.5, fontWeight: 700, fill: '#16243b', ...halo }}>
                  {active.formatted ?? formatter(active.value)}
                </text>
                <text x="50%" y="66%" textAnchor="middle" style={{ fontSize: 11.5, fill: '#7c8698', ...halo }}>
                  {active.share ?? `${Math.round(active.frac * 100)}%`} of total
                </text>
                {/* Slice-color tick under the label so identity stays coupled. */}
                <rect x={SIZE / 2 - 11} y={SIZE * 0.475} width="22" height="3" rx="1.5" fill={active.color} />
              </>
            )
          })()
        ) : (
          <>
            <text x="50%" y="50%" textAnchor="middle" style={{ fontSize: 17, fontWeight: 700, fill: '#16243b' }}>
              {centerTotal}
            </text>
            <text x="50%" y="61%" textAnchor="middle" style={{ fontSize: 11, fill: '#7c8698' }}>
              {centerSub}
            </text>
          </>
        )}
      </motion.svg>

      {/* Key list UNDER the donut — full card width, strict grid columns
          (dot · label · amount · share) so labels and amounts never collide. */}
      <div className="w-full" onMouseLeave={() => setHover(null)}>
        {segs.map((s) => (
          <div
            key={s.i}
            onMouseEnter={() => setHover(s.i)}
            className="grid grid-cols-[12px_minmax(0,1fr)_auto_46px] items-center gap-x-3 rounded-lg px-2.5 py-1.5 transition-colors"
            style={{
              background: hover === s.i ? 'rgb(16 28 61 / 0.05)' : 'transparent',
              opacity: hover == null || hover === s.i ? 1 : 0.45,
            }}
          >
            <i aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className={`min-w-0 truncate text-[13.5px] ${s.deemph ? 'text-muted/70' : 'text-navy'}`} title={s.label}>
              {s.label}
            </span>
            <span className={`text-right text-[13.5px] font-semibold tabular-nums ${s.deemph ? 'text-muted/70' : 'text-navy'}`}>
              {s.formatted ?? formatter(s.value)}
            </span>
            <span className="text-right text-[12px] tabular-nums text-muted">
              {s.share ?? `${Math.round(s.frac * 100)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

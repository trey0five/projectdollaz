// ─────────────────────────────────────────────────────────────────────────────
// FlowBars — receipts up, disbursements down, one pair per bucket, the net as
// a dot riding the pair. The balance line (CashRail) answers "where does the
// level go"; this answers "what pushed it" — money in vs money out per week,
// which is the chart a treasurer's eye actually does arithmetic on.
//
// Mirrored around a shared zero axis with ONE scale for both directions: bars
// scaled independently would make a $50K receipt look equal to a $500K payroll.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useMeasuredWidth } from '../analytics/charts/useMeasuredWidth.js'
import { useReducedMotion } from '../analytics/charts/useReducedMotion.js'

const H = 190
const PAD_X = 8
const PAD_Y = 16
const IN_COLOR = '#059669'
const OUT_COLOR = '#e11d48'
const NET_COLOR = '#1f3d72'

export default function FlowBars({ buckets = [], format }) {
  const reduce = useReducedMotion()
  const [hostRef, width] = useMeasuredWidth(720)
  const fmt = typeof format === 'function' ? format : (n) => `$${Math.round(n).toLocaleString()}`

  const maxAbs = useMemo(() => {
    let m = 0
    for (const b of buckets) m = Math.max(m, b.receipts, b.disbursements)
    return m || 1
  }, [buckets])

  if (buckets.length === 0) return null

  const innerW = Math.max(80, width - PAD_X * 2)
  const mid = H / 2
  const half = mid - PAD_Y
  const slot = innerW / buckets.length
  const barW = Math.max(6, Math.min(26, slot * 0.42))
  const y = (v) => (v / maxAbs) * half

  return (
    <div ref={hostRef} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="Cash receipts and disbursements per period"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* The shared zero axis — the one line both directions hang from. */}
        <line x1={PAD_X} x2={PAD_X + innerW} y1={mid} y2={mid} stroke="#CBD5E1" strokeWidth={1} />

        {buckets.map((b, i) => {
          const cx = PAD_X + slot * i + slot / 2
          const inH = y(b.receipts)
          const outH = y(b.disbursements)
          const netY = mid - y(b.netChange >= 0 ? Math.min(b.netChange, maxAbs) : Math.max(b.netChange, -maxAbs))
          return (
            <g key={b.key}>
              <title>{`${b.key} · in ${fmt(b.receipts)} · out ${fmt(b.disbursements)} · net ${fmt(b.netChange)}`}</title>
              {b.receipts > 0 ? (
                <motion.rect
                  x={cx - barW / 2}
                  width={barW}
                  rx={3}
                  fill={IN_COLOR}
                  fillOpacity={0.85}
                  initial={reduce ? { y: mid - inH, height: inH } : { y: mid, height: 0 }}
                  animate={{ y: mid - inH, height: inH }}
                  transition={{ delay: reduce ? 0 : i * 0.03, duration: 0.45, ease: [0.22, 0.8, 0.2, 1] }}
                />
              ) : null}
              {b.disbursements > 0 ? (
                <motion.rect
                  x={cx - barW / 2}
                  width={barW}
                  rx={3}
                  fill={OUT_COLOR}
                  fillOpacity={0.75}
                  initial={reduce ? { y: mid, height: outH } : { y: mid, height: 0 }}
                  animate={{ y: mid, height: outH }}
                  transition={{ delay: reduce ? 0 : i * 0.03, duration: 0.45, ease: [0.22, 0.8, 0.2, 1] }}
                />
              ) : null}
              {/* The net dot — where this period actually landed. */}
              <motion.circle
                cx={cx}
                r={3.5}
                fill={NET_COLOR}
                stroke="#fff"
                strokeWidth={1.5}
                initial={reduce ? { cy: netY, opacity: 1 } : { cy: mid, opacity: 0 }}
                animate={{ cy: netY, opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.2 + i * 0.03, duration: 0.4 }}
              />
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex items-center gap-4 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: IN_COLOR }} /> Receipts
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: OUT_COLOR }} /> Disbursements
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full border border-white" style={{ background: NET_COLOR }} /> Net
        </span>
      </div>
    </div>
  )
}

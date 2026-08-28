// ─────────────────────────────────────────────────────────────────────────────
// CycleRail — the six-year cycle as a LINEAR road (F1, the Journey tab).
//
// The /strategy Horizon-arc family (navy glass, amber accents) made straight:
// a cycle is a road you drive from one Engagement Review to the next, not a
// gauge you fill. The rail's geometry is pure presentation — dates from the
// payload are placed proportionally on an axis, exactly the way the trend
// strip's X() places readings — and every FACT on it (dates, states) is the
// server's. States are carried by SHAPE + tooltip word, never color alone:
//   done         = solid dot
//   on_track     = ringed dot
//   at_risk      = triangle
//   overdue      = triangle (red tint reinforces; the word is in the tooltip
//                  and in the milestone card list directly below the rail)
//   upcoming     = hollow dot
//   not_measurable = dashed hollow dot
// The amber progress stroke reaches the payload's own `today`, marked and
// labelled. Reduced motion → no draw-in, instant road.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { MILESTONE_STATE } from './MilestoneCard.jsx'

const AMBER = '#F59E0B'
const VB_W = 720
const VB_H = 132
const PAD_X = 52
const RAIL_Y = 66

/** Whole days since the epoch for a yyyy-mm-dd string (UTC, no drift). */
function dayNumber(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  const t = d.getTime()
  return Number.isNaN(t) ? null : Math.round(t / 86400000)
}

/** "Review '22" — the rail's end label, from the anchor's own date. */
function endLabel(iso) {
  const y = /^(\d{4})/.exec(String(iso ?? ''))?.[1]
  return y ? `Review '${y.slice(2)}` : 'Review'
}

// Short rail captions per milestone key (UI chrome for a closed vocabulary —
// the full server label lives in the tooltip and the card list below).
const RAIL_LABEL = {
  findings_shared: 'Findings shared',
  implementing: 'Implement',
  progress_report: 'Progress report',
  self_assessment: 'Self-assessment',
  evidence_freeze: 'Evidence freeze',
  review_year: 'Review',
}

function StateMark({ x, state }) {
  const common = { 'data-state': state }
  switch (state) {
    case 'done':
      return <circle {...common} cx={x} cy={RAIL_Y} r={7} fill={AMBER} />
    case 'on_track':
      return (
        <g {...common}>
          <circle cx={x} cy={RAIL_Y} r={8} fill="none" stroke={AMBER} strokeWidth={2} />
          <circle cx={x} cy={RAIL_Y} r={3} fill={AMBER} />
        </g>
      )
    case 'at_risk':
    case 'overdue': {
      const color = state === 'overdue' ? '#f87171' : AMBER
      return (
        <path
          {...common}
          d={`M${x} ${RAIL_Y - 9} L${x + 8} ${RAIL_Y + 6} L${x - 8} ${RAIL_Y + 6} Z`}
          fill={color}
        />
      )
    }
    case 'not_measurable':
      return (
        <circle
          {...common}
          cx={x}
          cy={RAIL_Y}
          r={7}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.45}
          strokeWidth={2}
          strokeDasharray="3 3"
        />
      )
    default:
      // upcoming
      return (
        <circle
          {...common}
          cx={x}
          cy={RAIL_Y}
          r={7}
          fill="#12213f"
          stroke="#ffffff"
          strokeOpacity={0.5}
          strokeWidth={2}
        />
      )
  }
}

export default function CycleRail({ anchor, today, milestones = [], reduce = false }) {
  const start = dayNumber(anchor?.lastReviewDate)
  const end = dayNumber(anchor?.nextReviewDate)
  if (start == null || end == null || end <= start) return null
  const span = end - start
  const X = (d) => PAD_X + ((VB_W - 2 * PAD_X) * Math.min(Math.max(d - start, 0), span)) / span

  const todayDay = dayNumber(today)
  const todayX = todayDay != null ? X(todayDay) : null
  const todayFrac = todayDay != null ? Math.min(Math.max((todayDay - start) / span, 0), 1) : 0

  // Windowed milestones sit at their window's MIDPOINT (the window is the
  // thing, and the midpoint keeps a window ending on review day from stacking
  // on the review's own mark); dated ones at their due date.
  const marks = milestones
    .map((m) => {
      const ws = dayNumber(m?.window?.start)
      const we = dayNumber(m?.window?.end)
      const d = ws != null && we != null ? Math.round((ws + we) / 2) : dayNumber(m?.dueDate)
      return d == null ? null : { m, x: X(d) }
    })
    .filter(Boolean)
    .sort((a, b) => a.x - b.x)

  // Caption slots, greedily: below the road first, above when below is taken
  // nearby, NO caption when both rows are crowded (the mark + tooltip + the
  // card list right under the rail still carry everything). The review-year
  // milestone never gets a caption — the rail's own end label already names it.
  const MIN_GAP = 96
  // The above row starts occupied at both ends — the "Review 'YY" end labels
  // live up there and a caption printed into them is the exact bug this slot
  // logic exists to prevent.
  const lastX = { below: -Infinity, above: PAD_X }
  const aboveMaxX = VB_W - PAD_X - MIN_GAP
  const captioned = marks.map(({ m, x }) => {
    if (m.key === 'review_year') return { m, x, row: null }
    if (x - lastX.below >= MIN_GAP) {
      lastX.below = x
      return { m, x, row: 'below' }
    }
    if (x - lastX.above >= MIN_GAP && x <= aboveMaxX) {
      lastX.above = x
      return { m, x, row: 'above' }
    }
    return { m, x, row: null }
  })

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full"
      role="img"
      aria-label={`Your accreditation cycle from ${anchor.lastReviewDate} to ${anchor.nextReviewDate}`}
      data-testid="cycle-rail"
    >
      {/* the road — full term, faint */}
      <line
        x1={PAD_X}
        y1={RAIL_Y}
        x2={VB_W - PAD_X}
        y2={RAIL_Y}
        stroke="#ffffff"
        strokeOpacity={0.14}
        strokeWidth={5}
        strokeLinecap="round"
      />
      {/* the distance driven — amber, animated once */}
      {todayX != null && todayFrac > 0 ? (
        <motion.line
          x1={PAD_X}
          y1={RAIL_Y}
          x2={todayX}
          y2={RAIL_Y}
          stroke={AMBER}
          strokeWidth={5}
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: 'easeOut' }}
        />
      ) : null}

      {/* end labels — the two reviews that bound the road */}
      <text
        x={PAD_X}
        y={RAIL_Y - 18}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={600}
        fill="#ffffff"
        fillOpacity={0.7}
      >
        {endLabel(anchor.lastReviewDate)}
      </text>
      <text
        x={VB_W - PAD_X}
        y={RAIL_Y - 18}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={600}
        fill="#ffffff"
        fillOpacity={0.7}
      >
        {endLabel(anchor.nextReviewDate)}
      </text>

      {/* milestone marks — shape per state, word in the tooltip; captions take
          the free row (below first) and stand down entirely when the years
          cluster, so nothing ever overprints */}
      {captioned.map(({ m, x, row }) => {
        const word = (MILESTONE_STATE[m.state] ?? MILESTONE_STATE.upcoming).word
        const below = row === 'below'
        return (
          <g key={m.key}>
            <StateMark x={x} state={m.state} />
            {row ? (
              <>
                <text
                  x={x}
                  y={below ? RAIL_Y + 24 : RAIL_Y - 30}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#ffffff"
                  fillOpacity={0.55}
                >
                  {RAIL_LABEL[m.key] ?? m.label}
                </text>
                <text
                  x={x}
                  y={below ? RAIL_Y + 36 : RAIL_Y - 42}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fill="#ffffff"
                  fillOpacity={0.4}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >
                  {word.toUpperCase()}
                </text>
              </>
            ) : null}
            <title>
              {m.label} — {word}
            </title>
          </g>
        )
      })}

      {/* you are here — the payload's own clock, never the browser's */}
      {todayX != null ? (
        <g data-testid="cycle-today">
          <line
            x1={todayX}
            y1={RAIL_Y - 12}
            x2={todayX}
            y2={RAIL_Y + 12}
            stroke={AMBER}
            strokeOpacity={0.85}
            strokeWidth={2}
            strokeDasharray="3 3"
          />
          <circle cx={todayX} cy={RAIL_Y} r={4.5} fill={AMBER} stroke="#0f1f3d" strokeWidth={2} />
          <text
            x={todayX}
            y={VB_H - 6}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill={AMBER}
          >
            You are here
          </text>
          <title>{`Today — ${today}`}</title>
        </g>
      ) : null}
    </svg>
  )
}

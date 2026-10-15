// ─────────────────────────────────────────────────────────────────────────────
// CashForecastCinema — the landing set-piece for the Cash Forecast module: a
// treasury workbook TYPES ITSELF from QuickBooks and the balance line draws to
// its low point, touring the five real horizons the product ships (1M / 3M /
// 6M / 12M / 13W) ONCE and resting on the twelve-month view, where the
// December dip below reserve shows. Premium UI P5: on the ground (the page has
// one ink band, the hero), the workbook as a ruled table, the horizon picker a
// segmented control, status as 2px marks + ink text — no glass, no glow, no
// pulsing dot, no auto-cycle loop.
//
// The demo data is generated, not hand-typed, so the grid always reconciles:
// rows sum to the net row, the net row cumsums to the closing row, and the
// chart is drawn FROM the closing row. A marketing section that showed a grid
// disagreeing with its own chart would undercut the product's whole honesty
// pitch. The narrative beat is real too: short horizons look fine, the long
// ones reveal the December dip below reserve — which is the module's reason
// to exist.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Button, Pill, Toolbar } from '../../components/ui/surface/index.js'
import { CASH_CINEMA } from './landingContent.js'
import SectionHead from './SectionHead.jsx'
import { EASE } from './Reveal.jsx'
import '../../styles/pending/p5-landing.css'

const RESERVE = 500 // $K — the dashed floor on the chart

const MONTHS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
const WEEKS = ['Aug 10', 'Aug 17', 'Aug 24', 'Aug 31', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 28', 'Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2']

/** Build one horizon's dataset. Amounts in $K; everything derives from the row
 *  values so grid, net, closing and chart can never disagree. */
function build(labels, { tuition, collections, annual, payroll, bills, facilities }) {
  const n = labels.length
  const rowVals = (spec) => (Array.isArray(spec) ? spec : Array(n).fill(spec))
  const rows = {
    tuition: rowVals(tuition),
    collections: rowVals(collections),
    annual: rowVals(annual),
    payroll: rowVals(payroll),
    bills: rowVals(bills),
    facilities: rowVals(facilities),
  }
  const net = labels.map(
    (_, i) => rows.tuition[i] + rows.collections[i] + rows.annual[i] - rows.payroll[i] - rows.bills[i] - rows.facilities[i],
  )
  const closing = []
  let bal = 820
  for (const v of net) closing.push((bal += v))
  const lowIdx = closing.indexOf(Math.min(...closing))
  return { labels, rows, net, closing, lowIdx, opening: 820 }
}

// Tuition spikes where schools actually bill: August, January, spring deposits.
const monthlyTuition = (n) => MONTHS.slice(0, n).map((m) => ({ Aug: 520, Jan: 560, Apr: 220 })[m] ?? 34)

const HORIZONS = [
  { key: '1M', data: build(WEEKS.slice(0, 4), { tuition: [130, 130, 8, 8], collections: 20, annual: 5, payroll: 48, bills: 17, facilities: 9 }) },
  { key: '3M', data: build(WEEKS, { tuition: [130, 130, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8], collections: 20, annual: 5, payroll: 48, bills: 17, facilities: 9 }) },
  { key: '13W', data: build(WEEKS, { tuition: [130, 130, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8], collections: 20, annual: 5, payroll: 48, bills: 17, facilities: 9 }) },
  { key: '6M', data: build(MONTHS.slice(0, 6), { tuition: monthlyTuition(6), collections: 120, annual: 22, payroll: 210, bills: 72, facilities: 38 }) },
  { key: '12M', data: build(MONTHS, { tuition: monthlyTuition(12), collections: 120, annual: 22, payroll: 210, bills: 72, facilities: 38 }) },
]

// The tour order: short horizons first (they look fine), the 12-month view
// last — it reveals the December dip below reserve, the module's reason to
// exist, and the tour rests there.
const TOUR = ['1M', '3M', '13W', '6M', '12M']
const TOUR_MS = 4200

const GRID_ROWS = [
  { key: 'section-in', label: 'Receipts', section: true },
  { key: 'tuition', label: 'Tuition & fees' },
  { key: 'collections', label: 'Invoice collections', badge: 'QB' },
  { key: 'annual', label: 'Annual fund' },
  { key: 'section-out', label: 'Disbursements', section: true },
  { key: 'payroll', label: 'Payroll & benefits' },
  { key: 'bills', label: 'Bills due', badge: 'QB' },
  { key: 'facilities', label: 'Facilities' },
]

const fmtK = (v) => {
  const abs = Math.abs(v)
  const s = abs >= 1000 ? `${(abs / 1000).toFixed(2)}M` : `${abs}K`
  return v < 0 ? `(${s})` : s
}

// The balance chart. Marks are SVG stretched to the box (the reserve rule keeps
// a non-scaling stroke; the drawn line cannot — pathLength needs user units);
// every LABEL is HTML positioned in percent, so type stays 11-13px at any
// width instead of scaling with the viewBox (it shrank to 5px on a phone).
function Chart({ data, reduce }) {
  const W = 1000
  const H = 200
  const all = [data.opening, ...data.closing, RESERVE]
  const lo = Math.min(...all) - 60
  const hi = Math.max(...all) + 60
  const pts = [data.opening, ...data.closing]
  const xp = (i) => (i / (pts.length - 1)) * 100 // percent
  const yp = (v) => (1 - (v - lo) / (hi - lo)) * 100 // percent
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${((xp(i) * W) / 100).toFixed(1)},${((yp(v) * H) / 100).toFixed(1)}`).join(' ')
  const lowVal = data.closing[data.lowIdx]
  const lowX = xp(data.lowIdx + 1)
  const lowY = yp(lowVal)
  const below = lowVal < RESERVE
  const resY = yp(RESERVE)
  const animKey = `${data.labels.length}-${data.closing[0]}`
  return (
    <div className="relative h-44 sm:h-52" role="img" aria-label={`Projected cash balance; low point $${fmtK(lowVal)} in ${data.labels[data.lowIdx]}, against a $500K minimum reserve`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {/* Reserve floor — the line the whole demo is about (a semantic rule). */}
        <line x1="0" x2={W} y1={(resY * H) / 100} y2={(resY * H) / 100} stroke="rgb(185 28 28)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <motion.path
          key={`area-${animKey}`}
          d={`${path} L${W},${H} L0,${H} Z`}
          fill="rgb(37 99 235 / 0.07)"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        />
        <motion.path
          key={`line-${animKey}`}
          d={path}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute left-0 -translate-y-full pb-1 text-[11px] font-semibold leading-4 text-ink2"
        style={{ top: `${resY}%` }}
      >
        Minimum reserve $500K
      </span>
      {/* The low point: a ringed dot that lands once with the line + its label. */}
      <motion.span
        key={`low-${animKey}`}
        aria-hidden="true"
        className="absolute h-2.5 w-2.5 rounded-full border-2 bg-white"
        // framer owns this element's transform, so the centering offset is a
        // motion value (x/y), not a translate class it would overwrite.
        style={{ left: `${lowX}%`, top: `${lowY}%`, x: '-50%', y: '-50%', borderColor: below ? 'rgb(185 28 28)' : '#2563EB' }}
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, type: 'spring', stiffness: 300, damping: 20 }}
      />
      <span
        aria-hidden="true"
        className={`absolute whitespace-nowrap text-[13px] font-semibold leading-[18px] text-ink ${lowX > 70 ? '-translate-x-full pr-3' : 'pl-3'} ${lowY < 18 || (lowX > 70 && lowY < 80) ? 'translate-y-1 pt-1' : '-translate-y-full pb-1'}`}
        style={{ left: `${lowX}%`, top: `${lowY}%` }}
      >
        Low {`$${fmtK(lowVal)}`} · {data.labels[data.lowIdx]}
      </span>
    </div>
  )
}

export default function CashForecastCinema() {
  const reduce = useReducedMotion()
  const stageRef = useRef(null)
  const inView = useInView(stageRef, { margin: '-120px', once: true })
  const [active, setActive] = useState(reduce ? '12M' : TOUR[0])
  const [touring, setTouring] = useState(!reduce)

  // The tour: once the workbook is on screen, step through TOUR one time and
  // rest on the last horizon. A click on any horizon ends it.
  useEffect(() => {
    if (reduce || !touring || !inView) return undefined
    const i = TOUR.indexOf(active)
    if (i < 0 || i >= TOUR.length - 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the tour simply ends; nothing is scheduled.
      setTouring(false)
      return undefined
    }
    const t = setTimeout(() => setActive(TOUR[i + 1]), TOUR_MS)
    return () => clearTimeout(t)
  }, [reduce, touring, inView, active])

  const { data } = HORIZONS.find((h) => h.key === active)
  const n = data.labels.length
  const wide = n > 8
  const cellDelay = (col, row) => (reduce ? 0 : 0.12 + col * (wide ? 0.035 : 0.06) + row * 0.012)
  const CELL = 'py-1 pl-2 text-right text-[13px] leading-[18px] tabular-nums'

  return (
    <section id="cash-forecast" aria-labelledby="cashcinema-h2" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead id="cashcinema-h2" kicker={CASH_CINEMA.kicker} title={CASH_CINEMA.h2} sub={CASH_CINEMA.sub} />

        {/* ── The workbook, on the ground ── */}
        <motion.div
          ref={stageRef}
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease: EASE }}
          className="mt-12"
        >
          {/* Toolbar: the source on the left, the horizon picker on the right. */}
          <Toolbar
            aria-label="Forecast source and horizon"
            aside={
              <div className="seg" role="group" aria-label="Forecast horizon">
                {HORIZONS.map((h) => (
                  <button
                    key={h.key}
                    type="button"
                    aria-pressed={active === h.key}
                    onClick={() => {
                      setTouring(false)
                      setActive(h.key)
                    }}
                    className="seg-btn tabular-nums"
                  >
                    {h.key}
                  </button>
                ))}
              </div>
            }
          >
            <Pill variant="status" tone="good">
              {CASH_CINEMA.liveChip}
            </Pill>
          </Toolbar>

          {/* ── The self-typing workbook ── */}
          <div className="mt-4 overflow-x-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.15 } }}
                style={{ minWidth: Math.max(560, 160 + n * 64) }}
              >
                <div
                  className="grid text-ink"
                  style={{ gridTemplateColumns: `160px repeat(${n}, minmax(0,1fr))` }}
                >
                  {/* Header — a below-reserve column carries a 2px risk mark. */}
                  <span className="border-b border-hair py-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2">
                    Cash flow
                  </span>
                  {data.labels.map((l, i) => (
                    <span
                      key={l}
                      className="relative whitespace-nowrap border-b border-hair py-2 pl-2 text-right text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-ink2"
                    >
                      {l}
                      {data.closing[i] < RESERVE && (
                        <span aria-hidden="true" className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-risk" />
                      )}
                    </span>
                  ))}

                  {/* Opening */}
                  <span className="py-1 text-[13px] font-semibold leading-[18px]">Opening</span>
                  {data.labels.map((l, i) => (
                    <span key={l} className={`${CELL} text-ink2`}>
                      {i === 0 ? fmtK(data.opening) : ''}
                    </span>
                  ))}

                  {GRID_ROWS.map((r, ri) =>
                    r.section ? (
                      <span
                        key={r.key}
                        style={{ gridColumn: `1 / span ${n + 1}` }}
                        className="mt-1.5 border-t border-hair pt-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2"
                      >
                        {r.label}
                      </span>
                    ) : (
                      [
                        <span key={`${r.key}-label`} className="whitespace-nowrap py-1 pl-2 text-[13px] leading-[18px]">
                          {r.label}
                          {r.badge && (
                            <span className="ml-1.5 rounded-sm border border-hair/[.18] px-1 text-[11px] font-semibold leading-4 text-ink2">
                              {r.badge}
                            </span>
                          )}
                        </span>,
                        ...data.labels.map((l, ci) => (
                          <motion.span
                            key={`${r.key}-${l}`}
                            initial={reduce ? false : { opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: cellDelay(ci, ri), duration: 0.25 }}
                            className={CELL}
                          >
                            {fmtK(data.rows[r.key][ci])}
                          </motion.span>
                        )),
                      ]
                    ),
                  )}

                  {/* Net */}
                  <span className="mt-1 border-t border-hair pt-1 text-[13px] font-semibold leading-[18px]">Net</span>
                  {data.net.map((v, i) => (
                    <motion.span
                      key={`net-${data.labels[i]}`}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: cellDelay(i, 9), duration: 0.25 }}
                      className={`mt-1 border-t border-hair pt-1 ${CELL}`}
                    >
                      {fmtK(v)}
                    </motion.span>
                  ))}

                  {/* Closing — the row the chart is drawn from; double-ruled. A
                      below-reserve cell carries a 2px risk underline, ink text. */}
                  <span className="border-b-[3px] border-double border-ink/50 py-1.5 text-[13px] font-semibold leading-[18px]">Closing</span>
                  {data.closing.map((v, i) => (
                    <motion.span
                      key={`clo-${data.labels[i]}`}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: cellDelay(i, 10), duration: 0.25 }}
                      className={`relative border-b-[3px] border-double border-ink/50 py-1.5 font-semibold ${CELL}`}
                    >
                      {fmtK(v)}
                      {v < RESERVE && <span aria-hidden="true" className="absolute bottom-0.5 right-0 h-[2px] w-6 bg-risk" />}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* The chart sits OUTSIDE the workbook's scroll box, so on a phone it
              spans the screen instead of scrolling away with the grid. */}
          <div className="mt-6">
            <Chart data={data} reduce={reduce} />
          </div>
        </motion.div>

        {/* ── Proof points (ruled) + CTA ── */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <ul className="ruled-index">
            {CASH_CINEMA.proofChips.map((c) => (
              <li key={c} className="text-[15px] leading-[22px] text-ink">
                {c}
              </li>
            ))}
          </ul>
          <div>
            <Button to={CASH_CINEMA.cta.to} variant="primary" className="btn-lg">
              {CASH_CINEMA.cta.label} <ArrowRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

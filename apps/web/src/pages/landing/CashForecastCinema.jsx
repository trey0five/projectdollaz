// ─────────────────────────────────────────────────────────────────────────────
// CashForecastCinema — the landing set-piece for the Cash Forecast module: a
// dark "cinema" band where a treasury workbook TYPES ITSELF from QuickBooks
// and the balance line draws to its low point, cycling through the five real
// horizons the product ships (1M / 3M / 6M / 12M / 13W).
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
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { CASH_CINEMA } from './landingContent.js'
import { EASE } from './Reveal.jsx'

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
  { key: '6M', data: build(MONTHS.slice(0, 6), { tuition: monthlyTuition(6), collections: 120, annual: 22, payroll: 210, bills: 72, facilities: 38 }) },
  { key: '12M', data: build(MONTHS, { tuition: monthlyTuition(12), collections: 120, annual: 22, payroll: 210, bills: 72, facilities: 38 }) },
  { key: '13W', data: build(WEEKS, { tuition: [130, 130, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8], collections: 20, annual: 5, payroll: 48, bills: 17, facilities: 9 }) },
]

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

function Chart({ data, reduce }) {
  const W = 640
  const H = 150
  const PAD = 10
  const all = [data.opening, ...data.closing, RESERVE]
  const lo = Math.min(...all) - 60
  const hi = Math.max(...all) + 40
  const pts = [data.opening, ...data.closing]
  const x = (i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2)
  const y = (v) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2)
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lowX = x(data.lowIdx + 1)
  const lowY = y(data.closing[data.lowIdx])
  const lowVal = data.closing[data.lowIdx]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Projected cash balance with the low point marked">
      <defs>
        <linearGradient id="ccfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e6c98a" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#e6c98a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Reserve floor — the line the whole demo is about. */}
      <line x1={PAD} x2={W - PAD} y1={y(RESERVE)} y2={y(RESERVE)} stroke="#f87171" strokeWidth="1.3" strokeDasharray="5 4" />
      <text x={PAD + 2} y={y(RESERVE) - 5} fontSize="9.5" fontWeight="700" fill="#fca5a5">
        Minimum reserve $500K
      </text>
      <motion.path
        key={`area-${data.labels.length}-${data.closing[0]}`}
        d={`${path} L${x(pts.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`}
        fill="url(#ccfill)"
        initial={reduce ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      />
      <motion.path
        key={`line-${data.labels.length}-${data.closing[0]}`}
        d={path}
        fill="none"
        stroke="#e6c98a"
        strokeWidth="2.4"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: EASE }}
      />
      <motion.circle
        cx={lowX}
        cy={lowY}
        r="4.5"
        fill="#fb923c"
        stroke="#101c3d"
        strokeWidth="2"
        animate={reduce ? undefined : { scale: [1, 1.45, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: `${lowX}px ${lowY}px` }}
      />
      <text
        x={Math.min(lowX + 9, W - 118)}
        y={Math.max(lowY - 9, 14)}
        fontSize="10.5"
        fontWeight="700"
        fill="#fdba74"
      >
        Low ${fmtK(lowVal)} · {data.labels[data.lowIdx]}
      </text>
    </svg>
  )
}

export default function CashForecastCinema() {
  const reduce = useReducedMotion()
  const stageRef = useRef(null)
  const inView = useInView(stageRef, { margin: '-120px', once: false })
  const [active, setActive] = useState('13W')
  const [pinned, setPinned] = useState(false)

  // Auto-cycle the horizons while the stage is on screen, until the visitor
  // clicks a pill — a demo that fights the user's choice reads as broken.
  useEffect(() => {
    if (reduce || pinned || !inView) return undefined
    const t = setInterval(() => {
      setActive((k) => {
        const i = HORIZONS.findIndex((h) => h.key === k)
        return HORIZONS[(i + 1) % HORIZONS.length].key
      })
    }, 4200)
    return () => clearInterval(t)
  }, [reduce, pinned, inView])

  const { data } = HORIZONS.find((h) => h.key === active)
  const n = data.labels.length
  const wide = n > 8
  const cellDelay = (col, row) => (reduce ? 0 : 0.12 + col * (wide ? 0.035 : 0.06) + row * 0.012)

  return (
    <section
      id="cash-forecast"
      aria-labelledby="cashcinema-h2"
      className="relative scroll-mt-20 overflow-hidden bg-navy-gradient py-24"
    >
      {/* Ambient glow — one warm pool behind the stage, one cool one high left. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(46% 38% at 68% 62%, rgba(212,180,122,0.14) 0%, transparent 70%), radial-gradient(34% 30% at 16% 12%, rgba(96,140,255,0.12) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-5xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light">{CASH_CINEMA.kicker}</p>
          <h2 id="cashcinema-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-white sm:text-[42px]">
            {CASH_CINEMA.h2}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-white/70">{CASH_CINEMA.sub}</p>
        </div>

        {/* ── The stage ── */}
        <motion.div
          ref={stageRef}
          initial={reduce ? false : { opacity: 0, y: 26 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mt-12 rounded-3xl border border-white/10 bg-white/[0.05] p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur-sm sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-emerald-300">
              <span className="relative flex h-2 w-2">
                {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {CASH_CINEMA.liveChip}
            </span>
            <div className="flex items-center gap-1.5" role="group" aria-label="Forecast horizon">
              {HORIZONS.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => {
                    setPinned(true)
                    setActive(h.key)
                  }}
                  className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide transition-all ${
                    active === h.key
                      ? 'bg-gold-gradient text-navy-deep shadow-glow'
                      : 'text-white/55 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {h.key}
                </button>
              ))}
            </div>
          </div>

          {/* ── The self-typing workbook ── */}
          <div className="mt-5 overflow-x-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.15 } }}
                className="min-w-[560px]"
              >
                <div
                  className="grid items-center gap-x-2 gap-y-0.5 font-mono"
                  style={{ gridTemplateColumns: `118px repeat(${n}, minmax(0,1fr))` }}
                >
                  {/* Header */}
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/45">Cash flow</span>
                  {data.labels.map((l, i) => (
                    <span
                      key={l}
                      className={`whitespace-nowrap text-right text-[9.5px] font-bold uppercase tracking-wide ${
                        data.closing[i] < RESERVE ? 'text-rose-300' : 'text-white/45'
                      }`}
                    >
                      {data.closing[i] < RESERVE && <span aria-hidden="true" className="mr-0.5 inline-block h-[5px] w-[5px] rounded-full bg-rose-400" />}
                      {l}
                    </span>
                  ))}

                  {/* Opening */}
                  <span className="py-1 text-[11px] font-semibold text-white/80">Opening</span>
                  {data.labels.map((l, i) => (
                    <span key={l} className="py-1 text-right text-[11px] text-white/60">
                      {i === 0 ? fmtK(data.opening) : ''}
                    </span>
                  ))}

                  {GRID_ROWS.map((r, ri) =>
                    r.section ? (
                      <span
                        key={r.key}
                        style={{ gridColumn: `1 / span ${n + 1}` }}
                        className="mt-1.5 border-t border-white/10 pt-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-gold-light/80"
                      >
                        {r.label}
                      </span>
                    ) : (
                      [
                        <span key={`${r.key}-label`} className="whitespace-nowrap py-0.5 pl-2 text-[11px] text-white/70">
                          {r.label}
                          {r.badge && (
                            <span className="ml-1 rounded border border-emerald-300/30 bg-emerald-400/10 px-1 py-px text-[8px] font-bold text-emerald-300">
                              {r.badge}
                            </span>
                          )}
                        </span>,
                        ...data.labels.map((l, ci) => (
                          <motion.span
                            key={`${r.key}-${l}`}
                            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: cellDelay(ci, ri), duration: 0.25 }}
                            className="py-0.5 text-right text-[11px] tabular-nums text-white/85"
                          >
                            {fmtK(data.rows[r.key][ci])}
                          </motion.span>
                        )),
                      ]
                    ),
                  )}

                  {/* Net */}
                  <span className="mt-1 border-t border-white/10 pt-1 text-[11px] font-semibold text-white/80">Net</span>
                  {data.net.map((v, i) => (
                    <motion.span
                      key={`net-${data.labels[i]}`}
                      initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: cellDelay(i, 9), duration: 0.25 }}
                      className={`mt-1 border-t border-white/10 pt-1 text-right text-[11px] tabular-nums ${v < 0 ? 'text-rose-300' : 'text-emerald-300'}`}
                    >
                      {fmtK(v)}
                    </motion.span>
                  ))}

                  {/* Closing — the row the chart is drawn from. */}
                  <span className="py-1 text-[11px] font-bold text-gold-light">Closing</span>
                  {data.closing.map((v, i) => (
                    <motion.span
                      key={`clo-${data.labels[i]}`}
                      initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: cellDelay(i, 10), duration: 0.25 }}
                      className={`rounded py-1 text-right text-[11px] font-bold tabular-nums ${
                        v < RESERVE ? 'bg-rose-500/15 text-rose-300' : 'text-gold-light'
                      }`}
                    >
                      {fmtK(v)}
                    </motion.span>
                  ))}
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <Chart data={data} reduce={reduce} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Proof chips + CTA ── */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {CASH_CINEMA.proofChips.map((c) => (
            <span
              key={c}
              className="rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-medium text-white/75"
            >
              {c}
            </span>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            to={CASH_CINEMA.cta.to}
            className="inline-flex items-center gap-2 rounded-xl btn-cta px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-navy-deep transition-shadow hover:shadow-glow-lg outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            {CASH_CINEMA.cta.label} <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}

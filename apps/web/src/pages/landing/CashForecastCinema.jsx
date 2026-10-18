// ─────────────────────────────────────────────────────────────────────────────
// CashForecastCinema — the landing set-piece for the Cash Forecast module: a
// dark "cinema" band where a treasury workbook TYPES ITSELF from QuickBooks
// and the balance line draws to its low point, cycling through the five real
// horizons the product ships (1M / 3M / 6M / 12M / 13W). The look is the
// pre-Premium-UI one (74caaba): navy band, dark glass stage, mono workbook, a
// gold area chart over a red dashed reserve floor, a live pill that pings and
// a gradient CTA. What the stage depicts is TODAY's app: the Cash Forecast
// band's verdict sentence and its glass figures, each with the app's own
// Good / Watch / At risk pill — judged against the same $500K reserve the
// chart draws, never an invented target.
//
// The demo data is generated, not hand-typed, so the grid always reconciles:
// rows sum to the net row, the net row cumsums to the closing row, and the
// figures and chart are drawn FROM the closing row. A marketing section whose
// grid disagreed with its own chart would undercut the product's whole honesty
// pitch. The narrative beat is real too: short horizons look fine, the long
// ones reveal the dip below reserve — the module's reason to exist.
//
// The horizons cycle while the stage is on screen, until the visitor picks
// one (a demo that fights the user's choice reads as broken) or while the
// pointer / focus is on the stage. Reduced motion: the 12-month view (the one
// with the dip), statically — no cycle, no ping, no line draw.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowDownToLine, CalendarCheck, CalendarRange } from 'lucide-react'
import VerdictPill from '../../components/ui/aurora/VerdictPill.jsx'
import VerdictEm from '../../components/ui/aurora/VerdictEm.jsx'
import { CASH_CINEMA } from './landingContent.js'
import { EASE } from './Reveal.jsx'
import '../../styles/landing-restore-middle.css'

const RESERVE = 500 // $K — the dashed floor on the chart
// Within this much of the floor is "Watch" (a cushion, not a target).
const WATCH_CUSHION = 100

const MONTHS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
const MONTH_NAME = {
  Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December', Jan: 'January',
  Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July',
}
const WEEKS = ['Aug 10', 'Aug 17', 'Aug 24', 'Aug 31', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 28', 'Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2']

/** Build one horizon's dataset. Amounts in $K; everything derives from the row
 *  values so grid, net, closing, figures and chart can never disagree. */
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

const WEEKLY = { tuition: [130, 130, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8], collections: 20, annual: 5, payroll: 48, bills: 17, facilities: 9 }
const MONTHLY = { collections: 120, annual: 22, payroll: 210, bills: 72, facilities: 38 }

// The app's horizon order.
const HORIZONS = [
  { key: '1M', weekly: true, data: build(WEEKS.slice(0, 4), { ...WEEKLY, tuition: [130, 130, 8, 8] }) },
  { key: '3M', weekly: true, data: build(WEEKS, WEEKLY) },
  { key: '6M', weekly: false, data: build(MONTHS.slice(0, 6), { ...MONTHLY, tuition: monthlyTuition(6) }) },
  { key: '12M', weekly: false, data: build(MONTHS, { ...MONTHLY, tuition: monthlyTuition(12) }) },
  { key: '13W', weekly: true, data: build(WEEKS, WEEKLY) },
]
const CYCLE_MS = 4200

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
const money = (v) => `$${fmtK(Math.round(v))}`

/** A balance against the reserve floor → the app's verdict. */
const verdictOf = (v) => (v < RESERVE ? 'risk' : v < RESERVE + WATCH_CUSHION ? 'watch' : 'good')
const VERDICT_PHRASE = {
  risk: `below your $${RESERVE}K reserve`,
  watch: `just above your $${RESERVE}K reserve`,
  good: `comfortably above your $${RESERVE}K reserve`,
}
/** "the week of Nov 2" / "July" */
const when = (label, weekly) => (weekly ? `the week of ${label}` : MONTH_NAME[label] ?? label)

// A dollar figure that counts from its previous value to the new one.
function CountK({ value }) {
  const ref = useRef(null)
  const prev = useRef(value)
  const reduce = useReducedMotion()
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (!ref.current) return undefined
    if (reduce || from === value) {
      ref.current.textContent = money(value)
      return undefined
    }
    const controls = animate(from, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = money(v)
      },
    })
    return () => controls.stop()
  }, [value, reduce])
  return <span ref={ref}>{money(value)}</span>
}

// One glass figure, the app's band KPI at stage scale, kept compact so the
// stage paces like the pre-redesign band (workbook first, then the verdict):
// on a phone the three sit in ONE row (short label, value, pill — the verdict
// sentence above them already says when); from lg they stack in a column
// beside the chart, inside the height the chart already takes.
function Figure({ icon, label, short, value, text = null, caption, verdict }) {
  const Icon = icon
  return (
    <div className="lrm-glass-dark flex min-w-0 flex-col justify-center rounded-[12px] px-2.5 py-2 sm:px-3.5 sm:py-2.5">
      <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/70 sm:text-[11.5px] sm:normal-case sm:tracking-normal sm:text-white/85">
        <span className="hidden h-5 w-5 flex-none place-items-center rounded-[6px] bg-white/15 text-white sm:grid">
          <Icon size={12} aria-hidden="true" />
        </span>
        <span className="truncate sm:hidden">{short}</span>
        <span className="hidden truncate sm:inline">{label}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <b className="whitespace-nowrap text-[16px] font-bold leading-none tracking-[-0.02em] text-white tabular-nums sm:text-[22px]">
          {text ?? <CountK value={value} />}
        </b>
        <VerdictPill verdict={verdict} className="au-pill-sm" />
      </div>
      <span className="mt-1 hidden truncate text-[11px] text-white/60 sm:block">{caption}</span>
    </div>
  )
}

// The balance chart. Marks are SVG stretched to the box (the reserve rule keeps
// a non-scaling stroke; the drawn line cannot — pathLength needs user units);
// every LABEL is HTML positioned in percent, so type stays legible at any
// width instead of scaling with the viewBox (it shrank to 5px on a phone).
function Chart({ data, weekly, reduce }) {
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
  const resY = yp(RESERVE)
  // The low label goes where the line ISN'T: below the point when it's near
  // the top or on the right (the line arrives from the upper left there);
  // above it otherwise. At the bottom-right corner below still wins — the
  // label may hang a few px past the plot into the stage's gap, which beats
  // the line striking through it.
  const labelBelow = lowY < 18 || lowX > 70
  const animKey = `${data.labels.length}-${data.closing[0]}`
  return (
    <div
      className="relative h-36 sm:h-48 lg:h-full lg:min-h-[12rem]"
      role="img"
      aria-label={`Projected cash balance; low point ${money(lowVal)} in ${when(data.labels[data.lowIdx], weekly)}, against a $${RESERVE}K minimum reserve`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="ccfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6c98a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#e6c98a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Reserve floor — the line the whole demo is about. */}
        <line x1="0" x2={W} y1={(resY * H) / 100} y2={(resY * H) / 100} stroke="#f87171" strokeWidth="1.3" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <motion.path
          key={`area-${animKey}`}
          d={`${path} L${W},${H} L0,${H} Z`}
          fill="url(#ccfill)"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        />
        <motion.path
          key={`line-${animKey}`}
          d={path}
          fill="none"
          stroke="#e6c98a"
          strokeWidth="2.6"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute left-1 -translate-y-full pb-1 text-[11px] font-bold leading-4 text-[#fca5a5]"
        style={{ top: `${resY}%` }}
      >
        Minimum reserve ${RESERVE}K
      </span>
      {/* The low point: an orange marker that breathes, plus its label. */}
      <span
        aria-hidden="true"
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${lowX}%`, top: `${lowY}%` }}
      >
        <span className="lrm-breathe absolute inset-0 rounded-full border-2 border-[#101c3d] bg-[#fb923c]" style={{ boxShadow: '0 0 14px rgba(251,146,60,0.8)' }} />
      </span>
      <span
        aria-hidden="true"
        className={`absolute whitespace-nowrap text-[12px] font-bold leading-4 text-[#fdba74] ${lowX > 70 ? '-translate-x-full pr-3' : 'pl-3'} ${labelBelow ? 'translate-y-1 pt-1' : '-translate-y-full pb-1'}`}
        style={{ left: `${lowX}%`, top: `${lowY}%` }}
      >
        Low {money(lowVal)} · {data.labels[data.lowIdx]}
      </span>
    </div>
  )
}

export default function CashForecastCinema() {
  const reduce = useReducedMotion()
  const stageRef = useRef(null)
  const inView = useInView(stageRef, { margin: '-120px' })
  const [active, setActive] = useState(reduce ? '12M' : '1M')
  const [pinned, setPinned] = useState(false)
  const [hovering, setHovering] = useState(false)

  // Cycle the horizons while the stage is on screen, until the visitor picks
  // one; hold while the pointer or focus is on the stage.
  useEffect(() => {
    if (reduce || pinned || hovering || !inView) return undefined
    const t = setTimeout(() => {
      setActive((k) => {
        const i = HORIZONS.findIndex((h) => h.key === k)
        return HORIZONS[(i + 1) % HORIZONS.length].key
      })
    }, CYCLE_MS)
    return () => clearTimeout(t)
  }, [reduce, pinned, hovering, inView, active])

  const horizon = HORIZONS.find((h) => h.key === active)
  const { data, weekly } = horizon
  const n = data.labels.length
  const wide = n > 8
  const cellDelay = (col, row) => (reduce ? 0 : 0.12 + col * (wide ? 0.035 : 0.06) + row * 0.012)
  const lowVal = data.closing[data.lowIdx]
  const endVal = data.closing[n - 1]
  const lowVerdict = verdictOf(lowVal)
  // "Covered through": the last period before the balance first drops under
  // the reserve (the app's own figure), or the horizon's end when it never does.
  const breachIdx = data.closing.findIndex((v) => v < RESERVE)
  const covered =
    breachIdx < 0
      ? { text: data.labels[n - 1], caption: 'Above reserve the whole horizon', verdict: 'good' }
      : {
          text: breachIdx === 0 ? 'Now' : data.labels[breachIdx - 1],
          caption: `Below reserve from ${when(data.labels[breachIdx], weekly)}`,
          verdict: 'risk',
        }

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
            'radial-gradient(46% 38% at 68% 62%, rgba(212,180,122,0.14) 0%, transparent 70%), radial-gradient(34% 30% at 16% 12%, rgba(96,140,255,0.16) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-5xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light">{CASH_CINEMA.kicker}</p>
          <h2 id="cashcinema-h2" className="mt-3 font-sans text-[32px] font-semibold leading-tight text-white sm:text-[42px]">
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
          onPointerEnter={() => setHovering(true)}
          onPointerLeave={() => setHovering(false)}
          onFocus={() => setHovering(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setHovering(false)
          }}
          className="mt-12 min-w-0 rounded-[24px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm sm:p-6"
          style={{ boxShadow: '0 30px 80px -30px rgba(0,0,0,0.6)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-emerald-300">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {!reduce && <span className="lrm-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {CASH_CINEMA.liveChip}
            </span>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Forecast horizon">
              {HORIZONS.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  aria-pressed={active === h.key}
                  onClick={() => {
                    setPinned(true)
                    setActive(h.key)
                  }}
                  className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide outline-none transition-all focus-visible:ring-2 focus-visible:ring-white/70 ${
                    active === h.key ? 'bg-gold-gradient text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                  style={active === h.key ? { boxShadow: '0 0 0 1px rgba(125,211,252,0.5), 0 8px 24px rgba(59,130,246,0.45)' } : undefined}
                >
                  {h.key}
                </button>
              ))}
            </div>
          </div>

          {/* ── The self-typing workbook ── */}
          <div className="mt-4 overflow-x-auto rounded-[14px] border border-white/[0.08] bg-[#0a1229]/40 p-3 sm:p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.15 } }}
                style={{ minWidth: Math.max(540, 132 + n * 54) }}
              >
                <div
                  className="grid items-center gap-x-2 gap-y-0.5 font-mono"
                  style={{ gridTemplateColumns: `132px repeat(${n}, minmax(0,1fr))` }}
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
                            <span className="ml-1 rounded-[4px] border border-emerald-300/30 bg-emerald-400/10 px-1 py-px text-[8px] font-bold text-emerald-300">
                              {r.badge}
                            </span>
                          )}
                        </span>,
                        ...data.labels.map((l, ci) => (
                          <motion.span
                            key={`${r.key}-${l}`}
                            initial={reduce ? false : { opacity: 0, y: 4 }}
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
                      initial={reduce ? false : { opacity: 0 }}
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
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: cellDelay(i, 10), duration: 0.25 }}
                      className={`rounded-[4px] py-1 text-right text-[11px] font-bold tabular-nums ${
                        v < RESERVE ? 'bg-rose-500/15 text-rose-300' : 'text-gold-light'
                      }`}
                    >
                      {fmtK(v)}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── The verdict: the app's sentence, the chart and its glass figures,
              judged against the reserve. They follow the workbook (as the
              app's result follows its data), and sit OUTSIDE the workbook's
              scroll box so on a phone they span the stage. ── */}
          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="font-serif text-[17px] leading-snug text-white sm:text-[21px]">
              The low point is <VerdictEm>{money(lowVal)}</VerdictEm> in {when(data.labels[data.lowIdx], weekly)} —{' '}
              <VerdictEm tone={lowVerdict}>{VERDICT_PHRASE[lowVerdict]}</VerdictEm>.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_224px] lg:gap-5">
              <div className="pb-3 pt-2 lg:pb-0 lg:pt-3">
                <Chart key={active} data={data} weekly={weekly} reduce={reduce} />
              </div>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
                <Figure icon={ArrowDownToLine} label="Lowest point" short="Low point" value={lowVal} caption={`In ${when(data.labels[data.lowIdx], weekly)}`} verdict={lowVerdict} />
                <Figure icon={CalendarCheck} label="Covered through" short="Covered to" text={covered.text} caption={covered.caption} verdict={covered.verdict} />
                <Figure icon={CalendarRange} label="Ending balance" short="Ending" value={endVal} caption={weekly ? `Week of ${data.labels[n - 1]}` : `End of ${MONTH_NAME[data.labels[n - 1]]}`} verdict={verdictOf(endVal)} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Proof chips + CTA ── */}
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {CASH_CINEMA.proofChips.map((c) => (
            <li
              key={c}
              className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-medium text-white/75"
            >
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-8 text-center">
          <Link
            to={CASH_CINEMA.cta.to}
            className="btn-cta inline-flex items-center gap-2 rounded-[12px] px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {CASH_CINEMA.cta.label} <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}

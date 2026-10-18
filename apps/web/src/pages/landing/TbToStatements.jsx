// ─────────────────────────────────────────────────────────────────────────────
// TbToStatements — "One upload. Four statements." The core product truth as a
// LIVE moving example: a trial-balance file on the left feeds a marching packet
// beam into a statement viewer that AUTO-CYCLES through the four generated
// statements, each with realistic example numbers whose rows cascade in and
// whose total counts up. The look is the pre-Premium-UI one (74caaba): centred
// sans heading, a floating glass file card, a frosted statement card with
// progress pips. The viewer itself depicts TODAY's app: the Finance Aurora
// band ("Your statements"), filled pill tabs in the app's order, and the
// statement set as the app prints it (school name over the title, in serif).
//
// Tabs are real buttons; a click jumps there and the cycle carries on from it.
// The cycle runs only while the viewer is on screen and pauses while the
// pointer or keyboard focus is inside it. Reduced motion: the first statement,
// statically — no cycle, no float, no beam.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, animate, useInView, useReducedMotion } from 'framer-motion'
import { FileSpreadsheet, ArrowRight, Receipt } from 'lucide-react'
import VerdictPill from '../../components/ui/aurora/VerdictPill.jsx'
import { moduleAuroraVars } from '../../components/module/moduleAnatomy.js'
import '../../styles/landing-restore-middle.css'

const fmt = (n) =>
  (n < 0 ? '(' : '') + '$' + Math.abs(n).toLocaleString('en-US') + (n < 0 ? ')' : '')

// The example school the depicted statements belong to (fictional).
const SCHOOL = 'Cedar Ridge Preparatory'

// The four statements with board-realistic example figures (they tie: change in
// net assets 1,080,000; cash EOY 1,240,000 appears on the SoFP; net assets
// match). Order = the app's statement tabs.
const STATEMENTS = [
  {
    key: 'soa',
    tab: 'Activities',
    title: 'Statement of Activities',
    asOf: 'For the year ended June 30, 2026',
    rows: [
      { l: 'Tuition & fees, net', v: 10850000 },
      { l: 'Contributions', v: 1240000 },
      { l: 'Auxiliary programs', v: 610000 },
      { l: 'Total revenue', v: 12700000, total: true },
      { l: 'Program services', v: 8940000 },
      { l: 'Management & general', v: 2210000 },
      { l: 'Fundraising', v: 470000 },
      { l: 'Total expenses', v: 11620000, total: true },
    ],
    grand: { l: 'Change in net assets', v: 1080000 },
  },
  {
    key: 'sofp',
    tab: 'Financial Position',
    title: 'Statement of Financial Position',
    asOf: 'June 30, 2026',
    rows: [
      { l: 'Cash & equivalents', v: 1240000 },
      { l: 'Accounts receivable', v: 186000 },
      { l: 'Investments', v: 3420000 },
      { l: 'Property & equipment, net', v: 8150000 },
      { l: 'Total assets', v: 12996000, total: true },
      { l: 'Accounts payable', v: 142000 },
      { l: 'Deferred tuition revenue', v: 1890000 },
      { l: 'Long-term debt', v: 2600000 },
      { l: 'Total liabilities', v: 4632000, total: true },
    ],
    grand: { l: 'Net assets', v: 8364000 },
  },
  {
    key: 'scf',
    tab: 'Cash Flows',
    title: 'Statement of Cash Flows',
    asOf: 'For the year ended June 30, 2026',
    rows: [
      { l: 'Cash from operating activities', v: 1310000 },
      { l: 'Cash used in investing activities', v: -640000 },
      { l: 'Cash used in financing activities', v: -280000 },
      { l: 'Net change in cash', v: 390000, total: true },
      { l: 'Cash — beginning of year', v: 850000 },
    ],
    grand: { l: 'Cash — end of year', v: 1240000 },
  },
  {
    key: 'sna',
    tab: 'Net Assets',
    title: 'Statement of Changes in Net Assets',
    asOf: 'For the year ended June 30, 2026',
    rows: [
      { l: 'Without donor restrictions', v: 6210000 },
      { l: 'With donor restrictions', v: 2154000 },
      { l: 'Net assets — beginning of year', v: 7284000 },
      { l: 'Change in net assets', v: 1080000, total: true },
    ],
    grand: { l: 'Net assets — end of year', v: 8364000 },
  },
]

// How long the cycle holds each statement (ms).
const CYCLE_MS = 4200

// TB rows shown in the source file card.
const TB_ROWS = [
  ['4000 · Tuition income', '10,850,000'],
  ['1010 · Operating cash', '1,240,000'],
  ['5100 · Program salaries', '6,480,000'],
  ['2300 · Deferred tuition', '1,890,000'],
  ['1500 · Investments', '3,420,000'],
]
// The mapping step as the app runs it: most accounts map themselves, a few
// are flagged for one review popup.
const TB_TOTAL = 412
const TB_REVIEW = 3

// The Finance module's band hue (the app's locked registry hue).
const FINANCE_BAND = moduleAuroraVars('finance')

// How each counter prints a value mid-count.
const FORMATS = {
  money: (v) => fmt(Math.round(v / 1000) * 1000),
  int: (v) => String(Math.round(v)),
}

// A number that counts up from 0 once it is on screen (or instantly, reduced).
function useCountUp(ref, value, { duration = 0.8, kind = 'int', run = true } = {}) {
  const reduce = useReducedMotion()
  useEffect(() => {
    const format = FORMATS[kind]
    if (!ref.current) return undefined
    if (reduce || !run) {
      ref.current.textContent = format(run || reduce ? value : 0)
      return undefined
    }
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = format(v)
      },
    })
    return () => controls.stop()
  }, [ref, value, reduce, run, duration, kind])
}

// Grand-total value that counts up on each statement swap.
function GrandValue({ value }) {
  const ref = useRef(null)
  useCountUp(ref, value, { kind: 'money' })
  return <span ref={ref} className="tabular-nums">{fmt(value)}</span>
}

// "Mapped 409 of 412" — counts up when the file card comes on screen.
function MappedCount({ run }) {
  const ref = useRef(null)
  useCountUp(ref, TB_TOTAL - TB_REVIEW, { duration: 1.4, run })
  return <span ref={ref} className="tabular-nums">{TB_TOTAL - TB_REVIEW}</span>
}

export default function TbToStatements() {
  const reduce = useReducedMotion()
  const fileRef = useRef(null)
  const viewerRef = useRef(null)
  const fileInView = useInView(fileRef, { once: true, margin: '-80px' })
  const viewerInView = useInView(viewerRef, { margin: '-80px' })
  const [tab, setTab] = useState(0)
  const [paused, setPaused] = useState(false)

  // Auto-cycle the statements (the "dynamic moving example") while the viewer
  // is on screen and nobody is pointing at / tabbing through it. Keyed on the
  // tab, so a click restarts the hold and the cycle continues from there.
  useEffect(() => {
    if (reduce || !viewerInView || paused) return undefined
    const t = setTimeout(() => setTab((v) => (v + 1) % STATEMENTS.length), CYCLE_MS)
    return () => clearTimeout(t)
  }, [reduce, viewerInView, paused, tab])

  const s = STATEMENTS[tab]
  const cycling = !reduce && viewerInView && !paused

  return (
    <section aria-labelledby="tbstmt-h2" className="bg-[#e9f0fb] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
            From trial balance to board-ready
          </p>
          <h2 id="tbstmt-h2" className="mt-3 font-sans text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
            One upload. Four statements.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
            Drop the trial balance export your bookkeeper already makes. KYRO maps it and
            generates every statement your auditor and board expect.
          </p>
        </div>

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-[minmax(260px,340px)_auto_minmax(0,1fr)]">
          {/* ── The source: a trial-balance file, held up on glass ── */}
          <motion.div
            ref={fileRef}
            initial={reduce ? false : { opacity: 0, x: -30 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            <div
              className="lrm-float rounded-[16px] border border-navy/10 bg-white/80 p-5 backdrop-blur-sm sm:rounded-[20px]"
              style={{ boxShadow: '0 16px 40px -22px rgba(16,28,61,0.3)' }}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-emerald-600/10 text-emerald-700">
                  <FileSpreadsheet size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <b className="block text-[14px] font-semibold text-navy">June-TB.xlsx</b>
                  <span className="text-[11.5px] text-muted">{TB_TOTAL} rows · debits = credits ✓</span>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 font-mono text-[11px] text-navy/70" role="list" aria-label="Trial balance extract">
                {TB_ROWS.map(([l, v], i) => (
                  <motion.div
                    key={l}
                    role="listitem"
                    initial={reduce ? false : { opacity: 0, x: -10 }}
                    whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.25 + i * 0.09 }}
                    className="flex justify-between gap-3 border-b border-navy/5 pb-1"
                  >
                    <span className="truncate">{l}</span>
                    <span className="tabular-nums">{v}</span>
                  </motion.div>
                ))}
                <div className="pt-0.5 text-center text-navy/40">⋯ {TB_TOTAL - TB_ROWS.length} more</div>
              </div>
              {/* The mapping step, as the app runs it: most accounts map
                  themselves; the few it can't are one review popup. */}
              <div className="mt-4 rounded-[12px] border border-navy/[0.08] bg-[#f4f7fd] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-[11.5px] font-semibold text-navy">
                  <span>
                    Mapped <MappedCount run={fileInView} /> of {TB_TOTAL}
                  </span>
                  <VerdictPill verdict="watch" label={`${TB_REVIEW} to review`} className="au-pill-sm" />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/[0.08]">
                  <motion.div
                    className="lrm-sheen h-full rounded-full"
                    style={{
                      background: 'linear-gradient(90deg,#10b981,#2563EB)',
                      width: reduce ? `${((TB_TOTAL - TB_REVIEW) / TB_TOTAL) * 100}%` : undefined,
                    }}
                    initial={reduce ? false : { width: '0%' }}
                    animate={reduce ? undefined : { width: fileInView ? `${((TB_TOTAL - TB_REVIEW) / TB_TOTAL) * 100}%` : '0%' }}
                    transition={{ duration: 1.4, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── The pipeline: packets flowing right ── */}
          <div aria-hidden="true" className="hidden justify-center lg:flex">
            <svg width="90" height="40" viewBox="0 0 90 40" className="overflow-visible">
              <line x1="4" y1="20" x2="86" y2="20" stroke="rgba(16,28,61,0.15)" strokeWidth="3" strokeLinecap="round" />
              <line x1="4" y1="20" x2="86" y2="20" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" className="lrm-flow" />
              <path d="M78 12 L88 20 L78 28" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* ── The moving example: the app's statements view, auto-cycling ── */}
          <motion.div
            ref={viewerRef}
            initial={reduce ? false : { opacity: 0, x: 30 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false)
            }}
            className="relative min-w-0 overflow-hidden rounded-[16px] border border-navy/10 bg-white/85 backdrop-blur-sm sm:rounded-[20px]"
            style={{ boxShadow: '0 24px 60px -24px rgba(16,28,61,0.35)' }}
          >
            {/* The Finance band, as the app opens the statements view (its own
                clip-path keeps the blurred blobs inside the rounded corner). */}
            <div className="lrm-band px-5 py-4 sm:px-6" style={{ ...FINANCE_BAND, clipPath: 'inset(0 round 16px 16px 0 0)' }}>
              <div className="au-fx" aria-hidden="true">
                <span className="au-blob au-blob-1" />
                <span className="au-blob au-blob-2" />
                <span className="au-veil" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-white/25 bg-white/15">
                    <Receipt size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-serif text-[21px] font-medium leading-6 text-white">Your statements</p>
                    <p className="truncate text-[12px] text-white/80">The four statements, read-only</p>
                  </div>
                </div>
                <span className="flex-none rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[11.5px] font-semibold text-white">
                  FY 2026
                </span>
              </div>
            </div>

            {/* Pill tabs, as the app draws them. */}
            <div
              role="tablist"
              aria-label="Generated statements"
              className="flex flex-wrap gap-1 border-b border-navy/10 px-3 py-2.5 sm:px-4"
            >
              {STATEMENTS.map((st, i) => (
                <button
                  key={st.key}
                  type="button"
                  role="tab"
                  aria-selected={i === tab}
                  onClick={() => setTab(i)}
                  className={`relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 ${
                    i === tab ? 'text-white' : 'text-navy/55 hover:text-navy'
                  }`}
                >
                  {i === tab && (
                    <motion.span
                      layoutId="tb-tab-pill"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-[#2563EB]"
                      style={{ boxShadow: '0 6px 16px -6px rgba(37,99,235,0.7)' }}
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{st.tab}</span>
                </button>
              ))}
            </div>

            {/* The statement, as the app prints it. */}
            <div className="min-h-[372px] px-5 py-4 sm:px-7" role="tabpanel" aria-label={s.title}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.key}
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="text-center">
                    <p className="font-serif text-[19px] font-medium leading-6 text-navy">{SCHOOL}</p>
                    <h3 className="mt-0.5 text-[13px] font-semibold text-navy">{s.title}</h3>
                    <p className="text-[11px] italic text-navy/50">{s.asOf}</p>
                  </div>
                  <div className="mt-3">
                    {s.rows.map((r, i) => (
                      <motion.div
                        key={r.l}
                        initial={reduce ? false : { opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: reduce ? 0 : 0.1 + i * 0.06, duration: 0.3 }}
                        className={`flex items-baseline justify-between gap-4 py-[5px] text-[13.5px] ${
                          r.total ? 'border-t border-navy/15 font-semibold text-navy' : 'text-navy/75'
                        }`}
                      >
                        <span className="min-w-0">{r.l}</span>
                        <span className="tabular-nums">{fmt(r.v)}</span>
                      </motion.div>
                    ))}
                    {/* grand total — double-ruled, counts up */}
                    <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t-2 border-navy/60 py-2 text-[15px] font-bold text-navy [border-bottom:3px_double_rgba(16,28,61,0.6)]">
                      <span className="min-w-0">{s.grand.l}</span>
                      <GrandValue value={s.grand.v} />
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* auto-cycle progress pips */}
            {!reduce && (
              <div aria-hidden="true" className="flex gap-1.5 px-5 pb-4 sm:px-7">
                {STATEMENTS.map((st, i) => (
                  <span key={st.key} className="relative h-1 flex-1 overflow-hidden rounded-full bg-navy/10">
                    {i === tab && (
                      <motion.span
                        key={`${st.key}-${tab}-${cycling}`}
                        className="absolute inset-y-0 left-0 rounded-full bg-[#2563EB]"
                        initial={{ width: cycling ? '0%' : '100%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: cycling ? CYCLE_MS / 1000 : 0, ease: 'linear' }}
                      />
                    )}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* mobile pipeline hint */}
        <div aria-hidden="true" className="mt-4 flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-navy/45 lg:hidden">
          upload <ArrowRight size={13} /> statements, automatically
        </div>
      </div>
    </section>
  )
}

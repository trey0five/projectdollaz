// ─────────────────────────────────────────────────────────────────────────────
// TbToStatements — "One upload. Four statements." The core product truth as a
// LIVE moving example: a trial-balance file on the left feeds an animated
// pipeline into a statement viewer that AUTO-CYCLES through the four generated
// statements (Financial Position → Activities → Cash Flows → Net Assets), each
// with realistic example numbers whose rows cascade in and totals count up.
// Tabs are real buttons (clicking jumps the cycle). Light-ground section; all
// loops respect reduced motion (static first statement, no auto-advance).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, animate, useReducedMotion } from 'framer-motion'
import { FileSpreadsheet, ArrowRight } from 'lucide-react'
import '../../styles/landing-orbit.css'

const fmt = (n) =>
  (n < 0 ? '(' : '') + '$' + Math.abs(n).toLocaleString('en-US') + (n < 0 ? ')' : '')

// The four statements with board-realistic example figures (they tie: change in
// net assets 1,080,000; cash EOY 1,240,000 appears on the SoFP; net assets match).
const STATEMENTS = [
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
    key: 'soa',
    tab: 'Activities',
    title: 'Statement of Activities',
    asOf: 'Year ended June 30, 2026',
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
    key: 'scf',
    tab: 'Cash Flows',
    title: 'Statement of Cash Flows',
    asOf: 'Year ended June 30, 2026',
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
    asOf: 'Year ended June 30, 2026',
    rows: [
      { l: 'Without donor restrictions', v: 6210000 },
      { l: 'With donor restrictions', v: 2154000 },
      { l: 'Net assets — beginning of year', v: 7284000 },
      { l: 'Change in net assets', v: 1080000, total: true },
    ],
    grand: { l: 'Net assets — end of year', v: 8364000 },
  },
]

// TB rows shown in the source file card.
const TB_ROWS = [
  ['4000 · Tuition income', '10,850,000'],
  ['1010 · Operating cash', '1,240,000'],
  ['5100 · Program salaries', '6,480,000'],
  ['2300 · Deferred tuition', '1,890,000'],
  ['1500 · Investments', '3,420,000'],
]

// Grand-total value that counts up on each statement swap.
function GrandValue({ value }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) {
      if (ref.current) ref.current.textContent = fmt(value)
      return undefined
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt(Math.round(v / 1000) * 1000)
      },
    })
    return () => controls.stop()
  }, [value, reduce])
  return <span ref={ref} className="tabular-nums">{fmt(value)}</span>
}

export default function TbToStatements() {
  const reduce = useReducedMotion()
  const [tab, setTab] = useState(0)

  // Auto-cycle the statements (the "dynamic moving example"); clicking a tab
  // jumps there and the cycle continues from it.
  useEffect(() => {
    if (reduce) return undefined
    const t = setInterval(() => setTab((v) => (v + 1) % STATEMENTS.length), 4200)
    return () => clearInterval(t)
  }, [reduce])

  const s = STATEMENTS[tab]

  return (
    <section aria-labelledby="tbstmt-h2" className="bg-transparent py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
            From trial balance to board-ready
          </p>
          <h2 id="tbstmt-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
            One upload. Four statements.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
            Drop the trial balance export your bookkeeper already makes — KYRO maps it and
            generates every statement your auditor and board expect.
          </p>
        </div>

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-[minmax(260px,340px)_auto_1fr]">
          {/* ── The source: a trial-balance file ── */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-navy/10 bg-white/80 p-5 shadow-[0_16px_40px_-22px_rgba(16,28,61,0.3)] backdrop-blur-sm"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700">
                <FileSpreadsheet size={18} />
              </span>
              <div>
                <b className="block text-[14px] font-semibold text-navy">June-TB.xlsx</b>
                <span className="text-[11.5px] text-muted">412 rows · debits = credits ✓</span>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 font-mono text-[11px] text-navy/70" aria-hidden="true">
              {TB_ROWS.map(([l, v], i) => (
                <motion.div
                  key={l}
                  initial={reduce ? false : { opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.25 + i * 0.09 }}
                  className="flex justify-between gap-3 border-b border-navy/5 pb-1"
                >
                  <span className="truncate">{l}</span>
                  <span className="tabular-nums">{v}</span>
                </motion.div>
              ))}
              <div className="pt-0.5 text-center text-navy/35">⋯ 407 more</div>
            </div>
          </motion.div>

          {/* ── The pipeline: packets flowing right ── */}
          <div aria-hidden="true" className="hidden justify-center lg:flex">
            <svg width="90" height="40" viewBox="0 0 90 40" className="overflow-visible">
              <line x1="4" y1="20" x2="86" y2="20" stroke="rgba(16,28,61,0.15)" strokeWidth="3" strokeLinecap="round" />
              <line x1="4" y1="20" x2="86" y2="20" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" className="orbit-beam-flow" />
              <path d="M78 12 L88 20 L78 28" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* ── The moving example: auto-cycling statement viewer ── */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white/85 shadow-[0_24px_60px_-24px_rgba(16,28,61,0.35)] backdrop-blur-sm"
          >
            {/* gold hairline */}
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
            {/* tabs */}
            <div role="tablist" aria-label="Generated statements" className="flex flex-wrap gap-1 border-b border-navy/10 px-3 pt-3">
              {STATEMENTS.map((st, i) => (
                <button
                  key={st.key}
                  role="tab"
                  aria-selected={i === tab}
                  onClick={() => setTab(i)}
                  className={`relative rounded-t-lg px-3 py-2 text-[12.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-navy/40 ${
                    i === tab ? 'text-navy' : 'text-navy/45 hover:text-navy/75'
                  }`}
                >
                  {st.tab}
                  {i === tab && (
                    <motion.span
                      layoutId="tb-tab-underline"
                      className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-[#2563EB]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                </button>
              ))}
            </div>
            {/* statement body */}
            <div className="min-h-[330px] px-5 py-4 sm:px-7">
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.key}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-serif text-[17px] font-semibold text-navy sm:text-[19px]">{s.title}</h3>
                    <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-navy/45">{s.asOf}</span>
                  </div>
                  <div className="mt-3">
                    {s.rows.map((r, i) => (
                      <motion.div
                        key={r.l}
                        initial={reduce ? false : { opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: reduce ? 0 : 0.1 + i * 0.06, duration: 0.3 }}
                        className={`flex items-baseline justify-between gap-4 py-[5px] text-[13.5px] ${
                          r.total
                            ? 'border-t border-navy/15 font-semibold text-navy'
                            : 'text-navy/75'
                        }`}
                      >
                        <span>{r.l}</span>
                        <span className="tabular-nums">{fmt(r.v)}</span>
                      </motion.div>
                    ))}
                    {/* grand total — double-ruled, counts up */}
                    <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t-2 border-navy/60 py-2 text-[15px] font-bold text-navy [border-bottom:3px_double_rgba(16,28,61,0.6)]">
                      <span>{s.grand.l}</span>
                      <GrandValue value={s.grand.v} />
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            {/* auto-cycle progress */}
            {!reduce && (
              <div aria-hidden="true" className="flex gap-1.5 px-5 pb-4 sm:px-7">
                {STATEMENTS.map((st, i) => (
                  <span key={st.key} className="relative h-1 flex-1 overflow-hidden rounded-full bg-navy/10">
                    {i === tab && (
                      <motion.span
                        key={`${st.key}-${tab}`}
                        className="absolute inset-y-0 left-0 rounded-full bg-[#2563EB]"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 4.2, ease: 'linear' }}
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

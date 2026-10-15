// ─────────────────────────────────────────────────────────────────────────────
// TbToStatements — "One upload. Four statements." The core product truth as a
// moving example: a trial-balance extract on the left feeds a statement viewer
// that steps ONCE through the four generated statements (Financial Position →
// Activities → Cash Flows → Net Assets) and then rests on the last; rows
// cascade in and the total counts up on each. Tabs are real buttons (a click
// stops the tour and jumps there). Premium UI P5: everything sits on the ground
// as ruled figures (hairlines, double-ruled totals) — no frosted cards, no
// looping packet beam. Reduced motion: the first statement, statically.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, animate, useInView, useReducedMotion } from 'framer-motion'
import { FileSpreadsheet, ArrowRight, ArrowDown } from 'lucide-react'
import SectionHead from './SectionHead.jsx'

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

// How long the tour holds each statement (ms).
const TOUR_MS = 4200

// TB rows shown in the source extract.
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
  const viewerRef = useRef(null)
  const inView = useInView(viewerRef, { once: true, margin: '-120px' })
  const [tab, setTab] = useState(0)
  // The tour: once the viewer is on screen, step through the four statements
  // ONE time and stop on the last. A click on any tab ends the tour.
  const [touring, setTouring] = useState(true)

  useEffect(() => {
    if (reduce || !inView || !touring) return undefined
    if (tab >= STATEMENTS.length - 1) {
      const end = setTimeout(() => setTouring(false), TOUR_MS)
      return () => clearTimeout(end)
    }
    const t = setTimeout(() => setTab((v) => v + 1), TOUR_MS)
    return () => clearTimeout(t)
  }, [reduce, inView, touring, tab])

  const s = STATEMENTS[tab]
  const pick = (i) => {
    setTouring(false)
    setTab(i)
  }

  return (
    <section aria-labelledby="tbstmt-h2" className="py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          id="tbstmt-h2"
          kicker="From trial balance to board-ready"
          title="One upload. Four statements."
          sub="Drop the trial balance export your bookkeeper already makes. KYRO maps it and generates every statement your auditor and board expect."
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(240px,320px)_auto_minmax(0,1fr)] lg:items-start lg:gap-8">
          {/* ── The source: a trial-balance extract, ruled ── */}
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -20 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            <div className="sec-head">
              <p className="sec-label">The upload</p>
              <span className="sec-rule" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet size={18} strokeWidth={1.75} className="shrink-0 text-ink2" aria-hidden="true" />
              <div className="min-w-0">
                <b className="block text-[15px] font-semibold leading-[22px] text-ink">June-TB.xlsx</b>
                <span className="text-[13px] leading-[18px] text-ink2">412 rows · debits equal credits</span>
              </div>
            </div>
            <div className="dt-wrap mt-4">
              <table className="dt" aria-label="Trial balance extract">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col" className="dt-num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {TB_ROWS.map(([l, v], i) => (
                    <motion.tr
                      key={l}
                      initial={reduce ? false : { opacity: 0 }}
                      whileInView={reduce ? undefined : { opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                    >
                      <td className="whitespace-nowrap">{l}</td>
                      <td className="dt-num">{v}</td>
                    </motion.tr>
                  ))}
                  <tr>
                    <td colSpan={2} className="text-ink2">407 more rows</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* ── The hand-off: a quiet arrow, not a looping beam ── */}
          <div aria-hidden="true" className="hidden pt-[136px] text-ink2 lg:block">
            <ArrowRight size={20} strokeWidth={1.5} />
          </div>
          <div aria-hidden="true" className="-my-4 flex justify-center text-ink2 lg:hidden">
            <ArrowDown size={20} strokeWidth={1.5} />
          </div>

          {/* ── The statements, stepping once ── */}
          <motion.div
            ref={viewerRef}
            initial={reduce ? false : { opacity: 0, x: 20 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            <div role="tablist" aria-label="Generated statements" className="flex flex-nowrap gap-x-3 overflow-x-auto border-b border-hair [scrollbar-width:none] sm:gap-x-5">
              {STATEMENTS.map((st, i) => (
                <button
                  key={st.key}
                  type="button"
                  role="tab"
                  aria-selected={i === tab}
                  onClick={() => pick(i)}
                  className={`relative -mb-px shrink-0 whitespace-nowrap py-2.5 text-[13px] font-semibold outline-none transition-colors focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 ${
                    i === tab ? 'text-ink' : 'text-ink2 hover:text-ink'
                  }`}
                >
                  {st.tab}
                  {i === tab && (
                    <motion.span
                      layoutId="tb-tab-underline"
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#2563EB]"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {/* The tour's progress: a hairline fill under the live tab. */}
                  {i === tab && touring && inView && !reduce && (
                    <motion.span
                      key={`${st.key}-progress`}
                      aria-hidden="true"
                      className="absolute bottom-0 left-0 h-[2px] bg-ink/25"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: TOUR_MS / 1000, ease: 'linear' }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="min-h-[340px] pt-5" role="tabpanel" aria-label={s.title}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.key}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-serif text-[22px] font-medium leading-7 text-ink">{s.title}</h3>
                    <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2">{s.asOf}</span>
                  </div>
                  <div className="mt-3">
                    {s.rows.map((r, i) => (
                      <motion.div
                        key={r.l}
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: reduce ? 0 : 0.08 + i * 0.05, duration: 0.25 }}
                        className={`flex items-baseline justify-between gap-4 border-b border-hair py-2 text-[15px] leading-[22px] ${
                          r.total ? 'font-semibold text-ink' : 'text-ink'
                        }`}
                      >
                        <span className="min-w-0">{r.l}</span>
                        <span className="tabular-nums">{fmt(r.v)}</span>
                      </motion.div>
                    ))}
                    {/* The grand total — double-ruled, counts up. */}
                    <div className="mt-px flex items-baseline justify-between gap-4 border-b-[3px] border-double border-ink/60 py-2.5 text-[15px] font-semibold leading-[22px] text-ink">
                      <span>{s.grand.l}</span>
                      <GrandValue value={s.grand.v} />
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

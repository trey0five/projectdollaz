// ─────────────────────────────────────────────────────────────────────────────
// BentoWall — "the platform, today" (#platform): the LIVE bento under the Orbit,
// where every frosted cell runs a micro-demo on loop. Restored from the
// pre-redesign landing (74caaba) at the owner's request (2026-10-17) — the
// Premium UI P5 screenshot plates (which still showed the old owl and a real
// school's name) are retired — and each micro-demo is redrawn to look like
// TODAY's app: the briefing as a pocket Aurora band with Good / Watch / At risk
// verdict pills, the Scholar answering in Ask KYRO, the nine module tiles in
// their own hues, and QuickBooks reports that sort themselves.
//
// Every claim is a CURRENT platform truth (QBO live sync + diocesan split, the
// SIS connectors that exist — Blackbaud SKY and a OneRoster roster file — the
// NBOA packet, self-measuring strategy, the org console). Figures are sample
// data; no real school is named.
//
// Motion: cells cascade in with a 3-D tilt spring (whileInView, once); the
// loops are CSS keyframes (styles/landing-restore-bento.css) behind
// prefers-reduced-motion, parked while the wall is off screen. Reduced motion
// shows every demo at its finished still. The demos are decorative
// (aria-hidden); each cell's meaning is carried by its heading and text.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useRef, useState } from 'react'
import { animate, motion, useInView, useReducedMotion } from 'framer-motion'
import {
  Sparkles,
  BarChart3,
  RefreshCw,
  Bot,
  ListChecks,
  GraduationCap,
  FileBarChart2,
  Target,
  Building2,
  Library,
  LayoutGrid,
  Check,
  Play,
} from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import VerdictPill from '../../components/ui/aurora/VerdictPill.jsx'
import {
  FinanceArt,
  EnrollmentArt,
  AcademicsArt,
  GovernanceArt,
  AccreditationArt,
  FacilitiesArt,
  AdvancementArt,
  StrategyArt,
  HrArt,
} from '../../components/home/tileArt.jsx'
import '../../styles/aurora.css'
import '../../styles/landing-restore-bento.css'

// The briefing's attention items — module hue + the app's verdict vocabulary.
export const BRIEF_LINES = [
  {
    hue: '#2563EB',
    module: 'Finance',
    verdict: 'risk',
    text: 'Days of cash slipped below 90 — see June actuals',
  },
  {
    hue: '#F59E0B',
    module: 'Accreditation',
    verdict: 'watch',
    text: 'Standard 4 evidence due in 12 days',
  },
  {
    hue: '#0EA5E9',
    module: 'Enrollment',
    verdict: 'good',
    text: 'Re-enrollment at 94% — ahead of last year',
  },
]

// The nine domains, in the orbit's order, with the Home tiles' locked hues and
// art (components/home/tileRegistry.jsx). Statuses are sample data.
export const DOMAIN_TILES = [
  {
    key: 'finance',
    label: 'Finance',
    hue: '#2563EB',
    Art: FinanceArt,
    verdict: 'risk',
  },
  {
    key: 'enrollment',
    label: 'Enrollment',
    hue: '#0EA5E9',
    Art: EnrollmentArt,
    verdict: 'good',
  },
  {
    key: 'academics',
    label: 'Academics',
    hue: '#0D9488',
    Art: AcademicsArt,
    verdict: 'watch',
  },
  {
    key: 'governance',
    label: 'Governance',
    hue: '#7C3AED',
    Art: GovernanceArt,
    verdict: 'watch',
  },
  {
    key: 'accreditation',
    label: 'Accreditation',
    hue: '#F59E0B',
    Art: AccreditationArt,
    verdict: 'watch',
  },
  {
    key: 'facilities',
    label: 'Facilities',
    hue: '#EA580C',
    Art: FacilitiesArt,
    verdict: 'good',
  },
  {
    key: 'advancement',
    label: 'Advancement',
    hue: '#E11D48',
    Art: AdvancementArt,
    verdict: 'good',
  },
  {
    key: 'strategy',
    label: 'Strategy',
    hue: '#4F46E5',
    Art: StrategyArt,
    verdict: 'good',
  },
  { key: 'hr', label: 'HR', hue: '#059669', Art: HrArt, verdict: 'watch' },
]

const VERDICT_DOT = { good: '#10b981', watch: '#f59e0b', risk: '#e11d48' }
const VERDICT_WORD = { good: 'Good', watch: 'Watch', risk: 'At risk' }

// QuickBooks reports, dropped in any order, each finding its slot.
const QBO_REPORTS = ['Profit & Loss', 'Balance Sheet', 'Trial Balance']

// Enrollment by grade (K–8), sample data — vertical columns, the app's rule.
const GRADES = [44, 46, 43, 47, 45, 48, 46, 49, 44]

// The Ask KYRO loop (ms per step): the Scholar listens to the question, thinks
// (typing dots), then talks while its answer shows.
const CHAT_STEPS = [1700, 1700, 3200]

const CELL =
  'relative overflow-hidden rounded-[16px] border border-navy/10 bg-white/75 p-5 shadow-[0_16px_40px_-22px_rgba(16,28,61,0.3)] backdrop-blur-sm'
const HEAD = 'mb-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#7a5e00]'
const NOTE = 'text-[12px] leading-[1.6] text-muted'
const BIG = 'font-sans text-[34px] font-bold leading-none tracking-[-0.01em] text-navy'

function Cell({ i, span, children }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 46, rotateX: 9 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{
        duration: 0.7,
        delay: reduce ? 0 : (i % 3) * 0.09,
        ease: [0.16, 1.2, 0.3, 1],
      }}
      style={{ transformPerspective: 900 }}
      className={`${CELL} ${span}`}
    >
      {children}
    </motion.div>
  )
}

/** A number that counts up once when it scrolls into view (still under reduced motion). */
function CountUp({ to, decimals = 0, suffix = '', className = '' }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (reduce || !inView) return undefined
    const controls = animate(0, to, {
      duration: 1.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setValue,
    })
    return () => controls.stop()
  }, [inView, reduce, to])
  const shown = reduce ? to : value
  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">
        {shown.toFixed(decimals)}
        {suffix}
      </span>
      <span className="sr-only">
        {to.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  )
}

/** Steps through a loop of durations while `on`; returns the current step. */
function useLoop(durations, on) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!on) return undefined
    const t = setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step])
    return () => clearTimeout(t)
  }, [on, step, durations])
  return step
}

const BRIEF_STEPS = [1900, 1900, 2600]

export default function BentoWall() {
  const reduce = useReducedMotion()
  const wallRef = useRef(null)
  const live = useInView(wallRef, { margin: '120px' })
  const run = live && !reduce
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  // Briefing: the attention items arrive one by one, then reset — a living inbox.
  const briefStep = useLoop(BRIEF_STEPS, run)
  const shown = reduce ? BRIEF_LINES.length : briefStep + 1
  // Ask KYRO: listens to the question, thinks, answers.
  const chatStep = useLoop(CHAT_STEPS, run)
  const chat = reduce ? 2 : chatStep

  return (
    <section id="platform" aria-labelledby="bento-h2" className="scroll-mt-20 bg-transparent py-24">
      <div ref={wallRef} className={`bwr-wall mx-auto max-w-5xl px-5 sm:px-8${live ? '' : ' bwr-paused'}`}>
        <p className="font-sans text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">The platform, today</p>
        <h2
          id="bento-h2"
          className="mt-3 font-sans text-[32px] font-semibold leading-tight tracking-[-0.01em] text-navy sm:text-[42px]"
        >
          Everything on board — live.
        </h2>

        <div className="mt-11 grid grid-cols-2 gap-3.5 sm:grid-cols-6">
          {/* 1 · Daily briefing — the Home band, then the items arriving. */}
          <Cell i={0} span="col-span-2 sm:col-span-3">
            <h3 className={HEAD}>
              <Sparkles size={13} aria-hidden="true" /> Daily briefing
            </h3>
            <div className="bwr-band" aria-hidden="true">
              <span className="bwr-blob bwr-blob-1" />
              <span className="bwr-blob bwr-blob-2" />
              <span className="bwr-blob bwr-blob-3" />
              <span className="bwr-grain" />
              <p className="font-sans text-[19px] font-semibold leading-tight">Good morning.</p>
              <p className="mt-1 text-[12px] text-white/80">
                Here are <b className="text-white">3 things</b> to know · <b className="text-[#ff8a7d]">1 at risk</b>.
              </p>
              <span className="bwr-cta mt-2.5">
                <Play size={9} fill="currentColor" /> Open Daily Briefing
              </span>
            </div>
            <ul className="mt-2">
              {BRIEF_LINES.map((l, i) => (
                <li
                  key={l.text}
                  className="flex items-center gap-2.5 border-t border-navy/10 py-2 text-[13px] text-navy/85 transition-all duration-500 first:border-t-0"
                  style={{
                    opacity: i < shown ? 1 : 0,
                    transform: i < shown ? 'none' : 'translateY(8px)',
                  }}
                >
                  <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: l.hue }} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{l.module}: </span>
                    {l.text}
                  </span>
                  <VerdictPill verdict={l.verdict} className="flex-none" />
                </li>
              ))}
            </ul>
            <p className={`mt-1 ${NOTE}`}>Prioritized across all nine domains — shaped to your role.</p>
          </Cell>

          {/* 2 · Analytics + peers — the KPI card, line drawing in. */}
          <Cell i={1} span="col-span-2 sm:col-span-3">
            <h3 className={HEAD}>
              <BarChart3 size={13} aria-hidden="true" /> Analytics · peer benchmarked
            </h3>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-navy/70">Operating margin</p>
                <div className="mt-1 flex items-center gap-2.5">
                  <CountUp to={4} decimals={1} suffix="%" className={BIG} />
                  <VerdictPill verdict="good" />
                </div>
              </div>
              <div aria-hidden="true" className="flex items-center gap-3 text-[10.5px] text-navy/60">
                <span className="flex items-center gap-1.5">
                  <i className="h-[3px] w-4 rounded-full bg-[#2563EB]" /> Your school
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="w-4 border-t-2 border-dashed border-navy/30" /> Peer median
                </span>
              </div>
            </div>
            <div aria-hidden="true" className="relative mt-3">
              <svg className="block w-full" height="118" viewBox="0 0 300 92" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={`bwr-area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M6 58 L56 56 L106 54 L156 52 L206 50 L256 49 L294 47"
                  fill="none"
                  stroke="rgba(16,28,61,.28)"
                  strokeWidth="1.6"
                  strokeDasharray="5 5"
                />
                <path
                  className="bwr-area"
                  d="M6 76 L56 67 L106 70 L156 50 L206 54 L256 30 L294 20 L294 92 L6 92 Z"
                  fill={`url(#bwr-area-${gradId})`}
                />
                <path
                  className="bwr-spark"
                  d="M6 76 L56 67 L106 70 L156 50 L206 54 L256 30 L294 20"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength="100"
                />
              </svg>
              {/* The live end point: an HTML dot (round at any width), lit once the line arrives. */}
              <span
                className="bwr-end absolute h-2.5 w-2.5 rounded-full border-2 border-white bg-[#2563EB]"
                style={{
                  left: '98%',
                  top: '21.7%',
                  transform: 'translate(-50%,-50%)',
                }}
              />
            </div>
            <p className={`mt-2 ${NOTE}`}>Compare with similar schools — size band, county, type and grade span.</p>
          </Cell>

          {/* 3 · QuickBooks — the sync pulse, and reports sorting themselves. */}
          <Cell i={0} span="col-span-1 sm:col-span-2">
            <h3 className={HEAD}>
              <RefreshCw size={13} aria-hidden="true" /> QuickBooks sync
            </h3>
            <div aria-hidden="true" className="mb-3 mt-1 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-4">
              <div className="bwr-pulse relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white shadow-[0_8px_22px_-10px_rgba(37,99,235,0.6)] sm:h-14 sm:w-14">
                <RefreshCw size={20} className="text-[#2563EB]" />
              </div>
              <ul className="w-full space-y-1.5 sm:w-[150px]">
                {QBO_REPORTS.map((r, i) => (
                  <li
                    key={r}
                    className="bwr-sort flex items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-navy/10 bg-white/90 px-2 py-1 text-[10.5px] font-semibold text-navy/80 sm:gap-2 sm:px-2.5 sm:text-[11px]"
                    style={{ '--bwr-delay': `${i * 0.35}s` }}
                  >
                    <span className="bwr-sort-tick grid h-3.5 w-3.5 flex-none place-items-center rounded-full bg-[#10b981] text-white">
                      <Check size={9} strokeWidth={3.5} />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <p className={`text-center ${NOTE}`}>
              Live sync, or drop the reports — QuickBooks reports sort themselves.
              <span className="hidden sm:inline"> One diocesan file splits into per-school books.</span>
            </p>
          </Cell>

          {/* 4 · Ask KYRO — the Scholar listens, thinks, answers. */}
          <Cell i={1} span="col-span-1 sm:col-span-2">
            <h3 className={HEAD}>
              <Bot size={13} aria-hidden="true" /> Ask KYRO
            </h3>
            <div aria-hidden="true" className="mb-2 flex min-h-[112px] flex-col gap-2">
              <p className="bwr-bubble bwr-bubble-user max-w-[92%] sm:max-w-[86%]">What changed in June?</p>
              <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-end">
                <PennyAvatar
                  size={46}
                  state="perched"
                  paused={!run}
                  listening={chat === 0}
                  thinking={chat === 1}
                  speaking={chat === 2}
                  thinkingDots={false}
                  perch={false}
                  className="flex-none"
                />
                {chat === 1 ? (
                  <span className="bwr-bubble bwr-bubble-kyro bwr-type flex gap-1.5 py-2.5">
                    <i className="h-1.5 w-1.5 rounded-full bg-penny" />
                    <i className="h-1.5 w-1.5 rounded-full bg-penny" />
                    <i className="h-1.5 w-1.5 rounded-full bg-penny" />
                  </span>
                ) : (
                  <p className={`bwr-bubble bwr-bubble-kyro${chat === 2 ? '' : ' bwr-hidden'}`}>
                    Days of cash fell to 84. Want a task to chase June invoices?
                  </p>
                )}
              </div>
            </div>
            <p className={NOTE}>
              Voice in, files in — records out. <span className="sm:hidden">Every action reversible.</span>
              <span className="hidden sm:inline">Every action is confirmed first, and reversible.</span>
            </p>
          </Cell>

          {/* 5 · Tasks — a briefing item ticked off. */}
          <Cell i={2} span="col-span-2 sm:col-span-2">
            <h3 className={HEAD}>
              <ListChecks size={13} aria-hidden="true" /> Tasks
            </h3>
            <div className="flex items-center gap-2.5 py-1.5" aria-hidden="true">
              <span className="bwr-tickbox relative h-5 w-5 flex-none rounded-[6px] border-2 border-penny after:absolute after:inset-[3px] after:scale-0 after:rounded-[3px] after:bg-penny after:content-['']" />
              <s className="bwr-strike text-[13.5px] text-navy/85 [text-decoration-color:transparent]">Chase June invoices</s>
            </div>
            <div
              aria-hidden="true"
              className="mb-2.5 mt-1 flex flex-wrap items-center gap-1.5 pl-[30px] text-[10.5px] font-semibold"
            >
              <span className="rounded-full px-2 py-0.5 text-[#1d4ed8]" style={{ background: 'rgba(37,99,235,.1)' }}>
                From the briefing · Finance
              </span>
              <span className="rounded-full bg-navy/[0.06] px-2 py-0.5 text-navy/65">Due Fri</span>
            </div>
            <p className={NOTE}>
              Creates itself from the briefing — every attention item can become work assigned, and recurring tasks come due.
            </p>
          </Cell>

          {/* 6 · Enrollment — the count and the grades, in the module's hue. */}
          <Cell i={0} span="col-span-1 sm:col-span-2">
            <h3 className={HEAD}>
              <GraduationCap size={13} aria-hidden="true" /> Enrollment intelligence
            </h3>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="flex items-baseline gap-1.5">
                <CountUp to={412} className={BIG} />
                <span className="text-[13px] font-semibold text-navy/50">students</span>
              </span>
              <div aria-hidden="true" className="flex h-[34px] items-end gap-[3px]">
                {GRADES.map((g, i) => (
                  <i
                    key={i}
                    className="bwr-col block w-[7px] origin-bottom rounded-t-[2px]"
                    style={{
                      height: `${(g / 49) * 100}%`,
                      background: i === GRADES.length - 1 ? '#0EA5E9' : 'rgba(14,165,233,.45)',
                      boxShadow: i === GRADES.length - 1 ? '0 0 10px rgba(14,165,233,.7)' : 'none',
                      '--bwr-delay': `${i * 0.05}s`,
                    }}
                  />
                ))}
              </div>
            </div>
            <p className={`mt-2.5 ${NOTE}`}>
              SIS rosters via Blackbaud SKY, or a OneRoster roster file — matched to your students by name.
            </p>
          </Cell>

          {/* 7 · Board packet — four statements fanning out. */}
          <Cell i={1} span="col-span-1 sm:col-span-2">
            <h3 className={HEAD}>
              <FileBarChart2 size={13} aria-hidden="true" /> Board reports
            </h3>
            <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-3">
              <b className={`${BIG} whitespace-nowrap`}>
                <CountUp to={4} />
                <span className="text-[16px] font-semibold text-navy/50"> statements</span>
              </b>
              <div aria-hidden="true" className="relative mr-[52px] h-[46px] w-[34px]">
                {['#2563EB', '#0D9488', '#4F46E5', '#F59E0B'].map((hue, i) => (
                  <span
                    key={hue}
                    className="bwr-page"
                    style={{
                      '--hue': hue,
                      '--x': `${i * 14}px`,
                      '--r': `${(i - 1.5) * 7}deg`,
                      zIndex: i,
                    }}
                  />
                ))}
              </div>
            </div>
            <p className={`mt-2.5 ${NOTE}`}>NBOA-style finance-committee packet — one click from a trial balance.</p>
          </Cell>

          {/* 8 · Strategy — a goal filling, graded by the actuals. */}
          <Cell i={2} span="col-span-2 sm:col-span-2">
            <h3 className={HEAD}>
              <Target size={13} aria-hidden="true" /> Strategic planning
            </h3>
            <div aria-hidden="true" className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-navy/75">Days of cash to 120</span>
              <VerdictPill verdict="good" label="Ahead" />
            </div>
            <div aria-hidden="true" className="my-2.5 h-2 w-full overflow-hidden rounded-full bg-navy/10">
              <span
                className="bwr-goal block h-full rounded-full"
                style={{
                  width: '8%',
                  background: 'linear-gradient(90deg,#4F46E5,#8b5cf6)',
                  boxShadow: '0 0 12px rgba(79,70,229,.55)',
                }}
              />
            </div>
            <p className={NOTE}>Metric-bound goals graded by the live actuals — the plan measures itself.</p>
          </Cell>

          {/* 9 · Diocese network — the schools lighting up. */}
          <Cell i={0} span="col-span-2 sm:col-span-4">
            <h3 className={HEAD}>
              <Building2 size={13} aria-hidden="true" /> Diocese &amp; networks
            </h3>
            <div aria-hidden="true" className="flex items-center justify-center gap-3.5 py-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <i key={i} className="bwr-dot h-3.5 w-3.5 rounded-full bg-navy/15" style={{ '--bwr-delay': `${i * 0.3}s` }} />
              ))}
            </div>
            <p className={`text-center ${NOTE}`}>
              Every school synced, compared and consolidated — one console, org-wide statements, member access without swapping
              accounts.
            </p>
          </Cell>

          {/* 10 · Knowledge */}
          <Cell i={1} span="col-span-2 sm:col-span-2">
            <h3 className={HEAD}>
              <Library size={13} aria-hidden="true" /> Knowledge
            </h3>
            <b className={BIG}>
              ∞<span className="text-[16px] font-semibold text-navy/50"> memory</span>
            </b>
            <p className={`mt-1.5 ${NOTE}`}>Drop any document — KYRO files it to the right module, and it stays searchable.</p>
          </Cell>

          {/* 11 · Nine domains — the Home tiles, each in its own hue. */}
          <Cell i={2} span="col-span-2 sm:col-span-6">
            <h3 className={HEAD}>
              <LayoutGrid size={13} aria-hidden="true" /> Nine domains · one home
            </h3>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-9 sm:gap-1.5">
              {DOMAIN_TILES.map((d, i) => (
                <li key={d.key} className="bwr-mod" style={{ '--hue': d.hue, '--bwr-delay': `${i * 0.6}s` }}>
                  <span className="bwr-mod-art" aria-hidden="true">
                    <d.Art />
                  </span>
                  <p className="bwr-mod-label truncate text-[10.5px] font-semibold tracking-[-0.01em] text-navy sm:mt-2">{d.label}</p>
                  <p className="bwr-mod-verdict mt-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-navy/60">
                    <span aria-hidden="true" className="bwr-mod-dot" style={{ background: VERDICT_DOT[d.verdict] }} />
                    {VERDICT_WORD[d.verdict]}
                  </p>
                </li>
              ))}
            </ul>
            <p className={`mt-3 ${NOTE}`}>
              Every module reads from the same numbers and feeds the same briefing — Academics included.
            </p>
          </Cell>
        </div>
      </div>
    </section>
  )
}

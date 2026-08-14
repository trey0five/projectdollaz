// ─────────────────────────────────────────────────────────────────────────────
// AcademicsOverview — the module's front page.
//
// WHAT THIS REPLACES, since the design follows from it: a pale tinted box
// holding one sentence, three identical white cards counting rows, and a single
// grey button labelled "Open the full comparison". Three problems with that.
//
//   1. The verdict — the rank, the standing, the sentence a head of school
//      repeats to a board — was the least emphatic thing on the page.
//   2. The counters told you how much data was STORED. Nobody opens a module to
//      learn it has eight rows; they open it to learn how the school is doing
//      and what to do next.
//   3. One generic door into an analysis with five distinct views meant every
//      reader landed on the same one and hunted from there.
//
// So: a dark verdict panel carrying the finding (the one place on a white page
// where the module states its conclusion), a row of doors that each name a real
// question and carry a live number, and a rail that only speaks when something
// actually needs doing. Counters moved to the bottom, where inventory belongs.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardList,
  Footprints,
  Gauge,
  Sparkles,
  Upload,
} from 'lucide-react'
import { subjectLabelOf } from '@finrep/analytics'

const HUE = '#0D9488'
const INK = '#0A1628'
const EASE = [0.2, 0.8, 0.2, 1]

const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''))
const signed = (v, d = 1) => {
  if (v === null || v === undefined) return '—'
  const r = Number(Number(v).toFixed(d))
  return `${r > 0 ? '+' : ''}${String(r)}`
}
const ordinal = (n) => {
  if (n === null || n === undefined) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** Blend a hex over the ink ground. */
const glow = (hex, a) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// ── The verdict ──────────────────────────────────────────────────────────────

/**
 * THE READ. Rank, standing, and the sentence — on the ink ground the module
 * hero already established, so the page's one conclusion is also its one dark
 * surface. The rank track is the point: "2 of 3" is a fact you decode, whereas
 * a lit segment among three says the same thing before you have read anything.
 */
function VerdictPanel({ dashboard, reduce }) {
  const kpis = dashboard?.kpis
  const ctx = dashboard?.context
  const rank = kpis?.rank?.rank ?? null
  const of = kpis?.rank?.of ?? null
  const avg = kpis?.average ?? {}
  const standing = avg.standing ?? 'unknown'

  const tone =
    standing === 'strong' ? '#34D399' : standing === 'below' ? '#FB7185' : '#93C5FD'
  const verdict =
    standing === 'strong'
      ? 'Ahead of the network'
      : standing === 'below'
        ? 'Below the network'
        : 'In line with the network'

  // The widest gap, straight from the server's own subject comparison.
  const weakest = [...(dashboard?.subjects ?? [])]
    .filter((s) => s.variance !== null && s.variance !== undefined)
    .sort((a, b) => a.variance - b.variance)[0]

  const part = kpis?.participation
  const chips = [
    ctx?.testType
      ? { k: 'Measure', v: `${String(ctx.testType).toUpperCase()} · ${ctx.year}` }
      : null,
    weakest ? { k: 'Widest gap', v: `${subjectLabelOf(weakest.subject)} ${signed(weakest.variance, 0)}` } : null,
    dashboard?.trendDirection && dashboard.trendDirection !== 'unknown'
      ? { k: 'Trend', v: dashboard.trendDirection, accent: dashboard.trendDirection === 'improving' }
      : null,
    part?.rate != null
      ? { k: 'Participation', v: `${Math.round(part.rate * 100)}%${part.comparable ? ' · fair' : ' · read with care'}` }
      : null,
  ].filter(Boolean)

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative isolate overflow-hidden rounded-3xl px-6 py-6 text-white sm:px-7"
      style={{
        background: INK,
        boxShadow: `0 30px 80px -44px ${glow(HUE, 0.7)}, inset 0 1px 0 0 rgba(255,255,255,0.06)`,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            `radial-gradient(66% 120% at 90% -14%, ${glow(HUE, 0.8)} 0%, ${glow(HUE, 0.28)} 36%, transparent 74%)`,
            `radial-gradient(52% 92% at 2% 106%, ${glow('#3B82F6', 0.34)} 0%, transparent 72%)`,
          ].join(', '),
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <p
            className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.22em]"
            style={{ color: glow(HUE, 1) }}
          >
            <Sparkles size={11} /> The read
          </p>

          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-serif text-[40px] font-semibold leading-none tabular-nums">
              {ordinal(rank)}
            </span>
            <span className="text-[15px] text-white/60">of {of ?? '—'} schools</span>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: `${tone}22`, color: tone, boxShadow: `inset 0 0 0 1px ${tone}44` }}
            >
              {verdict}
            </span>
          </div>

          {/* ── The rank track: position, not arithmetic ── */}
          {of ? (
            <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: of }, (_, i) => {
                const mine = i + 1 === rank
                return (
                  <motion.span
                    key={i}
                    initial={reduce ? false : { scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.07 }}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      transformOrigin: 'left',
                      background: mine ? tone : 'rgba(255,255,255,0.14)',
                      boxShadow: mine ? `0 0 16px -1px ${tone}` : 'none',
                    }}
                  />
                )
              })}
            </div>
          ) : null}

          {dashboard?.keyInsight ? (
            <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-white/72">{dashboard.keyInsight}</p>
          ) : null}
        </div>

        {/* The score itself, and how far it sits from everyone else. */}
        <div className="shrink-0 text-right">
          <p className="font-mono text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/45">
            {avg.label ?? 'Average score'}
          </p>
          <p className="font-serif text-[44px] font-semibold leading-none tabular-nums">{fmt(avg.value)}</p>
          <p className="mt-1 text-[12px] text-white/55">
            Network {fmt(avg.peer)}{' '}
            <span style={{ color: tone }} className="font-semibold">
              {signed(avg.variance)}
            </span>
          </p>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <motion.span
              key={c.k}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : 0.24 + i * 0.06 }}
              className="rounded-xl px-3 py-1.5 backdrop-blur-sm"
              style={{
                background: 'rgba(255,255,255,0.07)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.09)',
              }}
            >
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-white/45">
                {c.k}
              </span>
              <span className="ml-2 text-[12.5px] font-semibold capitalize text-white/90">{c.v}</span>
            </motion.span>
          ))}
        </div>
      ) : null}
    </motion.section>
  )
}

// ── The doors ────────────────────────────────────────────────────────────────

/**
 * One card per analysis view, each naming the QUESTION it answers and carrying a
 * live number from the payload. A door labelled with its own finding tells you
 * whether it is worth opening; "Open the full comparison" never could.
 */
function ViewCards({ dashboard, onOpen, reduce }) {
  const kpis = dashboard?.kpis
  const cohorts = dashboard?.availableCohorts ?? []
  const schools = dashboard?.schools ?? []
  const yoy = kpis?.yoy

  const cards = [
    {
      key: 'standing',
      Icon: Gauge,
      title: 'Where this school stands',
      body: 'Every school ranked, the gap by subject, and a grade-by-grade heat map.',
      stat: kpis?.rank?.rank ? `Rank ${kpis.rank.rank} of ${kpis.rank.of}` : null,
    },
    {
      key: 'classroom',
      Icon: BarChart3,
      title: 'Inside the classroom',
      body: 'Where students actually sit, and who the average is hiding.',
      stat: kpis?.participation?.tested ? `${kpis.participation.tested} scored` : null,
    },
    {
      key: 'time',
      Icon: Activity,
      title: 'Are we moving?',
      body: 'The multi-year trend, and growth measured against achievement.',
      stat: yoy != null ? `${signed(yoy, 0)} year over year` : null,
      accent: yoy != null ? yoy >= 0 : null,
    },
    {
      key: 'cohorts',
      Icon: Footprints,
      title: 'Follow the same children',
      body: 'One group of students tracked forward, rather than this year’s grade against last year’s.',
      stat: cohorts.length ? `${cohorts.length} cohort${cohorts.length === 1 ? '' : 's'} available` : 'Needs two years',
      muted: cohorts.length === 0,
    },
    {
      key: 'network',
      Icon: ClipboardList,
      title: 'Board-ready',
      body: 'Every school, both years, against the national and network lines — and the table behind it.',
      stat: schools.length ? `${schools.length} schools` : null,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c, i) => (
        <motion.button
          key={c.key}
          type="button"
          onClick={() => onOpen(c.key)}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : 0.05 + i * 0.05 }}
          whileHover={reduce ? undefined : { y: -3 }}
          className="group relative isolate overflow-hidden rounded-2xl border border-navy/10 bg-white p-4 text-left transition-shadow hover:shadow-[0_22px_50px_-30px_rgba(16,28,61,0.5)]"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ background: `radial-gradient(120% 100% at 100% 0%, ${HUE}14 0%, transparent 62%)` }}
          />
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 h-full w-[3px]"
            style={{ background: `linear-gradient(180deg, ${HUE} 0%, ${HUE}00 100%)` }}
          />

          <span className="flex items-start justify-between gap-2">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{ background: `${HUE}1A`, color: HUE, boxShadow: `inset 0 0 0 1px ${HUE}2E` }}
            >
              <c.Icon size={16} strokeWidth={2.2} />
            </span>
            <ArrowRight
              size={15}
              className="mt-1 text-muted transition-transform group-hover:translate-x-0.5"
              style={{ color: HUE }}
            />
          </span>

          <p className="mt-3 font-serif text-[16.5px] font-semibold leading-tight text-navy">{c.title}</p>
          <p className="mt-1 text-[12px] leading-snug text-muted">{c.body}</p>

          {c.stat ? (
            <p
              className="mt-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{
                color: c.muted
                  ? '#94A3B8'
                  : c.accent === undefined || c.accent === null
                    ? HUE
                    : c.accent
                      ? '#059669'
                      : '#E11D48',
              }}
            >
              {c.stat}
            </p>
          ) : null}
        </motion.button>
      ))}
    </div>
  )
}

// ── What still needs doing ───────────────────────────────────────────────────

/**
 * Derived, and SILENT when there is nothing to say. A permanent checklist that
 * always shows three items teaches the reader to stop looking at it.
 */
function NeedsAttention({ dashboard, status, onGoAdd, reduce }) {
  const years = status?.assessments?.years ?? []
  const part = dashboard?.kpis?.participation
  const items = [
    years.length < 2
      ? {
          k: 'One year on file',
          v: 'Load a second year to unlock the trend, the movement view and cohort tracking.',
          cta: 'Add a year',
        }
      : null,
    part && part.comparable === false
      ? {
          k: 'Participation is out of line with peers',
          v: `${Math.round((part.rate ?? 0) * 100)}% of eligible students sat the test, against ${Math.round((part.peerRate ?? 0) * 100)}% elsewhere — comparisons on this page should be read with that in mind.`,
        }
      : null,
    (status?.gradebook?.total ?? 0) === 0
      ? { k: 'No gradebook data', v: 'Connect the SIS or upload a grade export to see marks beside test scores.', cta: 'Connect' }
      : null,
    (status?.lessonPlans?.total ?? 0) === 0
      ? { k: 'No lesson plans yet', v: 'The classroom register is empty.', cta: 'Add one' }
      : null,
  ].filter(Boolean)

  if (items.length === 0) return null

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : 0.1 }}
      className="overflow-hidden rounded-2xl border border-navy/10 bg-white"
    >
      <header className="border-b border-navy/[0.07] px-5 py-3.5" style={{ background: 'rgba(245,158,11,0.06)' }}>
        <span className="inline-flex items-center rounded-full bg-amber-500/12 px-2 py-[3px] font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-amber-700">
          To finish the picture
        </span>
      </header>
      <ul className="divide-y divide-navy/[0.06]">
        {items.map((it) => (
          <li key={it.k} className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-navy">{it.k}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted">{it.v}</span>
            </span>
            {it.cta ? (
              <button
                type="button"
                onClick={onGoAdd}
                className="shrink-0 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold text-navy transition-colors hover:bg-navy/[0.03]"
                style={{ borderColor: `${HUE}55` }}
              >
                {it.cta}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </motion.section>
  )
}

// ── Inventory ────────────────────────────────────────────────────────────────

/** What is loaded. Real, but the least urgent thing here — so it sits last. */
function Inventory({ status, reduce }) {
  const cards = [
    {
      k: 'Assessment results',
      v: status?.assessments?.rows ?? 0,
      s: `${status?.assessments?.years?.length ?? 0} year(s) · ${status?.assessments?.tested ?? 0} scored`,
    },
    {
      k: 'Gradebook',
      v: status?.gradebook?.total ?? 0,
      s: `${status?.gradebook?.courses ?? 0} course(s)`,
    },
    {
      k: 'Lesson plans',
      v: status?.lessonPlans?.total ?? 0,
      s: `${status?.lessonPlans?.byStatus?.draft ?? 0} still in draft`,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c, i) => (
        <motion.div
          key={c.k}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : i * 0.05 }}
          className="rounded-xl border border-navy/10 bg-white px-4 py-3"
        >
          <p className="font-mono text-[8.5px] font-bold uppercase tracking-[0.16em] text-muted">{c.k}</p>
          <p className="mt-0.5 font-serif text-[21px] font-semibold tabular-nums text-navy">{c.v}</p>
          <p className="text-[11px] text-muted">{c.s}</p>
        </motion.div>
      ))}
    </div>
  )
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function AcademicsOverview({
  dashboard,
  status,
  loading,
  isMultiSchool,
  onOpenView,
  onGoAdd,
  networkTo = '/academics/network',
}) {
  const reduce = useReducedMotion()

  if (loading) return <p className="text-[13.5px] text-muted">Loading…</p>

  if (!dashboard || dashboard.empty) {
    return (
      <div className="rounded-2xl border border-dashed border-navy/20 bg-white p-10 text-center">
        <Upload size={22} className="mx-auto mb-2" style={{ color: HUE }} />
        <p className="font-serif text-[19px] font-semibold text-navy">Start with a scores file</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-muted">
          A diocesan summary, a publisher export, or a student-level file — the parser handles the title rows and odd
          column names that come with them.
        </p>
        <button
          type="button"
          onClick={onGoAdd}
          className="mt-4 rounded-xl px-4 py-2 text-[12.5px] font-bold uppercase tracking-[0.12em] text-white"
          style={{ background: HUE }}
        >
          Add academic data
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <VerdictPanel dashboard={dashboard} reduce={reduce} />

      <div>
        <p className="mb-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: HUE }}>
          Open the analysis
        </p>
        <ViewCards dashboard={dashboard} onOpen={onOpenView} reduce={reduce} />
      </div>

      <NeedsAttention dashboard={dashboard} status={status} onGoAdd={onGoAdd} reduce={reduce} />

      {isMultiSchool ? (
        <motion.a
          href={networkTo}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : 0.15 }}
          className="group flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 transition-shadow hover:shadow-[0_22px_50px_-30px_rgba(16,28,61,0.5)]"
          style={{ borderColor: `${HUE}44`, background: `${HUE}0A` }}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: `${HUE}1A`, color: HUE, boxShadow: `inset 0 0 0 1px ${HUE}2E` }}
            >
              <Building2 size={17} strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-[16.5px] font-semibold text-navy">
                The whole network, school by school
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                The diocesan view — every school on one screen, without switching between them.
              </span>
            </span>
          </span>
          <ArrowRight size={16} style={{ color: HUE }} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
        </motion.a>
      ) : null}

      <Inventory status={status} reduce={reduce} />
    </div>
  )
}

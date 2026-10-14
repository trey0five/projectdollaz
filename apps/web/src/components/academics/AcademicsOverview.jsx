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
// PREMIUM UI P4: the dark "The read" stage and its glass chips are gone. The
// read is a `Section` lead — the verdict sentence in Garamond, the rank track
// in ink with one hue segment, the key insight as prose — over a `StatStrip`
// of the four chips as Stats. The doors are ruled rows under a Section label
// (a title, a question, a live figure as a Pill, an arrow), not icon tiles.
// "To finish the picture" is a `Panel tone="attention"` because it carries
// actions. Inventory is a StatStrip at the foot, where inventory belongs.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Upload } from 'lucide-react'
import { subjectLabelOf } from '@finrep/analytics'
import { Section, StatStrip, Stat, Pill, Panel, Button } from '../ui/surface/index.js'

const HUE = '#0D9488'
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

// ── The verdict ──────────────────────────────────────────────────────────────

/**
 * THE READ. Rank, standing, and the sentence — as the page's lead paragraph on
 * the ground, with a StatStrip under it. The rank track is the point: "2 of 3"
 * is a fact you decode, whereas a lit segment among three says the same thing
 * before you have read anything. The track is ink; the school's segment is the
 * module hue (identity, not status). Status lives in the Stat marks.
 */
function VerdictSection({ dashboard, reduce }) {
  const kpis = dashboard?.kpis
  const ctx = dashboard?.context
  const rank = kpis?.rank?.rank ?? null
  const of = kpis?.rank?.of ?? null
  const avg = kpis?.average ?? {}
  const standing = avg.standing ?? 'unknown'

  const tone = standing === 'strong' ? 'good' : standing === 'below' ? 'risk' : 'neutral'
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
  const trend = dashboard?.trendDirection && dashboard.trendDirection !== 'unknown' ? dashboard.trendDirection : null

  return (
    <Section
      as={motion.section}
      label="The read"
      aside={ctx?.testType ? `${String(ctx.testType).toUpperCase()} · ${ctx.year}` : null}
      className="!mt-4"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <p className="sec-title !mb-2">
        {rank ? `${ordinal(rank)} of ${of ?? '—'} schools` : 'Not yet ranked'} — {verdict.toLowerCase()}.
      </p>

      {/* ── The rank track: position, not arithmetic ── */}
      {of ? (
        <div className="mb-3 flex max-w-md items-center gap-1" aria-hidden="true">
          {Array.from({ length: of }, (_, i) => {
            const mine = i + 1 === rank
            return (
              <motion.span
                key={i}
                initial={reduce ? false : { scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : 0.1 + i * 0.06 }}
                className="h-[2px] flex-1"
                style={{ transformOrigin: 'left', background: mine ? HUE : 'rgb(16 28 61 / 0.14)' }}
              />
            )
          })}
        </div>
      ) : null}

      {dashboard?.keyInsight ? <p className="max-w-[65ch] text-body leading-relaxed text-ink">{dashboard.keyInsight}</p> : null}

      <StatStrip cols={4} className="stats-wrap mt-4 grid-cols-2 lg:grid-cols-4">
        <Stat
          label={avg.label ?? 'Average score'}
          value={fmt(avg.value)}
          status={tone === 'neutral' ? null : tone}
          delta={avg.variance != null ? { text: `${signed(avg.variance)} vs network ${fmt(avg.peer)}`, tone } : null}
          note={avg.variance == null ? `Network ${fmt(avg.peer)}` : null}
        />
        <Stat
          label="Widest gap"
          value={weakest ? signed(weakest.variance, 0) : '—'}
          status={weakest ? (weakest.variance < 0 ? 'risk' : 'good') : null}
          note={weakest ? subjectLabelOf(weakest.subject) : 'no subject comparison yet'}
        />
        <Stat
          label="Trend"
          value={trend ? trend.charAt(0).toUpperCase() + trend.slice(1) : '—'}
          status={trend === 'improving' ? 'good' : trend === 'declining' ? 'risk' : null}
          className="stat-text"
        />
        <Stat
          label="Participation"
          value={part?.rate != null ? `${Math.round(part.rate * 100)}%` : '—'}
          status={part?.rate != null ? (part.comparable ? 'good' : 'watch') : null}
          note={part?.rate != null ? (part.comparable ? 'comparison is fair' : 'read with care') : null}
        />
      </StatStrip>
    </Section>
  )
}

// ── The doors ────────────────────────────────────────────────────────────────

/**
 * One ruled row per analysis view, each naming the QUESTION it answers and
 * carrying a live figure from the payload. A door labelled with its own finding
 * tells you whether it is worth opening; "Open the full comparison" never could.
 */
function ViewRows({ dashboard, onOpen }) {
  const kpis = dashboard?.kpis
  const cohorts = dashboard?.availableCohorts ?? []
  const schools = dashboard?.schools ?? []
  const yoy = kpis?.yoy

  const rows = [
    {
      key: 'standing',
      title: 'Where this school stands',
      body: 'Every school ranked, the gap by subject, and a grade-by-grade heat map.',
      stat: kpis?.rank?.rank ? `Rank ${kpis.rank.rank} of ${kpis.rank.of}` : null,
    },
    {
      key: 'classroom',
      title: 'Inside the classroom',
      body: 'Where students actually sit, and who the average is hiding.',
      stat: kpis?.participation?.tested ? `${kpis.participation.tested} scored` : null,
    },
    {
      key: 'time',
      title: 'Are we moving?',
      body: 'The multi-year trend, and growth measured against achievement.',
      stat: yoy != null ? `${signed(yoy, 0)} year over year` : null,
      tone: yoy != null ? (yoy >= 0 ? 'good' : 'risk') : null,
    },
    {
      key: 'cohorts',
      title: 'Follow the same children',
      body: 'One group of students tracked forward, rather than this year’s grade against last year’s.',
      stat: cohorts.length ? `${cohorts.length} cohort${cohorts.length === 1 ? '' : 's'} available` : 'Needs two years',
      muted: cohorts.length === 0,
    },
    {
      key: 'network',
      title: 'Board-ready',
      body: 'Every school, both years, against the national and network lines — and the table behind it.',
      stat: schools.length ? `${schools.length} schools` : null,
    },
  ]

  return (
    <ul className="divide-y divide-hair border-y border-hair">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onOpen(r.key)}
            className="group flex w-full items-center gap-4 py-3 text-left outline-none transition-colors hover:bg-ink/[.03] focus-visible:ring-2 focus-visible:ring-navy-soft/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">{r.title}</span>
              <span className="mt-0.5 block text-small leading-snug text-ink2">{r.body}</span>
            </span>
            {r.stat ? (
              <Pill variant={r.tone ? 'status' : 'default'} tone={r.tone ?? undefined} className={r.muted ? 'text-ink2' : ''}>
                {r.stat}
              </Pill>
            ) : null}
            <ArrowRight size={15} className="shrink-0 text-ink2 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── What still needs doing ───────────────────────────────────────────────────

/**
 * Derived, and SILENT when there is nothing to say. A permanent checklist that
 * always shows three items teaches the reader to stop looking at it. A Panel,
 * because every row can carry an action.
 */
function NeedsAttention({ dashboard, status, onGoAdd }) {
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
    <Section label="To finish the picture">
      <Panel tone="attention" className="panel-watch" padded={false}>
        <ul className="divide-y divide-hair">
          {items.map((it) => (
            <li key={it.k} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="min-w-0">
                <span className="block text-small font-semibold text-ink">{it.k}</span>
                <span className="mt-0.5 block text-small leading-snug text-ink2">{it.v}</span>
              </span>
              {it.cta ? (
                <Button variant="secondary" size="sm" onClick={onGoAdd} className="shrink-0">
                  {it.cta}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </Section>
  )
}

// ── Inventory ────────────────────────────────────────────────────────────────

/** What is loaded. Real, but the least urgent thing here — so it sits last. */
function Inventory({ status }) {
  return (
    <Section label="On file">
      <StatStrip cols={3} className="stats-wrap !grid-cols-1 sm:!grid-cols-3">
        <Stat
          label="Assessment results"
          value={status?.assessments?.rows ?? 0}
          note={`${status?.assessments?.years?.length ?? 0} year(s) · ${status?.assessments?.tested ?? 0} scored`}
        />
        <Stat label="Gradebook" value={status?.gradebook?.total ?? 0} note={`${status?.gradebook?.courses ?? 0} course(s)`} />
        <Stat
          label="Lesson plans"
          value={status?.lessonPlans?.total ?? 0}
          note={`${status?.lessonPlans?.byStatus?.draft ?? 0} still in draft`}
        />
      </StatStrip>
    </Section>
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

  if (loading) return <p className="text-small text-ink2">Loading…</p>

  if (!dashboard || dashboard.empty) {
    return (
      <Section label="Getting started" className="!mt-4">
        <div className="border-b border-hair py-8 text-center">
          <Upload size={20} className="mx-auto mb-2 text-ink2" aria-hidden="true" />
          <p className="font-serif text-title font-medium text-ink">Start with a scores file</p>
          <p className="mx-auto mt-1.5 max-w-md text-small text-ink2">
            A diocesan summary, a publisher export, or a student-level file — the parser handles the title rows and odd
            column names that come with them.
          </p>
          <Button variant="primary" onClick={onGoAdd} className="mt-4">
            Add academic data
          </Button>
        </div>
      </Section>
    )
  }

  return (
    <div>
      <VerdictSection dashboard={dashboard} reduce={reduce} />

      <Section label="Open the analysis">
        <ViewRows dashboard={dashboard} onOpen={onOpenView} />
        {isMultiSchool ? (
          <a href={networkTo} className="sec-more">
            The whole network, school by school — the diocesan view, every school on one screen{' '}
            <ArrowRight size={13} aria-hidden="true" />
          </a>
        ) : null}
      </Section>

      <NeedsAttention dashboard={dashboard} status={status} onGoAdd={onGoAdd} />

      <Inventory status={status} />
    </div>
  )
}

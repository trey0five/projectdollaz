// ─────────────────────────────────────────────────────────────────────────────
// AcademicsOverview — the module's front page, on the Aurora system
// (owner-approved 2026-10-15).
//
// The design still answers what the original replaced: the verdict (rank and
// standing) is the loudest thing on the page, counters of stored rows sit
// last, and every analysis view gets its own door labelled with a live figure.
//
//   AcademicsBand   the band: "Academics", one plain sentence from the rank and
//                   standing, Add data / Records / Analytics, and up to four
//                   glass figures (average · rank · widest gap · trend), any
//                   extra as chips. Shared by the Overview and Analytics tabs.
//   Overview body   "Needs a look" (only when something is missing) → "How you
//                   compare" (the rank track + the gap to the network by subject
//                   as vertical columns, in a white card) → "Open the analysis"
//                   (one tile per view) → "On file" → How this works.
//
// Every figure is the server's: rank, standing, variance, participation and the
// trend direction arrive in the dashboard payload. Verdict pills come only from
// those server reads (standing, trend direction, the sign of a gap, whether
// participation is comparable) — never from a target invented here.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Footprints,
  Gauge,
  GraduationCap,
  LineChart,
  Network,
  Target,
  Trophy,
  Upload,
  Users2,
  Wrench,
} from 'lucide-react'
import { subjectLabelOf } from '@finrep/analytics'
import { moduleHue } from '../module/moduleAnatomy.js'
import { AddDataCta, RecordsCta } from '../module/ModuleCtas.jsx'
import {
  AuroraHero,
  AuroraButton,
  AuroraSection,
  AuroraCard,
  AuroraColumns,
  AuroraTile,
  AuroraTileGrid,
  AuroraEmpty,
  AuroraLightButton,
  HowThisWorks,
  VerdictEm,
} from '../ui/aurora/index.js'
import { DIVERGING_INK } from '../analytics/charts/heatScales.js'
import '../../styles/pending/aurora-enroll-acad.css'

const HUE = moduleHue('academics')
const EASE = [0.2, 0.8, 0.2, 1]

const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''))
const signed = (v, d = 1) => {
  if (v === null || v === undefined) return '—'
  const r = Number(Number(v).toFixed(d))
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${String(Math.abs(r))}`
}
const ordinal = (n) => {
  if (n === null || n === undefined) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** Standing (server) → verdict. 'average'/'unknown' carry no judgement. */
const STANDING_VERDICT = { strong: 'good', below: 'risk' }

/**
 * The page's own "real difference" line: the charts say a gap under 5
 * percentile points is not a difference, and the heat map treats ±5 as level.
 * The band only NAMES a subject as the widest gap once it clears that line.
 */
const REAL_GAP = 5

/** The widest gap, straight from the server's own subject comparison. */
function weakestSubject(dashboard) {
  return [...(dashboard?.subjects ?? [])]
    .filter((s) => s.variance !== null && s.variance !== undefined)
    .sort((a, b) => a.variance - b.variance)[0]
}

// ── The band ─────────────────────────────────────────────────────────────────

/**
 * The Academics band. `loading` prints em-dashes rather than zeros; an empty
 * school gets the next step as its sentence.
 */
export function AcademicsBand({ schoolName, level, status, dashboard, loading, tab = 'overview', networkTo = null, tools = null }) {
  const kpis = dashboard?.kpis
  const ctx = dashboard?.context
  const empty = !dashboard || dashboard.empty
  const rank = kpis?.rank?.rank ?? null
  const of = kpis?.rank?.of ?? null
  const avg = kpis?.average ?? {}
  const standing = avg.standing ?? 'unknown'
  const weakest = weakestSubject(dashboard)
  const trend = dashboard?.trendDirection && dashboard.trendDirection !== 'unknown' ? dashboard.trendDirection : null
  const part = kpis?.participation

  const context =
    [
      level && level !== 'unknown' ? level : null,
      ctx?.testType ? `${String(ctx.testType).toUpperCase()} ${ctx.year}` : null,
      ctx ? (ctx.scoreType === 'percentile' ? 'national percentile' : 'scale score') : null,
    ]
      .filter(Boolean)
      .join(' · ') || null
  const eyebrow = tab === 'analytics' ? ['Analytics', context].filter(Boolean).join(' · ') : context

  const standingWords =
    standing === 'strong' ? 'ahead of the network' : standing === 'below' ? 'below the network' : 'in line with the network'
  const verdict = loading ? (
    'Loading the comparison…'
  ) : empty ? (
    'Add a scores file and this school appears beside every other school in the network.'
  ) : (
    <>
      {rank ? (
        <>
          <VerdictEm>
            {ordinal(rank)} of {of ?? '—'} schools
          </VerdictEm>{' '}
          —{' '}
        </>
      ) : (
        'Not yet ranked — '
      )}
      <VerdictEm tone={STANDING_VERDICT[standing] ?? undefined}>{standingWords}</VerdictEm>.
      {weakest && weakest.variance <= -REAL_GAP ? (
        <>
          {' '}
          The widest gap is{' '}
          <VerdictEm tone={STANDING_VERDICT[weakest.standing] === 'risk' ? 'risk' : undefined}>
            {subjectLabelOf(weakest.subject)}
          </VerdictEm>
          .
        </>
      ) : null}
    </>
  )

  // An empty school gets the sentence and the buttons — no row of blank cards
  // repeating "nothing yet" four times.
  const kpiItems = empty && !loading
    ? []
    : loading
      ? [
          { key: 'avg', icon: Gauge, label: 'Average score', value: null, caption: loading ? 'Loading…' : 'No scores yet' },
          { key: 'rank', icon: Trophy, label: 'Rank', value: null, caption: loading ? 'Loading…' : 'Not ranked yet' },
          {
            key: 'years',
            icon: CalendarDays,
            label: 'Years on file',
            value: loading ? null : String(status?.assessments?.years?.length ?? 0),
          },
          {
            key: 'plans',
            icon: ClipboardList,
            label: 'Lesson plans',
            value: loading ? null : String(status?.lessonPlans?.total ?? 0),
          },
        ]
      : [
          {
            key: 'avg',
            icon: Gauge,
            label: avg.label ?? 'Average score',
            value: fmt(avg.value),
            // avg.peer EXCLUDES this school — "Network" read as a figure that
            // contains it, beside a Network view whose line names the exclusion.
            caption: avg.peer != null ? `Peer avg ${fmt(avg.peer)}${avg.variance != null ? ` · ${signed(avg.variance)}` : ''}` : null,
            verdict: STANDING_VERDICT[standing] ?? null,
            verdictLabel: standing === 'strong' ? 'Ahead' : standing === 'below' ? 'Behind' : null,
          },
          {
            key: 'rank',
            icon: Trophy,
            label: 'Rank',
            value: rank ? `${rank}` : null,
            unit: rank && of ? `of ${of}` : null,
            caption: ctx?.peerCount != null ? `${ctx.peerCount} peer school${ctx.peerCount === 1 ? '' : 's'}` : null,
          },
          {
            key: 'gap',
            icon: Target,
            // The subject furthest behind — or, when every subject is ahead, the
            // smallest lead (never call a lead a "gap").
            label: weakest && weakest.variance >= 0 ? 'Smallest lead' : 'Widest gap',
            // At the precision the average beside it is printed at (fmt → one
            // decimal): "+1" for a +0.58 lead overstated it by nearly double.
            value: weakest ? signed(weakest.variance) : null,
            caption: weakest ? subjectLabelOf(weakest.subject) : 'No subject comparison yet',
            // The SIGN of a gap is a word, not a judgement: the pill stays
            // neutral unless the server itself rated that subject's standing.
            verdict: weakest ? (STANDING_VERDICT[weakest.standing] ?? null) : null,
            // A gap that PRINTS as 0 is level — no "Ahead"/"Behind" beside it.
            verdictLabel: weakest && signed(weakest.variance) !== '0' ? (weakest.variance < 0 ? 'Behind' : 'Ahead') : null,
          },
          {
            key: 'trend',
            icon: LineChart,
            label: 'Trend',
            value: trend ? trend.charAt(0).toUpperCase() + trend.slice(1) : null,
            textValue: true,
            caption: kpis?.yoy != null ? `${signed(kpis.yoy)} on last year` : null,
            verdict: trend === 'improving' ? 'good' : trend === 'declining' ? 'risk' : null,
          },
          {
            key: 'part',
            label: 'Participation',
            value: part?.rate != null ? `${Math.round(part.rate * 100)}%` : null,
            verdict: part?.rate != null ? (part.comparable ? 'good' : 'watch') : null,
            verdictLabel: part?.rate != null ? (part.comparable ? 'Comparable' : 'Watch') : null,
          },
        ]

  return (
    <AuroraHero
      moduleKey="academics"
      school={schoolName ?? null}
      eyebrow={eyebrow || null}
      title="Academics"
      verdict={verdict}
      actions={
        <>
          <AddDataCta />
          <RecordsCta module="academics" />
          {tab === 'analytics' ? (
            <AuroraButton to="/academics" icon={<BookOpen size={18} aria-hidden="true" />}>
              Overview
            </AuroraButton>
          ) : (
            <AuroraButton to="?tab=analytics" icon={<BarChart3 size={18} aria-hidden="true" />}>
              Analytics
            </AuroraButton>
          )}
          {/* A door, not a job: a small text link after the buttons rather
              than a fourth equal-weight outline button on a line of its own. */}
          {networkTo ? (
            <Link to={networkTo} className="enr-band-link">
              <Network size={15} aria-hidden="true" />
              Whole network
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : null}
        </>
      }
      tools={tools}
      kpis={kpiItems}
    />
  )
}

// ── How you compare ──────────────────────────────────────────────────────────

/**
 * The rank track (position, not arithmetic — a lit segment among N says "3rd
 * of 12" before you read anything) and the gap to the network by subject as
 * VERTICAL columns (owner rule), coloured by the sign of the server's own gap.
 */
function CompareSection({ dashboard, reduce, first = false }) {
  const kpis = dashboard?.kpis
  const rank = kpis?.rank?.rank ?? null
  const of = kpis?.rank?.of ?? null
  const subjects = (dashboard?.subjects ?? []).filter((s) => s.variance !== null && s.variance !== undefined).slice(0, 6)

  return (
    <AuroraSection first={first} icon={Gauge} title="How you compare" subtitle="Against the other schools in the network">
      <AuroraCard
        title={rank ? `${ordinal(rank)} of ${of ?? '—'} schools` : 'Not yet ranked'}
        subtitle="Your place in the network"
      >
        {of ? (
          <div className="mb-4 mt-1 flex max-w-xl items-center gap-1" aria-hidden="true">
            {Array.from({ length: of }, (_, i) => {
              const mine = i + 1 === rank
              return (
                <motion.span
                  key={i}
                  initial={reduce ? false : { scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : 0.1 + i * 0.06 }}
                  className={mine ? 'h-[8px] flex-1 rounded-full' : 'h-[4px] flex-1 rounded-full'}
                  style={{ transformOrigin: 'left', background: mine ? HUE : 'rgb(16 28 61 / 0.14)' }}
                />
              )
            })}
          </div>
        ) : null}
        {dashboard?.keyInsight ? <p className="max-w-[70ch] text-small leading-relaxed text-ink2">{dashboard.keyInsight}</p> : null}
        {subjects.length ? (
          <>
            <p className="mt-5 text-small font-semibold text-ink">Gap to the network, by subject</p>
            <AuroraColumns
              ariaLabel="Gap to the network average, by subject"
              tick={(t) => signed(t, 0)}
              bars={subjects.map((s) => ({
                key: s.subject,
                label: subjectLabelOf(s.subject),
                value: Number(s.variance),
                // Same rounding and the same blue↔red pair as the Analytics
                // tab's gap chart and the heat map — one subject, one colour.
                display: Math.abs(s.variance) < 0.5 ? '0' : signed(s.variance, 0),
                full: `${subjectLabelOf(s.subject)}: ${signed(s.variance, 1)} against the network`,
                color:
                  Math.abs(s.variance) < 0.5 ? DIVERGING_INK.mid : s.variance < 0 ? DIVERGING_INK.neg : DIVERGING_INK.pos,
              }))}
            />
          </>
        ) : null}
      </AuroraCard>
    </AuroraSection>
  )
}

// ── The doors ────────────────────────────────────────────────────────────────

/**
 * One tile per analysis view, each naming the QUESTION it answers and carrying
 * a live figure from the payload — a door labelled with its own finding tells
 * you whether it is worth opening.
 */
function ViewTiles({ dashboard, onOpen, networkTo }) {
  const kpis = dashboard?.kpis
  const cohorts = dashboard?.availableCohorts ?? []
  const schools = dashboard?.schools ?? []
  const yoy = kpis?.yoy

  const rows = [
    {
      key: 'standing',
      icon: Gauge,
      title: 'Where this school stands',
      body: 'Every school ranked, by subject and grade.',
      stat: kpis?.rank?.rank ? `Rank ${kpis.rank.rank} of ${kpis.rank.of}` : null,
    },
    {
      key: 'classroom',
      icon: Users2,
      hue: 'var(--au-h2)',
      title: 'Inside the classroom',
      body: 'Where students sit, and who the average hides.',
      stat: kpis?.participation?.tested ? `${kpis.participation.tested} scored` : null,
    },
    {
      key: 'time',
      icon: LineChart,
      hue: 'var(--au-h3)',
      title: 'Are we moving?',
      body: 'The trend, and growth against achievement.',
      // The same precision as the band's "+0.7 on last year" — never "+1" here.
      stat: yoy != null ? `${signed(yoy)} on last year` : null,
      tone: yoy != null && signed(yoy) !== '0' ? (yoy > 0 ? 'good' : 'risk') : null,
    },
    {
      key: 'cohorts',
      icon: Footprints,
      title: 'Follow the same children',
      body: 'One group of students, tracked forward.',
      stat: cohorts.length ? `${cohorts.length} cohort${cohorts.length === 1 ? '' : 's'}` : 'Needs two years',
    },
    {
      key: 'network',
      icon: Activity,
      hue: 'var(--au-h2)',
      title: 'Board-ready',
      body: 'Every school, both years, and the table behind it.',
      stat: schools.length ? `${schools.length} schools` : null,
    },
  ]

  return (
    <AuroraSection icon={BarChart3} hue="var(--au-h2)" title="Open the analysis" subtitle="Pick the question you came with">
      <AuroraTileGrid cols={3}>
        {rows.map((r) => (
          <AuroraTile
            key={r.key}
            icon={r.icon}
            hue={r.hue}
            title={r.title}
            desc={r.body}
            verdict={r.tone ?? null}
            verdictLabel={r.stat}
            onClick={() => onOpen(r.key)}
          />
        ))}
        {networkTo ? (
          <AuroraTile
            to={networkTo}
            icon={Network}
            hue="var(--au-h3)"
            title="The whole network"
            desc="Every school on one screen."
          />
        ) : null}
      </AuroraTileGrid>
    </AuroraSection>
  )
}

// ── What still needs doing ───────────────────────────────────────────────────

/**
 * Derived, and SILENT when there is nothing to say. A permanent checklist that
 * always shows three items teaches the reader to stop looking at it.
 */
function needsItems(dashboard, status) {
  const years = status?.assessments?.years ?? []
  const part = dashboard?.kpis?.participation
  return [
    years.length < 2
      ? { k: 'One year on file', v: 'Load a second year to unlock the trend and cohorts.', cta: 'Add a year', icon: CalendarDays }
      : null,
    part && part.comparable === false
      ? {
          k: 'Participation is out of line with peers',
          v: `${Math.round((part.rate ?? 0) * 100)}% sat the test, against ${Math.round((part.peerRate ?? 0) * 100)}% elsewhere.`,
          tip: `${Math.round((part.rate ?? 0) * 100)}% of eligible students sat the test, against ${Math.round((part.peerRate ?? 0) * 100)}% elsewhere — comparisons on this page should be read with that in mind.`,
          icon: Users2,
        }
      : null,
    (status?.gradebook?.total ?? 0) === 0
      ? { k: 'No gradebook data', v: 'Connect the SIS or upload marks to see them beside scores.', cta: 'Connect', icon: GraduationCap }
      : null,
    (status?.lessonPlans?.total ?? 0) === 0
      ? { k: 'No lesson plans yet', v: 'The classroom register is empty.', cta: 'Add one', icon: ClipboardList }
      : null,
  ].filter(Boolean)
}

function NeedsAttention({ items, onGoAdd, first = false }) {
  if (items.length === 0) return null
  return (
    <AuroraSection
      first={first}
      icon={Wrench}
      tone="watch"
      title="Needs a look"
      subtitle="To finish the picture"
      count={`${items.length} to check`}
    >
      <AuroraTileGrid cols={Math.min(4, Math.max(2, items.length))}>
        {items.map((it) => (
          <AuroraTile
            key={it.k}
            icon={it.icon}
            tone="watch"
            title={it.k}
            desc={it.v}
            tip={it.tip}
            foot={
              it.cta && onGoAdd ? (
                <AuroraLightButton size="sm" variant="ghost" hue="#b45309" onClick={onGoAdd}>
                  {it.cta}
                </AuroraLightButton>
              ) : null
            }
          />
        ))}
      </AuroraTileGrid>
    </AuroraSection>
  )
}

// ── Inventory ────────────────────────────────────────────────────────────────

/** What is loaded. Real, but the least urgent thing here — so it sits last. */
function Inventory({ status }) {
  return (
    <AuroraSection icon={BookOpen} title="On file" subtitle="What is loaded for this school">
      <AuroraTileGrid cols={3}>
        <AuroraTile
          icon={BarChart3}
          title="Test results"
          figure={String(status?.assessments?.rows ?? 0)}
          unit="rows"
          desc={`${status?.assessments?.years?.length ?? 0} year(s) · ${status?.assessments?.tested ?? 0} scored`}
        />
        <AuroraTile
          icon={GraduationCap}
          hue="var(--au-h2)"
          title="Gradebook"
          figure={String(status?.gradebook?.total ?? 0)}
          unit="marks"
          desc={`${status?.gradebook?.courses ?? 0} course(s)`}
          to="?tab=records"
        />
        <AuroraTile
          icon={ClipboardList}
          hue="var(--au-h3)"
          title="Lesson plans"
          figure={String(status?.lessonPlans?.total ?? 0)}
          unit="plans"
          desc={`${status?.lessonPlans?.byStatus?.draft ?? 0} still in draft`}
          to="?tab=records"
        />
      </AuroraTileGrid>
    </AuroraSection>
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

  if (loading) {
    return (
      <div className="mt-8" aria-busy="true">
        <div className="h-40 animate-pulse rounded-2xl bg-ink/[.04]" />
      </div>
    )
  }

  if (!dashboard || dashboard.empty) {
    return (
      <AuroraSection first icon={Upload} title="Getting started" subtitle="One file is enough to begin">
        <AuroraEmpty
          icon={Upload}
          text="Start with a scores file."
          sub="A diocesan summary, a publisher export or a student-level file all work."
          action={
            onGoAdd ? (
              <AuroraLightButton onClick={onGoAdd} icon={<Upload size={15} aria-hidden="true" />}>
                Add academic data
              </AuroraLightButton>
            ) : null
          }
        />
      </AuroraSection>
    )
  }

  const items = needsItems(dashboard, status)
  return (
    <div>
      <NeedsAttention items={items} onGoAdd={onGoAdd} first />

      <CompareSection dashboard={dashboard} reduce={reduce} first={items.length === 0} />

      <ViewTiles dashboard={dashboard} onOpen={onOpenView} networkTo={isMultiSchool ? networkTo : null} />

      <Inventory status={status} />

      <HowThisWorks>
        <p>
          Every figure is computed from the scores on file for{' '}
          {dashboard?.context?.testType ? String(dashboard.context.testType).toUpperCase() : 'this test'}{' '}
          {dashboard?.context?.year ?? ''}, against the other schools in your network.
        </p>
        <p>
          Ahead or Behind follows the standing KYRO computes for the average, and the sign of each subject&rsquo;s
          gap. Participation reads &ldquo;Fair&rdquo; when the share of students tested is in line with peers, and
          &ldquo;Read with care&rdquo; when it is not.
        </p>
      </HowThisWorks>
    </div>
  )
}

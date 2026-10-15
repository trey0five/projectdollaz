// ─────────────────────────────────────────────────────────────────────────────
// THE RECORDS-GRADE TABLE — the charts' twin, and how a head of school DEFENDS
// the number in a board meeting.
//
// Every figure above is drawn; here every figure is printed, in one place, with
// its grade beside it. Nothing in this table is computed in the browser: the
// counts, shares, plans, gaps and gap percentages are all read straight off the
// payload the charts were drawn from, so the table and the charts cannot drift.
//
// PREMIUM UI P4: a `DataTable` on the ground under a `Section` label — sticky
// caps head, 36px hairline rows, every numeric column right-aligned and
// tabular, the School total as a tfoot line. No wrapper card.
//
// ── WHY THERE IS NO PER-GRADE "CHANGE" COLUMN ───────────────────────────────
// The obvious last column is this year's grade 9 minus last year's grade 9. Two
// separate reasons it is not here:
//
//   1. Subtracting two counts in the browser is exactly the arithmetic this page
//      does not do. Every other number on screen comes from the server's one
//      definition; a delta invented here would be the first figure with no
//      canonical source, and the first one able to disagree with the board pack.
//
//   2. It would not mean what a reader would take it to mean. Grade 9 last year
//      and grade 9 this year are DIFFERENT CHILDREN — a rung, refilled. The
//      same-children comparison is the cohort walk in E3, and it is labelled
//      size, not retention, for the same reason.
//
// So the column prints last year's count for that rung and says what it is. The
// whole-school year-over-year change, which IS computed canonically and IS
// like-for-like, lives in the vitals strip.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { DataTable, Section } from '../ui/surface/index.js'
import InfoPopover from '../ui/InfoPopover.jsx'
import {
  CELL_MASKED,
  EASE,
  cellState,
  cellTitle,
  cellToken,
  fmtCount,
  fmtDate,
  fmtShare,
  gradeLabelOf,
  hasValue,
  schoolYearLabel,
  signedCount,
  signedShare,
} from './enrollmentAnalyticsKit.jsx'

function GapCell({ gap, gapPct }) {
  if (cellState(gap) === CELL_MASKED) return <span className="text-ink2">withheld</span>
  if (!hasValue(gap)) return <span className="text-ink2">—</span>
  const under = gap.value < 0
  const even = gap.value === 0
  // Colour sits on the GAP as a 2px mark; the figure stays ink.
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {!even ? <span className={`mark tone-${under ? 'risk' : 'good'}`} aria-hidden="true" /> : null}
      <span className={even ? 'text-ink2' : 'font-semibold text-ink'}>{signedCount(gap.value)}</span>
      {hasValue(gapPct) ? <span className="text-ink2">{signedShare(gapPct.value)}</span> : null}
    </span>
  )
}

export default function EnrollmentGradeTable({ ladder, vsPlan, gradeByYear, minCell = 5, reduce = false }) {
  // vs-plan rows keyed by grade, so the plan columns can join the ladder without
  // either side re-deriving the other.
  const planByGrade = useMemo(() => {
    const m = new Map()
    for (const r of vsPlan?.rows ?? []) m.set(r.grade, r)
    return m
  }, [vsPlan])

  // Last year's same-rung count, printed but never subtracted (see the header).
  const { priorYear, priorByGrade } = useMemo(() => {
    const years = gradeByYear?.years ?? []
    if (years.length < 2) return { priorYear: null, priorByGrade: new Map() }
    const py = years[years.length - 2]
    const m = new Map()
    for (const c of gradeByYear?.cells ?? []) if (c.schoolYear === py) m.set(c.grade, c.count)
    return { priorYear: py, priorByGrade: m }
  }, [gradeByYear])

  const rows = ladder?.rows ?? []
  const hasPlan = planByGrade.size > 0
  const hasPrior = priorYear !== null

  const columns = useMemo(() => {
    const cols = [
      {
        key: 'grade',
        header: 'Grade',
        render: (r) => <span className="font-semibold text-ink">{gradeLabelOf(r.grade)}</span>,
      },
      {
        key: 'students',
        header: 'Students',
        num: true,
        render: (r) => {
          const masked = cellState(r.count) === CELL_MASKED
          return (
            <span className={masked ? 'text-ink2' : 'font-semibold text-ink'} title={cellTitle(r.count, { minCell }) ?? undefined}>
              {cellToken(r.count)}
            </span>
          )
        },
      },
      {
        key: 'share',
        header: 'Share',
        num: true,
        // The share is dropped whenever the count is — printing it beside a
        // masked count would give the count back.
        render: (r) => <span className="text-ink2">{hasValue(r.share) ? fmtShare(r.share.value) : '—'}</span>,
      },
    ]
    if (hasPlan) {
      cols.push(
        {
          key: 'plan',
          header: 'Plan',
          num: true,
          render: (r) => {
            const p = planByGrade.get(r.grade)
            return <span className="text-ink2">{p ? cellToken(p.plan) : '—'}</span>
          },
        },
        {
          key: 'gap',
          header: 'Gap',
          num: true,
          render: (r) => {
            const p = planByGrade.get(r.grade)
            return p ? <GapCell gap={p.gap} gapPct={p.gapPct} /> : <span className="text-ink2">—</span>
          },
        },
      )
    }
    if (hasPrior) {
      cols.push({
        key: 'prior',
        header: (
          <span>
            {schoolYearLabel(priorYear)}
            <span className="dt-sub normal-case tracking-normal">same grade</span>
          </span>
        ),
        num: true,
        render: (r) => {
          const prior = priorByGrade.get(r.grade) ?? null
          return (
            <span className="text-ink2" title={prior ? (cellTitle(prior, { minCell }) ?? undefined) : 'Not reported that year.'}>
              {prior ? cellToken(prior) : '—'}
            </span>
          )
        },
      })
    }
    return cols
  }, [hasPlan, hasPrior, planByGrade, priorByGrade, priorYear, minCell])

  // The School line as a tfoot row — the same columns, never sorted.
  const footRows = useMemo(() => {
    if (!vsPlan?.totals) return []
    return [
      {
        grade: '__school__',
        count: { value: vsPlan.totals.actual, suppressed: false },
        share: { value: 1, suppressed: false },
        __total: true,
      },
    ]
  }, [vsPlan])

  // The School line renders through the SAME columns (one definition), with
  // each cell swapped for its total. Memoized: a fresh columns array per render
  // would re-key DataTable's sort memo on every paint.
  const tableColumns = useMemo(() => {
    if (!vsPlan?.totals) return columns
    const footColumns = columns.map((c) => {
    if (c.key === 'grade') return { ...c, render: () => <span className="font-semibold text-ink">School</span> }
    if (c.key === 'students') return { ...c, render: () => <span className="font-semibold text-ink">{fmtCount(vsPlan.totals.actual)}</span> }
    if (c.key === 'share') return { ...c, render: () => <span className="text-ink2">100.0%</span> }
    if (c.key === 'plan') return { ...c, render: () => <span className="text-ink2">{fmtCount(vsPlan.totals.plan)}</span> }
    if (c.key === 'gap')
      return {
        ...c,
        render: () => (
          <GapCell
            gap={{ value: vsPlan.totals.gap, suppressed: false }}
            gapPct={{ value: vsPlan.totals.gapPct, suppressed: false }}
          />
        ),
      }
    return { ...c, render: () => null }
  })
    return columns.map((c, i) => ({ ...c, render: (r) => (r.__total ? footColumns[i].render(r) : c.render(r)) }))
  }, [columns, vsPlan])

  if (rows.length === 0) return null

  return (
    <Section
      as={motion.section}
      label="Every grade, in figures"
      aside={
        <>
          <span className="tabular-nums">
            {fmtCount(ladder.total)} students · counted {fmtDate(ladder.observedOn) ?? ladder.observedOn}
          </span>
          {/* How to read the table — behind an ⓘ, the same disclosure every
              chart card on this page uses, so the table leads with figures. */}
          <InfoPopover label="How to read this table">
            <div className="space-y-2 text-small leading-snug text-ink">
              {ladder.narrowestRung ? (
                <p>The narrowest rung is the year that sets the ceiling for the grade above it next year.</p>
              ) : null}
              {hasPrior ? (
                <p>
                  The last column is the same GRADE a year earlier, not the same children — a rung, refilled. No
                  change is taken across it for that reason; to follow one class as it moves up, read the cohort
                  panels.
                </p>
              ) : null}
              <p>Grades with fewer than {minCell} students are hidden, never shown as zero.</p>
            </div>
          </InfoPopover>
        </>
      }
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <DataTable
        caption={`Headcount by grade with each grade's share of the school${hasPlan ? ', the planned headcount, and the gap against it' : ''}${hasPrior ? `, beside the same grade's count in ${schoolYearLabel(priorYear)}` : ''}.`}
        columns={tableColumns}
        rows={rows}
        rowKey="grade"
        footRows={footRows}
        empty="No grade-level reading on file."
      />

      <div className="mt-2.5 space-y-1">
        {/* The narrowest rung is a genuine finding — the thin year that becomes
            next year's problem — but it is only nameable when nothing is
            hidden, because the smallest VISIBLE rung is not the smallest rung. */}
        {ladder.narrowestRung ? (
          <p className="sec-note">
            Narrowest rung:{' '}
            <span className="font-semibold text-ink">{gradeLabelOf(ladder.narrowestRung.grade)}</span> at{' '}
            <span className="font-semibold tabular-nums text-ink">{fmtCount(ladder.narrowestRung.count)}</span> students.
          </p>
        ) : ladder.narrowestRungWithheldReason ? (
          <p className="sec-note">{ladder.narrowestRungWithheldReason}</p>
        ) : null}
      </div>
    </Section>
  )
}

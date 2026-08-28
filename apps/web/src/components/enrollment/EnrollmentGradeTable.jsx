// ─────────────────────────────────────────────────────────────────────────────
// THE RECORDS-GRADE TABLE — the charts' twin, and how a head of school DEFENDS
// the number in a board meeting.
//
// Every figure above is drawn; here every figure is printed, in one place, with
// its grade beside it. Nothing in this table is computed in the browser: the
// counts, shares, plans, gaps and gap percentages are all read straight off the
// payload the charts were drawn from, so the table and the charts cannot drift.
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
// like-for-like, lives in the hero tiles.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  CELL_MASKED,
  EASE,
  cellState,
  cellTitle,
  cellToken,
  fmtCount,
  fmtShare,
  gradeLabelOf,
  hasValue,
  schoolYearLabel,
  signedCount,
  signedShare,
} from './enrollmentAnalyticsKit.jsx'

function GapCell({ gap, gapPct }) {
  if (cellState(gap) === CELL_MASKED) return <span className="text-amber-700">withheld</span>
  if (!hasValue(gap)) return <span className="text-muted">—</span>
  const under = gap.value < 0
  const even = gap.value === 0
  return (
    <span className={even ? 'text-slate-500' : under ? 'font-bold text-red-600' : 'font-bold text-emerald-700'}>
      {signedCount(gap.value)}
      {hasValue(gapPct) ? <span className="ml-1.5 font-semibold opacity-70">{signedShare(gapPct.value)}</span> : null}
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
  if (rows.length === 0) return null

  const hasPlan = planByGrade.size > 0
  const hasPrior = priorYear !== null

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: EASE }}
      className="av2-card p-4 sm:p-5"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-[16px] font-semibold text-navy sm:text-[17px]">Every grade, in figures</h3>
        <span className="text-[11px] font-medium tabular-nums text-slate-400">
          {fmtCount(ladder.total)} students · counted {ladder.observedOn}
        </span>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[520px] border-collapse text-left text-[12.5px]">
          <caption className="sr-only">
            Headcount by grade with each grade&apos;s share of the school
            {hasPlan ? ', the planned headcount, and the gap against it' : ''}
            {hasPrior ? `, beside the same grade's count in ${schoolYearLabel(priorYear)}` : ''}.
          </caption>
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 font-bold">Grade</th>
              <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 text-right font-bold">Students</th>
              <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 text-right font-bold">Share</th>
              {hasPlan ? (
                <>
                  <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 text-right font-bold">Plan</th>
                  <th scope="col" className="border-b border-navy/10 py-1.5 pr-3 text-right font-bold">Gap</th>
                </>
              ) : null}
              {hasPrior ? (
                <th scope="col" className="border-b border-navy/10 py-1.5 text-right font-bold">
                  {schoolYearLabel(priorYear)}
                  <span className="block font-sans text-[8.5px] normal-case tracking-normal opacity-70">
                    same grade
                  </span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = planByGrade.get(r.grade)
              const prior = priorByGrade.get(r.grade) ?? null
              const masked = cellState(r.count) === CELL_MASKED
              return (
                <tr key={r.grade} className="align-top">
                  <td className="border-b border-navy/[0.06] py-1.5 pr-3 font-semibold text-navy">
                    {gradeLabelOf(r.grade)}
                  </td>
                  <td
                    className={`border-b border-navy/[0.06] py-1.5 pr-3 text-right tabular-nums ${
                      masked ? 'font-semibold text-amber-700' : 'font-bold text-navy'
                    }`}
                    title={cellTitle(r.count, { minCell }) ?? undefined}
                  >
                    {cellToken(r.count)}
                  </td>
                  <td className="border-b border-navy/[0.06] py-1.5 pr-3 text-right tabular-nums text-muted">
                    {/* The share is dropped whenever the count is — printing it
                        beside a masked count would give the count back. */}
                    {hasValue(r.share) ? fmtShare(r.share.value) : '—'}
                  </td>
                  {hasPlan ? (
                    <>
                      <td className="border-b border-navy/[0.06] py-1.5 pr-3 text-right tabular-nums text-muted">
                        {p ? cellToken(p.plan) : '—'}
                      </td>
                      <td className="border-b border-navy/[0.06] py-1.5 pr-3 text-right tabular-nums">
                        {p ? <GapCell gap={p.gap} gapPct={p.gapPct} /> : <span className="text-muted">—</span>}
                      </td>
                    </>
                  ) : null}
                  {hasPrior ? (
                    <td
                      className="border-b border-navy/[0.06] py-1.5 text-right tabular-nums text-muted"
                      title={prior ? (cellTitle(prior, { minCell }) ?? undefined) : 'Not reported that year.'}
                    >
                      {prior ? cellToken(prior) : '—'}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
          {vsPlan?.totals ? (
            <tfoot>
              <tr className="font-bold">
                <td className="py-2 pr-3 text-navy">School</td>
                <td className="py-2 pr-3 text-right tabular-nums text-navy">{fmtCount(vsPlan.totals.actual)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted">100.0%</td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted">{fmtCount(vsPlan.totals.plan)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <GapCell
                    gap={{ value: vsPlan.totals.gap, suppressed: false }}
                    gapPct={{ value: vsPlan.totals.gapPct, suppressed: false }}
                  />
                </td>
                {hasPrior ? <td /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="mt-2.5 space-y-1">
        {/* The narrowest rung is a genuine finding — the thin year that becomes
            next year's problem — but it is only nameable when nothing is
            hidden, because the smallest VISIBLE rung is not the smallest rung. */}
        {ladder.narrowestRung ? (
          <p className="text-[11.5px] leading-snug text-muted">
            Narrowest rung:{' '}
            <span className="font-semibold text-navy">{gradeLabelOf(ladder.narrowestRung.grade)}</span> at{' '}
            <span className="font-bold tabular-nums text-navy">{fmtCount(ladder.narrowestRung.count)}</span> students —
            the year that sets the ceiling for the grade above it next year.
          </p>
        ) : ladder.narrowestRungWithheldReason ? (
          <p className="text-[11.5px] leading-snug text-muted">{ladder.narrowestRungWithheldReason}</p>
        ) : null}
        {hasPrior ? (
          <p className="text-[11.5px] leading-snug text-muted">
            The last column is the same GRADE a year earlier, not the same children — a rung, refilled. No change is
            taken across it for that reason; to follow one class as it moves up, read the cohort panels above.
          </p>
        ) : null}
      </div>
    </motion.section>
  )
}

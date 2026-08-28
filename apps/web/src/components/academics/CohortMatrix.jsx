// ─────────────────────────────────────────────────────────────────────────────
// CohortMatrix — every cohort against every subject, in one glance.
//
// The panels above answer "did this group move"; this answers the question a
// head of school asks next, which is "was that one subject or the whole
// battery". It is a REAL TABLE — <th scope> on both axes — because it is read
// down columns and across rows by people using screen readers and by anyone
// pasting it into a board packet.
//
// TWO RULES IT EXISTS TO KEEP.
//
// 1. TONE FROM DIRECTION, NEVER SIGN. See `cohortFill` in cohortKit.
// 2. A SUPPRESSED CELL IS NEVER A ZERO. `<5` and `—` are different marks for
//    different facts: a number withheld to protect fewer than five children,
//    and a number nobody ever filed. A zero in either place would be the table
//    asserting "no change", which is a claim about a figure we do not have.
//
// Total Battery is the publisher's OWN reported composite, not the mean of the
// subject columns beside it, so the column sits first behind a hairline and the
// caption says so. Reading that column as a row average is the one misread this
// layout can invite.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { COH_EASE, cohortFill, fmtScore, legTitle, signed } from './cohortKit.js'

const TOTAL = 'total'

const ARROW = { gained: '▲', declined: '▼', held: '•' }

/** The mark a cell wears when there is no number to print. */
function blankOf(cell) {
  if (!cell) return { token: '—', title: 'No result on file' }
  if (cell.startState === 'suppressed' || cell.endState === 'suppressed')
    return { token: '<5', title: legTitle('suppressed') }
  if (cell.startState !== 'observed') return { token: '—', title: legTitle(cell.startState) }
  if (cell.endState !== 'observed') return { token: '—', title: legTitle(cell.endState) }
  return null
}

export default function CohortMatrix({ matrix, onlyKeys = null, unit, gap, schoolName, reduce = false }) {
  const keep = onlyKeys ? new Set(onlyKeys) : null
  const cohorts = (matrix?.cohorts ?? []).filter((c) => !keep || keep.has(c.key))
  const series = [...(matrix?.series ?? [])].sort((a, b) => (a.key === TOTAL ? -1 : b.key === TOTAL ? 1 : 0))
  const cells = (matrix?.cells ?? []).filter((c) => !keep || keep.has(c.cohortKey))
  if (cohorts.length === 0 || series.length === 0) return null

  const byCell = new Map(cells.map((c) => [`${c.cohortKey}|${c.series}`, c]))
  // The scaling reference for the intensity ramp — the largest move actually
  // rendered, so both sections' colours agree. A max is a selection, not
  // arithmetic on scores.
  const worst = Math.max(3, ...cells.map((c) => Math.abs(c.netChange ?? 0)))

  const cols = series.length
  // The composite's NAME comes from the server, per family — this file must
  // never type 'Total Battery' over an ACT or SAT school.
  const totalLabel = series.find((s) => s.key === TOTAL)?.label ?? 'Composite'

  return (
    <div>
      <div
        className="coh-matrix-scroll -mx-1 overflow-x-auto px-1"
        // A scroll container that only a mouse can reach is a column of numbers
        // a keyboard reader cannot get to. Focusable + named, so it is announced
        // and can be scrolled with the arrow keys.
        tabIndex={0}
        role="region"
        aria-label={`Net change by cohort and subject at ${schoolName ?? 'this school'}, scrollable`}
      >
        <table className="w-full min-w-[520px] border-separate" style={{ borderSpacing: '3px' }}>
          <caption className="sr-only">
            Net change by cohort and subject at {schoolName ?? 'this school'}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="coh-matrix-stick sticky left-0 z-10 bg-white pr-2 text-left font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted"
              >
                Cohort
              </th>
              {series.map((s, i) => (
                <th
                  key={s.key}
                  scope="col"
                  className="px-1 pb-1 text-center font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted"
                  style={
                    i === 0 && s.key === TOTAL
                      ? { borderRight: '1px solid rgba(16,28,61,0.12)', color: '#0f766e' }
                      : undefined
                  }
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c, row) => (
              <tr key={c.key}>
                <th
                  scope="row"
                  className="coh-matrix-stick sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-right text-[11.5px] font-semibold text-navy"
                >
                  {c.label}
                </th>
                {series.map((s, col) => {
                  const cell = byCell.get(`${c.key}|${s.key}`)
                  const blank = blankOf(cell)
                  const paint = blank
                    ? cohortFill('unknown', null, worst)
                    : cohortFill(cell.direction, cell.netChange, worst)
                  const title = blank
                    ? `${c.label} · ${s.label} — ${blank.title}`
                    : `${c.label} · ${s.label}: ${fmtScore(cell.startValue, unit.decimals)} → ${fmtScore(
                        cell.endValue,
                        unit.decimals,
                      )} (${signed(cell.netChange, unit.decimals)} ${unit.points}${
                        cell.direction === 'held' ? `, smaller than ${gap} — within the noise` : ''
                      })`
                  return (
                    <td
                      key={s.key}
                      className="p-0"
                      style={
                        col === 0 && s.key === TOTAL
                          ? { borderRight: '1px solid rgba(16,28,61,0.12)' }
                          : undefined
                      }
                    >
                      <motion.div
                        initial={reduce ? false : { opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.32,
                          ease: COH_EASE,
                          delay: reduce ? 0 : Math.min(0.4, 0.025 * (row * cols + col)),
                        }}
                        title={title}
                        className="flex h-[46px] cursor-default items-center justify-center gap-1 rounded-xl"
                        style={{
                          background: blank ? 'rgba(16,28,61,0.03)' : paint.bg,
                          boxShadow: `inset 0 0 0 1px ${blank ? 'rgba(16,28,61,0.06)' : paint.ring}`,
                        }}
                      >
                        {blank ? (
                          <span className="font-mono text-[9px] font-bold text-muted">{blank.token}</span>
                        ) : (
                          <>
                            <span className="text-[11px] leading-none" style={{ color: paint.fg }}>
                              {ARROW[cell.direction] ?? '•'}
                            </span>
                            <span
                              className="text-[15px] font-bold leading-none tabular-nums"
                              style={{ color: paint.fg }}
                            >
                              {signed(cell.netChange, unit.decimals)}
                            </span>
                          </>
                        )}
                      </motion.div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MatrixLegend unit={unit} gap={gap} schoolName={schoolName} totalLabel={totalLabel} />
    </div>
  )
}

/** Every word of it derived from the live unit — never typed. */
function MatrixLegend({ unit, gap, schoolName, totalLabel }) {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="text-emerald-700">▲</span> Gained — {gap ?? '—'} {unit.points} or more
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-navy/50">•</span> Within the noise — smaller than {gap ?? '—'} {unit.points}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-rose-700">▼</span> Declined
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="font-mono font-bold">&lt;5</span> Suppressed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="font-mono font-bold">—</span> Not on file
        </span>
      </div>
      {/* Each row spans DIFFERENT grades, so the sentence names the rule rather
          than one row's grades — naming grade 3 here would be false on row two. */}
      <p className="text-[11px] leading-snug text-muted">
        Every row is one group of children at {schoolName ?? 'this school'}, and its net change is that row&rsquo;s
        end-grade score minus its start-grade score. {totalLabel} is the publisher&rsquo;s own reported composite —
        not an average of the subject columns beside it.
      </p>
    </div>
  )
}

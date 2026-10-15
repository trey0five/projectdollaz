// ─────────────────────────────────────────────────────────────────────────────
// GradesPanel — the gradebook and the student score register, side by side.
//
// THE ROLE SPLIT HERE IS A PRIVACY BOUNDARY, not a permissions nicety. The
// summaries above are aggregates the whole school can see; the two registers
// below are the only surfaces in the module that put a student's name beside a
// number, and the API answers 403 for anyone but an owner or business manager.
// The UI says so out loud rather than silently rendering an empty table.
//
// PREMIUM UI P4: four `Section`s on the ground (Gradebook · Register · Courses ·
// Import history); the gradebook summary is a StatStrip, the registers are
// `DataTable`s, the undo confirm is the one `Panel` (a modal you act on).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import ColumnChart from '../analytics/charts/ColumnChart.jsx'
import { GraduationCap, Link2, Lock, UserRoundX } from 'lucide-react'
import RegisterEmpty from '../module/RegisterEmpty.jsx'
import { academicsApi } from '../../lib/api.js'
import { Section, StatStrip, Stat, DataTable, Pill, Panel, Button } from '../ui/surface/index.js'
import { moduleHue } from '../module/moduleAnatomy.js'

const HUE = moduleHue('academics')

const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''))

/** Bar width for a term average, inferring the mark scale from the data. */
// The top of the axis is the scale the marks are ACTUALLY on: a 0–4 GPA
// gradebook drawn on a percentage axis renders 3.6 as a sliver.
function termCeiling(terms) {
  const peak = Math.max(...(terms ?? []).map((t) => t.average ?? 0), 0)
  const ceiling = peak <= 5 ? 4 : peak <= 20 ? 20 : 100 // GPA · points · percent
  return Math.max(ceiling, peak)
}

function Restricted({ what }) {
  return (
    <p className="flex items-start gap-2.5 border-l-2 border-hair pl-3 text-small text-ink2">
      <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        {what} are visible to owners and business managers only — they show a student&rsquo;s name beside a
        score. The summaries above are open to everyone.
      </span>
    </p>
  )
}

const RESULT_COLUMNS = [
  {
    key: 'displayName',
    header: 'Student',
    render: (r) => r.displayName ?? <span className="italic text-ink2">unnamed row</span>,
  },
  { key: 'testType', header: 'Test', render: (r) => <span className="uppercase text-ink2">{r.testType}</span> },
  { key: 'schoolYear', header: 'Year', num: true, render: (r) => <span className="text-ink2">{r.schoolYear}</span> },
  { key: 'gradeLevel', header: 'Grade', num: true, render: (r) => <span className="text-ink2">{r.gradeLevel ?? '—'}</span> },
  { key: 'composite', header: 'Score', num: true, render: (r) => <span className="font-semibold text-ink">{r.composite ?? '—'}</span> },
  {
    key: 'matchStatus',
    header: 'Match',
    render: (r) =>
      r.matchStatus === 'unmatched' ? (
        <Pill variant="status" tone="watch">
          <UserRoundX size={10} aria-hidden="true" /> unmatched
        </Pill>
      ) : (
        <Pill variant="status" tone="good">
          <Link2 size={10} aria-hidden="true" /> {r.matchStatus}
        </Pill>
      ),
  },
]

export default function GradesPanel({ schoolId, canEdit }) {
  const [gradebook, setGradebook] = useState(null)
  const [courses, setCourses] = useState([])
  const [results, setResults] = useState([])
  const [imports, setImports] = useState([])
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [year, setYear] = useState('')
  const [years, setYears] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [reverting, setReverting] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const [g, c, , res, imp] = await Promise.all([
        academicsApi.gradebookSummary(schoolId).catch(() => null),
        canEdit ? academicsApi.gradebookCourses(schoolId).catch(() => null) : Promise.resolve(null),
        canEdit ? academicsApi.gradebookRecords(schoolId).catch(() => null) : Promise.resolve(null),
        canEdit
          ? academicsApi
              .results(schoolId, {
                ...(unmatchedOnly ? { unmatchedOnly: true } : {}),
                ...(year ? { schoolYear: Number(year) } : {}),
              })
              .catch(() => null)
          : Promise.resolve(null),
        academicsApi.imports(schoolId).catch(() => null),
      ])
      setGradebook(g ? (g.data ?? g) : null)
      setCourses(c ? (c.data ?? c) : [])
      // The register now answers with { rows, total, shown, years } so the page
      // can show a year filter and say what it is not showing. Older shapes
      // (a bare array) still render, so a stale client is not a blank screen.
      const body = res ? (res.data ?? res) : null
      const list = Array.isArray(body) ? body : (body?.rows ?? [])
      setResults(list)
      setTotal(Array.isArray(body) ? list.length : (body?.total ?? list.length))
      if (body?.years?.length) setYears(body.years)
      setImports(imp ? (imp.data ?? imp) : [])
      setError('')
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not load grades.')
    } finally {
      setLoading(false)
    }
  }, [schoolId, canEdit, unmatchedOnly, year])

  // A school swap must not carry the previous school's year filter across. The
  // panel is not remounted on swap, so without this the register comes up
  // filtered to a year the new school may not even have, showing nothing.
  useEffect(() => {
    setYear('')
    setYears([])
  }, [schoolId])

  useEffect(() => {
    load()
  }, [load])

  const unmatchedCount = useMemo(() => results.filter((r) => r.matchStatus === 'unmatched').length, [results])
  const shownResults = useMemo(() => results.slice(0, 200), [results])

  const importColumns = useMemo(
    () => [
      { key: 'fileName', header: 'File', render: (imp) => <span className="text-ink">{imp.fileName ?? `${imp.kind} import`}</span> },
      { key: 'testTypeHint', header: 'Test', render: (imp) => <span className="uppercase text-ink2">{imp.testTypeHint ?? '—'}</span> },
      { key: 'yearHint', header: 'Year', num: true, render: (imp) => <span className="text-ink2">{imp.yearHint ?? '—'}</span> },
      {
        key: 'rows',
        header: 'Rows',
        num: true,
        render: (imp) => (
          <span className="text-ink2">
            {imp.resultsCreated > 0 ? `${imp.resultsCreated} student rows` : `${imp.aggregatesUpserted} summary rows`}
          </span>
        ),
      },
      { key: 'createdAt', header: 'Imported', num: true, className: 'dt-nowrap', render: (imp) => <span className="text-ink2">{String(imp.createdAt).slice(0, 10)}</span> },
      ...(canEdit
        ? [
            {
              key: 'undo',
              header: '',
              num: true,
              render: (imp) => (
                <Button variant="quiet" size="sm" disabled={reverting === imp.id} onClick={() => setConfirming(imp)} className="dt-actions">
                  {reverting === imp.id ? 'Undoing…' : 'Undo'}
                </Button>
              ),
            },
          ]
        : []),
    ],
    [canEdit, reverting],
  )

  if (loading) return <p className="text-small text-ink2">Loading…</p>

  // Nothing at all on file: one line + the register's own "+ New" (read from
  // the ModuleRegister shell), never three empty sections in a row.
  const nothingOnFile =
    !error && !(gradebook?.total > 0) && results.length === 0 && !unmatchedOnly && !year && imports.length === 0
  if (nothingOnFile) {
    return (
      <RegisterEmpty
        icon={GraduationCap}
        text="No course marks or student results yet."
        sub="Upload a gradebook or a student-level scores export and they land here."
        actionLabel="Upload a gradebook"
      />
    )
  }

  return (
    <div>
      {/* ── Gradebook summary ── */}
      <Section label="Gradebook" className="!mt-0">
        <h3 className="sec-title">Course marks on file</h3>
        {gradebook && gradebook.total > 0 ? (
          <div className="space-y-4">
            <StatStrip cols={3} className="stats-wrap !grid-cols-3">
              <Stat label="Marks" value={gradebook.total} />
              <Stat label="Courses" value={gradebook.courses} />
              <Stat label="Average" value={fmt(gradebook.average)} />
            </StatStrip>
            {(gradebook.byTerm ?? []).length > 0 ? (
              <ColumnChart
                rows={gradebook.byTerm.map((t) => ({
                  id: t.term,
                  label: t.term,
                  value: t.average,
                  formatted: fmt(t.average),
                  meta: [{ label: 'Marks', value: `${t.count}` }],
                }))}
                color={HUE}
                domain={{ lo: 0, hi: termCeiling(gradebook.byTerm) }}
                showValues="all"
                height={180}
                ariaLabel="Average mark by term"
              />
            ) : null}
          </div>
        ) : (
          <p className="text-small text-ink2">
            No course marks yet. Upload a gradebook export from Add data — live SIS grade sync is not available yet.
          </p>
        )}
      </Section>

      {/* ── Student score register ── */}
      <Section
        label="Register"
        aside={
          canEdit && (results.length > 0 || unmatchedOnly || year) ? (
            <>
              {/* PAST YEARS ARE REACHABLE. The register is ordered newest-first
                  and capped, so without this a school's earlier years sat on the
                  server with no way on screen to ask for them. */}
              {years.length > 1 ? (
                <select aria-label="School year" value={year} onChange={(e) => setYear(e.target.value)} className="sel !h-7">
                  <option value="">All years</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              ) : null}
              <label className="flex items-center gap-1.5 text-small text-ink2">
                <input type="checkbox" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} />
                Unmatched only{unmatchedCount > 0 ? ` (${unmatchedCount})` : ''}
              </label>
            </>
          ) : null
        }
      >
        <h3 className="sec-title">Student results</h3>
        {!canEdit ? (
          <Restricted what="Individual results" />
        ) : results.length === 0 && unmatchedOnly ? (
          <p className="text-small text-ink2">
            {/* The claim has to match the filter. "Every result on file is
                attached" is a statement about the whole school, and saying it
                while a single year is selected is simply false. */}
            {year
              ? `Nothing unmatched in ${year}. Clear the filters above to see the rest.`
              : 'Nothing unmatched — every result on file is attached to a roster student. Clear the filter above to see them all.'}
          </p>
        ) : results.length === 0 && year ? (
          <p className="text-small text-ink2">
            No student-level results for {year}. Choose another year, or clear the filter to see everything on file.
          </p>
        ) : results.length === 0 ? (
          <p className="text-small text-ink2">
            No student-level results on file. A school-summary file fills the dashboards but carries no individual
            rows; upload a student-level export to populate this register.
          </p>
        ) : (
          <div>
            <DataTable columns={RESULT_COLUMNS} rows={shownResults} rowKey="id" caption="Student results" />
            {/* SAY WHAT IS NOT SHOWN. The old line reported the length of what
                the server had already truncated, so "the first 200 of 1000" was
                the ceiling talking, not the school's actual history. */}
            {total > shownResults.length ? (
              <p className="sec-note">
                Showing {shownResults.length.toLocaleString()} of {total.toLocaleString()}
                {year ? ` for ${year}` : ''}.
                {total > results.length && !year && years.length > 1
                  ? ' Pick a year above to narrow it, or export everything from Settings → Your Data.'
                  : ''}
              </p>
            ) : null}
          </div>
        )}
      </Section>

      {/* ── Course register ── */}
      {canEdit && courses.length > 0 ? (
        <Section label="Courses">
          <h3 className="sec-title">Sections on file</h3>
          <ul className="grid grid-cols-1 gap-x-8 border-t border-hair sm:grid-cols-2">
            {courses.slice(0, 40).map((c) => (
              <li key={c.id} className="flex h-9 items-center gap-2 border-b border-hair text-small">
                <span className="min-w-0 flex-1 break-words text-ink">{c.name}</span>
                {c.subject ? <span className="text-[11px] text-ink2">{c.subject}</span> : null}
                {c.gradeLevel ? <span className="text-[11px] text-ink2 tabular-nums">Gr {c.gradeLevel}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ── Provenance ── */}
      <Section label="Where this came from">
        <h3 className="sec-title">Import history</h3>
        <DataTable columns={importColumns} rows={imports.slice(0, 12)} rowKey="id" empty="Nothing imported yet." caption="Import history" />
      </Section>

      {/* UNDO DELETES ROWS. It used to fire on the first click with no
          confirmation, no busy state and no error branch, so a rejected DELETE
          became an unhandled rejection and the list simply did not change —
          indistinguishable from an undo that worked. */}
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <Panel className="w-full max-w-sm !shadow-float" role="dialog" aria-modal="true">
            <h4 className="font-serif text-heading font-medium text-ink">Undo this import?</h4>
            <p className="mt-1.5 text-small text-ink2">
              {confirming.fileName ?? `${confirming.kind} import`} — this removes the{' '}
              {confirming.resultsCreated > 0
                ? `${confirming.resultsCreated} student rows`
                : `${confirming.aggregatesUpserted} summary rows`}{' '}
              it added and recomputes the averages built from them. It cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Keep it
              </Button>
              <Button
                variant="primary"
                className="!bg-risk !shadow-none"
                onClick={async () => {
                  const imp = confirming
                  setConfirming(null)
                  setReverting(imp.id)
                  setError('')
                  try {
                    await academicsApi.revertImport(schoolId, imp.id)
                    await load()
                  } catch (e) {
                    setError(e?.response?.data?.message ?? 'Could not undo that import.')
                  } finally {
                    setReverting(null)
                  }
                }}
              >
                Undo import
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-small text-risk">{error}</p> : null}
    </div>
  )
}

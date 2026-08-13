// ─────────────────────────────────────────────────────────────────────────────
// GradesPanel — the gradebook and the student score register, side by side.
//
// THE ROLE SPLIT HERE IS A PRIVACY BOUNDARY, not a permissions nicety. The
// summaries above are aggregates the whole school can see; the two registers
// below are the only surfaces in the module that put a student's name beside a
// number, and the API answers 403 for anyone but an owner or business manager.
// The UI says so out loud rather than silently rendering an empty table.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Link2, Lock, ScrollText, UserRoundX } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'

const HUE = '#0D9488'
const EASE = [0.2, 0.8, 0.2, 1]

const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''))

/** Bar width for a term average, inferring the mark scale from the data. */
function termBarPct(value, terms) {
  if (value === null || value === undefined) return 0
  const peak = Math.max(...(terms ?? []).map((t) => t.average ?? 0), 0)
  const ceiling = peak <= 5 ? 4 : peak <= 20 ? 20 : 100 // GPA · points · percent
  return Math.max(0, Math.min(100, (Number(value) / ceiling) * 100))
}

function Card({ title, eyebrow, children, aside }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="rounded-2xl border border-navy/10 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(16,28,61,0.4)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: HUE }}>
            {eyebrow}
          </p>
          <h3 className="mt-0.5 font-serif text-[19px] font-semibold text-navy">{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </motion.section>
  )
}

function Restricted({ what }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-navy/[0.04] px-4 py-3">
      <Lock size={15} className="mt-0.5 shrink-0 text-muted" />
      <p className="text-[12.5px] text-muted">
        {what} are visible to owners and business managers only — they show a student&rsquo;s name beside a
        score. The summaries above are open to everyone.
      </p>
    </div>
  )
}

export default function GradesPanel({ schoolId, canEdit }) {
  const [gradebook, setGradebook] = useState(null)
  const [courses, setCourses] = useState([])
  const [records, setRecords] = useState([])
  const [results, setResults] = useState([])
  const [imports, setImports] = useState([])
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [reverting, setReverting] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const [g, c, r, res, imp] = await Promise.all([
        academicsApi.gradebookSummary(schoolId).catch(() => null),
        canEdit ? academicsApi.gradebookCourses(schoolId).catch(() => null) : Promise.resolve(null),
        canEdit ? academicsApi.gradebookRecords(schoolId).catch(() => null) : Promise.resolve(null),
        canEdit ? academicsApi.results(schoolId, unmatchedOnly ? { unmatchedOnly: true } : {}).catch(() => null) : Promise.resolve(null),
        academicsApi.imports(schoolId).catch(() => null),
      ])
      setGradebook(g ? (g.data ?? g) : null)
      setCourses(c ? (c.data ?? c) : [])
      setRecords(r ? (r.data ?? r) : [])
      setResults(res ? (res.data ?? res) : [])
      setImports(imp ? (imp.data ?? imp) : [])
      setError('')
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not load grades.')
    } finally {
      setLoading(false)
    }
  }, [schoolId, canEdit, unmatchedOnly])

  useEffect(() => {
    load()
  }, [load])

  const unmatchedCount = useMemo(() => results.filter((r) => r.matchStatus === 'unmatched').length, [results])

  if (loading) return <p className="text-[13px] text-muted">Loading…</p>

  return (
    <div className="space-y-4">
      {/* ── Gradebook summary ── */}
      <Card eyebrow="Gradebook" title="Course marks on file" aside={<GraduationCap size={16} className="text-muted" />}>
        {gradebook && gradebook.total > 0 ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { k: 'Marks', v: gradebook.total },
                { k: 'Courses', v: gradebook.courses },
                { k: 'Average', v: fmt(gradebook.average) },
              ].map((c) => (
                <div key={c.k} className="rounded-xl border border-navy/10 px-3 py-2.5">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted">{c.k}</p>
                  <p className="mt-0.5 font-serif text-[22px] font-semibold tabular-nums text-navy">{c.v}</p>
                </div>
              ))}
            </div>
            {(gradebook.byTerm ?? []).length > 0 ? (
              <div className="space-y-1.5">
                {/* Scale to the scale the marks are ACTUALLY on. A 0–4 GPA
                    gradebook drawn as a percentage renders 3.6 as a 3.6%-wide
                    sliver; anything at or under 5 is a points scale. */}
                {gradebook.byTerm.map((t) => (
                  <div key={t.term} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-right text-[11.5px] text-muted">{t.term}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-navy/[0.05]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${termBarPct(t.average, gradebook.byTerm)}%` }}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="h-full rounded"
                        style={{ background: `linear-gradient(90deg, ${HUE}, #14b8a6)` }}
                      />
                    </div>
                    <span className="w-12 text-right text-[12px] font-semibold tabular-nums text-navy">{fmt(t.average)}</span>
                    <span className="w-14 text-right font-mono text-[10.5px] text-muted">{t.count} marks</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">
            No course marks loaded yet. A gradebook export — or a OneRoster sync once your SIS credentials are in —
            lands here.
          </p>
        )}
      </Card>

      {/* ── Student score register ── */}
      <Card
        eyebrow="Register"
        title="Student results"
        aside={
          canEdit && results.length > 0 ? (
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
              <input type="checkbox" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} />
              Unmatched only{unmatchedCount > 0 ? ` (${unmatchedCount})` : ''}
            </label>
          ) : null
        }
      >
        {!canEdit ? (
          <Restricted what="Individual results" />
        ) : results.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            No student-level results on file. A school-summary file fills the dashboards but carries no individual
            rows; upload a student-level export to populate this register.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-navy/12">
                  {['Student', 'Test', 'Year', 'Grade', 'Score', 'Match'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-b border-navy/[0.07] hover:bg-navy/[0.02]">
                    <td className="px-2 py-2 text-left text-[12.5px] text-navy">
                      {r.displayName ?? <span className="italic text-muted">unnamed row</span>}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] uppercase text-muted">{r.testType}</td>
                    <td className="px-2 py-2 text-right text-[12px] tabular-nums text-muted">{r.schoolYear}</td>
                    <td className="px-2 py-2 text-right text-[12px] tabular-nums text-muted">{r.gradeLevel ?? '—'}</td>
                    <td className="px-2 py-2 text-right text-[12.5px] font-bold tabular-nums text-navy">
                      {r.composite ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.matchStatus === 'unmatched' ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/12 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700">
                          <UserRoundX size={10} /> unmatched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
                          <Link2 size={10} /> {r.matchStatus}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > 200 ? (
              <p className="mt-2 text-[11.5px] text-muted">Showing the first 200 of {results.length}.</p>
            ) : null}
          </div>
        )}
      </Card>

      {/* ── Course register ── */}
      {canEdit && courses.length > 0 ? (
        <Card eyebrow="Courses" title="Sections on file">
          <div className="grid gap-2 sm:grid-cols-2">
            {courses.slice(0, 40).map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-navy/10 px-3 py-2">
                <span className="flex-1 truncate text-[12.5px] text-navy">{c.name}</span>
                {c.subject ? <span className="text-[11px] text-muted">{c.subject}</span> : null}
                {c.gradeLevel ? <span className="font-mono text-[10.5px] text-muted">Gr {c.gradeLevel}</span> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ── Provenance ── */}
      <Card eyebrow="Where this came from" title="Import history" aside={<ScrollText size={16} className="text-muted" />}>
        {imports.length === 0 ? (
          <p className="text-[12.5px] text-muted">Nothing imported yet.</p>
        ) : (
          <div className="space-y-1.5">
            {imports.slice(0, 12).map((imp) => (
              <div key={imp.id} className="flex items-center gap-3 rounded-lg border border-navy/10 px-3 py-2">
                <span className="flex-1 truncate text-[12.5px] text-navy">
                  {imp.fileName ?? `${imp.kind} import`}
                </span>
                <span className="font-mono text-[10.5px] uppercase text-muted">{imp.testTypeHint ?? '—'}</span>
                <span className="font-mono text-[10.5px] text-muted">{imp.yearHint ?? '—'}</span>
                <span className="text-[11px] text-muted">
                  {imp.resultsCreated > 0 ? `${imp.resultsCreated} student rows` : `${imp.aggregatesUpserted} summary rows`}
                </span>
                <span className="font-mono text-[10px] text-muted">{String(imp.createdAt).slice(0, 10)}</span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await academicsApi.revertImport(schoolId, imp.id)
                      load()
                    }}
                    className="rounded border border-navy/15 px-2 py-0.5 text-[10.5px] text-muted hover:border-danger hover:text-danger"
                  >
                    Undo
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
    </div>
  )
}

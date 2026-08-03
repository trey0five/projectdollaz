// ─────────────────────────────────────────────────────────────────────────────
// InterventionPriorities — AIC Phase I. ONE DIOCESAN WORKSHOP INSTEAD OF NINE
// SCHOOL PROJECTS.
//
// The question this panel answers: is there a single standard weak at enough
// schools to justify one intervention run centrally? "COG-14 is below the
// improvement threshold at 9 of 14 schools" is a different — and far cheaper —
// piece of work than nine separate school improvement plans.
//
// WHY THE AGGREGATION IS THE SERVER'S AND NOT OURS (spec §5.1): school standards
// are per-school CLONES of a catalog row, so fourteen schools hold fourteen
// different standard ids and a `code` that each school can edit. The only
// comparable identity is `catalogStandardId`, and the grouping happens API-side.
// This component GROUPS NOTHING — it renders the rows it was handed, in the order
// they arrived (the ordering is frozen server-side: schools-below desc, share
// desc, code asc, id asc, with no client override anywhere in Phase I).
//
// THE HEADLINE IS THE SERVER'S FROZEN SENTENCE, printed verbatim. The threshold
// is emitted as a NUMBER (`thresholdScore`) because the API deliberately does not
// carry a rubric label table — the rubric words belong to each framework. So the
// score is shown as the shipped RubricPicker pips (read-only), which is the one
// place rubric scores are already rendered, and no second label vocabulary is
// invented here.
//
// The per-school breakdown is ABSENT under the viewer lens (the API omits the
// key entirely, spec §4.7) — so this component must never assume it exists, and
// the adopt affordance is only offered when it does.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Layers, Target } from 'lucide-react'
import RubricPicker from '../accreditation/RubricPicker.jsx'
import BulkAdoptFlow from './BulkAdoptFlow.jsx'

function Metric({ label, value }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      <span className="text-[14px] font-semibold tabular-nums text-navy">
        {Number.isFinite(value) ? value : '—'}
      </span>
    </span>
  )
}

function PriorityRow({ priority, thresholdScore, canWrite, onPropose, onConfirm }) {
  const [open, setOpen] = useState(false)
  const schools = Array.isArray(priority?.schools) ? priority.schools : null
  const share = Number.isFinite(priority?.sharePct) ? `${priority.sharePct}%` : null

  return (
    <li className="border-b border-rule/50 px-5 py-4 last:border-b-0 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {/* The server's frozen headline template, verbatim. */}
          <p className="font-serif text-[15.5px] font-semibold leading-snug text-navy">
            {priority?.headline ?? priority?.code ?? 'Standard'}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
            {priority?.code ? <span className="font-semibold">{priority.code}</span> : null}
            {priority?.title ? ` · ${priority.title}` : ''}
            {priority?.domainKey ? ` · ${priority.domainKey}` : ''}
          </p>
        </div>
        {share && (
          <span className="shrink-0 rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-[12px] font-semibold text-navy">
            {share} of schools in scope
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <Metric label="Below threshold" value={priority?.schoolsBelowThreshold} />
        <Metric label="In scope" value={priority?.schoolsInScope} />
        <Metric label="Scored" value={priority?.schoolsScored} />
        <Metric label="No evidence" value={priority?.schoolsWithEvidenceGap} />
        <span className="inline-flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Median self-score
          </span>
          {priority?.medianRubricScore == null ? (
            // NOT a zero. Nothing scored and "scored 1" are different facts.
            <span className="text-[13px] text-muted">Not scored</span>
          ) : (
            <RubricPicker value={Math.round(priority.medianRubricScore)} disabled />
          )}
        </span>
      </div>

      {schools && schools.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-navy">
            Which schools ({schools.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {schools.map((s, i) => (
              <li
                key={s?.schoolId ?? i}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg border border-rule/60 bg-section px-3 py-1.5 text-[12.5px]"
              >
                <span className="font-semibold text-navy">{s?.name ?? s?.schoolId}</span>
                <span className="text-muted">
                  {s?.rubricScore == null
                    ? 'Not scored'
                    : `Self-score ${s.rubricScore} (threshold ${thresholdScore})`}
                  {Number.isFinite(s?.evidenceCount) ? ` · ${s.evidenceCount} artifacts` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {schools && canWrite && (
        <>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 inline-flex min-h-[38px] items-center gap-2 rounded-lg border-2 border-hair px-3.5 text-[13px] font-semibold text-navy transition hover:border-gold"
            >
              <Target size={14} aria-hidden className="text-gold" />
              Run one intervention across these schools
            </button>
          )}
          {open && (
            <BulkAdoptFlow
              priority={priority}
              canWrite={canWrite}
              onClose={() => setOpen(false)}
              onPropose={(body) => onPropose?.(priority, body)}
              onConfirm={(body) => onConfirm?.(priority, body)}
            />
          )}
        </>
      )}
    </li>
  )
}

export default function InterventionPriorities({
  data = null,
  loading = false,
  error = '',
  canWrite = false,
  onPropose,
  onConfirm,
}) {
  if (loading) {
    return (
      <section className="card-soft px-5 py-6 sm:px-6">
        <p className="text-[13.5px] text-muted">Looking for standards weak across the diocese…</p>
      </section>
    )
  }
  if (error) {
    return (
      <section className="card-soft px-5 py-6 sm:px-6">
        <h2 className="font-serif text-[17px] font-semibold text-navy">Intervention priorities</h2>
        <p className="mt-1 text-[13.5px] text-muted">{error}</p>
      </section>
    )
  }
  if (!data) return null

  const priorities = Array.isArray(data.priorities) ? data.priorities : []
  const notes = Array.isArray(data.notes) ? data.notes : []
  const threshold = Number.isFinite(data.thresholdScore) ? data.thresholdScore : null

  // ── A TRUNCATED LIST THAT DOES NOT SAY IT IS TRUNCATED READS AS THE WHOLE
  // ANSWER. The server slices to `limit` and sends the PRE-SLICE `totalPriorities`
  // precisely so this heading can say how many were withheld. A 14-school diocese
  // with 47 weak standards planning against 10 of them, believing that is all of
  // them, is the failure. The count is the server's; nothing here re-derives it,
  // and when the server sends no total this sentence is simply absent.
  const total = Number.isFinite(data.totalPriorities) ? data.totalPriorities : null
  const withheld = total !== null && total > priorities.length

  return (
    <section aria-labelledby="portfolio-priorities" className="card-soft overflow-hidden">
      <div className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-section text-muted">
          <Layers size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="portfolio-priorities" className="font-serif text-[17px] font-semibold text-navy">
            Intervention priorities
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Standards weak at enough schools to be worth one diocesan workshop rather than nine
            separate school projects. Grouped by the shared catalog standard — never by a code a
            school can edit.
            {threshold != null
              ? ` "Below the threshold" means a self-score at or under ${threshold}.`
              : ''}
          </p>
          {withheld && (
            <p className="mt-1 text-[12.5px] font-semibold text-navy">
              Showing the top {priorities.length} of {total}. {total - priorities.length} further
              standard{total - priorities.length === 1 ? ' is' : 's are'} below the threshold
              somewhere in this organization and {total - priorities.length === 1 ? 'is' : 'are'} not
              listed here.
            </p>
          )}
          {(Number.isFinite(data.schoolsConsidered) || Number.isFinite(data.schoolsWithFramework)) && (
            <p className="mt-1 text-[12px] text-muted">
              {Number.isFinite(data.schoolsWithFramework) ? data.schoolsWithFramework : '—'} of{' '}
              {Number.isFinite(data.schoolsConsidered) ? data.schoolsConsidered : '—'} schools hold a
              framework this can be measured against.
            </p>
          )}
        </div>
      </div>

      {priorities.length === 0 ? (
        <p className="px-5 pb-5 text-[13.5px] text-muted sm:px-6">
          No standard is weak at enough schools to name a shared intervention.
        </p>
      ) : (
        <ul className="border-t border-rule/60">
          {priorities.map((p) => (
            <PriorityRow
              key={p?.catalogStandardId ?? p?.code}
              priority={p}
              thresholdScore={threshold}
              canWrite={canWrite}
              onPropose={onPropose}
              onConfirm={onConfirm}
            />
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1 border-t border-rule/60 px-5 py-4 sm:px-6">
          {notes.map((n, i) => (
            <li key={i} className="text-[12.5px] leading-snug text-muted">
              {n}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

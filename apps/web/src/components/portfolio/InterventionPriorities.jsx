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
// score is shown as a plain number out of 4, and no second label vocabulary is
// invented here.
//
// The per-school breakdown is ABSENT under the viewer lens (the API omits the
// key entirely, spec §4.7) — so this component must never assume it exists, and
// the adopt affordance is only offered when it does.
//
// LEDGER SHAPE (Premium UI P4): the priorities are ONE DataTable — the counts
// stack in tabular columns instead of a five-figure strip repeated per standard —
// and the per-standard detail opens below the table for the row asked about. The
// median self-score is shown as the server's number out of 4 (no rubric words
// are invented here; the rubric vocabulary still belongs to each framework).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Target, Users } from 'lucide-react'
import { Section, DataTable, Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'
import BulkAdoptFlow from './BulkAdoptFlow.jsx'
import { humanizeToken } from './AttentionBandChip.jsx'

// A server count → the cell. A missing count is an em dash, never a zero.
const count = (v) => (Number.isFinite(v) ? v : '—')

const priorityKey = (p) => p?.catalogStandardId ?? p?.code

/**
 * The priorities as ONE ledger table (standard × the five counts × share), in the
 * server's order — no sortable column, because the order is frozen server-side.
 * The per-standard detail (which schools, run one intervention) opens BELOW the
 * table for the one row asked about, instead of every row carrying its own
 * disclosure and button.
 */
function PriorityTable({ priorities, openKey, onOpen }) {
  const columns = [
    {
      key: 'standard',
      header: 'Standard',
      render: (p) => (
        <div className="min-w-[16rem] max-w-[34rem] py-1.5">
          {/* The server's frozen headline template, verbatim. */}
          <span className="font-semibold leading-snug text-ink">{p?.headline ?? p?.code ?? 'Standard'}</span>
          <span className="dt-sub mt-0.5">
            {p?.code ? <span className="font-semibold">{p.code}</span> : null}
            {p?.title ? ` · ${p.title}` : ''}
            {p?.domainKey ? ` · ${humanizeToken(p.domainKey)}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'below', header: 'Below', num: true, render: (p) => <span className="font-semibold">{count(p?.schoolsBelowThreshold)}</span> },
    { key: 'inScope', header: 'In scope', num: true, render: (p) => count(p?.schoolsInScope) },
    { key: 'scored', header: 'Scored', num: true, render: (p) => count(p?.schoolsScored) },
    { key: 'gap', header: 'No evidence', num: true, render: (p) => count(p?.schoolsWithEvidenceGap) },
    {
      key: 'median',
      header: 'Median self-score',
      num: true,
      render: (p) =>
        // NOT a zero. Nothing scored and "scored 1" are different facts.
        p?.medianRubricScore == null ? (
          <span className="text-ink2">Not scored</span>
        ) : (
          <span className="whitespace-nowrap">
            {p.medianRubricScore}
            <span className="text-ink2"> / 4</span>
          </span>
        ),
    },
    {
      key: 'share',
      header: 'Share of schools',
      num: true,
      render: (p) => (Number.isFinite(p?.sharePct) ? `${p.sharePct}%` : '—'),
    },
  ]
  // Only when the breakdown exists (the viewer lens omits the key entirely).
  if (priorities.some((p) => Array.isArray(p?.schools)))
    columns.push({
      key: 'open',
      header: <span className="sr-only">Detail</span>,
      headerClassName: 'dt-num',
      className: 'dt-num',
      render: (p) =>
        Array.isArray(p?.schools) ? (
          <button
            type="button"
            className="dt-link dt-actions whitespace-nowrap"
            aria-expanded={openKey === priorityKey(p)}
            aria-controls="portfolio-priority-detail"
            onClick={() => onOpen(openKey === priorityKey(p) ? null : priorityKey(p))}
          >
            <Users size={13} aria-hidden="true" />
            {openKey === priorityKey(p) ? 'Close' : `Schools (${p.schools.length})`}
          </button>
        ) : null,
    })
  return (
    <DataTable
      caption="Standards weak across the organization"
      columns={columns}
      rows={priorities}
      rowKey={(p, i) => priorityKey(p) ?? i}
      rowClassName={(p) => (openKey === priorityKey(p) ? 'dt-subtotal' : '')}
      className="mt-3 [&_.dt]:min-w-[46rem]"
    />
  )
}

/** The one opened standard: which schools, and the one-intervention action. */
function PriorityDetail({ priority, thresholdScore, canWrite, onPropose, onConfirm, onClose }) {
  const [adopting, setAdopting] = useState(false)
  const schools = Array.isArray(priority?.schools) ? priority.schools : []
  return (
    <div id="portfolio-priority-detail" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hair pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
          {priority?.code ?? 'Standard'} · which schools ({schools.length})
        </p>
        <button type="button" className="dt-link text-[12px]" onClick={onClose}>
          Close
        </button>
      </div>
      {schools.length > 0 ? (
        <ul className="b1-list !border-t-0">
          {schools.map((s, i) => (
            <li key={s?.schoolId ?? i} className="b1-row justify-between !text-[12.5px]">
              <span className="font-semibold text-ink">{s?.name ?? s?.schoolId}</span>
              <span className="tabular-nums text-ink2">
                {s?.rubricScore == null
                  ? 'Not scored'
                  : `Self-score ${s.rubricScore} (threshold ${thresholdScore})`}
                {Number.isFinite(s?.evidenceCount) ? ` · ${s.evidenceCount} artifacts` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sec-note">The server listed no schools for this standard.</p>
      )}
      {canWrite &&
        (adopting ? (
          <BulkAdoptFlow
            priority={priority}
            canWrite={canWrite}
            onClose={() => setAdopting(false)}
            onPropose={(body) => onPropose?.(priority, body)}
            onConfirm={(body) => onConfirm?.(priority, body)}
          />
        ) : (
          <Button onClick={() => setAdopting(true)} icon={<Target size={14} aria-hidden />} className="mt-3">
            Run one intervention across these schools
          </Button>
        ))}
    </div>
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
  const [openKey, setOpenKey] = useState(null)
  if (loading) {
    return (
      <Section label="Intervention priorities">
        <p className="text-[13.5px] text-ink2">Looking for standards weak across the diocese…</p>
      </Section>
    )
  }
  if (error) {
    return (
      <Section label="Intervention priorities">
        <p className="text-[13.5px] text-ink2">{error}</p>
      </Section>
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
  const opened =
    openKey != null ? priorities.find((p) => priorityKey(p) === openKey && Array.isArray(p?.schools)) ?? null : null

  return (
    <Section
      aria-labelledby="portfolio-priorities"
      label={<span id="portfolio-priorities">Intervention priorities</span>}
    >
      <p className="max-w-prose text-[13px] leading-relaxed text-ink2">
        Standards weak at enough schools to be worth one diocesan workshop rather than nine separate
        school projects. Grouped by the shared catalog standard — never by a code a school can edit.
        {threshold != null ? ` "Below the threshold" means a self-score at or under ${threshold}.` : ''}
      </p>
      {withheld && (
        <p className="mt-1 text-[12.5px] font-semibold text-ink">
          Showing the top {priorities.length} of {total}. {total - priorities.length} further
          standard{total - priorities.length === 1 ? ' is' : 's are'} below the threshold
          somewhere in this organization and {total - priorities.length === 1 ? 'is' : 'are'} not
          listed here.
        </p>
      )}
      {(Number.isFinite(data.schoolsConsidered) || Number.isFinite(data.schoolsWithFramework)) && (
        <p className="mt-1 text-[12px] text-ink2">
          {Number.isFinite(data.schoolsWithFramework) ? data.schoolsWithFramework : '—'} of{' '}
          {Number.isFinite(data.schoolsConsidered) ? data.schoolsConsidered : '—'} schools hold a
          framework this can be measured against.
        </p>
      )}

      {priorities.length === 0 ? (
        <div className="b1-empty mt-3">
          <p>No standard is weak at enough schools to name a shared intervention.</p>
        </div>
      ) : (
        <>
          <PriorityTable priorities={priorities} openKey={openKey} onOpen={setOpenKey} />
          {opened ? (
            <PriorityDetail
              key={openKey}
              priority={opened}
              thresholdScore={threshold}
              canWrite={canWrite}
              onPropose={onPropose}
              onConfirm={onConfirm}
              onClose={() => setOpenKey(null)}
            />
          ) : null}
        </>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {notes.map((n, i) => (
            <li key={i} className="text-[12.5px] leading-snug text-ink2">
              {n}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

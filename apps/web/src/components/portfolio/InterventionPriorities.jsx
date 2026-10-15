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
import { Button } from '../ui/surface/index.js'
import { AuroraEmpty, AuroraSection, AuroraTile, AuroraTileGrid, HowThisWorks } from '../ui/aurora/index.js'
import '../../styles/pending/b1-domain.css'
import BulkAdoptFlow from './BulkAdoptFlow.jsx'
import { humanizeToken } from './AttentionBandChip.jsx'

// A server count → the cell. A missing count is an em dash, never a zero.
const count = (v) => (Number.isFinite(v) ? v : '—')

const priorityKey = (p) => p?.catalogStandardId ?? p?.code

/**
 * The priorities as Aurora TILES, in the server's order — nothing is sorted
 * here, because the order is frozen server-side. Each tile carries the server's
 * frozen headline verbatim (the decision), the standard's own words (one
 * clamped line, full text as a tooltip) and the counts as ONE short facts line.
 * The per-standard detail (which schools, run one intervention) opens BELOW the
 * grid for the one standard asked about.
 */
function PriorityTiles({ priorities, openKey, onOpen }) {
  const hasBreakdown = priorities.some((p) => Array.isArray(p?.schools))
  return (
    <AuroraTileGrid cols={3} className="pf-prio" data-testid="portfolio-priorities">
      {priorities.map((p, i) => {
        const key = priorityKey(p) ?? i
        const on = openKey === priorityKey(p)
        const kicker = [p?.code, p?.domainKey ? humanizeToken(p.domainKey) : null].filter(Boolean).join(' · ')
        // NOT a zero. Nothing scored and "scored 1" are different facts.
        const median = p?.medianRubricScore == null ? 'Not scored' : `Median ${p.medianRubricScore} / 4`
        const facts = [
          `${count(p?.schoolsScored)} scored`,
          `${count(p?.schoolsWithEvidenceGap)} no proof`,
          median,
        ].join(' · ')
        return (
          <AuroraTile
            key={key}
            icon={Target}
            art={false}
            kicker={kicker || null}
            title={p?.headline ?? p?.code ?? 'Standard'}
            desc={p?.title ?? null}
            className={on ? 'pf-prio-on' : ''}
            foot={
              hasBreakdown && Array.isArray(p?.schools) ? (
                <button
                  type="button"
                  className="dt-link whitespace-nowrap"
                  aria-expanded={on}
                  aria-controls="portfolio-priority-detail"
                  onClick={() => onOpen(on ? null : priorityKey(p))}
                >
                  <Users size={13} aria-hidden="true" />
                  {on ? 'Close' : `Schools (${p.schools.length})`}
                </button>
              ) : null
            }
          >
            <p className="pf-facts">{facts}</p>
          </AuroraTile>
        )
      })}
    </AuroraTileGrid>
  )
}

/** The one opened standard: which schools, and the one-intervention action. */
function PriorityDetail({ priority, thresholdScore, canWrite, onPropose, onConfirm, onClose }) {
  const [adopting, setAdopting] = useState(false)
  const schools = Array.isArray(priority?.schools) ? priority.schools : []
  return (
    <div id="portfolio-priority-detail" className="au-card pf-card mt-4 min-w-0">
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
      <AuroraSection id="priorities" icon={Target} title="Shared weak standards" subtitle="One workshop instead of nine projects">
        <AuroraEmpty icon={Target} text="Looking for standards weak across the diocese…" aria-busy="true" />
      </AuroraSection>
    )
  }
  if (error) {
    return (
      <AuroraSection id="priorities" icon={Target} title="Shared weak standards" subtitle="One workshop instead of nine projects">
        <AuroraEmpty icon={Target} text={error} />
      </AuroraSection>
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
    <AuroraSection
      id="priorities"
      aria-labelledby="portfolio-priorities"
      icon={Target}
      title={<span id="portfolio-priorities">Shared weak standards</span>}
      subtitle="One workshop instead of nine projects"
      count={total !== null ? `${total} standard${total === 1 ? '' : 's'}` : null}
    >
      {/* Grouped by the shared catalog standard — never by a code a school can
          edit. The threshold is the server's. The section stands on tiles (no
          card around a tile grid); the few facts about the list sit in one line. */}
      <p className="pf-lead">
        {threshold != null ? <>Below the threshold = self-scored {threshold} or under. </> : null}
        {(Number.isFinite(data.schoolsConsidered) || Number.isFinite(data.schoolsWithFramework)) && (
          <>
            {Number.isFinite(data.schoolsWithFramework) ? data.schoolsWithFramework : '—'} of{' '}
            {Number.isFinite(data.schoolsConsidered) ? data.schoolsConsidered : '—'} schools hold a framework to
            measure.
          </>
        )}
      </p>
      {withheld && (
        <p className="pf-lead pf-lead-strong">
          Showing the top {priorities.length} of {total}; {total - priorities.length} further
          standard{total - priorities.length === 1 ? '' : 's'} below the threshold{' '}
          {total - priorities.length === 1 ? 'is' : 'are'} not listed.
        </p>
      )}

      {priorities.length === 0 ? (
        <AuroraEmpty
          className="mt-3"
          icon={Target}
          text="No standard is weak at enough schools to name a shared intervention."
        />
      ) : (
        <>
          <PriorityTiles priorities={priorities} openKey={openKey} onOpen={setOpenKey} />
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

      {/* The server's notes and the method, word for word, behind one closed
          disclosure — delivered, not dropped, and off the main read. */}
      <HowThisWorks inline className="mt-4" title="How these are picked">
        <p>Standards weak at enough schools to be worth one diocesan workshop.</p>
        {threshold != null ? <p>&quot;Below the threshold&quot; means a self-score at or under {threshold}.</p> : null}
        {notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </HowThisWorks>
    </AuroraSection>
  )
}

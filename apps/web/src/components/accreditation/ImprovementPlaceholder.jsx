// ─────────────────────────────────────────────────────────────────────────────
// ImprovementPlaceholder — the Accreditation page's Improvement tab.
//
// IT IS NO LONGER A PLACEHOLDER. Through Phase F this component shipped a frozen
// sentence — "…ships with the Continuous Improvement Manager. It is not here yet."
// — and an honesty spec that asserted the sentence was rendered. AIC Phase G makes
// that sentence FALSE, so it dies here in the same commit that makes it false. A
// green spec asserting a claim the product has outgrown is worse than no spec: it
// is the test suite defending a lie.
//
// What it is now: a thin RAIL over the same candidate findings, each linking to
// /improvement with the finding's key, where the real manager gives it an owner, a
// date, a milestone plan and progress computed from the school's own numbers.
//
// WHAT IT STILL DOES NOT DO, deliberately — the manager lives at /improvement, and
// duplicating half of it here would be two half-truths instead of one whole one:
//   · no progress bar (this rail has no progress to show);
//   · no owner field and no due-date picker (they belong to the initiative, and
//     an initiative is created on /improvement);
//   · no percentage of any kind.
//
// PREMIUM UI P4 (a2): a lead line + one flat Button on the ground, then the
// candidates as a DataTable (2px severity mark · standard tags · the finding · a
// quiet "Work this gap" link) under a Section rule. No cards, no amber chips.
//
// The component NAME is deliberately unchanged: it is imported by
// AccreditationPage and named in the honesty spec, and renaming a file to
// celebrate a behaviour change costs a reviewer a rename-vs-rewrite diff for
// nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { ArrowRight, TrendingUp } from 'lucide-react'
import { Button, DataTable, Section } from '../ui/surface/index.js'
import '../../styles/pending/a2-carry.css'

/**
 * The deep link the Improvement page consumes (?rec=…&recTitle=…).
 *
 * THE TITLE IS CARRIED, and that is not decoration. /improvement resolves `rec`
 * against its recommendation rail, which is capped at eight and ranked by index
 * lift — and a school-scoped early warning carries no lift, so it is the first
 * thing truncated on any school with eight-plus scored gaps. Carrying the
 * finding's own title makes the link self-sufficient: the flow can be seeded
 * from the URL alone when the rail does not contain it, instead of the click
 * silently doing nothing. An unknown key is still ADVISORY — it opens the flow,
 * it never errors.
 */
export function workThisGapHref(finding) {
  const key = finding?.findingKey ?? finding?.factKey ?? null
  if (!key) return '/improvement'
  const params = new URLSearchParams({ rec: key })
  const title = String(finding?.title ?? '').trim()
  if (title) params.set('recTitle', title)
  return `/improvement?${params.toString()}`
}

export default function ImprovementPlaceholder({ findings = [], loading = false }) {
  // Candidates: open, not already adopted by an initiative, and not merely
  // informational. Filtering is selection, not composition — no number, sentence
  // or status is invented here.
  const candidates = findings.filter(
    (f) => !f.initiativeId && f.severity !== 'info' && !f.findingCleared,
  )

  const heading =
    loading && candidates.length === 0
      ? 'Reading your open findings…'
      : `${candidates.length} finding${candidates.length === 1 ? '' : 's'} ${
          candidates.length === 1 ? 'is a candidate' : 'are candidates'
        } for an improvement initiative`

  const columns = [
    {
      key: 'tags',
      header: 'Standard',
      width: '10.5rem',
      render: (f) =>
        (f.standardTags ?? []).length ? (
          <span className="flex flex-wrap gap-1 py-1.5">
            {(f.standardTags ?? []).slice(0, 2).map((t) => (
              <span key={t} className="a2-code">
                {t}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-ink2">—</span>
        ),
    },
    {
      key: 'title',
      header: 'Finding',
      render: (f) => <span className="block py-2 font-semibold text-ink">{f.title}</span>,
    },
    {
      key: 'act',
      header: <span className="sr-only">Action</span>,
      headerClassName: 'text-right',
      className: 'text-right',
      render: (f) => (
        <Link to={workThisGapHref(f)} className="dt-link whitespace-nowrap">
          Work this gap <ArrowRight size={12} aria-hidden />
        </Link>
      ),
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-hair pb-4">
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink">
          Turning a finding into owned, dated work — with a milestone plan and progress computed
          from your own numbers — happens in the Continuous Improvement Manager.
        </p>
        <Button to="/improvement" variant="primary" icon={<TrendingUp size={14} />}>
          Open Improvement
          <ArrowRight size={13} aria-hidden />
        </Button>
      </div>

      <Section label="Candidates" aside={<span>Open, not informational, not yet on a plan</span>}>
        <h3 className="sec-title">{heading}</h3>
        {candidates.length === 0 ? (
          <div className="a2-empty">
            <p className="a2-empty-title">Nothing is waiting on a plan.</p>
            <p>Either no rule is firing, or every open finding is already informational.</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={candidates}
            rowKey={(f, i) => f.findingKey ?? f.factKey ?? `candidate-${i}`}
            markOf={(f) => (f.severity === 'critical' ? 'risk' : 'watch')}
            caption="Findings that are candidates for an improvement initiative"
          />
        )}
      </Section>
    </div>
  )
}

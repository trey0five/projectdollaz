// ─────────────────────────────────────────────────────────────────────────────
// ImprovementPlaceholder — the Improvement tab, shipped honestly.
//
// THE CONTINUOUS IMPROVEMENT MANAGER IS A LATER PHASE, AND THIS TAB SAYS SO.
// Turning a finding into owned, dated work — a milestone plan, an owner, progress
// computed from the school's own numbers — is not built yet. What this tab must
// NOT do, and does not do:
//   · no progress bar that is always at zero;
//   · no owner field that saves nowhere;
//   · no due-date picker that no engine reads;
//   · no disabled "Create initiative" button implying it works next week.
// Every one of those is a promise the product has not made, and a school planning
// a self-study around a fake control is worse off than one that was told the truth.
//
// WHAT IT DOES SHIP IS REAL AND USEFUL TODAY: the open findings that are genuinely
// candidates for an improvement initiative — not yet linked to one, and not merely
// informational — read straight from the twin payload already on this page, each
// under the standard code it would be cited against. That is a real work list a
// head of school can take into a leadership meeting this afternoon.
//
// And one live action that genuinely works right now: the strategic plan, where
// initiatives can be created and are already measured against real numbers.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'

const AMBER = '#F59E0B'

/** The one frozen sentence. It is not softened, and it is not a teaser. */
const NOT_HERE_YET =
  'Turning a finding into owned, dated work — with a milestone plan and progress computed from your own numbers — ships with the Continuous Improvement Manager. It is not here yet.'

export default function ImprovementPlaceholder({ findings = [], loading = false }) {
  // Candidates: open, not already adopted by an initiative, and not merely
  // informational. Filtering is selection, not composition — no number, sentence
  // or status is invented here.
  const candidates = findings.filter(
    (f) => !f.initiativeId && f.severity !== 'info' && !f.findingCleared,
  )

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-rule/50 bg-cream/40 p-4">
        <span className="inline-flex items-center rounded-md border border-rule/60 bg-section px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Coming in the Continuous Improvement Manager
        </span>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-navy">{NOT_HERE_YET}</p>
        <Link
          to="/strategy"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
        >
          <Compass size={14} aria-hidden /> Open the strategic plan
          <ArrowRight size={13} aria-hidden />
        </Link>
        <p className="mt-2 text-[12px] text-muted">
          Initiatives can be created there today, and their progress is already computed from your
          own figures.
        </p>
      </div>

      <section className="rounded-2xl border border-rule/50 bg-white p-4">
        <h3 className="font-serif text-[16px] font-semibold text-navy">
          {loading && candidates.length === 0
            ? 'Reading your open findings…'
            : `${candidates.length} finding${candidates.length === 1 ? '' : 's'} ${
                candidates.length === 1 ? 'is a candidate' : 'are candidates'
              } for an improvement initiative`}
        </h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          Open, not informational, and not yet attached to any plan.
        </p>

        {candidates.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-rule/60 bg-cream/50 px-4 py-8 text-center">
            <p className="text-[13px] font-semibold text-navy">Nothing is waiting on a plan.</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Either no rule is firing, or every open finding is already informational.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-rule/40 rounded-xl border border-rule/50">
            {candidates.map((f) => (
              <li key={f.findingKey ?? f.factKey} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span
                  aria-hidden
                  className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: f.severity === 'critical' ? '#DC2626' : AMBER }}
                />
                {(f.standardTags ?? []).slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-[#F59E0B]/35 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700"
                  >
                    {t}
                  </span>
                ))}
                <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-navy">
                  {f.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

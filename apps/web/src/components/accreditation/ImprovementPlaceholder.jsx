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
// The component NAME is deliberately unchanged: it is imported by
// AccreditationPage and named in the honesty spec, and renaming a file to
// celebrate a behaviour change costs a reviewer a rename-vs-rewrite diff for
// nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { ArrowRight, TrendingUp } from 'lucide-react'

const AMBER = '#F59E0B'

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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-rule/50 bg-cream/40 p-4">
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-navy">
          Turning a finding into owned, dated work — with a milestone plan and progress computed
          from your own numbers — happens in the Continuous Improvement Manager.
        </p>
        <Link
          to="/improvement"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
        >
          <TrendingUp size={14} aria-hidden /> Open Improvement
          <ArrowRight size={13} aria-hidden />
        </Link>
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
            {candidates.map((f, i) => (
              <li key={f.findingKey ?? f.factKey ?? `candidate-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
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
                <Link
                  to={workThisGapHref(f)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rule/70 bg-white px-2.5 py-1 text-[12px] font-semibold text-navy transition hover:border-gold/60 hover:text-gold"
                >
                  Work this gap <ArrowRight size={12} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

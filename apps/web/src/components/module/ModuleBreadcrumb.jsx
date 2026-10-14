// ─────────────────────────────────────────────────────────────────────────────
// ModuleBreadcrumb — one control that says where you are and where back goes.
//
// WHY THIS REPLACES TWO PILLS. A module page grew a second back button: "Back
// to overview" beside "Back to dashboard". Both were spelled the same way, so
// the reader had to read two labels to work out which one moved them one step
// and which one left the module entirely — and neither said what the CURRENT
// page was. Two affordances competing for the same job is worse than the
// missing affordance was, because now there is a decision to make.
//
// The information the reader actually needs is the HIERARCHY: Dashboard →
// Academics → Analytics → Cohorts. A breadcrumb states it. It gives the reader
// their position (the thing neither pill provided), makes every ancestor a
// direct jump rather than a chain of steps, and collapses "how do I go back"
// into one obvious answer: the crumb to the left.
//
// PREMIUM UI P2: the trail is now the page header's EYEBROW grammar — 11px caps,
// ink-2, a quiet arrow bound to the immediate parent (the filled chip is gone
// with the back pills). It sits on the ground above the PageHeader rule.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'

/**
 * @param {object} props
 * @param {Array}  props.crumbs  [{ label, to?, onClick? }] — root first, current
 *                               LAST. The final crumb is the page you are on and
 *                               is never a link; give it no `to`/`onClick`.
 */
export default function ModuleBreadcrumb({ crumbs = [] }) {
  const trail = crumbs.filter(Boolean)
  if (trail.length === 0) return null

  // One level up, not all the way out. The last crumb is here; its parent is
  // the one before it — and if there is no parent, there is nothing to go back
  // to and the arrow is correctly absent.
  const parent = trail.length > 1 ? trail[trail.length - 2] : null

  const crumbClasses =
    'rounded-sm px-1 py-0.5 text-micro font-semibold uppercase text-ink2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-soft/40'

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
      {parent ? <BackArrow crumb={parent} /> : null}

      <ol className="flex flex-wrap items-center gap-0.5">
        {trail.map((c, i) => {
          const last = i === trail.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-0.5">
              {i > 0 ? <ChevronRight size={12} className="shrink-0 text-ink/25" aria-hidden="true" /> : null}
              {last ? (
                <span aria-current="page" className="px-1 py-0.5 text-micro font-semibold uppercase text-ink">
                  {c.label}
                </span>
              ) : c.to ? (
                <Link to={c.to} className={crumbClasses}>
                  {c.label}
                </Link>
              ) : (
                <button type="button" onClick={c.onClick} className={crumbClasses}>
                  {c.label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The arrow, bound to the immediate parent — a link or a button to match it. */
function BackArrow({ crumb }) {
  const cls = 'back-link'
  const label = `Back to ${crumb.label}`
  const icon = <ArrowLeft size={14} />

  return crumb.to ? (
    <Link to={crumb.to} className={cls} aria-label={label} title={label}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={crumb.onClick} className={cls} aria-label={label} title={label}>
      {icon}
    </button>
  )
}

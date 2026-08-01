// ─────────────────────────────────────────────────────────────────────────────
// CoverageCta — Phase E: the two honest upsells, and neither of them invents a
// number.
//
// VARIANT 1 · YEARS. "3 more rules unlock when you add FY2023–24." Rules that need
// five annual readings can only say "directional" with two, and the arithmetic
// says so out loud rather than dressing a two-point line up as a direction. The
// fix is one upload into the bulk-year uploader THAT ALREADY EXISTS — this
// component wires a deep link to it and builds nothing.
//
// `fyLabel` ARRIVES FROM THE SERVER and is printed verbatim. The client composes
// no fiscal-year arithmetic: FY boundaries are a school-level setting, "the year
// before your earliest reading" is a real computation, and doing it twice is how
// two surfaces end up naming two different years.
//
// VARIANT 2 · MODULES. "6 rules are waiting on the Governance module." An
// unlicensed module lowers coverage and never lowers a score — so this is the one
// place in the product where saying "you'd see more if you bought more" is simply
// true, and it links to the modules surface that already exists.
//
// BOTH VARIANTS RENDER NOTHING WHEN THERE IS NOTHING TO SAY. A CTA that fires on
// an empty list is how an upsell becomes noise.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { CalendarPlus, Sparkles } from 'lucide-react'

const AMBER = '#F59E0B'

/** moduleKey → the display name used elsewhere in the app's chrome. */
const MODULE_LABEL = {
  finance: 'Finance',
  governance: 'Governance',
  accreditation: 'Accreditation',
  facilities: 'Facilities',
  advancement: 'Advancement',
  hr: 'HR',
  strategy: 'Strategic Planning',
  enrollment: 'Enrollment',
  planning: 'Planning',
}

function moduleLabel(key) {
  return MODULE_LABEL[key] ?? key
}

function Card({ children }) {
  return (
    <div className="rounded-2xl border border-[#F59E0B]/35 bg-amber-50/60 p-4">{children}</div>
  )
}

/**
 * F13 — the years CTA. Renders only when the engine actually named rules that a
 * longer series would unlock.
 */
export function YearsCta({ unlockableByYears = null }) {
  const ruleIds = unlockableByYears?.ruleIds ?? []
  if (ruleIds.length === 0) return null
  // EVERY year the server says that one signal needs — printed in full. Naming the
  // first of two required years and then counting rules against it is how the ask
  // becomes false: the school uploads the named year, the series is still a
  // reading short, and nothing unlocks.
  const fyLabels = unlockableByYears?.fyLabels ?? []
  const years =
    fyLabels.length === 0
      ? null
      : fyLabels.length === 1
        ? fyLabels[0]
        : `${fyLabels.slice(0, -1).join(', ')} and ${fyLabels[fyLabels.length - 1]}`

  return (
    <Card>
      <p className="flex items-center gap-1.5 font-serif text-[16px] font-semibold text-navy">
        <Sparkles size={15} style={{ color: AMBER }} aria-hidden />
        {ruleIds.length} more rule{ruleIds.length === 1 ? '' : 's'} unlock
        {ruleIds.length === 1 ? 's' : ''}
        {/* The server's labels, verbatim — no client-side fiscal-year arithmetic. */}
        {years ? ` when you add ${years}` : ' when you add your prior years'}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        Rules that need five annual readings can only say &ldquo;directional&rdquo; with what you
        have. Adding your prior years is one upload.
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {ruleIds.map((id) => (
          <li
            key={id}
            className="rounded-md border border-rule/60 bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-muted"
          >
            {id}
          </li>
        ))}
      </ul>
      {/* THE V2 ROUTE, not /data. `/data` is a STATIC redirect to
          `/finance?tab=add` for every user without an explicit `?ui=v1` opt-out,
          and the redirect drops the query string — so the old link landed on a
          generic add-data screen with no uploader open. `add=tb` picks the trial-
          balance option and `intake=bulk` opens its multi-year tab. */}
      <Link
        to="/finance?tab=add&add=tb&intake=bulk"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
      >
        <CalendarPlus size={14} aria-hidden /> Add years
      </Link>
    </Card>
  )
}

/**
 * The module CTA. `blockedByModule` maps moduleKey → the rule ids blocked PURELY
 * by licensing — never a rule that is blocked for any other reason, so this can
 * never overstate what buying the module would actually turn on.
 */
export function ModulesCta({ blockedByModule = null }) {
  const entries = Object.entries(blockedByModule ?? {}).filter(([, ids]) => (ids ?? []).length > 0)
  if (entries.length === 0) return null

  return (
    <Card>
      <p className="font-serif text-[16px] font-semibold text-navy">
        Rules waiting on a module you haven&apos;t licensed
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        These lower what we can evaluate — they never lower your score, and they never produce a
        finding against you.
      </p>
      <ul className="mt-2 space-y-1.5">
        {entries.map(([moduleKey, ids]) => (
          <li key={moduleKey} className="text-[13px] text-navy">
            <span className="font-semibold">
              {ids.length} rule{ids.length === 1 ? '' : 's'} {ids.length === 1 ? 'is' : 'are'}{' '}
              waiting on the {moduleLabel(moduleKey)} module
            </span>
            <span className="ml-1.5 font-mono text-[10.5px] text-muted">{ids.join(' · ')}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/settings/billing#modules"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-navy transition hover:border-[#F59E0B]"
      >
        See modules
      </Link>
    </Card>
  )
}

/** Both variants, side by side. Renders nothing when neither has anything to say. */
export default function CoverageCta({ coverage = null }) {
  const years = coverage?.unlockableByYears ?? null
  const modules = coverage?.blockedByModule ?? null
  const hasYears = (years?.ruleIds ?? []).length > 0
  const hasModules = Object.values(modules ?? {}).some((ids) => (ids ?? []).length > 0)
  if (!hasYears && !hasModules) return null

  return (
    <div className={`grid gap-4 ${hasYears && hasModules ? 'lg:grid-cols-2' : ''}`}>
      <YearsCta unlockableByYears={years} />
      <ModulesCta blockedByModule={modules} />
    </div>
  )
}

// Organization Briefing tab — the org-level, multi-school ATTENTION BRIEFING for the
// caller's organization. Reads the org-briefing endpoint (one call site in
// api.js) and renders a ranked cross-school attention list (each item attributed
// to its school) + a compact per-school summary table + a not-reported callout.
// The server rolls each in-org school's latest-for-FY briefing up, ranks the items
// deterministically, and caps the list — the web just renders what it gets (never
// re-sorts, never recounts). Read-only / advisory, no-print, navy/gold theme.
//
// Pure presentation over the `briefing` prop; everything derived at render (no
// effects, no in-render component definitions — React-Compiler safe).
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowRight,
  Sparkles,
  Building2,
  CheckCircle2,
  MinusCircle,
} from 'lucide-react'

// Per-severity theming — identical language to HomeBriefing (navy/gold/danger):
// accent rail + tint + icon, plus a chip tint for the per-school count pills.
const SEVERITY = {
  critical: {
    Icon: AlertTriangle,
    rail: 'bg-danger',
    tint: 'bg-[#fdeeee]',
    border: 'border-[#e0a0a0]',
    iconWrap: 'bg-danger/10 text-danger',
    chip: 'bg-danger/10 text-danger',
  },
  warn: {
    Icon: AlertCircle,
    rail: 'bg-gold',
    tint: 'bg-[#fff8e6]',
    border: 'border-[#e8c96a]',
    iconWrap: 'bg-gold/15 text-gold',
    chip: 'bg-gold/15 text-gold',
  },
  info: {
    Icon: Info,
    rail: 'bg-navy/40',
    tint: 'bg-navy/[0.04]',
    border: 'border-rule',
    iconWrap: 'bg-navy/10 text-navy',
    chip: 'bg-navy/10 text-navy',
  },
}

const CTA_LABEL = {
  metric: 'Open analytics',
  compliance: 'Open readiness',
  data: 'Go to Data hub',
}

function fmtDue(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Cross-school item card — mirrors HomeBriefing's BriefingItemCard with an added
// school-attribution chip on the title row so it reads "Sample High — Tuition
// Dependency is in the risk band". The CTA Link still targets item.link (a
// school-relative route); the school name is surfaced prominently because the link
// resolves against the viewer's active school (seamless cross-school deep-linking
// is a known integration caveat, out of this slice's scope).
function OrgBriefingItemCard({ item, index, reduce }) {
  const theme = SEVERITY[item.severity] ?? SEVERITY.info
  const { Icon } = theme
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.04 }}
    >
      <Link
        to={item.link}
        className={`group flex items-stretch gap-0 overflow-hidden rounded-2xl border ${theme.border} ${theme.tint} shadow-card transition-all hover:shadow-glow`}
      >
        <span className={`w-1.5 shrink-0 ${theme.rail}`} aria-hidden />
        <div className="flex flex-1 items-start gap-4 px-5 py-4">
          <span
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.iconWrap}`}
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-navy px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <Building2 size={11} />
                {item.schoolName}
              </span>
              <p className="font-semibold text-navy">{item.title}</p>
              {item.dueDate && (
                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[12px] font-semibold text-navy">
                  Due {fmtDue(item.dueDate)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">{item.why}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-gold">
              {CTA_LABEL[item.source] ?? 'Take a look'}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

// One severity count pill for the per-school summary row.
function CountPill({ kind, value }) {
  if (!value) return <span className="text-muted">—</span>
  return (
    <span
      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${SEVERITY[kind].chip}`}
    >
      {value}
    </span>
  )
}

export default function OrgBriefing({ briefing, loading, error }) {
  const reduce = useReducedMotion()

  if (loading) {
    return (
      <div className="no-print card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">
          Assembling your organization briefing…
        </p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="no-print card-soft border-dashed px-6 py-12 text-center">
        <p className="font-serif text-base italic text-muted">{error}</p>
      </div>
    )
  }
  if (!briefing) return null

  const consolidated = briefing.consolidated || {}
  const schools = briefing.schools || []
  const items = briefing.items || []
  const notReported = briefing.notReported || []
  const { critical = 0, warn = 0, info = 0, total = 0 } = consolidated
  const schoolsReporting = consolidated.schoolsReporting ?? schools.filter((s) => s.reported).length
  const schoolCount = consolidated.schoolCount ?? schools.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="no-print space-y-5"
    >
      {/* Headline — org-scoped HomeBriefing idiom. */}
      {total === 0 ? (
        <div className="card-soft flex items-center gap-4 px-6 py-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
            <Sparkles size={26} />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Every reporting school is on track.
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              No metrics, readiness gaps, or data issues need attention across your{' '}
              {schoolsReporting} reporting {schoolsReporting === 1 ? 'school' : 'schools'}.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
              Across your {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} — {total} thing
              {total === 1 ? '' : 's'} need{total === 1 ? 's' : ''} attention.
            </h2>
            <span
              className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-gold/70 shadow-[0_0_8px_rgba(184,150,80,0.5)]"
              aria-hidden
            />
          </div>
          <p className="text-[14px] text-muted">
            <span className="font-semibold text-danger">{critical} critical</span> ·{' '}
            <span className="font-semibold text-gold">{warn} warnings</span> ·{' '}
            <span className="font-semibold text-navy">{info} to review</span>
          </p>
        </div>
      )}

      {/* Coverage banner — OrgStatements idiom. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gold/30 bg-gold/5 px-5 py-3">
        <p className="text-[13px] font-semibold text-navy">
          {schoolsReporting} of {schoolCount} {schoolCount === 1 ? 'school' : 'schools'} reported
        </p>
        <p className="text-[11px] italic text-muted">
          Advisory — rolled up from each school&rsquo;s latest period for this fiscal year.
        </p>
      </div>

      {/* Ranked cross-school items (server-ranked — never re-sorted). */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((item, i) => (
            <OrgBriefingItemCard key={item.orgItemId} item={item} index={i} reduce={reduce} />
          ))}
          {briefing.capApplied && (
            <div className="rounded-2xl border border-dashed border-rule bg-cream/40 px-5 py-3 text-center">
              <p className="text-[12px] text-muted">
                <span className="font-semibold text-navy">+{briefing.cappedItemCount} more</span>{' '}
                across your schools — see the per-school summaries below for the full counts.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Per-school summary — OrgStatements table chrome. */}
      <div className="card-soft overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-rule bg-cream/50 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <Building2 size={17} />
          </span>
          <h3 className="font-serif text-base font-semibold text-navy sm:text-lg">
            Schools in your organization
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-cream">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  School
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Period
                </th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Critical
                </th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Warn
                </th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Review
                </th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {schools.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center font-serif italic text-muted">
                    No schools found for your organization.
                  </td>
                </tr>
              )}
              {schools.map((s) => (
                <tr key={s.schoolId} className="border-t border-rule/50">
                  <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                  <td className="px-3 py-2 text-muted">{s.periodLabel || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {s.summary ? <CountPill kind="critical" value={s.summary.critical} /> : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.summary ? <CountPill kind="warn" value={s.summary.warn} /> : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.summary ? <CountPill kind="info" value={s.summary.info} /> : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.failed ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
                        <MinusCircle size={14} /> Couldn&rsquo;t load
                      </span>
                    ) : s.reported ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                        <CheckCircle2 size={14} /> Reported
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
                        <MinusCircle size={14} /> Not yet reported
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Not-reported callout — never let the briefing look complete while a school is missing. */}
      {notReported.length > 0 && (
        <div className="rounded-2xl border border-dashed border-rule bg-cream/40 px-5 py-3">
          <p className="text-[12px] text-muted">
            <span className="font-semibold text-navy">Not yet reported:</span>{' '}
            {notReported.map((n) => n.name).join(', ')}. These schools are not yet included in the
            briefing.
          </p>
        </div>
      )}
    </motion.div>
  )
}

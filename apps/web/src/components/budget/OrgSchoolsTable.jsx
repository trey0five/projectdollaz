// Per-school summary table for the ORGANIZATION view — the "Schools in your
// organization" roll-up (critical/warn/review counts + reporting status per school).
// Extracted from OrgBriefing so OrgHome can place it ABOVE the triage board (with
// the org KPI strip), while the briefing headline stays attached to the triage.
// Pure presentation over `schools` (server-provided); never re-sorts or recounts.
import { Building2, CheckCircle2, MinusCircle } from 'lucide-react'

// Chip tints per severity — mirrors OrgBriefing's SEVERITY.chip.
const CHIP = {
  critical: 'bg-danger/10 text-danger',
  warn: 'bg-gold/15 text-gold',
  info: 'bg-navy/10 text-navy',
}

function CountPill({ kind, value }) {
  if (!value) return <span className="text-muted">—</span>
  return (
    <span
      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${CHIP[kind]}`}
    >
      {value}
    </span>
  )
}

export default function OrgSchoolsTable({ schools = [] }) {
  return (
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
  )
}

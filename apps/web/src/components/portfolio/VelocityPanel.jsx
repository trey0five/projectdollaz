// ─────────────────────────────────────────────────────────────────────────────
// VelocityPanel — AIC Phase I. IS THE IMPROVEMENT WORK ACTUALLY MOVING?
//
// A diocese can adopt fourteen initiatives and move nothing. This panel answers
// the only question that matters after the adoption: over the window, did the
// initiatives with real observations go up, stay level, or go down.
//
// THE RULE (spec §4.5(3), §7.1): `basis: 'insufficient'` RENDERS THE SERVER'S
// LITERAL REASON — never a zero and never a dash. An initiative with one
// observation, or two taken a week apart, has not moved "0 points": we cannot see
// whether it moved at all, and those are different facts. The server refuses to
// emit a delta below two observations spanning MIN_PROJECTION_SPAN_DAYS, and this
// panel refuses to fill the hole it leaves.
//
// Every number here is the server's own count or delta. Nothing is summed,
// averaged or re-derived on the client.
// ─────────────────────────────────────────────────────────────────────────────
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { AuroraEmpty, AuroraSection, AuroraTile, AuroraTileGrid, HowThisWorks } from '../ui/aurora/index.js'
import '../../styles/pending/b1-domain.css'
import { humanizeToken } from './AttentionBandChip.jsx'

/** A signed delta in PERCENTAGE POINTS → '+4.0 points'. null → null, never '0'. */
export function deltaText(delta) {
  if (delta == null || !Number.isFinite(delta)) return null
  const rounded = Math.round(delta * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(1)} points`
}

function DeltaIcon({ delta }) {
  if (delta == null || !Number.isFinite(delta)) return null
  if (delta > 0) return <ArrowUpRight size={14} aria-hidden className="text-good" />
  if (delta < 0) return <ArrowDownRight size={14} aria-hidden className="text-risk" />
  return <ArrowRight size={14} aria-hidden className="text-ink2" />
}

function Tally({ icon, label, value }) {
  return (
    <AuroraTile icon={icon} art={false} title={label} figure={Number.isFinite(value) ? String(value) : '—'} />
  )
}

function SchoolRow({ row, reasonShown = false }) {
  const observed = row?.basis === 'observed'
  const delta = observed ? deltaText(row?.deltaPctPoints) : null
  return (
    <li className="b1-row justify-between">
      <span className="min-w-0">
        <span className="font-semibold text-ink">{row?.name ?? 'Unnamed school'}</span>
        <span className="ml-2 text-[12px] text-ink2">
          {Number.isFinite(row?.initiatives) ? `${row.initiatives} initiatives` : 'initiatives —'}
          {Number.isFinite(row?.observations) ? ` · ${row.observations} observations` : ''}
        </span>
      </span>
      {delta ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-ink">
          <DeltaIcon delta={row?.deltaPctPoints} />
          {delta}
        </span>
      ) : reasonShown ? null : (
        // The literal reason. Never a zero, never an em-dash standing in for one.
        <span className="text-[12.5px] text-ink2">
          Not measurable yet — {humanizeToken(row?.reason)?.toLowerCase() ?? 'reason not stated'}
        </span>
      )}
    </li>
  )
}

export default function VelocityPanel({ data = null, loading = false, error = '' }) {
  if (loading) {
    return (
      <AuroraSection id="velocity" icon={Activity} title="Is the work moving?" subtitle="Improvement velocity across schools">
        <AuroraEmpty icon={Activity} text="Reading improvement velocity…" aria-busy="true" />
      </AuroraSection>
    )
  }
  if (error) {
    return (
      <AuroraSection id="velocity" icon={Activity} title="Is the work moving?" subtitle="Improvement velocity across schools">
        <AuroraEmpty icon={Activity} text={error} />
      </AuroraSection>
    )
  }
  if (!data) return null

  const org = data.org ?? {}
  const schools = Array.isArray(data.schools) ? data.schools : []
  const notes = Array.isArray(data.notes) ? data.notes : []
  // When NO school is measurable and every one gives the same reason, say it
  // once above the list rather than fourteen times beside it. Any observed
  // row, or any differing reason, keeps the reason per row.
  const firstReason = schools[0]?.reason ?? null
  const sharedReason =
    schools.length > 1 && schools.every((r) => r?.basis !== 'observed' && (r?.reason ?? null) === firstReason)
      ? (humanizeToken(firstReason)?.toLowerCase() ?? 'reason not stated')
      : null

  return (
    <AuroraSection
      id="velocity"
      aria-labelledby="portfolio-velocity"
      icon={Activity}
      title={<span id="portfolio-velocity">Is the work moving?</span>}
      subtitle="Improvement velocity across schools"
      count={Number.isFinite(data.windowDays) ? `Last ${data.windowDays} days` : null}
    >
      {/* The four org tallies as tiles; a missing tally is "—", never 0. */}
      <AuroraTileGrid cols={4} className="pf-tally">
        <Tally icon={ArrowUpRight} label="Improved" value={org.improved} />
        <Tally icon={ArrowRight} label="Level" value={org.flat} />
        <Tally icon={ArrowDownRight} label="Declined" value={org.declined} />
        <Tally icon={Activity} label="Unresponded findings" value={org.unresponded} />
      </AuroraTileGrid>

      {org.basis === 'insufficient' || (Number.isFinite(org.initiativesWithObservations) && Number.isFinite(org.initiatives)) ? (
        <p className="pf-lead mt-4">
          {Number.isFinite(org.initiativesWithObservations) && Number.isFinite(org.initiatives)
            ? `${org.initiativesWithObservations} of ${org.initiatives} initiatives carry observations in this window. `
            : null}
          {org.basis === 'insufficient' ? (
            <>
              Organization-wide movement is not measurable yet —{' '}
              {String(humanizeToken(org.reason)?.toLowerCase() ?? 'reason not stated').replace(/\.+$/, '')}.
            </>
          ) : null}
        </p>
      ) : null}

      {sharedReason ? (
        <p className="pf-lead pf-lead-strong" data-testid="velocity-shared-reason">
          Not measurable yet for any school — {sharedReason}
        </p>
      ) : null}

      {schools.length > 0 && (
        <ul className="b1-list pf-vel-list mt-3">
          {schools.map((row) => (
            <SchoolRow key={row?.schoolId ?? row?.name} row={row} reasonShown={Boolean(sharedReason)} />
          ))}
        </ul>
      )}

      {/* The method and the server's notes, word for word, behind one closed
          disclosure — delivered, not dropped, and off the main read. */}
      <HowThisWorks inline className="mt-4" title="How movement is counted">
        <p>
          Movement observed over the last {Number.isFinite(data.windowDays) ? data.windowDays : '—'} days
          {data.asOf ? `, as of ${data.asOf}` : ''}. Only initiatives with two readings far enough apart to
          show movement are counted.
        </p>
        {notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </HowThisWorks>
    </AuroraSection>
  )
}

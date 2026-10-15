// ─────────────────────────────────────────────────────────────────────────────
// CycleStepper — "Where you are in the cycle": the accreditation cycle as a row
// of stations on the Accreditation overview (Aurora). Every fact is the cycle
// payload's own — the milestones in the server's order, each state as WORD +
// ICON + COLOUR (never colour alone), dates formatted only. "You are here" is
// the milestone whose key is the server's current phase; nothing is computed.
//
// The full road (rail, measures, every sentence verbatim, edit dates) stays on
// the Journey tab; this is the at-a-glance version with the one thing that is
// next, and a door to the rest.
//
// Unconfigured cycle → the designed empty state (one line + one button that
// opens the Journey tab, where the setup card lives). Not licensed / no payload
// → nothing.
// ─────────────────────────────────────────────────────────────────────────────
import {
  AlertTriangle,
  Award,
  CalendarClock,
  Check,
  Clock,
  FileText,
  Hammer,
  ListChecks,
  Minus,
  Route,
  Share2,
  UploadCloud,
} from 'lucide-react'
import { AuroraSection, AuroraEmpty, AuroraLightButton, VerdictPill } from '../ui/aurora/index.js'
import { formatShortDate } from '../../lib/format.js'

// Short station names per milestone key (UI chrome for a closed vocabulary —
// the server's full label rides in the tooltip). Unknown keys use the label.
const STATION = {
  findings_shared: { name: 'Share findings', Icon: Share2 },
  implementing: { name: 'Do the work', Icon: Hammer },
  progress_report: { name: 'Progress report', Icon: FileText },
  self_assessment: { name: 'Self-assessment', Icon: ListChecks },
  evidence_freeze: { name: 'Upload proof', Icon: UploadCloud },
  review_year: { name: null, Icon: Award },
}

// The server's closed state enum → the Aurora verdict + its word.
const STATE = {
  done: { verdict: 'good', word: 'Done', Icon: Check },
  on_track: { verdict: 'good', word: 'On track', Icon: Check },
  at_risk: { verdict: 'watch', word: 'At risk', Icon: AlertTriangle },
  overdue: { verdict: 'risk', word: 'Overdue', Icon: AlertTriangle },
  upcoming: { verdict: null, word: 'Upcoming', Icon: Clock },
  not_measurable: { verdict: null, word: "Can't tell", Icon: Minus },
}

const iso = (v) => String(v ?? '').slice(0, 10)
const year = (v) => /^(\d{4})/.exec(String(v ?? ''))?.[1] ?? null

function whenText(m) {
  if (m?.window?.start && m?.window?.end) {
    if (m.key === 'implementing') return `${year(m.window.start)} – ${year(m.window.end)}`
    return `Until ${formatShortDate(iso(m.window.end))}`
  }
  if (m?.dueDate) return `${m.state === 'overdue' ? 'Was due' : 'Due'} ${formatShortDate(iso(m.dueDate))}`
  return null
}

export default function CycleStepper({ cycle, notLicensed = false, adopted = true, onOpenJourney = null, first = false }) {
  // No payload yet (loading, or a failed read) → nothing: the Journey tab
  // carries the loading and error lines for the cycle.
  if (notLicensed || !adopted || !cycle) return null

  if (!cycle.configured) {
    return (
      <AuroraSection first={first} icon={Route} title="Where you are in the cycle" subtitle="Your accreditation road, start to review">
        <AuroraEmpty
          icon={CalendarClock}
          text="Add your last review date to map the cycle."
          action={
            onOpenJourney ? (
              <AuroraLightButton variant="ghost" onClick={onOpenJourney} icon={<Route size={15} aria-hidden="true" />}>
                Map my cycle
              </AuroraLightButton>
            ) : null
          }
        />
      </AuroraSection>
    )
  }

  const anchor = cycle.anchor ?? null
  const phase = cycle.phase ?? null
  const countdown = cycle.countdown ?? null
  const milestones = cycle.milestones ?? []
  const fw = cycle.framework ?? null
  const term = anchor?.termYears ?? null
  const from = year(anchor?.lastReviewDate)
  const to = year(anchor?.nextReviewDate)
  const subtitle = [
    `Your ${term ? `${term}-year ` : ''}${fw?.accreditor ? `${fw.accreditor} ` : ''}cycle`,
    from && to ? `${from} to ${to}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  const count = phase?.yearOfCycle != null && term != null ? `Year ${phase.yearOfCycle} of ${term}` : null

  return (
    <AuroraSection first={first} icon={Route} title="Where you are in the cycle" subtitle={subtitle} count={count}>
      <div className="au-card acc-cycle" data-testid="cycle-stepper">
        <ol className="acc-steps" style={{ '--n': Math.max(milestones.length, 1) }}>
          {milestones.map((m) => {
            const st = STATE[m.state] ?? STATE.upcoming
            const station = STATION[m.key] ?? { name: null, Icon: Clock }
            const Icon = m.state === 'done' ? Check : station.Icon
            const here = phase?.key && m.key === phase.key
            return (
              <li
                key={m.key}
                className={`acc-step${here ? ' acc-here' : ''}`}
                data-state={m.state}
                data-verdict={st.verdict ?? 'none'}
                title={[m.label, m.measure?.text ?? m.reason].filter(Boolean).join(' — ')}
                aria-current={here ? 'step' : undefined}
              >
                {here ? <span className="acc-here-tag">You are here</span> : null}
                <span className="acc-node" aria-hidden="true">
                  <Icon size={here ? 22 : 19} />
                </span>
                <span className="acc-step-name">{station.name ?? m.label}</span>
                {whenText(m) ? <span className="acc-step-when">{whenText(m)}</span> : null}
                <VerdictPill verdict={st.verdict} label={st.word} className="au-pill-sm" />
              </li>
            )
          })}
        </ol>

        {countdown ? (
          <div className="acc-next">
            <span className="acc-next-big">
              {typeof countdown.daysRemaining === 'number' ? countdown.daysRemaining : '—'}
              <small>day{countdown.daysRemaining === 1 ? '' : 's'}</small>
            </span>
            <span className="acc-next-words">
              <b>Next: {countdown.label}.</b>
              {countdown.dueDate ? <> Due {formatShortDate(iso(countdown.dueDate))}.</> : null}
            </span>
            {onOpenJourney ? (
              <AuroraLightButton size="sm" onClick={onOpenJourney} icon={<Route size={15} aria-hidden="true" />}>
                See the journey
              </AuroraLightButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </AuroraSection>
  )
}

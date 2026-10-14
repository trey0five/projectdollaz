// ─────────────────────────────────────────────────────────────────────────────
// MilestoneCard — one milestone of the six-year accreditation cycle (F1, the
// Journey tab). Renders EXACTLY what the cycle payload says about it:
//
//   · the state as ICON + WORD, never color alone (the closed server enum maps
//     to a fixed vocabulary here, the same way RatingBadge maps `rating`);
//   · the due date / window, formatted only — no client date math;
//   · `measure.text` VERBATIM — the server printed its own thresholds into that
//     sentence so they are contestable, and this card never re-derives them;
//   · a not-measurable milestone shows the server's `reason` verbatim and no
//     invented figure — suppressed is not zero, in prose too.
//
// PREMIUM UI P4: a ruled ROW on the ground (no card) — the state as a status
// Pill (2px mark + word + icon), the label and dates as ink, the measure
// sentence under it, and a quiet Button for the link.
//
// Chronological order is the payload's own; the list is never re-sorted
// worst-first (a cycle is a road — you read it in the order you will drive it).
// ─────────────────────────────────────────────────────────────────────────────
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDashed, CircleDot, Clock } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'
import { Pill, Button } from '../ui/surface/index.js'

// The server's closed state enum → icon + word + the Pill's mark tone. Word and
// icon always travel together; the mark is reinforcement, never the message.
export const MILESTONE_STATE = {
  done: { word: 'Done', Icon: CheckCircle2, tone: 'good' },
  on_track: { word: 'On track', Icon: CircleDot, tone: 'hue' },
  at_risk: { word: 'At risk', Icon: AlertTriangle, tone: 'watch' },
  overdue: { word: 'Overdue', Icon: AlertTriangle, tone: 'risk' },
  upcoming: { word: 'Upcoming', Icon: Clock, tone: 'neutral' },
  not_measurable: { word: 'Not measurable', Icon: CircleDashed, tone: 'neutral' },
}

// Navigation labels per milestone key — UI chrome for the payload's own `link`,
// a closed vocabulary like the state map above. Unknown keys get the plain word.
const CTA_LABEL = {
  findings_shared: 'Add prior visit',
  implementing: 'Open evidence',
  progress_report: 'Open findings',
  self_assessment: 'Open standards',
  evidence_freeze: 'Open evidence',
  review_year: 'Open readiness',
}

export function MilestoneStateChip({ state }) {
  const s = MILESTONE_STATE[state] ?? MILESTONE_STATE.upcoming
  const Icon = s.Icon
  return (
    <Pill variant="status" tone={s.tone} className="shrink-0">
      <Icon size={11} aria-hidden />
      {s.word}
    </Pill>
  )
}

/** "due Apr 12, 2026" / "window Apr 12, 2027 – Apr 12, 2028" — formatting only. */
function whenLine(m) {
  if (m?.window?.start && m?.window?.end) {
    return `window ${formatShortDate(String(m.window.start).slice(0, 10))} – ${formatShortDate(String(m.window.end).slice(0, 10))}`
  }
  if (m?.dueDate) {
    const due = formatShortDate(String(m.dueDate).slice(0, 10))
    return m.state === 'overdue' ? `was due ${due}` : `due ${due}`
  }
  return null
}

export default function MilestoneCard({ milestone, onNavigate = null }) {
  if (!milestone) return null
  const m = milestone
  const when = whenLine(m)
  const cta = m.link && onNavigate ? (CTA_LABEL[m.key] ?? 'Open') : null
  return (
    <li data-testid={`milestone-${m.key}`} className="flex flex-wrap items-start gap-3 border-b border-hair py-3">
      <MilestoneStateChip state={m.state} />
      {/* basis-[16rem]: below that the content WRAPS to its own line instead
          of shrinking beside the CTA (at 390 it collapsed to ~90px). */}
      <div className="min-w-0 flex-1 basis-[16rem]">
        <p className="text-small font-semibold leading-snug text-ink">
          {m.label}
          {when ? (
            <span className="ml-2 inline-flex items-center gap-1 align-middle text-[12px] font-medium text-ink2">
              <CalendarClock size={12} aria-hidden />
              {when}
            </span>
          ) : null}
        </p>
        {/* The measure sentence, verbatim — or the not-measurable reason,
            verbatim. Never both, never neither invented. */}
        {m.measure?.text ? (
          <p className="mt-1 text-small leading-relaxed text-ink2">{m.measure.text}</p>
        ) : m.reason ? (
          <p className="mt-1 text-small italic leading-relaxed text-ink2">{m.reason}</p>
        ) : null}
      </div>
      {cta ? (
        <Button variant="quiet" size="sm" onClick={() => onNavigate(m.link)} className="shrink-0">
          {cta} <ArrowRight size={13} aria-hidden />
        </Button>
      ) : null}
    </li>
  )
}

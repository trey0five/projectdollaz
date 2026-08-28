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
// Chronological order is the payload's own; the list is never re-sorted
// worst-first (a cycle is a road — you read it in the order you will drive it).
// ─────────────────────────────────────────────────────────────────────────────
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
} from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'

// The server's closed state enum → icon + word + tone. Word and icon always
// travel together; the tint is reinforcement, never the message.
export const MILESTONE_STATE = {
  done: {
    word: 'Done',
    Icon: CheckCircle2,
    cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  },
  on_track: {
    word: 'On track',
    Icon: CircleDot,
    cls: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  },
  at_risk: {
    word: 'At risk',
    Icon: AlertTriangle,
    cls: 'border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#fde68a]',
  },
  overdue: {
    word: 'Overdue',
    Icon: AlertTriangle,
    cls: 'border-red-400/50 bg-red-400/10 text-red-300',
  },
  upcoming: {
    word: 'Upcoming',
    Icon: Clock,
    cls: 'border-white/20 bg-white/5 text-white/60',
  },
  not_measurable: {
    word: 'Not measurable',
    Icon: CircleDashed,
    cls: 'border-white/20 border-dashed bg-transparent text-white/50',
  },
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
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${s.cls}`}
    >
      <Icon size={12} aria-hidden />
      {s.word}
    </span>
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
    <li
      data-testid={`milestone-${m.key}`}
      className="flex flex-wrap items-start gap-3 rounded-xl border border-white/10 bg-navy/40 px-4 py-3"
    >
      <MilestoneStateChip state={m.state} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-snug text-white">
          {m.label}
          {when ? (
            <span className="ml-2 inline-flex items-center gap-1 align-middle text-[12px] font-medium text-white/50">
              <CalendarClock size={12} aria-hidden />
              {when}
            </span>
          ) : null}
        </p>
        {/* The measure sentence, verbatim — or the not-measurable reason,
            verbatim. Never both, never neither invented. */}
        {m.measure?.text ? (
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">{m.measure.text}</p>
        ) : m.reason ? (
          <p className="mt-1 text-[12.5px] italic leading-relaxed text-white/55">{m.reason}</p>
        ) : null}
      </div>
      {cta ? (
        <button
          type="button"
          onClick={() => onNavigate(m.link)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/20 px-2.5 py-1.5 text-[12.5px] font-semibold text-white/75 transition hover:border-[#F59E0B]/60 hover:text-[#fde68a]"
        >
          {cta} <ArrowRight size={13} aria-hidden />
        </button>
      ) : null}
    </li>
  )
}

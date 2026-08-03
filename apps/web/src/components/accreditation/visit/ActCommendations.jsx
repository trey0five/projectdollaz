// ─────────────────────────────────────────────────────────────────────────────
// ACT 2 — "What they'd commend."
//
// THIS COMPONENT RENDERS NOTHING OF ITS OWN. It hands the act's four carried-
// through fields to `CommendationsPanel`, the Phase C surface that already renders
// them, and stops. The composer re-runs no engine and this file re-styles no row:
// a second commendations renderer is a second place for a strength to be worded
// differently, which is the exact drift Phase H exists to end.
//
// ZERO COMMENDATIONS IS A LEGITIMATE ANSWER and the panel already says so with the
// server's `caveat` plus the exclusion counts — how many standards were eligible
// and how many fell out at each of the three tests (score, current evidence,
// favourable operating figure). It is never an empty box, and it is never padded
// with a rubric-only "strength". `signalsUnavailable` is the separate, honest case
// where KYRO could value no operating figure at all; it is carried verbatim so
// "No favourable figure: 31" cannot read as a verdict on the school.
// ─────────────────────────────────────────────────────────────────────────────
import CommendationsPanel from '../CommendationsPanel.jsx'

export default function ActCommendations({ commendations = null }) {
  // The read FAILED — a different fact from "there are none", and it gets its own
  // frozen server sentence rather than an empty strengths list that would read as
  // a verdict on the school.
  if (commendations?.unavailableReason) {
    return (
      <p
        data-testid="commendations-unavailable"
        className="rounded-xl border border-[#F59E0B]/40 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900"
      >
        {commendations.unavailableReason}
      </p>
    )
  }
  return (
    <CommendationsPanel
      commendations={commendations?.commendations ?? []}
      exclusions={commendations?.exclusions ?? null}
      caveat={commendations?.caveat ?? ''}
      signalsUnavailable={commendations?.signalsUnavailable ?? null}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// "Here is exactly what carries over."
//
// Upgrading to a successor framework (cognia_2022 → cognia_2025) is the
// OPPOSITE promise to removal — nothing the school entered is lost — and the
// confirmation has to prove it in the school's own numbers, read straight off
// the server's preflight (GET …/upgrade-impact). Same discipline as
// frameworkRemoval.js, for the same reason: a confirmation that disagrees with
// the write it authorises is the worst bug this screen could have. So:
//
//   • every figure is the preflight's own — no client counting, no fallback
//     sentence, nothing rendered while the payload is absent;
//   • new standards arriving UNSCORED are named, because a score invented for a
//     standard the school never assessed would be the one dishonest write in
//     the flow, and the school should read that it will not happen;
//   • the series note (the trend restarts with an explicit break) is the
//     server's sentence, passed through verbatim;
//   • a blocker means the confirm stays disabled — the sentence explains the
//     recovery path, it never argues with the server.
//
// PURE and separate from the modal, so the sentences are testable as behaviour.
// ─────────────────────────────────────────────────────────────────────────────

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The lines of the upgrade confirmation, in the order a person reads them.
 *
 * @param impact the §5.1 upgrade-impact payload. Null/absent while loading —
 *               the caller must not invent numbers.
 * @returns { carried: string[], notes: string[] } — both may be empty.
 */
export function upgradeLines(impact) {
  if (!impact) return { carried: [], notes: [] }

  const carried = []
  if (impact.standardsToMove > 0) {
    const toName = impact.to?.name ?? 'the new framework'
    carried.push(
      `${plural(impact.standardsToMove, 'standard', 'standards')} ` +
        `${impact.standardsToMove === 1 ? 'moves' : 'move'} to ${toName}`,
    )
  }
  if (impact.scoredCarried > 0) {
    carried.push(
      `${plural(impact.scoredCarried, 'rubric score carries', 'rubric scores carry')} over exactly as scored`,
    )
  }
  if (impact.ratedCarried > 0) {
    carried.push(
      `${plural(impact.ratedCarried, 'rating carries', 'ratings carry')} over exactly as rated`,
    )
  }
  if (impact.evidenceCarried > 0) {
    carried.push(
      `${plural(impact.evidenceCarried, 'evidence link stays', 'evidence links stay')} attached — nothing is re-uploaded`,
    )
  }
  if (impact.editedTitleKept > 0) {
    carried.push(
      `${plural(impact.editedTitleKept, 'title you edited is', 'titles you edited are')} kept as you wrote ${impact.editedTitleKept === 1 ? 'it' : 'them'}`,
    )
  }

  const notes = []
  if ((impact.newStandards ?? []).length > 0) {
    const codes = impact.newStandards.join(', ')
    notes.push(
      `${plural(impact.newStandards.length, 'new standard arrives', 'new standards arrive')} UNSCORED (${codes}) — we never invent a score for a standard you did not assess.`,
    )
  }
  if ((impact.unmappedKept ?? []).length > 0) {
    const fromName = impact.from?.name ?? 'the old framework'
    notes.push(
      `${plural(impact.unmappedKept.length, 'standard has', 'standards have')} no counterpart in the new edition and ${impact.unmappedKept.length === 1 ? 'stays' : 'stay'} on ${fromName}: ${impact.unmappedKept.join(', ')}.`,
    )
  }
  // The rubric VOCABULARY changes even though the numbers carry — the school
  // should read the new words before agreeing to speak them.
  const fromLabels = impact.from?.rubricLabels ?? []
  const toLabels = impact.to?.rubricLabels ?? []
  if (
    fromLabels.length &&
    toLabels.length &&
    JSON.stringify(fromLabels) !== JSON.stringify(toLabels)
  ) {
    notes.push(
      `The rubric vocabulary changes: ${fromLabels.join(' → ')} becomes ${toLabels.join(' → ')}. Your 1–4 numbers are unchanged.`,
    )
  }
  // The server's own sentence about the recorded trend — verbatim.
  if (impact.seriesNote) notes.push(impact.seriesNote)

  return { carried, notes }
}

// The preflight's closed blocker vocabulary → the recovery sentence. Unknown
// blocker codes still BLOCK (the confirm never proceeds past a blocker it does
// not recognise) — they just render the code rather than a guessed story.
const BLOCKER_TEXT = {
  successor_already_adopted:
    'You already hold standards on the newer edition, so a one-click upgrade would collide with them. ' +
    'Finish adopting the newer edition directly, then remove this register via the removal flow.',
}

/** The sentences for the preflight's blockers. Empty when nothing blocks. */
export function upgradeBlockers(impact) {
  return (impact?.blockers ?? []).map((b) => BLOCKER_TEXT[b] ?? String(b))
}

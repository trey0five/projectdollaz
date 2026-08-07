// ─────────────────────────────────────────────────────────────────────────────
// "Here is exactly what you are about to lose."
//
// Removing a framework is always PERMITTED — refusing would strand the school
// that adopted the wrong accreditor and noticed after scoring forty standards,
// which is precisely the mistake a seven-framework catalog invites. What stands
// between a mis-click and a year of lost work is therefore not a locked door but
// this sentence, so it has to be exactly right:
//
//   • it counts only what is really going (a hand-made standard belongs to no
//     catalog and survives every framework change — the server scopes to
//     frameworkId, and nothing here may imply otherwise);
//   • it never rounds, softens or omits a category that is non-zero;
//   • it says out loud what SURVIVES, because "7 evidence links will be removed"
//     reads as "my audit PDF is being deleted" and that is not what happens;
//   • it names orphaned improvement work rather than hiding it — an initiative
//     is the school's own plan and is deliberately NOT deleted, which is only
//     honest if the broken link back is stated.
//
// PURE, and separate from the modal, because a confirmation sentence that
// disagrees with the delete it authorises is the worst possible bug here.
// ─────────────────────────────────────────────────────────────────────────────

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The lines of the confirmation, in the order a person reads them.
 *
 * @param impact FrameworkRemovalImpact from the server. Null/absent while the
 *               count is still loading — the caller must not invent numbers.
 * @returns { losses: string[], survives: string[] } — both may be empty.
 */
export function removalLines(impact) {
  if (!impact) return { losses: [], survives: [] }

  const losses = []
  if (impact.standards > 0) {
    // The VERB agrees too — "1 standard leave your register" undermines the one
    // sentence on this screen that has to be trusted.
    losses.push(
      `${plural(impact.standards, 'standard', 'standards')} ` +
        `${impact.standards === 1 ? 'leaves' : 'leave'} your register`,
    )
  }
  if (impact.rubricScored > 0) {
    losses.push(`${plural(impact.rubricScored, 'rubric score', 'rubric scores')} will be lost`)
  }
  if (impact.rated > 0) {
    losses.push(`${plural(impact.rated, 'rating', 'ratings')} will be lost`)
  }
  if (impact.evidenceLinks > 0) {
    losses.push(
      `${plural(impact.evidenceLinks, 'evidence link', 'evidence links')} will be removed`,
    )
  }

  const survives = []
  // Only worth saying when there were links to worry about.
  if (impact.evidenceLinks > 0) {
    survives.push('Your documents stay in Knowledge — only the links to these standards go.')
  }
  if (impact.initiativesOrphaned > 0) {
    survives.push(
      `${plural(impact.initiativesOrphaned, 'improvement initiative', 'improvement initiatives')} ` +
        `raised from these standards will be kept, but will no longer link back to a standard.`,
    )
  }
  return { losses, survives }
}

/**
 * True when this removal costs the school nothing it entered — the framework was
 * adopted and never touched. Worth knowing so the confirmation can be quiet
 * instead of alarming: an untouched framework is a tidy-up, not a loss.
 */
export function isCostless(impact) {
  if (!impact) return false
  return (
    impact.rubricScored === 0 &&
    impact.rated === 0 &&
    impact.evidenceLinks === 0 &&
    impact.initiativesOrphaned === 0
  )
}

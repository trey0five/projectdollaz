// ─────────────────────────────────────────────────────────────────────────────
// mergeAttentionRail — the ONE comparator behind the accreditation
// "Needs attention" rail.
//
// Extracted from AccreditationPage so it can be tested with real fixtures,
// because the shape it replaces was the one cap in the codebase that could drop
// a CRITICAL while keeping a watch: four slots reserved for engine findings,
// the remainder for readiness prompts, two lists concatenated with sort keys
// that were never compared to each other. A school with five open criticals had
// its fifth evicted by "«code» is unscored". Viewers — who skipped the concat —
// saw a strictly better list than editors.
//
// Order, and why:
//   1. The briefing's FOCUS rule leads whatever its severity — "we sent you
//      here" and "here is what we sent you to" must be the same row (the
//      documented rail invariant).
//   2. SEVERITY, critical first. A critical is never displaced by a lower band;
//      if there are seven criticals, the rail is six criticals and an honest
//      "…and 1 more", not five criticals and a reminder.
//   3. Engine findings before readiness prompts within a band — the finding is
//      the alarm, the prompt is the reminder.
//   4. Each source's own internal order, which is already deliberate upstream
//      (focus → severity → age for findings; category rank for prompts), is
//      preserved by index — this comparator never re-derives it.
// ─────────────────────────────────────────────────────────────────────────────

/** Rank for the rail's severity vocabulary. Unknown values sort LAST, never first. */
const SEV = { critical: 0, warn: 1, watch: 2 }

/**
 * @param {Array} earlyWarningItems  engine findings, already internally sorted,
 *                                   each carrying `severity` and `focused`
 * @param {Array} readinessItems     readiness prompts carrying `severity` + `sortKey`
 * @param {number} cap               rail size (6)
 * @returns {{ list: Array, more: number }} the capped rail + the honest overflow count
 */
export function mergeAttentionRail(earlyWarningItems, readinessItems, cap = 6) {
  const prompts = [...readinessItems].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0))
  const merged = [
    ...earlyWarningItems.map((it, i) => ({ it, src: 0, i })),
    ...prompts.map((it, i) => ({ it, src: 1, i })),
  ].sort((a, b) => {
    const fa = a.it.focused ? 0 : 1
    const fb = b.it.focused ? 0 : 1
    if (fa !== fb) return fa - fb
    const sev = (SEV[a.it.severity] ?? 3) - (SEV[b.it.severity] ?? 3)
    if (sev !== 0) return sev
    if (a.src !== b.src) return a.src - b.src
    return a.i - b.i
  })
  return { list: merged.slice(0, cap).map((m) => m.it), more: Math.max(0, merged.length - cap) }
}

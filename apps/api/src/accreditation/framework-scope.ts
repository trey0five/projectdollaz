// ─────────────────────────────────────────────────────────────────────────────
// ONE definition of "which framework is this school's".
//
// leaf-scope.ts answers "which rows count" and domain-map.ts answers "how do
// catalog rows become domains". This file answers the question that sits ABOVE
// both: when a school has adopted more than one framework — which `adoptFramework`
// fully permits, and a school re-accrediting or a diocese switching accreditors
// will do — which one are we grading?
//
// It used to be answered only inside AccreditationReadinessService, so the SIGNAL
// panel (which resolved bindings over EVERY standard in the register) and the
// readiness read (which scopes to the dominant framework) could describe two
// different populations on the SAME card: "N of 15 live" directly above "your
// framework has 1 finance standard". Two indicators on one card must be built
// from one population or the card contradicts itself.
//
// DOMINANCE RULE (unchanged, now shared): most linked standards wins; ties break
// on framework code ascending, so the answer is stable across requests.
// ─────────────────────────────────────────────────────────────────────────────

/** The only field of a school standard this resolution needs. */
interface FrameworkLinked {
  frameworkId: string | null
}

/** The only fields of a framework row this resolution needs. */
interface FrameworkCoded {
  id: string
  code: string
}

/** The DISTINCT framework ids these standards link to (order not significant). */
export function frameworkIdsIn(rows: readonly FrameworkLinked[]): string[] {
  const ids = new Set<string>()
  for (const r of rows) if (r.frameworkId) ids.add(r.frameworkId)
  return [...ids]
}

/**
 * The DOMINANT framework among `candidates`: the one the most standards link to,
 * ties broken by `code` ascending. Returns null when nothing links.
 */
export function pickDominantFramework<T extends FrameworkCoded>(
  rows: readonly FrameworkLinked[],
  candidates: readonly T[],
): T | null {
  if (candidates.length === 0) return null
  const countByFw = new Map<string, number>()
  for (const r of rows) {
    if (r.frameworkId) countByFw.set(r.frameworkId, (countByFw.get(r.frameworkId) ?? 0) + 1)
  }
  const sorted = [...candidates].sort((a, b) => {
    const c = (countByFw.get(b.id) ?? 0) - (countByFw.get(a.id) ?? 0)
    return c !== 0 ? c : a.code.localeCompare(b.code)
  })
  return sorted[0] ?? null
}

import type { AccreditationStandard } from '@finrep/db'

// ─────────────────────────────────────────────────────────────────────────────
// ONE definition of "which standards count".
//
// Both the LIVE readiness read (AccreditationReadinessService) and the RECORDED
// readiness capture (AccreditationSnapshotService) have to answer the same two
// questions — which rows are leaves, and which leaves are binary assurance gates
// excluded from the rubric math. They used to answer them with two independent
// copies of the same three lines, which meant the number on the hero and the
// number in the recorded series were equal only by coincidence. A future change
// to either copy would silently desynchronise them, and because both round
// through the same frozen engine the divergence would be invisible.
//
// So the definition lives here, once, and both services import it.
// ─────────────────────────────────────────────────────────────────────────────

type Node = Pick<AccreditationStandard, 'id' | 'parentId' | 'catalogStandardId'>

/**
 * LEAF = a standard that no OTHER standard in the school's register points at as
 * its parent. Parenthood is evaluated over `all` (the whole register) while the
 * result is drawn from `scoped` (e.g. one framework's rows), so narrowing the
 * scope can never promote a parent into a leaf.
 */
export function leavesOf<T extends Node>(all: readonly T[], scoped: readonly T[]): T[] {
  const parentIds = new Set(all.map((r) => r.parentId).filter((id): id is string => id !== null))
  return scoped.filter((r) => !parentIds.has(r.id))
}

/**
 * An assurance gate is a leaf whose CATALOG row is flagged isAssurance. A row
 * with no catalog link is never an assurance (hand-made registers, mocks).
 */
export function isAssuranceLeaf<T extends Node>(
  r: T,
  assuranceCatalogIds: ReadonlySet<string>,
): boolean {
  return r.catalogStandardId != null && assuranceCatalogIds.has(r.catalogStandardId)
}

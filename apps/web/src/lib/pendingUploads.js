// ─────────────────────────────────────────────────────────────────────────────
// pendingUploads — the hand-off between the Finance "Upload your financial
// files" sorter (#43) and the tile that actually saves each file.
//
// The sorter reads a file, decides where it belongs (trial balance, monthly,
// budget…) and then opens that tile with `nav.goToOption`. The tiles are
// existing components with their own drop zones and no "initial files" prop,
// so the files wait HERE for one render: the destination calls `takePending`
// on mount and feeds them through the same path a drop would. Nothing is
// persisted; a page reload simply forgets the stash (the files are still on
// the person's disk).
// ─────────────────────────────────────────────────────────────────────────────

const stash = new Map() // destination key → File[]

/** Queue files for a destination ('tb-single' | 'tb-bulk' | 'monthly' | 'budget'). */
export function stashPending(destination, files) {
  const list = Array.from(files || []).filter(Boolean)
  if (list.length === 0) return
  stash.set(destination, [...(stash.get(destination) || []), ...list])
}

/** Take (and clear) the files queued for a destination. */
export function takePending(destination) {
  const list = stash.get(destination) || []
  stash.delete(destination)
  return list
}

export function hasPending(destination) {
  return (stash.get(destination) || []).length > 0
}

/** Test seam. */
export function clearPending() {
  stash.clear()
}

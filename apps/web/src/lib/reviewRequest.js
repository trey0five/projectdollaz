// ─────────────────────────────────────────────────────────────────────────────
// reviewRequest — "open the review panel" that survives a page change (A4).
//
// The Finance band's "Review 12 accounts" button lands on the Add-data trial
// balance step, where the file cards mount a moment later (after the stored
// imports hydrate). A plain `finrep:open-review` event would fire before any
// card is listening. So the ask is STICKY for a short while: the first card
// that mounts with something to review takes it, opens its panel and scrolls
// into view. Exactly one card takes it; an ask nobody could take expires.
//
// The live event still fires too, for cards that are already on screen.
// ─────────────────────────────────────────────────────────────────────────────
export const OPEN_REVIEW_EVENT = 'finrep:open-review'
export const REVIEW_REQUEST_TTL_MS = 20_000

let pendingAt = 0

/** Ask the intake to open its review panel (now, or on the next card mount). */
export function requestOpenReview(now = Date.now()) {
  pendingAt = now
  try {
    window.dispatchEvent(new CustomEvent(OPEN_REVIEW_EVENT, { detail: { sticky: true } }))
  } catch {
    /* no window (tests / SSR) — the sticky ask still stands */
  }
}

/** Is there a live ask? (Does not take it.) */
export function hasReviewRequest(now = Date.now()) {
  return pendingAt > 0 && now - pendingAt <= REVIEW_REQUEST_TTL_MS
}

/** Take the ask — true for exactly one caller while it is live. */
export function takeReviewRequest(now = Date.now()) {
  const live = hasReviewRequest(now)
  pendingAt = 0
  return live
}

/** Drop any ask (a card already opened in response to the live event). */
export function clearReviewRequest() {
  pendingAt = 0
}

/** Does the current URL carry the band's `review=1` deep link? */
export function urlAsksForReview(search) {
  try {
    const q = new URLSearchParams(search ?? window.location.search)
    return q.get('review') === '1'
  } catch {
    return false
  }
}

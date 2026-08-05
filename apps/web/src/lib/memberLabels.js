// ─────────────────────────────────────────────────────────────────────────────
// ONE way to name a member. Two casings reach the browser and BOTH are correct:
// the roster (GET /schools/:id/members) emits snake_case through toUserPublic,
// while records that INCLUDE a related user — a task's assignee, an initiative's
// owner — arrive camelCase straight off Prisma. Four copies of this helper had
// drifted around the app and three read camelCase ONLY, so every picker fed by
// the roster fell through to its email fallback on every render and the product
// asked an owner to pick a colleague by email address.
//
// Position is part of the label, not a second column: "who should own this" is
// answered by a job, and the roster's other identifier is an access role
// (Leadership/Finance/Board), which is not one.
// ─────────────────────────────────────────────────────────────────────────────

/** First + last from either casing. '' when the account carries no name. */
export function memberFullName(m) {
  const first = m?.first_name ?? m?.firstName ?? ''
  const last = m?.last_name ?? m?.lastName ?? ''
  return [first, last].filter(Boolean).join(' ').trim()
}

/** Name, else email, else a neutral word. Never blank. */
export function memberName(m, fallback = 'Member') {
  return memberFullName(m) || m?.email || fallback
}

/** The position a member holds at this school, or '' — never null in a template. */
export function memberTitle(m) {
  return String(m?.title ?? m?.jobTitle ?? '').trim()
}

/** "Jo Ruiz — Business Manager". The picker label: a person, and what they do. */
export function memberLabel(m, fallback = 'Member') {
  const name = memberName(m, fallback)
  const title = memberTitle(m)
  return title ? `${name} — ${title}` : name
}

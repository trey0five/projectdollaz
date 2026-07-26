// ─────────────────────────────────────────────────────────────────────────────
// peopleMeta — shared constants + pure helpers for Governance Phase 2 People.
// PERSON_GROUPS / MEMBER_ROLES are HARD-COPIED mirrors of the API DTO arrays
// (apps/api/src/governance/dto/person.dto.ts — the DTO is the authority; the
// COMMITTEE_KINDS precedent). No React, no styling classes beyond tone maps.
// ─────────────────────────────────────────────────────────────────────────────

// apps/api/src/governance/dto/person.dto.ts (PERSON_GROUPS)
export const PERSON_GROUPS = ['board', 'finance_team', 'staff']
// apps/api/src/governance/dto/person.dto.ts (MEMBER_ROLES)
export const MEMBER_ROLES = ['chair', 'vice_chair', 'secretary', 'member']

// The governance module hue (matches tileRegistry) — used for the purple group
// chips on the light roster; everything else inherits the module accent chrome.
export const GOV_HUE = '#7C3AED'

// Tag convention for person credential documents in the knowledge store.
export const CREDENTIAL_TAGS = ['cv', 'license', 'degree', 'background_check']

const GROUP_LABELS = {
  board: 'Board',
  finance_team: 'Finance team',
  staff: 'Staff',
}

const ROLE_LABELS = {
  chair: 'Chair',
  vice_chair: 'Vice chair',
  secretary: 'Secretary',
  member: 'Member',
}

const TAG_LABELS = {
  cv: 'CV',
  license: 'License',
  degree: 'Degree',
  background_check: 'Background check',
}

export function groupLabel(g) {
  return GROUP_LABELS[g] ?? g
}

export function roleLabel(r) {
  return ROLE_LABELS[r] ?? r
}

export function credentialTagLabel(t) {
  return TAG_LABELS[t] ?? t
}

/** 'yyyy-mm-dd' slice of an ISO DateTime (the contract serializes dates as
 *  Prisma DateTime ISO strings — render value.slice(0,10)). */
export function isoDay(v) {
  return v ? String(v).slice(0, 10) : ''
}

/**
 * Client-side mirror of the report's termStatus rule (list rows don't carry it):
 * no_term when termEnd is null; expired when termEnd < today; expiring_90d when
 * within 90 days; else active. Pure string compares on yyyy-mm-dd (UTC-safe).
 */
export function termStatusOf(person) {
  const end = isoDay(person?.termEnd)
  if (!end) return 'no_term'
  const today = new Date().toISOString().slice(0, 10)
  if (end < today) return 'expired'
  const horizon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (end <= horizon) return 'expiring_90d'
  return 'active'
}

/** Light-theme badge classes per term status (coral/danger when expiring/expired). */
export const TERM_BADGE = {
  active: { label: 'Term active', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  expiring_90d: { label: 'Expires soon', cls: 'border-danger/30 bg-danger/10 text-danger' },
  expired: { label: 'Term expired', cls: 'border-danger/40 bg-danger/15 text-danger' },
  no_term: { label: 'No term', cls: 'border-rule/60 bg-section text-muted' },
}

/**
 * The chair display rule (read-side, frozen): effective chair = the chair-role
 * membership's person name; else the legacy Committee.chair free-text string
 * (labelled "legacy"); else none. Returns { name, source: 'membership'|'legacy'|null }.
 */
export function effectiveChair(committee) {
  if (committee?.chairPersonName) return { name: committee.chairPersonName, source: 'membership' }
  if (committee?.chair) return { name: committee.chair, source: 'legacy' }
  return { name: null, source: null }
}

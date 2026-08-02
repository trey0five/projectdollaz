// ─────────────────────────────────────────────────────────────────────────────
// staffEvaluationMeta — AIC Phase F. Shared constants + pure helpers for the
// STAFF EVALUATION register. HARD-COPIED mirrors of the API DTO arrays
// (apps/api/src/hr/dto/staff-evaluation.dto.ts — the DTO is the authority; the
// COMMITTEE_KINDS / PERSON_GROUPS precedent). No React, no fetching.
//
// PII CONTRACT (why this file has no "name" helper): the register itself may name
// a person to an owner or an accountant, and NOTHING ELSE may. The count card, the
// briefing, Penny and every export are fed by the /summary route, which returns
// integers only. Nothing in this file composes a sentence containing a person.
// ─────────────────────────────────────────────────────────────────────────────

// apps/api/src/hr/dto/staff-evaluation.dto.ts (STAFF_EVALUATION_STATUSES)
export const STAFF_EVALUATION_STATUSES = ['scheduled', 'in_progress', 'completed', 'waived']

// The hr module hue (locked brand hue — matches tileRegistry/moduleAnatomy).
export const HR_HUE = '#059669'

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  waived: 'Waived',
}

export function statusLabel(s) {
  return STATUS_LABELS[s] ?? s
}

/** Light-theme badge classes per evaluation status (matches the facilities palette). */
export const STATUS_BADGE = {
  scheduled: { label: 'Scheduled', cls: 'border-rule/60 bg-section text-muted' },
  in_progress: { label: 'In progress', cls: 'border-sky-300/70 bg-sky-50 text-sky-700' },
  completed: { label: 'Completed', cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-700' },
  waived: { label: 'Waived', cls: 'border-rule/60 bg-section text-muted' },
}

export const OVERDUE_BADGE = {
  label: 'Past due',
  cls: 'border-danger/30 bg-danger/10 text-danger',
}

/**
 * The count at which the Needs-attention item goes from `watch` to `risk`.
 *
 * A HARD-COPIED MIRROR of TWIN_THRESHOLDS.STAFF_EVAL_OVERDUE_CRITICAL_COUNT
 * (packages/compliance/src/accreditation-twin.ts), for the same reason the status
 * arrays above are mirrors: the web must not import the rule engine to colour a
 * rail. The engine stays the authority — if it moves, move this with it — and the
 * two must agree, or /hr and the twin's own finding disagree about one school.
 */
export const EVAL_OVERDUE_RISK_COUNT = 10

/** Days past due at which the same item escalates. Mirrors STAFF_EVAL_OVERDUE_CRITICAL_DAYS. */
export const EVAL_OVERDUE_RISK_DAYS = 365

/**
 * THE FROZEN VIEWER SENTENCE (spec §9.2). Rendered VERBATIM in place of the
 * register for any role the server would 403, and for an actual 403 response.
 * It is the whole explanation: it says what is withheld, why, and what remains
 * visible. Do not reword it on one surface without moving it on both.
 */
export const VIEWER_RESTRICTION_NOTE =
  'Evaluation records name individual staff, so they are limited to owners and finance leads. The count above is what this view shows.'

/**
 * The roles the server lets read the register (@Roles('owner','accountant') — a
 * viewer gets 403). Deciding it here rather than by `role !== 'viewer'` means an
 * unknown or future role is treated exactly as the server treats it: restricted.
 */
export function canReadStaffEvaluations(role) {
  return role === 'owner' || role === 'accountant'
}

/** 'yyyy-mm-dd' slice of an ISO DateTime, for a date input / DatePicker value. */
export function isoDay(v) {
  return v ? String(v).slice(0, 10) : ''
}
